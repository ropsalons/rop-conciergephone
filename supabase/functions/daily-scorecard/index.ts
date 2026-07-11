// ROP Connect — automatic rich "ROP Scorecard" (company total, by salon, by stylist), from Snowflake.
// Metrics per Yesterday/WTD/MTD/YTD: guests/appts, new guests, new-guest prebook %, RPG,
// prebook %, LUX % (Luxury Upgrades category), new-request % (new AND requested that stylist).
// Quality metrics come from ANALYTICS.MARTS.STYLIST_QUALITY_DAILY; guests/RPG from STYLIST_DAILY.
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
  const r = await fetch(SF_URL, { method: 'POST', headers, body: JSON.stringify({ statement: sql, timeout: 60, warehouse: 'COMPUTE_WH', role: 'ROP_CONNECT_READONLY', database: 'ANALYTICS', schema: 'MARTS' }) })
  let j: any = await r.json()
  if (r.status === 202 && j.statementHandle) {
    for (let i = 0; i < 12; i++) { await new Promise((res) => setTimeout(res, 1500)); const g = await fetch(SF_URL + '/' + j.statementHandle, { headers }); if (g.status === 200) { j = await g.json(); break } }
  }
  if (!j.data) throw new Error('Snowflake: ' + JSON.stringify(j).slice(0, 200))
  return j.data as string[][]
}

const n = (v: any) => (v == null || v === '' ? 0 : Number(v))
const fmt = (v: any) => n(v).toLocaleString('en-US')
const pct = (v: any) => (v == null || v === '' ? '<span style="opacity:.4">&mdash;</span>' : `${n(v)}%`)
// colored KPI cell (target-aware): pb 70/50, lux 33/20, rpg $8/$5
function kpi(v: any, kind: 'pb' | 'lux' | 'rpg'): string {
  if (v == null || v === '') return '<span style="opacity:.4">&mdash;</span>'
  const x = n(v)
  const t = kind === 'lux' ? [33, 20] : kind === 'rpg' ? [8, 5] : [70, 50]
  const c = x >= t[0] ? '#4ade80' : x >= t[1] ? '#fbbf24' : '#f87171'
  return `<span style="color:${c};font-weight:700">${kind === 'rpg' ? '$' + fmt(x) : x + '%'}</span>`
}

