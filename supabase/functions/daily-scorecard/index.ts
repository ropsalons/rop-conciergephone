// ROP Connect — automatic rich "ROP Scorecard" (company + per-stylist), sourced from Snowflake.
// Self-contained scheduled job (pg_cron -> this function). Reads the ANALYTICS.MARTS views via the
// Snowflake SQL API using a read-only programmatic access token, builds an HTML scorecard
// (Yesterday / WTD / MTD / YTD company table + a per-stylist table with Yesterday/WTD/MTD/YTD tabs)
// and posts it into #daily-numbers through the ingest webhook. No Claude, no private key.

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

// Per-stylist, all four windows. Columns (0-based):
// 0 name | 1-4 Yesterday a,n,req,rpg | 5-8 WTD | 9-12 MTD | 13-16 YTD
// 17 prebook MTD | 18 prebook YTD | 19 LUX MTD | 20 LUX YTD
const STYLIST_SQL = `with r as (select max(DATE_LOC) d from ANALYTICS.MARTS.STYLIST_DAILY where DATE_LOC < current_date),
sd as (
  select STAFF_NAME,
    sum(iff(DATE_LOC=(select d from r),APPOINTMENTS,0)) y_a,
    sum(iff(DATE_LOC=(select d from r),NEW_CLIENTS,0)) y_n,
    round(100.0*sum(iff(DATE_LOC=(select d from r),REQUESTED_APPTS,0))/nullif(sum(iff(DATE_LOC=(select d from r),APPOINTMENTS,0)),0)) y_req,
    round(sum(iff(DATE_LOC=(select d from r),RETAIL_REVENUE,0))/nullif(sum(iff(DATE_LOC=(select d from r),CLIENTS,0)),0)) y_rpg,
    sum(iff(DATE_LOC>=date_trunc('week',(select d from r)),APPOINTMENTS,0)) w_a,
    sum(iff(DATE_LOC>=date_trunc('week',(select d from r)),NEW_CLIENTS,0)) w_n,
    round(100.0*sum(iff(DATE_LOC>=date_trunc('week',(select d from r)),REQUESTED_APPTS,0))/nullif(sum(iff(DATE_LOC>=date_trunc('week',(select d from r)),APPOINTMENTS,0)),0)) w_req,
    round(sum(iff(DATE_LOC>=date_trunc('week',(select d from r)),RETAIL_REVENUE,0))/nullif(sum(iff(DATE_LOC>=date_trunc('week',(select d from r)),CLIENTS,0)),0)) w_rpg,
    sum(iff(DATE_LOC>=date_trunc('month',(select d from r)),APPOINTMENTS,0)) m_a,
    sum(iff(DATE_LOC>=date_trunc('month',(select d from r)),NEW_CLIENTS,0)) m_n,
    round(100.0*sum(iff(DATE_LOC>=date_trunc('month',(select d from r)),REQUESTED_APPTS,0))/nullif(sum(iff(DATE_LOC>=date_trunc('month',(select d from r)),APPOINTMENTS,0)),0)) m_req,
    round(sum(iff(DATE_LOC>=date_trunc('month',(select d from r)),RETAIL_REVENUE,0))/nullif(sum(iff(DATE_LOC>=date_trunc('month',(select d from r)),CLIENTS,0)),0)) m_rpg,
    sum(APPOINTMENTS) ytd_a, sum(NEW_CLIENTS) ytd_n,
    round(100.0*sum(REQUESTED_APPTS)/nullif(sum(APPOINTMENTS),0)) ytd_req,
    round(sum(RETAIL_REVENUE)/nullif(sum(CLIENTS),0)) ytd_rpg
  from ANALYTICS.MARTS.STYLIST_DAILY
  where DATE_LOC>=date_trunc('year',(select d from r)) and DATE_LOC<=(select d from r) and coalesce(STAFF_NAME,'')<>''
  group by STAFF_NAME),
pbm as (select STAFF_NAME, round(100.0*sum(PREBOOKED)/nullif(sum(COMPLETED_APPOINTMENTS),0)) v from ANALYTICS.MARTS.STYLIST_PREBOOK where MONTH=date_trunc('month',(select d from r)) group by STAFF_NAME),
pby as (select STAFF_NAME, round(100.0*sum(PREBOOKED)/nullif(sum(COMPLETED_APPOINTMENTS),0)) v from ANALYTICS.MARTS.STYLIST_PREBOOK where MONTH>=date_trunc('year',(select d from r)) group by STAFF_NAME),
lxm as (select STAFF_NAME, round(100.0*sum(LUX_APPOINTMENTS)/nullif(sum(APPOINTMENTS),0)) v from ANALYTICS.MARTS.LUX_PENETRATION where MONTH=date_trunc('month',(select d from r)) group by STAFF_NAME),
lxy as (select STAFF_NAME, round(100.0*sum(LUX_APPOINTMENTS)/nullif(sum(APPOINTMENTS),0)) v from ANALYTICS.MARTS.LUX_PENETRATION where MONTH>=date_trunc('year',(select d from r)) group by STAFF_NAME)
select sd.STAFF_NAME, sd.y_a,sd.y_n,sd.y_req,sd.y_rpg, sd.w_a,sd.w_n,sd.w_req,sd.w_rpg,
  sd.m_a,sd.m_n,sd.m_req,sd.m_rpg, sd.ytd_a,sd.ytd_n,sd.ytd_req,sd.ytd_rpg,
  pbm.v, pby.v, lxm.v, lxy.v
from sd
left join pbm on pbm.STAFF_NAME=sd.STAFF_NAME
left join pby on pby.STAFF_NAME=sd.STAFF_NAME
left join lxm on lxm.STAFF_NAME=sd.STAFF_NAME
left join lxy on lxy.STAFF_NAME=sd.STAFF_NAME
where sd.ytd_a>0 order by sd.m_a desc, sd.ytd_a desc`

