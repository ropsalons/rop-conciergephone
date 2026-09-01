// ROP Chat — "Victories" feed. Celebrates each guest win as they check out, into #victories.
// Wins (from ANALYTICS.MARTS.VICTORIES_TODAY over the Boulevard share):
//   prebook        — a current-day guest booked their next visit
//   new_prebook    — a BRAND-NEW guest pre-booked (biggest win)
//   lux            — a Luxury Upgrade service was checked out
//   retail         — a retail product was sold
// Each win posts one celebratory card with external_key = the event key, so re-runs update in
// place (no duplicates). Scheduled every few minutes (pg_cron). Snowflake data lags ~1-2h.
// Deployed copy holds live secrets; the repo copy keeps them redacted (Deno.env fallback).

const SF_URL = 'https://QXKKQNU-JNB21158.snowflakecomputing.com/api/v2/statements'
const SF_TOKEN = Deno.env.get('SF_TOKEN') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
const INGEST_URL = 'https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ingest'
const INGEST_KEY = Deno.env.get('INGEST_KEY') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
const CRON_SECRET = 'rop-daily-3f9ac21b'
const MAX_PER_RUN = 60

async function sf(sql: string): Promise<string[][]> {
  const headers = {
    Authorization: 'Bearer ' + SF_TOKEN,
    'X-Snowflake-Authorization-Token-Type': 'PROGRAMMATIC_ACCESS_TOKEN',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const r = await fetch(SF_URL, { method: 'POST', headers, body: JSON.stringify({ statement: sql, timeout: 60, warehouse: (Deno.env.get('SF_WAREHOUSE') ?? 'COMPUTE_WH'), role: 'ROP_CONNECT_READONLY', parameters: { QUERY_TAG: 'rop-connect:victories-feed' }, database: 'ANALYTICS', schema: 'MARTS' }) })
  let j: any = await r.json()
  if (r.status === 202 && j.statementHandle) {
    for (let i = 0; i < 12; i++) { await new Promise((res) => setTimeout(res, 1500)); const g = await fetch(SF_URL + '/' + j.statementHandle, { headers }); if (g.status === 200) { j = await g.json(); break } }
  }
  if (!j.data) throw new Error('Snowflake: ' + JSON.stringify(j).slice(0, 200))
  return j.data as string[][]
}

const esc = (s: string) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c])
const first = (s: string) => esc(String(s ?? '').trim().split(' ')[0] || 'Team')

const SQL = `select EVENT_KEY, VTYPE, STYLIST, GUEST, DETAIL, LOC from ANALYTICS.MARTS.VICTORIES_TODAY`

function hero(c1: string, c2: string, emoji: string, tag: string, line: string): string {
  return (
    `<div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,${c1},${c2});border-radius:16px;padding:20px 18px;text-align:center;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25)">` +
    `<div style="font-size:46px;line-height:1">${emoji}</div>` +
    `<div style="font-size:14px;font-weight:900;letter-spacing:.10em;margin-top:6px;opacity:.95">${tag}</div>` +
    `<div style="font-size:16px;line-height:1.5;margin-top:8px;font-weight:600">${line}</div>` +
    `</div>`
  )
}

function card(vtype: string, stylist: string, guest: string, detail: string): { title: string; html: string } {
  const s = first(stylist)
  const g = `<b>${esc(guest || 'Your guest')}</b>`
  const d = esc(detail || '')
  if (vtype === 'new_prebook')
    return { title: '🚀 NEW GUEST REBOOKED', html: hero('#e11d48', '#7c3aed', '🚀🌟', 'BRAND-NEW GUEST REBOOKED!', `<b>${s}</b>, ${g} came in for the FIRST time and already booked their next visit (${d})! That is HUGE. 🔥🔥`) }
  if (vtype === 'prebook')
    return { title: '🎉 Rebooked', html: hero('#2563eb', '#7c3aed', '🎉', 'REBOOKED!', `Boom, <b>${s}</b> — ${g} just pre-booked for <b>${d}</b>! Way to lock in the next visit. 🙌`) }
  if (vtype === 'lux')
    return { title: '✨ LUX Upgrade', html: hero('#7c3aed', '#d946ef', '✨💎', 'LUX UPGRADE!', `Nice one, <b>${s}</b> — ${g} added <b>${d}</b>! Elevating the experience. 🔥`) }
  return { title: '🛍️ Retail Win', html: hero('#059669', '#10b981', '🛍️💥', 'RETAIL WIN!', `Ka-ching, <b>${s}</b> — ${g} went home with <b>${d}</b>! Way to send them off right. 🙌`) }
}

async function post(external_key: string, title: string, html: string): Promise<boolean> {
  const r = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'x-api-key': INGEST_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'victories', author_name: 'Victories', title, external_key, html }),
  })
  const b = await r.json().catch(() => ({}))
  return !!b.ok
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET)
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  try {
    const rows = (await sf(SQL)).slice(0, MAX_PER_RUN)
    let posted = 0
    for (const [key, vtype, stylist, guest, detail] of rows) {
      const c = card(vtype, stylist, guest, detail)
      if (await post(key, c.title, c.html)) posted++
    }
    return new Response(JSON.stringify({ ok: true, found: rows.length, posted }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
