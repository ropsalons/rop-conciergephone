// ROP Connect — automatic rich "ROP Scorecard" (company total, by salon, by stylist), from Snowflake.
// Quality metrics (Prebook %, LUX %, New-Request %) come from ANALYTICS.MARTS.STYLIST_QUALITY_DAILY
// (daily grain: LUX = 'LUXURY UPGRADES' category, prebook = IS_PREBOOKED, new-request = new & requested).
// Guests / New / RPG come from STYLIST_DAILY. Every metric is available for Yesterday / WTD / MTD / YTD.
// Deployed copy holds live secrets; the repo copy keeps them redacted (Deno.env fallback).

const SF_URL = 'https://QXKKQNU-JNB21158.snowflakecomputing.com/api/v2/statements'
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

const REF = `with r as (select max(DATE_LOC) d from ANALYTICS.MARTS.STYLIST_DAILY where DATE_LOC < current_date)`
const IN_YEAR = `DATE_LOC>=date_trunc('year',(select d from r)) and DATE_LOC<=(select d from r)`
const Y = `DATE_LOC=(select d from r)`
const W = `DATE_LOC>=date_trunc('week',(select d from r))`
const M = `DATE_LOC>=date_trunc('month',(select d from r))`
// Aliased column blocks per window (prefix p, predicate P) — explicit names so the outer select can interleave them.
const gcols = (p: string, P: string) => `sum(iff(${P},CLIENTS,0)) ${p}_g, sum(iff(${P},NEW_CLIENTS,0)) ${p}_n, round(sum(iff(${P},RETAIL_REVENUE,0))/nullif(sum(iff(${P},CLIENTS,0)),0)) ${p}_rpg`
const gYtd = (p: string) => `sum(CLIENTS) ${p}_g, sum(NEW_CLIENTS) ${p}_n, round(sum(RETAIL_REVENUE)/nullif(sum(CLIENTS),0)) ${p}_rpg`
const qcols = (p: string, P: string) => `round(100.0*sum(iff(${P},PREBOOKED_APPTS,0))/nullif(sum(iff(${P},APPTS,0)),0)) ${p}_pb, round(100.0*sum(iff(${P},LUX_APPTS,0))/nullif(sum(iff(${P},APPTS,0)),0)) ${p}_lux, round(100.0*sum(iff(${P},NEW_REQUESTED_APPTS,0))/nullif(sum(iff(${P},APPTS,0)),0)) ${p}_nr`
const qYtd = (p: string) => `round(100.0*sum(PREBOOKED_APPTS)/nullif(sum(APPTS),0)) ${p}_pb, round(100.0*sum(LUX_APPTS)/nullif(sum(APPTS),0)) ${p}_lux, round(100.0*sum(NEW_REQUESTED_APPTS)/nullif(sum(APPTS),0)) ${p}_nr`
const acols = (p: string, P: string) => `sum(iff(${P},APPTS,0)) ${p}_a, sum(iff(${P},NEW_APPTS,0)) ${p}_n`
const aYtd = (p: string) => `sum(APPTS) ${p}_a, sum(NEW_APPTS) ${p}_n`
const rpg = (p: string, P: string) => `round(sum(iff(${P},RETAIL_REVENUE,0))/nullif(sum(iff(${P},CLIENTS,0)),0)) ${p}_rpg`
const rpgYtd = (p: string) => `round(sum(RETAIL_REVENUE)/nullif(sum(CLIENTS),0)) ${p}_rpg`
// interleaved outer-select column list for guests/quality tables (prefix set y,w,m,ytd)
const GQ = ['y', 'w', 'm', 'ytd'].map((p) => `sd.${p}_g,sd.${p}_n,sd.${p}_rpg,q.${p}_pb,q.${p}_lux,q.${p}_nr`).join(', ')
const AQ = ['y', 'w', 'm', 'ytd'].map((p) => `q.${p}_a,q.${p}_n,coalesce(sd.${p}_rpg,0),q.${p}_pb,q.${p}_lux,q.${p}_nr`).join(', ')

