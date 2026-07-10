// ROP Connect — live appointment feed into #dc-coordinators.
// Runs every ~10 min (pg_cron). Pulls appointments *booked* (createdAt) in the last ~15 min from
// Boulevard across all locations, skips any already posted (via public._appt_feed_seen), and posts
// each new booking — stylist, service, who booked it, guest, new-vs-repeat, appt time — to the
// dc-coordinators channel through the ingest webhook. `?mode=seed` marks recent bookings as seen
// WITHOUT posting (used once at startup to avoid a backlog flood). No Claude.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const BLVD_ENDPOINT = 'https://dashboard.boulevard.io/api/2020-01/admin'
// NOTE: real values live only in the deployed function (baked in at deploy time), never in the repo.
const BLVD_API_KEY = Deno.env.get('BLVD_API_KEY') ?? 'REDACTED'
const BLVD_SECRET = Deno.env.get('BLVD_SECRET') ?? 'REDACTED'
const BLVD_BIZ = Deno.env.get('BLVD_BUSINESS_ID') ?? 'REDACTED'

const INGEST_URL = 'https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ingest'
const INGEST_KEY = Deno.env.get('INGEST_KEY') ?? 'REDACTED'
const FEED_CHANNEL = 'dc-coordinators-in-salon-plus-on-phones'
const CRON_SECRET = 'rop-daily-3f9ac21b'
const TZ = 'America/New_York'

const LOCATIONS = [
  { id: 'urn:blvd:Location:1a0039ec-ef6a-4f09-908d-b2c160a0ea72', name: 'Bayfront' },
  { id: 'urn:blvd:Location:9ada5188-dc88-44aa-a736-ba398e1090b2', name: 'Village' },
  { id: 'urn:blvd:Location:e45dc1b0-6159-48c0-ba77-e8d7f64b161a', name: 'Bonita' },
]

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64); const a = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i)
  return a
}
function bytesToB64(b: Uint8Array): string { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s) }
async function authHeader(): Promise<string> {
  const ts = Math.floor(Date.now() / 1000).toString()
  const payload = 'blvd-admin-v1' + BLVD_BIZ + ts
  const key = await crypto.subtle.importKey('raw', b64ToBytes(BLVD_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = bytesToB64(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))))
  return 'Basic ' + btoa(BLVD_API_KEY + ':' + sig + payload)
}
async function gql(query: string): Promise<any> {
  const r = await fetch(BLVD_ENDPOINT, { method: 'POST', headers: { Authorization: await authHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
  const j = await r.json()
  if (j.errors) throw new Error('Boulevard: ' + JSON.stringify(j.errors).slice(0, 200))
  return j.data
}

function fmtWhen(iso: string): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso))
}
const SRC: Record<string, string> = { STAFF: 'booked by staff', ONLINE: 'booked online', CLIENT: 'booked online by guest' }

function bookingText(node: any, locName: string): string {
  const guest = node.client?.name || 'Guest'
  const repeat = (node.client?.appointmentCount ?? 0) <= 1 ? 'new guest' : 'repeat'
  const staff = [...new Set((node.appointmentServices || []).map((s: any) => s.staff?.displayName).filter(Boolean))].join(' & ') || 'Unassigned'
  const services = [...new Set((node.appointmentServices || []).map((s: any) => s.service?.name).filter(Boolean))].join(', ') || 'Service'
  const src = SRC[node.bookedByType] || 'booked'
  return `🗓️ New booking · ${locName} — ${guest} (${repeat}) with ${staff} · ${services} · ${src} · ${fmtWhen(node.startAt)}`
}

async function fetchNew(sinceIso: string): Promise<{ id: string; text: string }[]> {
  const out: { id: string; text: string }[] = []
  for (const loc of LOCATIONS) {
    let after: string | null = null
    for (let page = 0; page < 10; page++) {
      const cur = after ? `, after: "${after}"` : ''
      const d = await gql(`query { appointments(first: 100, locationId: "${loc.id}", query: "createdAt >= '${sinceIso}'"${cur}) { pageInfo { hasNextPage endCursor } edges { node { id createdAt startAt state bookedByType client { name appointmentCount } appointmentServices { service { name } staff { displayName } } } } } }`)
      for (const e of d?.appointments?.edges || []) {
        const st = (e.node.state || '').toLowerCase()
        if (st.includes('cancel')) continue
        out.push({ id: e.node.id, text: bookingText(e.node, loc.name) })
      }
      if (!d?.appointments?.pageInfo?.hasNextPage) break
      after = d.appointments.pageInfo.endCursor
    }
  }
  return out
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET)
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  const mode = new URL(req.url).searchParams.get('mode') || 'post'
  const sinceMin = mode === 'seed' ? 360 : 15
  const sinceIso = new Date(Date.now() - sinceMin * 60000).toISOString()
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    const candidates = await fetchNew(sinceIso)
    let posted = 0
    if (candidates.length) {
      const ids = candidates.map((c) => c.id)
      const { data: seenRows } = await db.from('_appt_feed_seen').select('appt_id').in('appt_id', ids)
      const seen = new Set((seenRows || []).map((r: any) => r.appt_id))
      const fresh = candidates.filter((c) => !seen.has(c.id))
      if (mode !== 'seed') {
        for (const c of fresh) {
          const r = await fetch(INGEST_URL, { method: 'POST', headers: { 'x-api-key': INGEST_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: FEED_CHANNEL, author_name: 'Bookings', text: c.text }) })
          if (r.ok) posted++
        }
      }
      if (fresh.length) await db.from('_appt_feed_seen').upsert(fresh.map((c) => ({ appt_id: c.id })), { onConflict: 'appt_id' })
    }
    await db.from('_appt_feed_seen').delete().lt('seen_at', new Date(Date.now() - 3 * 86400000).toISOString())
    return new Response(JSON.stringify({ ok: true, mode, since: sinceIso, candidates: candidates.length, posted }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
