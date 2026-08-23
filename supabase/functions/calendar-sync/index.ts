// ROP Chat — Google Calendar → Events sync.
//
// Pulls the company calendar's secret iCal (.ics) feed and upserts real events into ROP Chat's
// Events. Runs entirely on Supabase (pg_cron → this function every 30 min), so it needs no Mac and
// no Claude session — it just keeps running. It reads its config (the iCal URL + a skip-list) from
// the `integration_config` table, so nothing secret lives in the code.
//
// What it does each run:
//   • fetch the iCal feed, unfold + parse VEVENTs (timed, all-day, and recurring)
//   • expand recurring events (weekly/daily/monthly/yearly) across a ~4-month window
//   • skip personal/admin junk (a configurable keyword skip-list: OOT, QBO, etc.)
//   • fill in a clean description when the calendar event has none
//   • map "Bayfront / Village / Promenade / Bonita" to the right salon
//   • upsert by a stable key so edits & time changes update in place (no duplicates)
//   • mark events that vanished from the calendar as cancelled
//
// Auth: called by cron with the x-cron-secret header. Not a public endpoint.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? 'rop-daily-3f9ac21b'
const CAL_TZ = 'America/New_York'
const OWNER_ID = '6cd61125-689a-4889-82ab-fb5835acf59c' // Rob — organizer/created_by for synced events
const LOC = {
  bayfront: 'b565a776-969f-409b-a2d5-efe3abb2c6aa',
  village: 'ad623d11-2511-48b5-95dd-503f90f0aeed',
  promenade: 'dee43bef-5cc2-4e99-a9d0-706889a2125d',
}
const DEFAULT_DENY = ['oot', 'out of office', 'entered into', 'qbo', 'sales tax', 'marketing update', 'marketing check-in', 'birthday']
const WINDOW_BACK_DAYS = 2
const WINDOW_FWD_DAYS = 120
const MAX_INSTANCES = 400

// ── Time-zone helpers ─────────────────────────────────────────────────────────
function tzOffsetMs(tz: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const m: Record<string, string> = {}
  for (const p of dtf.formatToParts(new Date(utcMs))) m[p.type] = p.value
  const asIfLocal = Date.UTC(+m.year, +m.month - 1, +m.day, +(m.hour === '24' ? '0' : m.hour), +m.minute, +m.second)
  return asIfLocal - utcMs
}
// Interpret Y-M-D h:m:s as wall-clock in `tz` and return the real UTC Date.
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  const off = tzOffsetMs(tz, guess)
  return new Date(guess - off)
}

// ── iCal parsing ──────────────────────────────────────────────────────────────
function unfold(ics: string): string[] {
  const raw = ics.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) out[out.length - 1] += line.slice(1)
    else out.push(line)
  }
  return out
}
function unescapeText(v: string): string {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim()
}
interface Prop { params: Record<string, string>; value: string }
function parseProp(line: string): { name: string } & Prop {
  const colon = line.indexOf(':')
  const head = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const segs = head.split(';')
  const name = segs[0].toUpperCase()
  const params: Record<string, string> = {}
  for (let i = 1; i < segs.length; i++) {
    const eq = segs[i].indexOf('=')
    if (eq > 0) params[segs[i].slice(0, eq).toUpperCase()] = segs[i].slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name, params, value }
}
// A date/date-time property → { date: UTC Date, allDay }
function parseDate(p: Prop): { date: Date; allDay: boolean } | null {
  const v = p.value.trim()
  if (/^\d{8}$/.test(v)) { // DATE (all-day)
    const y = +v.slice(0, 4), mo = +v.slice(4, 6), d = +v.slice(6, 8)
    return { date: zonedToUtc(y, mo, d, 0, 0, 0, CAL_TZ), allDay: true }
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (z === 'Z') return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false }
  const tz = p.params.TZID || CAL_TZ
  return { date: zonedToUtc(+y, +mo, +d, +h, +mi, +s, tz), allDay: false }
}