// Client-side (runs inside the sandboxed RichCard iframe): renders the per-stylist table and
// swaps the visible window when a tab is clicked. Prebook/LUX are month-grain marts, so they only
// carry a value in the MTD and YTD tabs (shown as — for Yesterday/WTD).
function stylistWidget(rows: string[][]): string {
  const data = JSON.stringify(rows)
  return `<div id="rop-st">
<div style="color:#fff;font-size:12px;font-weight:700;margin:14px 0 6px">By stylist</div>
<div id="rop-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"></div>
<div style="overflow-x:auto"><table id="rop-tbl" style="min-width:420px"></table></div>
</div>
<script>(function(){
  var S=${data};
  var W=[{k:'Yesterday',o:1,pb:null,lx:null},{k:'Week&#8209;to&#8209;date',o:5,pb:null,lx:null},{k:'Month&#8209;to&#8209;date',o:9,pb:17,lx:19},{k:'Year&#8209;to&#8209;date',o:13,pb:18,lx:20}];
  var cur=2;
  function num(v){return v==null||v===''?0:Number(v)}
  function fmt(v){return num(v).toLocaleString('en-US')}
  function P(v){return v==null||v===''?'<span style="opacity:.5">&mdash;</span>':num(v)+'%'}
  function esc(s){return String(s).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
  function render(){
    var w=W[cur];
    var rows=S.map(function(r){return{name:r[0],a:num(r[w.o]),n:r[w.o+1],req:r[w.o+2],rpg:r[w.o+3],pb:w.pb==null?null:r[w.pb],lx:w.lx==null?null:r[w.lx]}})
      .filter(function(x){return x.a>0}).sort(function(a,b){return b.a-a.a});
    var body=rows.map(function(x){return '<tr><td>'+esc(x.name)+'</td><td>'+fmt(x.a)+'</td><td>'+fmt(x.n)+'</td><td>'+P(x.req)+'</td><td>$'+fmt(x.rpg)+'</td><td>'+P(x.pb)+'</td><td>'+P(x.lx)+'</td></tr>'}).join('');
    document.getElementById('rop-tbl').innerHTML='<tr><th>Stylist</th><th>Appts</th><th>New</th><th>Req%</th><th>RPG</th><th>Prebook%</th><th>LUX%</th></tr>'+body;
    var tabs=W.map(function(x,i){var on=i===cur;return '<button data-i="'+i+'" style="cursor:pointer;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:4px 11px;font-size:12px;font-weight:600;'+(on?'background:#2563eb;color:#fff':'background:rgba(255,255,255,.06);color:#cbd5e1')+'">'+x.k+'</button>'}).join('');
    document.getElementById('rop-tabs').innerHTML=tabs;
    Array.prototype.forEach.call(document.querySelectorAll('#rop-tabs button'),function(b){b.onclick=function(){cur=+b.getAttribute('data-i');render()}});
  }
  render();
})();</script>`
}

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

  const html =
    `<div style="color:#9fb3c8;font-size:12px;margin-bottom:8px">Company &middot; through ${refLabel} &middot; source: Snowflake ANALYTICS.MARTS</div>` +
    `<div style="overflow-x:auto"><table style="min-width:420px"><tr><th>Window</th><th>Guests</th><th>New</th><th>Req%</th><th>RPG</th><th>Prebook%</th><th>LUX%</th></tr>${companyRows}</table></div>` +
    stylistWidget(stylists) +
    `<div style="color:#9fb3c8;font-size:12px;margin-top:10px;line-height:1.6"><b style="color:#fff">Rebooking YTD:</b> ${pct(q[4])}<br>` +
    `<span style="opacity:.75">Tap a window (Yesterday / WTD / MTD / YTD) to switch the stylist view. Prebook &amp; LUX are month&#8209;grain marts &mdash; they show only on MTD/YTD. Targets: prebook 70%, LUX 33%, RPG $8.</span></div>`

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
