// ROP Connect — company calendar feed into #rop-calendar.
// Scheduled job (pg_cron -> this function). Fetches the PUBLIC iCal feed of the "Robert of
// Philadelphia" Google Calendar (robertofphilly@rop2020.com), expands recurring events across
// the next 14 days, and upserts a single auto-updating "Upcoming Events" card into the
// #rop-calendar channel via the ingest webhook. No Google credentials (public .ics), no Claude.

const ICS_URL = 'https://calendar.google.com/calendar/ical/robertofphilly%40rop2020.com/public/basic.ics'
const INGEST_URL = 'https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ingest'
// NOTE: real value lives only in the deployed function (baked in at deploy time), never in the repo.
const INGEST_KEY = Deno.env.get('INGEST_KEY') ?? 'REDACTED'
const FEED_CHANNEL = 'rop-calendar'
const CRON_SECRET = 'rop-daily-3f9ac21b'
const TZ = 'America/New_York'
const DAYS_AHEAD = 14
const MAX_ITEMS = 60

const DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

// --- date helpers (everything resolved in salon-local ET) ---
function pad(n: number) { return String(n).padStart(2, '0') }
function offsetFor(yyyyMmDd: string): string {
  const probe = new Date(`${yyyyMmDd}T12:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(probe)
  const tz = parts.find((p) => p.type === 'timeZoneName')
  return (tz?.value || 'GMT-05:00').replace('GMT', '') || '+00:00'
}
// A wall-clock ET time -> epoch ms.
function etWall(y: number, mo: number, d: number, h: number, mi: number): number {
  const day = `${y}-${pad(mo)}-${pad(d)}`
  return Date.parse(`${day}T${pad(h)}:${pad(mi)}:00${offsetFor(day)}`)
}
// Break an epoch into ET calendar parts.
function etParts(epoch: number) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(new Date(epoch))
  const g = (t: string) => p.find((x) => x.type === t)?.value || ''
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[g('weekday')] ?? 0
  let hour = parseInt(g('hour'), 10); if (hour === 24) hour = 0
  return { y: +g('year'), mo: +g('month'), d: +g('day'), h: hour, mi: +g('minute'), wd }
}
function dayNum(y: number, mo: number, d: number) { return Math.floor(Date.UTC(y, mo - 1, d) / 86400000) }

// --- iCal parsing ---
function unescapeText(s: string) {
  return s.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim()
}
interface RawEvent {
  uid: string; summary: string; location: string; status: string; transp: string
  start?: { epoch: number; allDay: boolean }
  rrule?: string; exdates: number[]; recurrenceId?: number
}
function parseDateValue(val: string, params: Record<string, string>): { epoch: number; allDay: boolean } {
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(val)) {
    const y = +val.slice(0, 4), mo = +val.slice(4, 6), d = +val.slice(6, 8)
    return { epoch: etWall(y, mo, d, 0, 0), allDay: true }
  }
  if (val.endsWith('Z')) return { epoch: Date.parse(val.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z')), allDay: false }
  const m = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/)
  if (m) return { epoch: etWall(+m[1], +m[2], +m[3], +m[4], +m[5]), allDay: false }
  return { epoch: NaN, allDay: false }
}
function parseICS(text: string): RawEvent[] {
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
  const lines = unfolded.split(/\r\n|\n/)
  const events: RawEvent[] = []
  let cur: RawEvent | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { uid: '', summary: '', location: '', status: '', transp: '', exdates: [] }; continue }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue }
    if (!cur) continue
    const ci = line.indexOf(':')
    if (ci < 0) continue
    const left = line.slice(0, ci), value = line.slice(ci + 1)
    const segs = left.split(';')
    const name = segs[0]
    const params: Record<string, string> = {}
    for (let i = 1; i < segs.length; i++) { const [k, v] = segs[i].split('='); if (k) params[k.toUpperCase()] = v }
    switch (name) {
      case 'UID': cur.uid = value; break
      case 'SUMMARY': cur.summary = unescapeText(value); break
      case 'LOCATION': cur.location = unescapeText(value); break
      case 'STATUS': cur.status = value.toUpperCase(); break
      case 'TRANSP': cur.transp = value.toUpperCase(); break
      case 'DTSTART': cur.start = parseDateValue(value, params); break
      case 'RRULE': cur.rrule = value; break
      case 'RECURRENCE-ID': cur.recurrenceId = parseDateValue(value, params).epoch; break
      case 'EXDATE':
        for (const part of value.split(',')) { const dv = parseDateValue(part, params); if (!isNaN(dv.epoch)) cur.exdates.push(dv.epoch) }
        break
    }
  }
  return events
}

function parseRRule(rrule: string) {
  const o: Record<string, string> = {}
  for (const kv of rrule.split(';')) { const [k, v] = kv.split('='); if (k) o[k.toUpperCase()] = v }
  const byday = (o.BYDAY ? o.BYDAY.split(',') : []).map((t) => {
    const m = t.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/)
    return m ? { ord: m[1] ? parseInt(m[1], 10) : 0, dow: DOW[m[2]] } : null
  }).filter(Boolean) as { ord: number; dow: number }[]
  let until: number | null = null
  if (o.UNTIL) { const dv = parseDateValue(o.UNTIL, o.UNTIL.endsWith('Z') ? {} : { VALUE: 'DATE' }); until = isNaN(dv.epoch) ? null : dv.epoch }
  return { freq: o.FREQ, interval: o.INTERVAL ? parseInt(o.INTERVAL, 10) : 1, count: o.COUNT ? parseInt(o.COUNT, 10) : null, until, byday }
}

// nth weekday of a given month (ord>0 from start, ord<0 from end); returns day-of-month or null.
function nthWeekdayOfMonth(y: number, mo: number, dow: number, ord: number): number | null {
  const days: number[] = []
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  for (let d = 1; d <= dim; d++) if (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() === dow) days.push(d)
  if (!days.length) return null
  return ord > 0 ? days[ord - 1] ?? null : days[days.length + ord] ?? null
}

interface Occ { epoch: number; allDay: boolean; summary: string; location: string }

// Does a recurring master have an occurrence on ET calendar day (y,mo,d)? Returns the start epoch (with the master's time-of-day) or null.
function occursOn(master: RawEvent, y: number, mo: number, d: number): number | null {
  if (!master.start || !master.rrule) return null
  const r = parseRRule(master.rrule)
  const ms = etParts(master.start.epoch)
  const candEpoch = master.start.allDay ? etWall(y, mo, d, 0, 0) : etWall(y, mo, d, ms.h, ms.mi)
  if (candEpoch < master.start.epoch) return null
  if (r.until && candEpoch > r.until) return null
  const targetWd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  const dnDiff = dayNum(y, mo, d) - dayNum(ms.y, ms.mo, ms.d)
  let ok = false
  if (r.freq === 'DAILY') {
    ok = dnDiff >= 0 && dnDiff % r.interval === 0
  } else if (r.freq === 'WEEKLY') {
    const days = r.byday.length ? r.byday.map((b) => b.dow) : [ms.wd]
    if (days.includes(targetWd)) {
      const weekDiff = Math.floor((dnDiff - ((ms.wd - 0 + 7) % 7) + ((targetWd - 0 + 7) % 7)) / 7)
      ok = weekDiff >= 0 && weekDiff % r.interval === 0
    }
  } else if (r.freq === 'MONTHLY') {
    const monthDiff = (y - ms.y) * 12 + (mo - ms.mo)
    if (monthDiff >= 0 && monthDiff % r.interval === 0) {
      if (r.byday.length) {
        ok = r.byday.some((b) => nthWeekdayOfMonth(y, mo, b.dow, b.ord || 1) === d)
      } else {
        ok = d === ms.d
      }
    }
  } else if (r.freq === 'YEARLY') {
    ok = mo === ms.mo && d === ms.d
  }
  if (!ok) return null
  if (master.exdates.some((ex) => Math.abs(ex - candEpoch) < 60000)) return null
  return candEpoch
}

function build(events: RawEvent[]): Occ[] {
  const now = Date.now()
  const t = etParts(now)
  const windowStart = etWall(t.y, t.mo, t.d, 0, 0)
  const windowEnd = windowStart + (DAYS_AHEAD + 1) * 86400000

  // Overrides: (uid, recurrence-id day) -> replacement event. Also cancellations.
  const overrideKeys = new Set<string>()
  const dayKey = (uid: string, epoch: number) => { const p = etParts(epoch); return `${uid}|${p.y}-${p.mo}-${p.d}` }
  for (const e of events) if (e.recurrenceId != null) overrideKeys.add(dayKey(e.uid, e.recurrenceId))

  const keep = (e: RawEvent) => e.status !== 'CANCELLED' && e.transp !== 'TRANSPARENT'
  const occs: Occ[] = []

  // Single events + explicit override instances.
  for (const e of events) {
    if (!e.start || e.rrule) continue
    if (!keep(e)) continue
    if (e.start.epoch >= windowStart && e.start.epoch < windowEnd)
      occs.push({ epoch: e.start.epoch, allDay: e.start.allDay, summary: e.summary || '(untitled)', location: e.location })
  }

  // Recurring masters expanded day-by-day across the window.
  for (const e of events) {
    if (!e.rrule || !e.start || !keep(e)) continue
    for (let off = 0; off <= DAYS_AHEAD; off++) {
      const dp = etParts(windowStart + off * 86400000 + 6 * 3600000) // midday-ish to avoid DST edges
      const epoch = occursOn(e, dp.y, dp.mo, dp.d)
      if (epoch == null) continue
      if (overrideKeys.has(dayKey(e.uid, epoch))) continue // replaced by an override instance (already added)
      if (epoch >= windowStart && epoch < windowEnd)
        occs.push({ epoch, allDay: e.start.allDay, summary: e.summary || '(untitled)', location: e.location })
    }
  }

  // De-dupe (same title + same start) and sort.
  const seen = new Set<string>()
  const out = occs.filter((o) => { const k = `${o.epoch}|${o.summary}`; if (seen.has(k)) return false; seen.add(k); return true })
  out.sort((a, b) => a.epoch - b.epoch || (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1))
  return out.slice(0, MAX_ITEMS)
}

function esc(s: string) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]) }
function fmtTime(epoch: number) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(epoch)).toLowerCase().replace(' ', '')
}
function dayHeader(epoch: number) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(epoch))
}

function renderCard(occs: Occ[]): string {
  if (!occs.length) return `<div style="color:#9fb3c8;font-size:13px">No events scheduled in the next ${DAYS_AHEAD} days.</div>`
  const byDay: Record<string, Occ[]> = {}
  const order: string[] = []
  for (const o of occs) { const p = etParts(o.epoch); const k = `${p.y}-${pad(p.mo)}-${pad(p.d)}` ; if (!byDay[k]) { byDay[k] = []; order.push(k) } ; byDay[k].push(o) }
  const todayKey = (() => { const p = etParts(Date.now()); return `${p.y}-${pad(p.mo)}-${pad(p.d)}` })()
  let html = ''
  for (const k of order) {
    const first = byDay[k][0]
    const isToday = k === todayKey
    html += `<div style="margin:12px 0 4px;font-size:12px;font-weight:800;color:${isToday ? '#fbbf24' : '#fff'}">${isToday ? 'Today · ' : ''}${dayHeader(first.epoch)}</div>`
    for (const o of byDay[k]) {
      const time = o.allDay ? 'All day' : fmtTime(o.epoch)
      const loc = o.location ? ` <span style="opacity:.6">· ${esc(o.location.split('\n')[0].slice(0, 60))}</span>` : ''
      html += `<div style="display:flex;gap:8px;padding:3px 0;font-size:13px"><span style="min-width:64px;color:#9fb3c8">${time}</span><span style="color:#e5e7eb">${esc(o.summary)}${loc}</span></div>`
    }
  }
  return html
}

async function buildAndPost() {
  const res = await fetch(ICS_URL)
  const text = await res.text()
  const occs = build(parseICS(text))
  const range = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }).format(new Date())
  const html =
    `<div style="color:#9fb3c8;font-size:12px;margin-bottom:2px">Next ${DAYS_AHEAD} days · from ${range} · source: Robert of Philadelphia calendar</div>` +
    renderCard(occs)
  const r = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'x-api-key': INGEST_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: FEED_CHANNEL, author_name: 'Calendar', title: 'Upcoming ROP Events', external_key: 'rop-calendar-upcoming', html }),
  })
  const body = await r.json().catch(() => ({}))
  return { ok: !!body.ok, events: occs.length, updated: body.updated }
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
