// ROP Connect — automatic rich "ROP Scorecard" (company + per-stylist), sourced from Snowflake.
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

// Reference day = most recent completed day (< today). Windows are relative to it.
const REF = `with r as (select max(DATE_LOC) d from ANALYTICS.MARTS.STYLIST_DAILY where DATE_LOC < current_date)`
const IN_YEAR = `DATE_LOC>=date_trunc('year',(select d from r)) and DATE_LOC<=(select d from r)`
// helper window predicates
const Y = `DATE_LOC=(select d from r)`
const W = `DATE_LOC>=date_trunc('week',(select d from r))`
const M = `DATE_LOC>=date_trunc('month',(select d from r))`

// Company: Guests/New/RPG from STYLIST_DAILY; Prebook%/LUX%/NewReq% from STYLIST_QUALITY_DAILY.
const COMPANY_SQL = `${REF},
sd as (select
  to_char((select d from r),'Dy Mon DD') ref_label,
  sum(iff(${Y},CLIENTS,0)) y_g, sum(iff(${Y},NEW_CLIENTS,0)) y_n, round(sum(iff(${Y},RETAIL_REVENUE,0))/nullif(sum(iff(${Y},CLIENTS,0)),0)) y_rpg,
  sum(iff(${W},CLIENTS,0)) w_g, sum(iff(${W},NEW_CLIENTS,0)) w_n, round(sum(iff(${W},RETAIL_REVENUE,0))/nullif(sum(iff(${W},CLIENTS,0)),0)) w_rpg,
  sum(iff(${M},CLIENTS,0)) m_g, sum(iff(${M},NEW_CLIENTS,0)) m_n, round(sum(iff(${M},RETAIL_REVENUE,0))/nullif(sum(iff(${M},CLIENTS,0)),0)) m_rpg,
  sum(CLIENTS) ytd_g, sum(NEW_CLIENTS) ytd_n, round(sum(RETAIL_REVENUE)/nullif(sum(CLIENTS),0)) ytd_rpg
 from ANALYTICS.MARTS.STYLIST_DAILY where ${IN_YEAR}),
q as (select
  round(100.0*sum(iff(${Y},PREBOOKED_APPTS,0))/nullif(sum(iff(${Y},APPTS,0)),0)) y_pb, round(100.0*sum(iff(${Y},LUX_APPTS,0))/nullif(sum(iff(${Y},APPTS,0)),0)) y_lux, round(100.0*sum(iff(${Y},NEW_REQUESTED_APPTS,0))/nullif(sum(iff(${Y},APPTS,0)),0)) y_nr,
  round(100.0*sum(iff(${W},PREBOOKED_APPTS,0))/nullif(sum(iff(${W},APPTS,0)),0)) w_pb, round(100.0*sum(iff(${W},LUX_APPTS,0))/nullif(sum(iff(${W},APPTS,0)),0)) w_lux, round(100.0*sum(iff(${W},NEW_REQUESTED_APPTS,0))/nullif(sum(iff(${W},APPTS,0)),0)) w_nr,
  round(100.0*sum(iff(${M},PREBOOKED_APPTS,0))/nullif(sum(iff(${M},APPTS,0)),0)) m_pb, round(100.0*sum(iff(${M},LUX_APPTS,0))/nullif(sum(iff(${M},APPTS,0)),0)) m_lux, round(100.0*sum(iff(${M},NEW_REQUESTED_APPTS,0))/nullif(sum(iff(${M},APPTS,0)),0)) m_nr,
  round(100.0*sum(PREBOOKED_APPTS)/nullif(sum(APPTS),0)) ytd_pb, round(100.0*sum(LUX_APPTS)/nullif(sum(APPTS),0)) ytd_lux, round(100.0*sum(NEW_REQUESTED_APPTS)/nullif(sum(APPTS),0)) ytd_nr
 from ANALYTICS.MARTS.STYLIST_QUALITY_DAILY where ${IN_YEAR})
select sd.ref_label,
 sd.y_g,sd.y_n,sd.y_rpg,q.y_pb,q.y_lux,q.y_nr,
 sd.w_g,sd.w_n,sd.w_rpg,q.w_pb,q.w_lux,q.w_nr,
 sd.m_g,sd.m_n,sd.m_rpg,q.m_pb,q.m_lux,q.m_nr,
 sd.ytd_g,sd.ytd_n,sd.ytd_rpg,q.ytd_pb,q.ytd_lux,q.ytd_nr
from sd, q`

