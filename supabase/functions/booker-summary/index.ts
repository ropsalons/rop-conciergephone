// ROP Connect — hourly "bookings by booker" summary into #bookings-by-booker.
// Reads ANALYTICS.MARTS.BOOKINGS_CREATED (a view over STG_COMPLETED_APPOINTMENTS exposing
// CREATED_BY_NAME = the staff login who booked it) and posts/updates a card grouping today's
// bookings by who booked them. Snowflake data lags real-time ~1-2h, so this is the "who booked"
// companion to the instant #dc-coordinators feed. Scheduled hourly (pg_cron). No Claude.
// Deployed copy holds live secrets; the repo copy keeps them redacted (Deno.env fallback).

const SF_URL = 'https://QXKKQNU-JNB21158.snowflakecomputing.com/api/v2/statements'
const SF_TOKEN = Deno.env.get('SF_TOKEN') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
const INGEST_URL = 'https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ingest'
const INGEST_KEY = Deno.env.get('INGEST_KEY') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
const CRON_SECRET = 'rop-daily-3f9ac21b'
const TZ = 'America/New_York'

async function sf(sql: string): Promise<string[][]> {
  const headers = {
    Authorization: 'Bearer ' + SF_TOKEN,
    'X-Snowflake-Authorization-Token-Type': 'PROGRAMMATIC_ACCESS_TOKEN',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const r = await fetch(SF_URL, { method: 'POST', headers, body: JSON.stringify({ statement: sql, timeout: 60, warehouse: 'COMPUTE_WH', role: 'ROP_CONNECT_READONLY', database: 'ANALYTICS', schema: 'MARTS' }) })
  let j: any = await r.json()
  if (r.status === 202 && j.statementHandle) {
    for (let i = 0; i < 12; i++) { await new Promise((res) => setTimeout(res, 1500)); const g = await fetch(SF_URL + '/' + j.statementHandle, { headers }); if (g.status === 200) { j = await g.json(); break } }
  }
  if (!j.data) throw new Error('Snowflake: ' + JSON.stringify(j).slice(0, 200))
  return j.data as string[][]
}

const esc = (s: string) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c])
const fmt = (v: any) => (v == null || v === '' ? 0 : Number(v)).toLocaleString('en-US')

// Shared look with the ROP Scorecard card (.rc-scoped so it can't leak out of the sandboxed iframe).
const STYLE = `<style>
.rc{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#e5e7eb}
.rc .hd{color:#9fb3c8;font-size:12px;margin-bottom:10px}
.rc .tiles{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.rc .tt{display:inline-block;min-width:104px;flex:1;background:linear-gradient(180deg,rgba(37,99,235,.14),rgba(37,99,235,.05));border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px 12px}
.rc .tt .l{font-size:10px;color:#9fb3c8;text-transform:uppercase;letter-spacing:.05em}
.rc .tt .v{font-size:22px;font-weight:800;color:#fff;margin-top:2px}
.rc .wrap{overflow-x:auto;border-radius:12px;border:1px solid rgba(255,255,255,.09)}
.rc table{border-collapse:separate;border-spacing:0;width:100%;min-width:420px;font-size:13px;background:rgba(255,255,255,.015)}
.rc th{background:rgba(37,99,235,.16);color:#c7d2fe;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;text-align:right;padding:9px 12px;border:0;white-space:nowrap}
.rc th:first-child{text-align:left}
.rc td{padding:8px 12px;border:0;border-top:1px solid rgba(255,255,255,.06);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.rc td:first-child{text-align:left;color:#fff;font-weight:600}
.rc td.typ{text-align:left;color:#9fb3c8;font-weight:500}
.rc td.new{color:#4ade80;font-weight:700}
.rc tbody tr:nth-child(even){background:rgba(255,255,255,.025)}
.rc .foot{color:#9fb3c8;font-size:12px;margin-top:12px;line-height:1.65}
</style>`

// Today's bookings (salon-local), grouped by booker. Staff show their name; online/guest show the type.
const SQL = `select
  coalesce(nullif(trim(CREATED_BY_NAME),''), initcap(CREATED_BY_TYPE), 'Unknown') booker,
  initcap(CREATED_BY_TYPE) typ,
  count(*) n,
  sum(iff(IS_NEW_CLIENT,1,0)) newg
from ANALYTICS.MARTS.BOOKINGS_CREATED
where convert_timezone('UTC','${TZ}', CREATED_AT)::date = convert_timezone('UTC','${TZ}', current_timestamp())::date
  and coalesce(IS_CANCELLED,false) = false
group by 1,2 order by n desc, booker`

function card(rows: string[][]): string {
  const now = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date())
  const total = rows.reduce((a, r) => a + Number(r[2] || 0), 0)
  const newTotal = rows.reduce((a, r) => a + Number(r[3] || 0), 0)
  const bookers = rows.length
  if (!rows.length)
    return (
      STYLE +
      `<div class="rc"><div class="hd">No bookings recorded yet today (as of ${now} ET) &middot; source: Snowflake &middot; updates hourly.</div></div>`
    )
  const body = rows
    .map((r) => `<tr><td>${esc(r[0])}</td><td class="typ">${esc(r[1])}</td><td>${fmt(r[2])}</td><td class="new">${fmt(r[3])}</td></tr>`)
    .join('')
  return (
    STYLE +
    `<div class="rc">` +
    `<div class="hd">Bookings made today (full day, salon-local) &middot; as of ${now} ET &middot; source: Snowflake</div>` +
    `<div class="tiles">` +
    `<div class="tt"><div class="l">Bookings today</div><div class="v">${fmt(total)}</div></div>` +
    `<div class="tt"><div class="l">New guests</div><div class="v">${fmt(newTotal)}</div></div>` +
    `<div class="tt"><div class="l">Bookers</div><div class="v">${fmt(bookers)}</div></div>` +
    `</div>` +
    `<div class="wrap"><table><thead><tr><th>Booked by</th><th>Type</th><th>Bookings</th><th>New</th></tr></thead><tbody>${body}</tbody></table></div>` +
    `<div class="foot">"Booked by" is the staff login that made the booking (or Online / Client for guest self-booking). Covers the whole day so far; data lags real time by ~1&ndash;2 hours.</div>` +
    `</div>`
  )
}

async function buildAndPost() {
  const rows = await sf(SQL)
  const r = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'x-api-key': INGEST_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'bookings-by-booker', author_name: 'Bookings', title: 'Bookings today — by booker', external_key: 'bookings-by-booker-today', html: card(rows) }),
  })
  const body = await r.json().catch(() => ({}))
  return { ok: !!body.ok, bookers: rows.length, updated: body.updated }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET)
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  try {
    return new Response(JSON.stringify(await buildAndPost()), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
