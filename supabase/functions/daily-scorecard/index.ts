// ROP Connect — automatic rich "ROP Scorecard" (company + per-stylist), sourced from Snowflake.
// Self-contained scheduled job (pg_cron -> this function). Reads the ANALYTICS.MARTS views via the
// Snowflake SQL API using a read-only programmatic access token, builds an HTML scorecard
// (Yesterday / WTD / MTD / YTD company table + per-stylist MTD table), and posts it into
// #daily-numbers through the ingest webhook. No Claude, no private key.

const SF_URL = 'https://QXKKQNU-JNB21158.snowflakecomputing.com/api/v2/statements'
// NOTE: real values live only in the deployed function (set at deploy time), never in the repo.
const SF_TOKEN = Deno.env.get('SF_TOKEN') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'

const INGEST_URL = 'https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ingest'
const INGEST_KEY = Deno.env.get('INGEST_KEY') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
const CRON_SECRET = 'rop-daily-3f9ac21b'

async function sf(sql: string): Promise<string[][]> {
  const headers = {
    Authorization: 'Bearer ' + SF_TOKEN,
    'X-Snowflake-Authorization-Token-Type': 'PROGRAMMATIC_ACCESS_TOKEN',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const r = await fetch(SF_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ statement: sql, timeout: 60, warehouse: 'COMPUTE_WH', role: 'ROP_CONNECT_READONLY', database: 'ANALYTICS', schema: 'MARTS' }),
  })
  let j: any = await r.json()
  if (r.status === 202 && j.statementHandle) {
    for (let i = 0; i < 12; i++) {
      await new Promise((res) => setTimeout(res, 1500))
      const g = await fetch(SF_URL + '/' + j.statementHandle, { headers })
      if (g.status === 200) { j = await g.json(); break }
    }
  }
  if (!j.data) throw new Error('Snowflake: ' + JSON.stringify(j).slice(0, 200))
  return j.data as string[][]
}

const n = (v: any) => (v == null || v === '' ? 0 : Number(v))
const fmt = (v: any) => n(v).toLocaleString('en-US')
const pct = (v: any) => (v == null || v === '' ? '&mdash;' : `${n(v)}%`)
const dash = '<span style="opacity:.5">&mdash;</span>'

const COMPANY_SQL = `with r as (select max(DATE_LOC) d from ANALYTICS.MARTS.STYLIST_DAILY where DATE_LOC < current_date)
select to_char((select d from r),'Dy Mon DD') ref_label,
 sum(iff(DATE_LOC=(select d from r),CLIENTS,0)) y_g, sum(iff(DATE_LOC=(select d from r),NEW_CLIENTS,0)) y_n,
 round(100.0*sum(iff(DATE_LOC=(select d from r),REQUESTED_APPTS,0))/nullif(sum(iff(DATE_LOC=(select d from r),APPOINTMENTS,0)),0)) y_req,
 round(sum(iff(DATE_LOC=(select d from r),RETAIL_REVENUE,0))/nullif(sum(iff(DATE_LOC=(select d from r),CLIENTS,0)),0)) y_rpg,
 sum(iff(DATE_LOC>=date_trunc('week',(select d from r)),CLIENTS,0)) w_g, sum(iff(DATE_LOC>=date_trunc('week',(select d from r)),NEW_CLIENTS,0)) w_n,
 round(100.0*sum(iff(DATE_LOC>=date_trunc('week',(select d from r)),REQUESTED_APPTS,0))/nullif(sum(iff(DATE_LOC>=date_trunc('week',(select d from r)),APPOINTMENTS,0)),0)) w_req,
 round(sum(iff(DATE_LOC>=date_trunc('week',(select d from r)),RETAIL_REVENUE,0))/nullif(sum(iff(DATE_LOC>=date_trunc('week',(select d from r)),CLIENTS,0)),0)) w_rpg,
 sum(iff(DATE_LOC>=date_trunc('month',(select d from r)),CLIENTS,0)) m_g, sum(iff(DATE_LOC>=date_trunc('month',(select d from r)),NEW_CLIENTS,0)) m_n,
 round(100.0*sum(iff(DATE_LOC>=date_trunc('month',(select d from r)),REQUESTED_APPTS,0))/nullif(sum(iff(DATE_LOC>=date_trunc('month',(select d from r)),APPOINTMENTS,0)),0)) m_req,
 round(sum(iff(DATE_LOC>=date_trunc('month',(select d from r)),RETAIL_REVENUE,0))/nullif(sum(iff(DATE_LOC>=date_trunc('month',(select d from r)),CLIENTS,0)),0)) m_rpg,
 sum(CLIENTS) ytd_g, sum(NEW_CLIENTS) ytd_n,
 round(100.0*sum(REQUESTED_APPTS)/nullif(sum(APPOINTMENTS),0)) ytd_req, round(sum(RETAIL_REVENUE)/nullif(sum(CLIENTS),0)) ytd_rpg
from ANALYTICS.MARTS.STYLIST_DAILY where DATE_LOC>=date_trunc('year',(select d from r)) and DATE_LOC<=(select d from r)`