// Per stylist, all four windows: [name, then 4×(appts,new,rpg,prebook%,lux%,newreq%)].
const STYLIST_SQL = `${REF},
q as (select STAFF_NAME,
  sum(iff(${Y},APPTS,0)) y_a, sum(iff(${Y},NEW_APPTS,0)) y_n, round(100.0*sum(iff(${Y},PREBOOKED_APPTS,0))/nullif(sum(iff(${Y},APPTS,0)),0)) y_pb, round(100.0*sum(iff(${Y},LUX_APPTS,0))/nullif(sum(iff(${Y},APPTS,0)),0)) y_lux, round(100.0*sum(iff(${Y},NEW_REQUESTED_APPTS,0))/nullif(sum(iff(${Y},APPTS,0)),0)) y_nr,
  sum(iff(${W},APPTS,0)) w_a, sum(iff(${W},NEW_APPTS,0)) w_n, round(100.0*sum(iff(${W},PREBOOKED_APPTS,0))/nullif(sum(iff(${W},APPTS,0)),0)) w_pb, round(100.0*sum(iff(${W},LUX_APPTS,0))/nullif(sum(iff(${W},APPTS,0)),0)) w_lux, round(100.0*sum(iff(${W},NEW_REQUESTED_APPTS,0))/nullif(sum(iff(${W},APPTS,0)),0)) w_nr,
  sum(iff(${M},APPTS,0)) m_a, sum(iff(${M},NEW_APPTS,0)) m_n, round(100.0*sum(iff(${M},PREBOOKED_APPTS,0))/nullif(sum(iff(${M},APPTS,0)),0)) m_pb, round(100.0*sum(iff(${M},LUX_APPTS,0))/nullif(sum(iff(${M},APPTS,0)),0)) m_lux, round(100.0*sum(iff(${M},NEW_REQUESTED_APPTS,0))/nullif(sum(iff(${M},APPTS,0)),0)) m_nr,
  sum(APPTS) ytd_a, sum(NEW_APPTS) ytd_n, round(100.0*sum(PREBOOKED_APPTS)/nullif(sum(APPTS),0)) ytd_pb, round(100.0*sum(LUX_APPTS)/nullif(sum(APPTS),0)) ytd_lux, round(100.0*sum(NEW_REQUESTED_APPTS)/nullif(sum(APPTS),0)) ytd_nr
 from ANALYTICS.MARTS.STYLIST_QUALITY_DAILY where ${IN_YEAR} and coalesce(STAFF_NAME,'')<>'' group by STAFF_NAME),
sd as (select STAFF_NAME,
  round(sum(iff(${Y},RETAIL_REVENUE,0))/nullif(sum(iff(${Y},CLIENTS,0)),0)) y_rpg,
  round(sum(iff(${W},RETAIL_REVENUE,0))/nullif(sum(iff(${W},CLIENTS,0)),0)) w_rpg,
  round(sum(iff(${M},RETAIL_REVENUE,0))/nullif(sum(iff(${M},CLIENTS,0)),0)) m_rpg,
  round(sum(RETAIL_REVENUE)/nullif(sum(CLIENTS),0)) ytd_rpg
 from ANALYTICS.MARTS.STYLIST_DAILY where ${IN_YEAR} and coalesce(STAFF_NAME,'')<>'' group by STAFF_NAME)
select q.STAFF_NAME,
 q.y_a,q.y_n,coalesce(sd.y_rpg,0),q.y_pb,q.y_lux,q.y_nr,
 q.w_a,q.w_n,coalesce(sd.w_rpg,0),q.w_pb,q.w_lux,q.w_nr,
 q.m_a,q.m_n,coalesce(sd.m_rpg,0),q.m_pb,q.m_lux,q.m_nr,
 q.ytd_a,q.ytd_n,coalesce(sd.ytd_rpg,0),q.ytd_pb,q.ytd_lux,q.ytd_nr
from q left join sd on sd.STAFF_NAME=q.STAFF_NAME
where q.ytd_a>0 order by q.m_a desc, q.ytd_a desc`

const REBOOK_SQL = `${REF} select round(100.0*sum(NEXT_VISIT_PREBOOKED)/nullif(sum(VISITS),0)) from ANALYTICS.MARTS.REBOOKING where MONTH>=date_trunc('year',(select d from r))`