const REF = `with r as (select max(DATE_LOC) d from ANALYTICS.MARTS.STYLIST_DAILY where DATE_LOC < current_date)`
const IN_YEAR = `DATE_LOC>=date_trunc('year',(select d from r)) and DATE_LOC<=(select d from r)`
const Y = `DATE_LOC=(select d from r)`, W = `DATE_LOC>=date_trunc('week',(select d from r))`, M = `DATE_LOC>=date_trunc('month',(select d from r))`
// STYLIST_DAILY blocks: guests + RPG
const gm = (p: string, P: string) => `sum(iff(${P},CLIENTS,0)) ${p}_g, round(sum(iff(${P},RETAIL_REVENUE,0))/nullif(sum(iff(${P},CLIENTS,0)),0)) ${p}_rpg`
const gmY = (p: string) => `sum(CLIENTS) ${p}_g, round(sum(RETAIL_REVENUE)/nullif(sum(CLIENTS),0)) ${p}_rpg`
const rpgm = (p: string, P: string) => `round(sum(iff(${P},RETAIL_REVENUE,0))/nullif(sum(iff(${P},CLIENTS,0)),0)) ${p}_rpg`
const rpgmY = (p: string) => `round(sum(RETAIL_REVENUE)/nullif(sum(CLIENTS),0)) ${p}_rpg`
// QUALITY blocks: new, new-prebook%, prebook%, lux%, new-req%  (+ appts for stylist)
const qm = (p: string, P: string) => `sum(iff(${P},NEW_APPTS,0)) ${p}_new, round(100.0*sum(iff(${P},NEW_PREBOOKED_APPTS,0))/nullif(sum(iff(${P},NEW_APPTS,0)),0)) ${p}_npb, round(100.0*sum(iff(${P},PREBOOKED_APPTS,0))/nullif(sum(iff(${P},APPTS,0)),0)) ${p}_pb, round(100.0*sum(iff(${P},LUX_APPTS,0))/nullif(sum(iff(${P},APPTS,0)),0)) ${p}_lux, round(100.0*sum(iff(${P},NEW_REQUESTED_APPTS,0))/nullif(sum(iff(${P},APPTS,0)),0)) ${p}_nr`
const qmY = (p: string) => `sum(NEW_APPTS) ${p}_new, round(100.0*sum(NEW_PREBOOKED_APPTS)/nullif(sum(NEW_APPTS),0)) ${p}_npb, round(100.0*sum(PREBOOKED_APPTS)/nullif(sum(APPTS),0)) ${p}_pb, round(100.0*sum(LUX_APPTS)/nullif(sum(APPTS),0)) ${p}_lux, round(100.0*sum(NEW_REQUESTED_APPTS)/nullif(sum(APPTS),0)) ${p}_nr`
const am = (p: string, P: string) => `sum(iff(${P},APPTS,0)) ${p}_a`
const amY = (p: string) => `sum(APPTS) ${p}_a`
const P4 = ['y', 'w', 'm', 'ytd']
// interleaved outer columns: [guests/appts, new, newpb, rpg, pb, lux, nr]
const GS = P4.map((p) => `sd.${p}_g, q.${p}_new, q.${p}_npb, sd.${p}_rpg, q.${p}_pb, q.${p}_lux, q.${p}_nr`).join(', ')
const SS = P4.map((p) => `q.${p}_a, q.${p}_new, q.${p}_npb, coalesce(sd.${p}_rpg,0), q.${p}_pb, q.${p}_lux, q.${p}_nr`).join(', ')

const COMPANY_SQL = `${REF},
sd as (select to_char((select d from r),'Dy Mon DD') ref_label, ${gm('y', Y)}, ${gm('w', W)}, ${gm('m', M)}, ${gmY('ytd')} from ANALYTICS.MARTS.STYLIST_DAILY where ${IN_YEAR}),
q as (select ${qm('y', Y)}, ${qm('w', W)}, ${qm('m', M)}, ${qmY('ytd')} from ANALYTICS.MARTS.STYLIST_QUALITY_DAILY where ${IN_YEAR})
select sd.ref_label, ${GS} from sd, q`

const SALON_SQL = `${REF},
q as (select LOCATION_NAME, ${qm('y', Y)}, ${qm('w', W)}, ${qm('m', M)}, ${qmY('ytd')} from ANALYTICS.MARTS.STYLIST_QUALITY_DAILY where ${IN_YEAR} group by LOCATION_NAME),
sd as (select LOCATION_NAME, ${gm('y', Y)}, ${gm('w', W)}, ${gm('m', M)}, ${gmY('ytd')} from ANALYTICS.MARTS.STYLIST_DAILY where ${IN_YEAR} group by LOCATION_NAME)
select case sd.LOCATION_NAME when 'Naples Bayfront' then 'Bayfront' when 'Naples Village' then 'Village' when 'Bonita Promenade' then 'Bonita' else sd.LOCATION_NAME end, ${GS}
from sd join q on q.LOCATION_NAME=sd.LOCATION_NAME order by sd.m_g desc`

