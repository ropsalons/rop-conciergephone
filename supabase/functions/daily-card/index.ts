// ROP Connect — automatic "Daily Numbers" card, sourced live from Boulevard.
//
// Runs on a schedule (pg_cron -> this function). Pulls yesterday's appointments +
// retail orders for all three salons from the Boulevard Admin API, computes guests,
// appointments, new clients, retail-per-guest (RPG) and a rebooking proxy (guests
// already booked for a future visit), renders an HTML stat card, and posts it into
// the #daily-numbers channel through the ROP Connect ingest webhook.
//
// Independent of Claude/any dashboard. Deploy: supabase functions deploy daily-card --no-verify-jwt

const BLVD_ENDPOINT = 'https://dashboard.boulevard.io/api/2020-01/admin'
// NOTE: real values live only in the deployed function (set at deploy time), never in the repo.
const BLVD_API_KEY = Deno.env.get('BLVD_API_KEY') ?? 'REDACTED'
const BLVD_SECRET = Deno.env.get('BLVD_SECRET') ?? 'REDACTED'
const BLVD_BIZ = Deno.env.get('BLVD_BUSINESS_ID') ?? 'REDACTED'

const INGEST_URL = 'https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ingest'
const INGEST_KEY = Deno.env.get('INGEST_KEY') ?? 'REDACTED'

const CRON_SECRET = 'rop-daily-3f9ac21b'
const TZ = 'America/New_York'

const LOCATIONS = [
  { key: 'bayfront', id: 'urn:blvd:Location:1a0039ec-ef6a-4f09-908d-b2c160a0ea72', name: 'Bayfront' },
  { key: 'village', id: 'urn:blvd:Location:9ada5188-dc88-44aa-a736-ba398e1090b2', name: 'Village' },
  { key: 'bonita', id: 'urn:blvd:Location:e45dc1b0-6159-48c0-ba77-e8d7f64b161a', name: 'Bonita' },
]