interface VEvent {
  uid: string
  summary: string
  description: string
  location: string
  start: { date: Date; allDay: boolean } | null
  end: { date: Date; allDay: boolean } | null
  rrule?: string
  exdates: number[]
  recurrenceId?: { date: Date; allDay: boolean } | null
  status: string
  transp: string
}
function parseEvents(ics: string): VEvent[] {
  const lines = unfold(ics)
  const events: VEvent[] = []
  let cur: VEvent | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { uid: '', summary: '', description: '', location: '', start: null, end: null, exdates: [], status: '', transp: '' }; continue }
    if (line === 'END:VEVENT') { if (cur && cur.uid && cur.start) events.push(cur); cur = null; continue }
    if (!cur || line.indexOf(':') < 0) continue
    const p = parseProp(line)
    switch (p.name) {
      case 'UID': cur.uid = p.value.trim(); break
      case 'SUMMARY': cur.summary = unescapeText(p.value); break
      case 'DESCRIPTION': cur.description = unescapeText(p.value); break
      case 'LOCATION': cur.location = unescapeText(p.value); break
      case 'DTSTART': cur.start = parseDate(p); break
      case 'DTEND': cur.end = parseDate(p); break
      case 'RRULE': cur.rrule = p.value.trim(); break
      case 'STATUS': cur.status = p.value.trim().toUpperCase(); break
      case 'TRANSP': cur.transp = p.value.trim().toUpperCase(); break
      case 'RECURRENCE-ID': cur.recurrenceId = parseDate(p); break
      case 'EXDATE': { const d = parseDate(p); if (d) cur.exdates.push(d.date.getTime()); break }
    }
  }
  return events
}