const STYLIST_SQL = `${REF},
q as (select STAFF_NAME, ${am('y', Y)}, ${qm('y', Y)}, ${am('w', W)}, ${qm('w', W)}, ${am('m', M)}, ${qm('m', M)}, ${amY('ytd')}, ${qmY('ytd')}
 from ANALYTICS.MARTS.STYLIST_QUALITY_DAILY where ${IN_YEAR} and coalesce(STAFF_NAME,'')<>'' group by STAFF_NAME),
sd as (select STAFF_NAME, ${rpgm('y', Y)}, ${rpgm('w', W)}, ${rpgm('m', M)}, ${rpgmY('ytd')}
 from ANALYTICS.MARTS.STYLIST_DAILY where ${IN_YEAR} and coalesce(STAFF_NAME,'')<>'' group by STAFF_NAME)
select q.STAFF_NAME, ${SS}
from q left join sd on sd.STAFF_NAME=q.STAFF_NAME
where q.ytd_a>0 order by q.m_a desc, q.ytd_a desc`

const REBOOK_SQL = `${REF} select round(100.0*sum(NEXT_VISIT_PREBOOKED)/nullif(sum(VISITS),0)) from ANALYTICS.MARTS.REBOOKING where MONTH>=date_trunc('year',(select d from r))`

const STYLE = `<style>
.rc{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#e5e7eb}
.rc .hd{color:#9fb3c8;font-size:12px;margin-bottom:10px}
.rc h4{color:#fff;font-size:12px;font-weight:800;letter-spacing:.02em;margin:18px 0 6px;display:flex;align-items:center;gap:7px}
.rc h4:before{content:"";width:3px;height:14px;background:#2563eb;border-radius:2px;display:inline-block}
.rc .wrap{overflow-x:auto;border-radius:12px;border:1px solid rgba(255,255,255,.09)}
.rc table{border-collapse:separate;border-spacing:0;width:100%;min-width:600px;font-size:13px;background:rgba(255,255,255,.015)}
.rc th{background:rgba(37,99,235,.16);color:#c7d2fe;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;text-align:right;padding:9px 12px;border:0;white-space:nowrap}
.rc th:first-child{text-align:left}
.rc td{padding:8px 12px;border:0;border-top:1px solid rgba(255,255,255,.06);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.rc td:first-child{text-align:left;color:#fff;font-weight:600}
.rc tbody tr:nth-child(even){background:rgba(255,255,255,.025)}
.rc .tabs{display:flex;gap:6px;flex-wrap:wrap;margin:16px 0 6px}
.rc .tabs button{cursor:pointer;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:5px 13px;font-size:12px;font-weight:700;background:rgba(255,255,255,.06);color:#cbd5e1}
.rc .tabs button.on{background:#2563eb;color:#fff;border-color:#2563eb;box-shadow:0 2px 8px rgba(37,99,235,.4)}
.rc .foot{color:#9fb3c8;font-size:12px;margin-top:12px;line-height:1.65}
.rc .tt{display:inline-block;min-width:104px;flex:1;background:linear-gradient(180deg,rgba(37,99,235,.14),rgba(37,99,235,.05));border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px 12px}
.rc .tt .l{font-size:10px;color:#9fb3c8;text-transform:uppercase;letter-spacing:.05em}
.rc .tt .v{font-size:22px;font-weight:800;color:#fff;margin-top:2px}
</style>`

const HEAD = (first: string, second: string) =>
  `<thead><tr><th>${first}</th><th>${second}</th><th>New</th><th>New&nbsp;PB%</th><th>RPG</th><th>Prebook%</th><th>LUX%</th><th>New&nbsp;Req%</th></tr></thead>`