const QUALITY_SQL = `with r as (select max(DATE_LOC) d from ANALYTICS.MARTS.STYLIST_DAILY where DATE_LOC < current_date)
select
 (select round(100.0*sum(PREBOOKED)/nullif(sum(COMPLETED_APPOINTMENTS),0)) from ANALYTICS.MARTS.STYLIST_PREBOOK where MONTH=date_trunc('month',(select d from r))) prebook_mtd,
 (select round(100.0*sum(PREBOOKED)/nullif(sum(COMPLETED_APPOINTMENTS),0)) from ANALYTICS.MARTS.STYLIST_PREBOOK where MONTH>=date_trunc('year',(select d from r))) prebook_ytd,
 (select round(100.0*sum(LUX_APPOINTMENTS)/nullif(sum(APPOINTMENTS),0)) from ANALYTICS.MARTS.LUX_PENETRATION where MONTH=date_trunc('month',(select d from r))) lux_mtd,
 (select round(100.0*sum(LUX_APPOINTMENTS)/nullif(sum(APPOINTMENTS),0)) from ANALYTICS.MARTS.LUX_PENETRATION where MONTH>=date_trunc('year',(select d from r))) lux_ytd,
 (select round(100.0*sum(NEXT_VISIT_PREBOOKED)/nullif(sum(VISITS),0)) from ANALYTICS.MARTS.REBOOKING where MONTH>=date_trunc('year',(select d from r))) rebook_ytd`

const STYLIST_SQL = `with r as (select max(DATE_LOC) d from ANALYTICS.MARTS.STYLIST_DAILY where DATE_LOC < current_date),
sd as (select STAFF_NAME, sum(APPOINTMENTS) appts, sum(NEW_CLIENTS) new,
   round(100.0*sum(REQUESTED_APPTS)/nullif(sum(APPOINTMENTS),0)) reqpct,
   round(sum(RETAIL_REVENUE)/nullif(sum(CLIENTS),0)) rpg
  from ANALYTICS.MARTS.STYLIST_DAILY
  where DATE_LOC>=date_trunc('month',(select d from r)) and DATE_LOC<=(select d from r) and coalesce(STAFF_NAME,'')<>''
  group by STAFF_NAME),
pb as (select STAFF_NAME, round(100.0*sum(PREBOOKED)/nullif(sum(COMPLETED_APPOINTMENTS),0)) prebook from ANALYTICS.MARTS.STYLIST_PREBOOK where MONTH=date_trunc('month',(select d from r)) group by STAFF_NAME),
lx as (select STAFF_NAME, round(100.0*sum(LUX_APPOINTMENTS)/nullif(sum(APPOINTMENTS),0)) lux from ANALYTICS.MARTS.LUX_PENETRATION where MONTH=date_trunc('month',(select d from r)) group by STAFF_NAME)
select sd.STAFF_NAME, sd.appts, sd.new, sd.reqpct, sd.rpg, pb.prebook, lx.lux
from sd left join pb on pb.STAFF_NAME=sd.STAFF_NAME left join lx on lx.STAFF_NAME=sd.STAFF_NAME
where sd.appts>0 order by sd.appts desc`

async function buildAndPost() {
  const [c] = await sf(COMPANY_SQL)
  const [q] = await sf(QUALITY_SQL)
  const stylists = await sf(STYLIST_SQL)

  const refLabel = c[0]
  const companyRows = [
    ['Yesterday', c[1], c[2], c[3], c[4], dash, dash],
    ['Week&#8209;to&#8209;date', c[5], c[6], c[7], c[8], dash, dash],
    ['Month&#8209;to&#8209;date', c[9], c[10], c[11], c[12], q[0], q[2]],
    ['Year&#8209;to&#8209;date', c[13], c[14], c[15], c[16], q[1], q[3]],
  ]
    .map(
      (row: any[]) =>
        `<tr><td>${row[0]}</td><td>${fmt(row[1])}</td><td>${fmt(row[2])}</td><td>${pct(row[3])}</td><td>$${fmt(row[4])}</td><td>${typeof row[5] === 'string' && row[5].includes('mdash') ? row[5] : pct(row[5])}</td><td>${typeof row[6] === 'string' && row[6].includes('mdash') ? row[6] : pct(row[6])}</td></tr>`,
    )
    .join('')

  const stylistRows = stylists
    .map(
      (s) =>
        `<tr><td>${s[0]}</td><td>${fmt(s[1])}</td><td>${fmt(s[2])}</td><td>${pct(s[3])}</td><td>$${fmt(s[4])}</td><td>${pct(s[5])}</td><td>${pct(s[6])}</td></tr>`,
    )
    .join('')

  const html =
    `<div style="color:#9fb3c8;font-size:12px;margin-bottom:8px">Company &middot; through ${refLabel} &middot; source: Snowflake ANALYTICS.MARTS</div>` +
    `<table><tr><th>Window</th><th>Guests</th><th>New</th><th>Req%</th><th>RPG</th><th>Prebook%</th><th>LUX%</th></tr>${companyRows}</table>` +
    `<div style="color:#fff;font-size:12px;font-weight:700;margin:14px 0 4px">By stylist &middot; month&#8209;to&#8209;date</div>` +
    `<table><tr><th>Stylist</th><th>Appts</th><th>New</th><th>Req%</th><th>RPG</th><th>Prebook%</th><th>LUX%</th></tr>${stylistRows}</table>` +
    `<div style="color:#9fb3c8;font-size:12px;margin-top:10px;line-height:1.6"><b style="color:#fff">Rebooking YTD:</b> ${pct(q[4])}<br>` +
    `<span style="opacity:.75">Prebook &amp; LUX are month&#8209;grain marts &mdash; shown for MTD/YTD only. Targets: prebook 70%, LUX 33%, RPG $8.</span></div>`

  const r = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'x-api-key': INGEST_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'daily-numbers', author_name: 'Snowflake', title: `ROP Scorecard — through ${refLabel}`, external_key: 'rop-scorecard', html }),
  })
  const body = await r.json().catch(() => ({}))
  return { ok: !!body.ok, refLabel, stylists: stylists.length, updated: body.updated }
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
