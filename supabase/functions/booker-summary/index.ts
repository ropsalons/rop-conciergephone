// ROP Connect — "bookings by booker" summary into #bookings-by-booker (hourly, pg_cron).
// Reads ANALYTICS.MARTS.BOOKINGS_CREATED (CREATED_BY_NAME = the staff login who booked). Computes,
// per booker, bookings + new-guest counts across 8 windows (Today / Yesterday / WTD / Last week /
// MTD / Last month / Last 3 mo / Last 12 mo) and posts an interactive card whose tab bar switches
// every window client-side. Snowflake lags real-time ~1-2h. Deployed copy holds live secrets.

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

// 8 windows: label + SQL predicate over b.d (the ET booking-created date) and r.td (ET today).
const WINS: [string, string][] = [
  ['Today', 'b.d = r.td'],
  ['Yesterday', "b.d = dateadd('day',-1,r.td)"],
  ['Week-to-date', "b.d >= date_trunc('week', r.td) and b.d <= r.td"],
  ['Last week', "b.d >= dateadd('day',-7, date_trunc('week', r.td)) and b.d < date_trunc('week', r.td)"],
  ['Month-to-date', "b.d >= date_trunc('month', r.td) and b.d <= r.td"],
  ['Last month', "b.d >= date_trunc('month', dateadd('month',-1, r.td)) and b.d < date_trunc('month', r.td)"],
  ['Last 3 months', "b.d >= dateadd('month',-3, r.td) and b.d <= r.td"],
  ['Last 12 months', "b.d >= dateadd('month',-12, r.td) and b.d <= r.td"],
]
const AGG = WINS.map(([, p], i) => `count_if(${p}) w${i}_n, sum(iff(${p}, b.newg, 0)) w${i}_new`).join(', ')

const SQL = `with r as (select convert_timezone('UTC','${TZ}', sysdate())::date td),
b as (
  select
    case when lower(CREATED_BY_TYPE)='staff' then coalesce(nullif(trim(CREATED_BY_NAME),''),'Staff') else 'Online / self-booked' end booker,
    case when lower(CREATED_BY_TYPE)='staff' then 'Staff' else 'Online' end typ,
    convert_timezone('UTC','${TZ}', CREATED_AT)::date d,
    iff(IS_NEW_CLIENT,1,0) newg
  from ANALYTICS.MARTS.BOOKINGS_CREATED
  where coalesce(IS_CANCELLED,false)=false
    and convert_timezone('UTC','${TZ}', CREATED_AT)::date >= dateadd('month',-12, (select td from r))
)
select b.booker, b.typ, ${AGG}
from b cross join r
group by b.booker, b.typ
order by b.booker`

const STYLE = `<style>
.rc{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#e5e7eb}
.rc .hd{color:#9fb3c8;font-size:12px;margin-bottom:10px}
.rc .tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}
.rc .tabs button{cursor:pointer;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:5px 12px;font-size:12px;font-weight:700;background:rgba(255,255,255,.06);color:#cbd5e1}
.rc .tabs button.on{background:#2563eb;color:#fff;border-color:#2563eb;box-shadow:0 2px 8px rgba(37,99,235,.45)}
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
.rc tbody tr.tot td{background:rgba(37,99,235,.16);border-top:2px solid rgba(37,99,235,.5);font-weight:800;color:#fff}
.rc .foot{color:#9fb3c8;font-size:12px;margin-top:12px;line-height:1.65}
@media (max-width:560px){
  .rc .tt{min-width:0;padding:7px 8px}
  .rc .tt .v{font-size:17px}
  .rc table{min-width:0;font-size:11px}
  .rc th{padding:6px 6px;font-size:9px;letter-spacing:0}
  .rc td{padding:6px 6px}
  .rc .tabs button{padding:4px 9px;font-size:11px}
}
</style>`

// Interactive widget: one tab bar (8 windows) drives the tiles + the booked-by table, client-side.
function card(rows: string[][], nowET: string): string {
  return (
    STYLE +
    `<div class="rc">` +
    `<div class="hd">Bookings by who made them (all appointment dates) &middot; as of ${nowET} ET &middot; source: Snowflake</div>` +
    `<div class="tabs" id="bk-tabs"></div>` +
    `<div class="tiles" id="bk-tiles"></div>` +
    `<div class="wrap"><table id="bk-tbl"></table></div>` +
    `<div class="foot">Every appointment <b style="color:#fff">created in the selected window</b> (any appointment date), by who made the booking — staff shown by name, client self-bookings grouped as "Online". Tap a window to switch. Excludes cancellations; data lags real time by ~1&ndash;2 hours.</div>` +
    `<script>(function(){
  var ROWS=${JSON.stringify(rows)};
  var W=${JSON.stringify(WINS.map(([k]) => k))};
  var cur=0;
  function num(v){return v==null||v===''?0:Number(v)}
  function fmt(v){return num(v).toLocaleString('en-US')}
  function esc(s){return String(s).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
  function render(){
    var o=2+cur*2;
    var rows=ROWS.filter(function(r){return num(r[o])>0}).sort(function(a,b){
      var ra=a[1]==='Staff'?0:1, rb=b[1]==='Staff'?0:1;
      return ra!==rb ? ra-rb : num(b[o])-num(a[o]);
    });
    var total=0,staff=0,newg=0;
    rows.forEach(function(r){var n=num(r[o]);total+=n;if(r[1]==='Staff')staff+=n;newg+=num(r[o+1])});
    var online=total-staff;
    document.getElementById('bk-tabs').innerHTML=W.map(function(k,i){return '<button class="'+(i===cur?'on':'')+'" data-i="'+i+'">'+esc(k)+'</button>'}).join('');
    Array.prototype.forEach.call(document.querySelectorAll('#bk-tabs button'),function(b){b.onclick=function(){cur=+b.getAttribute('data-i');render()}});
    document.getElementById('bk-tiles').innerHTML=
      '<div class="tt"><div class="l">Bookings</div><div class="v">'+fmt(total)+'</div></div>'+
      '<div class="tt"><div class="l">Staff&#8209;booked</div><div class="v">'+fmt(staff)+'</div></div>'+
      '<div class="tt"><div class="l">Self&#8209;booked</div><div class="v">'+fmt(online)+'</div></div>'+
      '<div class="tt"><div class="l">New guests</div><div class="v">'+fmt(newg)+'</div></div>';
    var body=rows.map(function(r){return '<tr><td>'+esc(r[0])+'</td><td class="typ">'+esc(r[1])+'</td><td>'+fmt(r[o])+'</td><td class="new">'+fmt(r[o+1])+'</td></tr>'}).join('');
    if(!body) body='<tr><td colspan="4" style="text-align:center;color:#9fb3c8;padding:14px">No bookings in this window.</td></tr>';
    else body+='<tr class="tot"><td>All bookers</td><td class="typ"></td><td>'+fmt(total)+'</td><td>'+fmt(newg)+'</td></tr>';
    document.getElementById('bk-tbl').innerHTML='<thead><tr><th>Booked by</th><th>Type</th><th>Bookings</th><th>New</th></tr></thead><tbody>'+body+'</tbody>';
  }
  render();
})();</script>` +
    `</div>`
  )
}

async function buildAndPost() {
  const rows = await sf(SQL)
  const nowET = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date())
  const r = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'x-api-key': INGEST_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'bookings-by-booker', author_name: 'Bookings', title: 'Bookings — by booker', external_key: 'bookings-by-booker-today', html: card(rows, nowET) }),
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