const COMPANY_SQL = `${REF},
sd as (select to_char((select d from r),'Dy Mon DD') ref_label, ${gcols('y', Y)}, ${gcols('w', W)}, ${gcols('m', M)}, ${gYtd('ytd')} from ANALYTICS.MARTS.STYLIST_DAILY where ${IN_YEAR}),
q as (select ${qcols('y', Y)}, ${qcols('w', W)}, ${qcols('m', M)}, ${qYtd('ytd')} from ANALYTICS.MARTS.STYLIST_QUALITY_DAILY where ${IN_YEAR})
select sd.ref_label, ${GQ} from sd, q`

// By salon: [salon, then 4×(guests,new,rpg,prebook%,lux%,newreq%)].
const SALON_SQL = `${REF},
q as (select LOCATION_NAME, ${qcols('y', Y)}, ${qcols('w', W)}, ${qcols('m', M)}, ${qYtd('ytd')} from ANALYTICS.MARTS.STYLIST_QUALITY_DAILY where ${IN_YEAR} group by LOCATION_NAME),
sd as (select LOCATION_NAME, ${gcols('y', Y)}, ${gcols('w', W)}, ${gcols('m', M)}, ${gYtd('ytd')} from ANALYTICS.MARTS.STYLIST_DAILY where ${IN_YEAR} group by LOCATION_NAME)
select case sd.LOCATION_NAME when 'Naples Bayfront' then 'Bayfront' when 'Naples Village' then 'Village' when 'Bonita Promenade' then 'Bonita' else sd.LOCATION_NAME end, ${GQ}
from sd join q on q.LOCATION_NAME=sd.LOCATION_NAME order by sd.m_g desc`

// By stylist: [name, then 4×(appts,new,rpg,prebook%,lux%,newreq%)].
const STYLIST_SQL = `${REF},
q as (select STAFF_NAME, ${acols('y', Y)}, ${qcols('y', Y)}, ${acols('w', W)}, ${qcols('w', W)}, ${acols('m', M)}, ${qcols('m', M)}, ${aYtd('ytd')}, ${qYtd('ytd')}
 from ANALYTICS.MARTS.STYLIST_QUALITY_DAILY where ${IN_YEAR} and coalesce(STAFF_NAME,'')<>'' group by STAFF_NAME),
sd as (select STAFF_NAME, ${rpg('y', Y)}, ${rpg('w', W)}, ${rpg('m', M)}, ${rpgYtd('ytd')}
 from ANALYTICS.MARTS.STYLIST_DAILY where ${IN_YEAR} and coalesce(STAFF_NAME,'')<>'' group by STAFF_NAME)
select q.STAFF_NAME, ${AQ}
from q left join sd on sd.STAFF_NAME=q.STAFF_NAME
where q.ytd_a>0 order by q.m_a desc, q.ytd_a desc`

const REBOOK_SQL = `${REF} select round(100.0*sum(NEXT_VISIT_PREBOOKED)/nullif(sum(VISITS),0)) from ANALYTICS.MARTS.REBOOKING where MONTH>=date_trunc('year',(select d from r))`