// Expand an RRULE master into instance start-times within [from, to].
function expand(ev: VEvent, from: number, to: number): number[] {
  if (!ev.start) return []
  const startMs = ev.start.date.getTime()
  if (!ev.rrule) return startMs >= from && startMs <= to ? [startMs] : (startMs < from && (ev.end?.date.getTime() ?? startMs) >= from ? [startMs] : [])
  const R: Record<string, string> = {}
  for (const kv of ev.rrule.split(';')) { const [k, v] = kv.split('='); if (k) R[k.toUpperCase()] = v }
  const freq = R.FREQ
  const interval = Math.max(1, +(R.INTERVAL || '1'))
  const count = R.COUNT ? +R.COUNT : Infinity
  const until = R.UNTIL ? (parseDate({ params: {}, value: R.UNTIL })?.date.getTime() ?? Infinity) : Infinity
  const byday = (R.BYDAY || '').split(',').map((x) => x.trim()).filter(Boolean)
  const DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
  const ex = new Set(ev.exdates)
  const out: number[] = []
  const base = new Date(startMs)
  let n = 0, guard = 0
  const push = (ms: number) => { if (ms >= from && ms <= to && ms <= until && !ex.has(ms)) out.push(ms) }
  while (n < count && guard < 1000 && out.length < 60) {
    guard++
    const step = new Date(base)
    if (freq === 'WEEKLY') step.setUTCDate(base.getUTCDate() + n * 7 * interval)
    else if (freq === 'DAILY') step.setUTCDate(base.getUTCDate() + n * interval)
    else if (freq === 'MONTHLY') step.setUTCMonth(base.getUTCMonth() + n * interval)
    else if (freq === 'YEARLY') step.setUTCFullYear(base.getUTCFullYear() + n * interval)
    else { push(startMs); break }
    if (step.getTime() > to && (freq !== 'WEEKLY' || !byday.length)) { if (step.getTime() > until) break; if (out.length && step.getTime() > to) break }
    if (freq === 'WEEKLY' && byday.length) {
      const weekStart = new Date(step); weekStart.setUTCDate(step.getUTCDate() - step.getUTCDay())
      for (const bd of byday) {
        const dow = DOW[bd.slice(-2)]; if (dow === undefined) continue
        const inst = new Date(weekStart); inst.setUTCDate(weekStart.getUTCDate() + dow)
        // keep the original wall-clock time
        inst.setUTCHours(base.getUTCHours(), base.getUTCMinutes(), base.getUTCSeconds(), 0)
        if (inst.getTime() >= startMs) push(inst.getTime())
      }
    } else {
      push(step.getTime())
    }
    n++
    if (freq !== 'WEEKLY' && step.getTime() > to) break
    if (guard > 400) break
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

// ── Classification helpers ────────────────────────────────────────────────────
function categoryFor(title: string): string {
  const t = title.toLowerCase()
  if (/academy|series|training|education|excellence|class|workshop/.test(t)) return 'education'
  if (/photo\s?shoot|photoshoot|shoot/.test(t)) return 'other'
  if (/care week|salon care|campaign/.test(t)) return 'other'
  if (/meeting|huddle|check-in|1:1|one on one/.test(t)) return 'team_meeting'
  return 'team_meeting'
}
function locationFor(text: string): { id: string | null; name: string } {
  const t = (text || '').toLowerCase()
  if (/bayfront|bay front/.test(t)) return { id: LOC.bayfront, name: 'ROP Bayfront' }
  if (/village|venetian/.test(t)) return { id: LOC.village, name: 'ROP Village' }
  if (/promenade|bonita/.test(t)) return { id: LOC.promenade, name: 'ROP Promenade' }
  return { id: null, name: text || '' }
}
function fmtWhen(startMs: number, endMs: number | null, allDay: boolean): string {
  const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: CAL_TZ, weekday: 'long', month: 'long', day: 'numeric' })
  const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: CAL_TZ, hour: 'numeric', minute: '2-digit' })
  const day = dayFmt.format(new Date(startMs))
  if (allDay) return day
  const t1 = timeFmt.format(new Date(startMs))
  const t2 = endMs ? timeFmt.format(new Date(endMs)) : ''
  return `${day} · ${t1}${t2 ? '–' + t2 : ''} ET`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok')
  if (req.headers.get('x-cron-secret') !== CRON_SECRET)
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const log = async (ok: boolean, detail: unknown) => {
    try { await admin.from('integration_sync_log').insert({ source: 'google_calendar', ok, detail }) } catch { /* ignore */ }
  }

  try {
    const { data: cfg } = await admin.from('integration_config').select('key,value').in('key', ['calendar_ics_url', 'calendar_denylist'])
    const rows = new Map((cfg ?? []).map((r: any) => [r.key, r.value]))
    const url = (rows.get('calendar_ics_url') || '').trim()
    if (!url) { await log(true, { skipped: 'no calendar_ics_url configured yet' }); return new Response(JSON.stringify({ ok: true, skipped: 'no url' }), { headers: { 'Content-Type': 'application/json' } }) }
    const deny = ((rows.get('calendar_denylist') || DEFAULT_DENY.join(',')).toLowerCase()).split(',').map((s) => s.trim()).filter(Boolean)

    const res = await fetch(url, { headers: { 'User-Agent': 'ROP-Chat-calendar-sync/1.0' } })
    if (!res.ok) { await log(false, { fetch_status: res.status }); return new Response(JSON.stringify({ ok: false, error: `feed ${res.status}` }), { status: 502, headers: { 'Content-Type': 'application/json' } }) }
    const ics = await res.text()
    const vevents = parseEvents(ics)

    const now = Date.now()
    const from = now - WINDOW_BACK_DAYS * 864e5
    const to = now + WINDOW_FWD_DAYS * 864e5

    // Overrides (modified single instances) keyed by uid::recurrenceStartMs.
    const overrides = new Map<string, VEvent>()
    for (const ev of vevents) if (ev.recurrenceId) overrides.set(`${ev.uid}::${ev.recurrenceId.date.getTime()}`, ev)

    interface Row { external_uid: string; title: string; description: string | null; category: string; location: string | null; location_id: string | null; starts_at: string; ends_at: string | null; organizer: string; is_cancelled: boolean }
    const desired: Row[] = []
    const seen = new Set<string>()

    for (const ev of vevents) {
      const title = ev.summary.trim()
      if (!title) continue
      if (deny.some((k) => title.toLowerCase().includes(k))) continue
      const durationMs = ev.start && ev.end ? (ev.end.date.getTime() - ev.start.date.getTime()) : (ev.start?.allDay ? 864e5 : null)

      const build = (startMs: number, key: string, cancelled: boolean) => {
        if (seen.has(key)) return
        seen.add(key)
        const endMs = durationMs != null ? startMs + durationMs : null
        const loc = locationFor(ev.location)
        const desc = ev.description && ev.description.trim().length > 1
          ? ev.description.trim()
          : `${title}${loc.name ? ' · ' + loc.name : ''}\n${fmtWhen(startMs, endMs, !!ev.start?.allDay)}`
        desired.push({
          external_uid: key,
          title,
          description: desc.slice(0, 4000),
          category: categoryFor(title),
          location: loc.name || (ev.location || null),
          location_id: loc.id,
          starts_at: new Date(startMs).toISOString(),
          ends_at: endMs != null ? new Date(endMs).toISOString() : null,
          organizer: 'Robert of Philadelphia',
          is_cancelled: cancelled || ev.status === 'CANCELLED',
        })
      }

      if (ev.recurrenceId) {
        // A modified/cancelled single instance of a series — keyed to the ORIGINAL occurrence.
        build(ev.start!.date.getTime(), `gcal:${ev.uid}::${ev.recurrenceId.date.getTime()}`, ev.status === 'CANCELLED')
        continue
      }
      if (ev.rrule) {
        for (const ms of expand(ev, from, to)) {
          const ovKey = `${ev.uid}::${ms}`
          if (overrides.has(ovKey)) continue // handled by the override VEVENT above
          build(ms, `gcal:${ev.uid}::${ms}`, false)
        }
      } else {
        const ms = ev.start!.date.getTime()
        const endMs = durationMs != null ? ms + durationMs : ms
        if (endMs >= from && ms <= to) build(ms, `gcal:${ev.uid}`, false)
      }
    }

    // Upsert everything we want to show.
    let upserted = 0
    for (const r of desired) {
      const payload = {
        external_uid: r.external_uid, source: 'google_calendar',
        title: r.title, description: r.description, category: r.category,
        format: 'in_person', location: r.location, location_id: r.location_id,
        starts_at: r.starts_at, ends_at: r.ends_at, timezone: CAL_TZ,
        organizer: r.organizer, audience: 'all', created_by: OWNER_ID,
        is_cancelled: r.is_cancelled, updated_at: new Date().toISOString(),
      }
      const { error } = await admin.from('events').upsert(payload, { onConflict: 'external_uid' })
      if (!error) upserted++
    }

    // Cancel events that were removed from the calendar (in-window, previously synced, not seen now).
    const { data: existing } = await admin.from('events')
      .select('id,external_uid,is_cancelled')
      .eq('source', 'google_calendar')
      .gte('starts_at', new Date(from).toISOString())
      .lte('starts_at', new Date(to).toISOString())
    let cancelled = 0
    for (const e of (existing ?? []) as any[]) {
      if (!seen.has(e.external_uid) && !e.is_cancelled) {
        await admin.from('events').update({ is_cancelled: true, updated_at: new Date().toISOString() }).eq('id', e.id)
        cancelled++
      }
    }

    const summary = { vevents: vevents.length, upserted, cancelled, window_days: WINDOW_FWD_DAYS }
    await log(true, summary)
    return new Response(JSON.stringify({ ok: true, ...summary }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    await log(false, { error: String((e as Error).message ?? e) })
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