function stylistWidget(rows: string[][]): string {
  const data = JSON.stringify(rows)
  return `<div id="rop-st">
<div style="color:#fff;font-size:12px;font-weight:700;margin:14px 0 6px">By stylist</div>
<div id="rop-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"></div>
<div style="overflow-x:auto"><table id="rop-tbl" style="min-width:520px"></table></div>
</div>
<script>(function(){
  var S=${data};
  var W=[{k:'Yesterday',o:1},{k:'Week&#8209;to&#8209;date',o:7},{k:'Month&#8209;to&#8209;date',o:13},{k:'Year&#8209;to&#8209;date',o:19}];
  var cur=2;
  function num(v){return v==null||v===''?0:Number(v)}
  function fmt(v){return num(v).toLocaleString('en-US')}
  function P(v){return v==null||v===''?'<span style="opacity:.5">&mdash;</span>':num(v)+'%'}
  function esc(s){return String(s).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
  function render(){
    var o=W[cur].o;
    var rows=S.map(function(r){return{name:r[0],a:num(r[o]),n:r[o+1],rpg:r[o+2],pb:r[o+3],lux:r[o+4],nr:r[o+5]}})
      .filter(function(x){return x.a>0}).sort(function(a,b){return b.a-a.a});
    var body=rows.map(function(x){return '<tr><td>'+esc(x.name)+'</td><td>'+fmt(x.a)+'</td><td>'+fmt(x.n)+'</td><td>$'+fmt(x.rpg)+'</td><td>'+P(x.pb)+'</td><td>'+P(x.lux)+'</td><td>'+P(x.nr)+'</td></tr>'}).join('');
    document.getElementById('rop-tbl').innerHTML='<tr><th>Stylist</th><th>Appts</th><th>New</th><th>RPG</th><th>Prebook%</th><th>LUX%</th><th>New&nbsp;Req%</th></tr>'+body;
    var tabs=W.map(function(x,i){var on=i===cur;return '<button data-i="'+i+'" style="cursor:pointer;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:4px 11px;font-size:12px;font-weight:600;'+(on?'background:#2563eb;color:#fff':'background:rgba(255,255,255,.06);color:#cbd5e1')+'">'+x.k+'</button>'}).join('');
    document.getElementById('rop-tabs').innerHTML=tabs;
    Array.prototype.forEach.call(document.querySelectorAll('#rop-tabs button'),function(b){b.onclick=function(){cur=+b.getAttribute('data-i');render()}});
  }
  render();
})();</script>`
}

async function buildAndPost() {
  const [c] = await sf(COMPANY_SQL)
  const stylists = await sf(STYLIST_SQL)
  let rebookYtd = ''
  try { const [[rb]] = await sf(REBOOK_SQL); rebookYtd = rb } catch (_) { /* optional */ }

  const refLabel = c[0]
  // company rows: [window, guests, new, rpg, prebook%, lux%, newreq%] at offsets 1,7,13,19
  const win = (o: number, label: string) =>
    `<tr><td>${label}</td><td>${fmt(c[o])}</td><td>${fmt(c[o + 1])}</td><td>$${fmt(c[o + 2])}</td><td>${pct(c[o + 3])}</td><td>${pct(c[o + 4])}</td><td>${pct(c[o + 5])}</td></tr>`
  const companyRows = win(1, 'Yesterday') + win(7, 'Week&#8209;to&#8209;date') + win(13, 'Month&#8209;to&#8209;date') + win(19, 'Year&#8209;to&#8209;date')

  const html =
    `<div style="color:#9fb3c8;font-size:12px;margin-bottom:8px">Company &middot; through ${refLabel} &middot; source: Snowflake ANALYTICS.MARTS</div>` +
    `<div style="overflow-x:auto"><table style="min-width:520px"><tr><th>Window</th><th>Guests</th><th>New</th><th>RPG</th><th>Prebook%</th><th>LUX%</th><th>New&nbsp;Req%</th></tr>${companyRows}</table></div>` +
    stylistWidget(stylists) +
    `<div style="color:#9fb3c8;font-size:12px;margin-top:10px;line-height:1.6">` +
    (rebookYtd ? `<b style="color:#fff">Rebooking YTD:</b> ${pct(rebookYtd)}<br>` : '') +
    `<span style="opacity:.75">New&nbsp;Req% = guests who were new <i>and</i> requested that stylist. LUX% = share of appointments with a Luxury Upgrade. Targets: prebook 70%, LUX 33%, RPG $8.</span></div>`

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