// Interactive widget: one Yesterday/WTD/MTD/YTD tab bar drives BOTH the by-salon and by-stylist tables.
function scorecardWidget(salons: string[][], stylists: string[][]): string {
  return `<div id="rop-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 8px"></div>
<div style="color:#fff;font-size:12px;font-weight:700;margin:6px 0 4px">By salon</div>
<div style="overflow-x:auto"><table id="rop-sal" style="min-width:520px"></table></div>
<div style="color:#fff;font-size:12px;font-weight:700;margin:14px 0 4px">By stylist</div>
<div style="overflow-x:auto"><table id="rop-tbl" style="min-width:520px"></table></div>
<script>(function(){
  var SAL=${JSON.stringify(salons)}, STY=${JSON.stringify(stylists)};
  var W=[{k:'Yesterday',o:1},{k:'Week&#8209;to&#8209;date',o:7},{k:'Month&#8209;to&#8209;date',o:13},{k:'Year&#8209;to&#8209;date',o:19}];
  var cur=2;
  function num(v){return v==null||v===''?0:Number(v)}
  function fmt(v){return num(v).toLocaleString('en-US')}
  function P(v){return v==null||v===''?'<span style="opacity:.5">&mdash;</span>':num(v)+'%'}
  function esc(s){return String(s).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
  function rowHtml(r,o){return '<tr><td>'+esc(r[0])+'</td><td>'+fmt(r[o])+'</td><td>'+fmt(r[o+1])+'</td><td>$'+fmt(r[o+2])+'</td><td>'+P(r[o+3])+'</td><td>'+P(r[o+4])+'</td><td>'+P(r[o+5])+'</td></tr>'}
  function render(){
    var o=W[cur].o;
    var salHead='<tr><th>Salon</th><th>Guests</th><th>New</th><th>RPG</th><th>Prebook%</th><th>LUX%</th><th>New&nbsp;Req%</th></tr>';
    document.getElementById('rop-sal').innerHTML=salHead+SAL.map(function(r){return rowHtml(r,o)}).join('');
    var stHead='<tr><th>Stylist</th><th>Appts</th><th>New</th><th>RPG</th><th>Prebook%</th><th>LUX%</th><th>New&nbsp;Req%</th></tr>';
    var rows=STY.filter(function(r){return num(r[o])>0}).sort(function(a,b){return num(b[o])-num(a[o])});
    document.getElementById('rop-tbl').innerHTML=stHead+rows.map(function(r){return rowHtml(r,o)}).join('');
    document.getElementById('rop-tabs').innerHTML=W.map(function(x,i){var on=i===cur;return '<button data-i="'+i+'" style="cursor:pointer;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:4px 11px;font-size:12px;font-weight:600;'+(on?'background:#2563eb;color:#fff':'background:rgba(255,255,255,.06);color:#cbd5e1')+'">'+x.k+'</button>'}).join('');
    Array.prototype.forEach.call(document.querySelectorAll('#rop-tabs button'),function(b){b.onclick=function(){cur=+b.getAttribute('data-i');render()}});
  }
  render();
})();</script>`
}

async function buildAndPost() {
  const [c] = await sf(COMPANY_SQL)
  const salons = await sf(SALON_SQL)
  const stylists = await sf(STYLIST_SQL)
  let rebookYtd = ''
  try { const [[rb]] = await sf(REBOOK_SQL); rebookYtd = rb } catch (_) { /* optional */ }

  const refLabel = c[0]
  const win = (o: number, label: string) =>
    `<tr><td>${label}</td><td>${fmt(c[o])}</td><td>${fmt(c[o + 1])}</td><td>$${fmt(c[o + 2])}</td><td>${pct(c[o + 3])}</td><td>${pct(c[o + 4])}</td><td>${pct(c[o + 5])}</td></tr>`
  const companyRows = win(1, 'Yesterday') + win(7, 'Week&#8209;to&#8209;date') + win(13, 'Month&#8209;to&#8209;date') + win(19, 'Year&#8209;to&#8209;date')

  const html =
    `<div style="color:#9fb3c8;font-size:12px;margin-bottom:8px">Company total &middot; through ${refLabel} &middot; source: Snowflake ANALYTICS.MARTS</div>` +
    `<div style="overflow-x:auto"><table style="min-width:520px"><tr><th>Window</th><th>Guests</th><th>New</th><th>RPG</th><th>Prebook%</th><th>LUX%</th><th>New&nbsp;Req%</th></tr>${companyRows}</table></div>` +
    scorecardWidget(salons, stylists) +
    `<div style="color:#9fb3c8;font-size:12px;margin-top:10px;line-height:1.6">` +
    (rebookYtd ? `<b style="color:#fff">Rebooking YTD:</b> ${pct(rebookYtd)}<br>` : '') +
    `<span style="opacity:.75">Company total, then a By-salon and By-stylist breakdown — tap a window to switch all three. New&nbsp;Req% = guests who were new <i>and</i> requested that stylist. LUX% = share with a Luxury Upgrade. Targets: prebook 70%, LUX 33%, RPG $8.</span></div>`

  const r = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'x-api-key': INGEST_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'daily-numbers', author_name: 'Snowflake', title: `ROP Scorecard — through ${refLabel}`, external_key: 'rop-scorecard', html }),
  })
  const body = await r.json().catch(() => ({}))
  return { ok: !!body.ok, refLabel, salons: salons.length, stylists: stylists.length, updated: body.updated }
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