// Interactive widget: one window tab bar drives the By-salon and By-stylist tables.
function widget(salons: string[][], stylists: string[][]): string {
  return `<div class="tabs" id="rop-tabs"></div>
<h4>By salon</h4><div class="wrap"><table id="rop-sal"></table></div>
<h4>By stylist</h4><div class="wrap"><table id="rop-tbl"></table></div>
<script>(function(){
  var SAL=${JSON.stringify(salons)}, STY=${JSON.stringify(stylists)};
  var W=[{k:'Yesterday',o:1},{k:'Week&#8209;to&#8209;date',o:8},{k:'Month&#8209;to&#8209;date',o:15},{k:'Year&#8209;to&#8209;date',o:22}];
  var cur=2;
  function num(v){return v==null||v===''?0:Number(v)}
  function fmt(v){return num(v).toLocaleString('en-US')}
  function dash(){return '<span style="opacity:.4">&mdash;</span>'}
  function P(v){return v==null||v===''?dash():num(v)+'%'}
  function kpi(v,kind){if(v==null||v==='')return dash();var x=num(v);var t=kind==='lux'?[33,20]:kind==='rpg'?[8,5]:[70,50];var c=x>=t[0]?'#4ade80':x>=t[1]?'#fbbf24':'#f87171';return '<span style="color:'+c+';font-weight:700">'+(kind==='rpg'?'$'+fmt(x):x+'%')+'</span>'}
  function esc(s){return String(s).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
  function row(r,o){return '<tr><td>'+esc(r[0])+'</td><td>'+fmt(r[o])+'</td><td>'+fmt(r[o+1])+'</td><td>'+kpi(r[o+2],'pb')+'</td><td>'+kpi(r[o+3],'rpg')+'</td><td>'+kpi(r[o+4],'pb')+'</td><td>'+kpi(r[o+5],'lux')+'</td><td>'+P(r[o+6])+'</td></tr>'}
  var HEAD=function(a,b){return '<thead><tr><th>'+a+'</th><th>'+b+'</th><th>New</th><th>New&nbsp;PB%</th><th>RPG</th><th>Prebook%</th><th>LUX%</th><th>New&nbsp;Req%</th></tr></thead>'}
  function render(){
    var o=W[cur].o;
    document.getElementById('rop-sal').innerHTML=HEAD('Salon','Guests')+'<tbody>'+SAL.map(function(r){return row(r,o)}).join('')+'</tbody>';
    var rows=STY.filter(function(r){return num(r[o])>0}).sort(function(a,b){return num(b[o])-num(a[o])});
    document.getElementById('rop-tbl').innerHTML=HEAD('Stylist','Appts')+'<tbody>'+rows.map(function(r){return row(r,o)}).join('')+'</tbody>';
    document.getElementById('rop-tabs').innerHTML=W.map(function(x,i){return '<button class="'+(i===cur?'on':'')+'" data-i="'+i+'">'+x.k+'</button>'}).join('');
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
    `<tr><td>${label}</td><td>${fmt(c[o])}</td><td>${fmt(c[o + 1])}</td><td>${kpi(c[o + 2], 'pb')}</td><td>${kpi(c[o + 3], 'rpg')}</td><td>${kpi(c[o + 4], 'pb')}</td><td>${kpi(c[o + 5], 'lux')}</td><td>${pct(c[o + 6])}</td></tr>`
  const companyRows = win(1, 'Yesterday') + win(8, 'Week&#8209;to&#8209;date') + win(15, 'Month&#8209;to&#8209;date') + win(22, 'Year&#8209;to&#8209;date')

  const html =
    STYLE +
    `<div class="rc">` +
    `<div class="hd">Company total &middot; through ${refLabel} &middot; source: Snowflake ANALYTICS.MARTS</div>` +
    `<div class="wrap"><table>${HEAD('Window', 'Guests')}<tbody>${companyRows}</tbody></table></div>` +
    widget(salons, stylists) +
    `<div class="foot">` +
    (rebookYtd ? `<b style="color:#fff">Rebooking YTD:</b> ${pct(rebookYtd)} &middot; ` : '') +
    `Tap a window (Yesterday / WTD / MTD / YTD) to switch every table. <b style="color:#fff">New&nbsp;PB%</b> = of new guests, how many pre‑booked their next visit. <b style="color:#fff">New&nbsp;Req%</b> = guests who were new <i>and</i> requested that stylist. Colors: <span style="color:#4ade80">on target</span> / <span style="color:#fbbf24">close</span> / <span style="color:#f87171">below</span>. Targets: prebook 70%, LUX 33%, RPG $8.</div>` +
    `</div>`

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