// --- Boulevard auth (HMAC-SHA256, blvd-admin-v1 scheme) ---
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const a = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i)
  return a
}
function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
async function authHeader(): Promise<string> {
  const ts = Math.floor(Date.now() / 1000).toString()
  const payload = 'blvd-admin-v1' + BLVD_BIZ + ts
  const key = await crypto.subtle.importKey('raw', b64ToBytes(BLVD_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const sig = bytesToB64(new Uint8Array(sigBuf))
  const token = sig + payload
  return 'Basic ' + btoa(BLVD_API_KEY + ':' + token)
}
async function gql(query: string): Promise<any> {
  const r = await fetch(BLVD_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: await authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const j = await r.json()
  if (j.errors) throw new Error('Boulevard: ' + JSON.stringify(j.errors).slice(0, 300))
  return j.data
}

// --- date window (salon-local yesterday) ---
function etDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
function offsetFor(yyyyMmDd: string): string {
  const probe = new Date(`${yyyyMmDd}T12:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(probe)
  const tz = parts.find((p) => p.type === 'timeZoneName')
  return (tz?.value || 'GMT-05:00').replace('GMT', '') || '+00:00'
}
function prettyDate(yyyyMmDd: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }).format(
    new Date(`${yyyyMmDd}T12:00:00Z`),
  )
}

function isCancelledish(state: string): boolean {
  const s = (state || '').toLowerCase()
  return s.includes('cancel') || s.includes('no_show') || s.includes('noshow')
}

async function locStats(loc: { key: string; id: string; name: string }, startIso: string, endIso: string) {
  const guests = new Set<string>()
  const newGuests = new Set<string>()
  let appts = 0
  const d = await gql(
    `query { appointments(first: 500, locationId: "${loc.id}", query: "startAt >= '${startIso}' AND startAt < '${endIso}'") { edges { node { id state client { id appointmentCount } } } } }`,
  )
  for (const e of d?.appointments?.edges || []) {
    const n = e.node
    if (isCancelledish(n.state)) continue
    appts++
    const cid = n.client?.id
    if (cid) guests.add(cid)
    // First-visit guest: their only appointment on record is this one.
    if (cid && (n.client?.appointmentCount ?? 99) <= 1) newGuests.add(cid)
  }
  // retail (product) sales for RPG
  let retailCents = 0
  let after: string | null = null
  for (let page = 0; page < 20; page++) {
    const cur = after ? `, after: "${after}"` : ''
    const o = await gql(
      `query { orders(first: 100, locationId: "${loc.id}", query: "closedAt >= '${startIso}' AND closedAt < '${endIso}'"${cur}) { pageInfo { hasNextPage endCursor } edges { node { lineGroups { lines { __typename ... on OrderProductLine { currentSubtotal } } } } } } }`,
    )
    for (const e of o?.orders?.edges || [])
      for (const g of e.node.lineGroups || [])
        for (const l of g.lines || []) if (l.__typename === 'OrderProductLine') retailCents += parseInt(l.currentSubtotal, 10) || 0
    if (!o?.orders?.pageInfo?.hasNextPage) break
    after = o.orders.pageInfo.endCursor
  }
  return { key: loc.key, name: loc.name, appts, guests, newGuests, retail: retailCents / 100 }
}

// clients with any upcoming appointment (from endIso onward) -> rebooking proxy
async function futureClients(endIso: string): Promise<Set<string>> {
  const set = new Set<string>()
  for (const loc of LOCATIONS) {
    let after: string | null = null
    for (let page = 0; page < 25; page++) {
      const cur = after ? `, after: "${after}"` : ''
      const d = await gql(
        `query { appointments(first: 200, locationId: "${loc.id}", query: "startAt >= '${endIso}'"${cur}) { pageInfo { hasNextPage endCursor } edges { node { client { id } } } } }`,
      )
      for (const e of d?.appointments?.edges || []) if (e.node.client?.id) set.add(e.node.client.id)
      if (!d?.appointments?.pageInfo?.hasNextPage) break
      after = d.appointments.pageInfo.endCursor
    }
  }
  return set
}

function tile(label: string, value: string): string {
  return `<div style="flex:1;min-width:104px;background:#0f2a44;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px"><div style="font-size:11px;color:#9fb3c8;text-transform:uppercase">${label}</div><div style="font-size:24px;font-weight:800;color:#fff">${value}</div></div>`
}

async function buildAndPost(): Promise<{ ok: boolean; date: string; body: any }> {
  const todayET = etDate(new Date())
  const [Y, M, D] = todayET.split('-').map(Number)
  const yd = new Date(Date.UTC(Y, M - 1, D))
  yd.setUTCDate(yd.getUTCDate() - 1)
  const yEt = `${yd.getUTCFullYear()}-${String(yd.getUTCMonth() + 1).padStart(2, '0')}-${String(yd.getUTCDate()).padStart(2, '0')}`
  const startIso = new Date(`${yEt}T00:00:00${offsetFor(yEt)}`).toISOString()
  const endIso = new Date(`${todayET}T00:00:00${offsetFor(todayET)}`).toISOString()

  const stats = []
  for (const loc of LOCATIONS) stats.push(await locStats(loc, startIso, endIso))

  const companyGuests = new Set<string>()
  const companyNew = new Set<string>()
  let companyAppts = 0
  let companyRetail = 0
  for (const s of stats) {
    s.guests.forEach((g) => companyGuests.add(g))
    s.newGuests.forEach((g) => companyNew.add(g))
    companyAppts += s.appts
    companyRetail += s.retail
  }
  const guestsN = companyGuests.size
  const rpg = guestsN ? Math.round(companyRetail / guestsN) : 0

  let rebookPct = 0
  try {
    const future = await futureClients(endIso)
    let booked = 0
    companyGuests.forEach((g) => {
      if (future.has(g)) booked++
    })
    rebookPct = guestsN ? Math.round((100 * booked) / guestsN) : 0
  } catch (_) {
    rebookPct = -1 // signal unavailable
  }

  const rows = stats
    .map(
      (s) =>
        `<tr><td>${s.name}</td><td>${s.guests.size}</td><td>${s.newGuests.size}</td><td>$${s.guests.size ? Math.round(s.retail / s.guests.size) : 0}</td></tr>`,
    )
    .join('')

  const tiles =
    tile('Guests', String(guestsN)) +
    tile('Appointments', String(companyAppts)) +
    tile('New Clients', String(companyNew.size)) +
    tile('Retail / Guest', `$${rpg}`)

  const rebookLine =
    rebookPct >= 0
      ? `<b style="color:#fff">Rebooking:</b> ${rebookPct}% of yesterday's guests are already booked for a next visit`
      : `<b style="color:#fff">Rebooking:</b> n/a`

  const html =
    `<div style="color:#9fb3c8;font-size:12px;margin-bottom:10px">${prettyDate(yEt)} &middot; source: Boulevard</div>` +
    `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${tiles}</div>` +
    `<table><tr><th>Location</th><th>Guests</th><th>New</th><th>RPG</th></tr>${rows}</table>` +
    `<div style="color:#9fb3c8;font-size:12px;margin-top:10px;line-height:1.6">${rebookLine}</div>`

  const r = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'x-api-key': INGEST_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'daily-numbers',
      author_name: 'Boulevard',
      title: `Daily Numbers - ${prettyDate(yEt)}`,
      external_key: `daily-${yEt}`,
      html,
    }),
  })
  const body = await r.json().catch(() => ({}))
  return { ok: !!body.ok, date: yEt, body }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET)
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  try {
    const res = await buildAndPost()
    return new Response(JSON.stringify(res), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
