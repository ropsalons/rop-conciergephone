// ROP Chat — Google Calendar → Events sync.
//
// Pulls the company calendar's secret iCal (.ics) feed and upserts real events into ROP Chat's
// Events. Runs entirely on Supabase (pg_cron → this function every 30 min, plus an admin "Refresh"
// button), so it needs no Mac and no Claude session. Config (iCal URL + skip-list) lives in the
// `integration_config` table, so nothing secret is in the code.
//
// Cleanup & routing rules it applies:
//   • tidy lower-case titles from the calendar ("village meeting" → "Village Meeting")
//   • pull the salon from the LOCATION or the title (e.g. "bayfront Staff Meeting" → ROP Bayfront)
//   • Marketing meetings → just Lexi + Rob;  SOGP/podcast → just Rob + Zach;
//     Academies / advanced / excellence classes → Styling team only (not everyone)
//   • add a ROP 5.0 line to staff-meeting descriptions for the next ~3 months
//   • skip personal/admin junk (OOO like "sara out", "content due", QBO, etc.)
//   • upsert by a stable key so time changes update in place; cancel events removed from the calendar

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? 'rop-daily-3f9ac21b'
const CAL_TZ = 'America/New_York'
const PEOPLE = {
  rob: '6cd61125-689a-4889-82ab-fb5835acf59c',
  lexi: '05edab58-7f16-4ee7-b7d4-1e6e6e3665f6',
  zach: '313796d0-df63-43f3-9a93-0446f00dbb8a',
  marina: '814750a0-eede-4851-b161-9fd260593c02',
}
const DEPT_STYLING = '0013a9d2-0b7f-4772-993d-6bfc8f66ccef'
const LOC = {
  bayfront: 'b565a776-969f-409b-a2d5-efe3abb2c6aa',
  village: 'ad623d11-2511-48b5-95dd-503f90f0aeed',
  promenade: 'dee43bef-5cc2-4e99-a9d0-706889a2125d',
}
const DEFAULT_DENY = ['oot', 'out of office', 'entered into', 'qbo', 'sales tax', 'marketing check-in', 'content due', 'birthday']
const WINDOW_BACK_DAYS = 2
const WINDOW_FWD_DAYS = 120

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
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  return new Date(guess - tzOffsetMs(tz, guess))
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
function parseDate(p: Prop): { date: Date; allDay: boolean } | null {
  const v = p.value.trim()
  if (/^\d{8}$/.test(v)) {
    return { date: zonedToUtc(+v.slice(0, 4), +v.slice(4, 6), +v.slice(6, 8), 0, 0, 0, CAL_TZ), allDay: true }
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (z === 'Z') return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false }
  return { date: zonedToUtc(+y, +mo, +d, +h, +mi, +s, p.params.TZID || CAL_TZ), allDay: false }
}

interface VEvent {
  uid: string; summary: string; description: string; location: string
  start: { date: Date; allDay: boolean } | null
  end: { date: Date; allDay: boolean } | null
  rrule?: string; exdates: number[]
  recurrenceId?: { date: Date; allDay: boolean } | null
  status: string
}
function parseEvents(ics: string): VEvent[] {
  const lines = unfold(ics)
  const events: VEvent[] = []
  let cur: VEvent | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { uid: '', summary: '', description: '', location: '', start: null, end: null, exdates: [], status: '' }; continue }
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
      case 'RECURRENCE-ID': cur.recurrenceId = parseDate(p); break
      case 'EXDATE': { const d = parseDate(p); if (d) cur.exdates.push(d.date.getTime()); break }
    }
  }
  return events
}

function expand(ev: VEvent, from: number, to: number): number[] {
  if (!ev.start) return []
  const startMs = ev.start.date.getTime()
  if (!ev.rrule) return (ev.end?.date.getTime() ?? startMs) >= from && startMs <= to ? [startMs] : []
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
    if (freq === 'WEEKLY' && byday.length) {
      const weekStart = new Date(step); weekStart.setUTCDate(step.getUTCDate() - step.getUTCDay())
      for (const bd of byday) {
        const dow = DOW[bd.slice(-2)]; if (dow === undefined) continue
        const inst = new Date(weekStart); inst.setUTCDate(weekStart.getUTCDate() + dow)
        inst.setUTCHours(base.getUTCHours(), base.getUTCMinutes(), base.getUTCSeconds(), 0)
        if (inst.getTime() >= startMs) push(inst.getTime())
      }
    } else push(step.getTime())
    n++
    if (freq !== 'WEEKLY' && step.getTime() > to) break
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

// ── Cleanup / classification ──────────────────────────────────────────────────
// Capitalize words that came in all-lowercase; leave acronyms (SOGP, ROP) and proper nouns alone.
function titleCase(s: string): string {
  return s.split(/(\s+)/).map((w) => (/^[a-z][a-z''-]*$/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join('')
}
// Turn a raw calendar summary into a clean, proper event title:
//   • strip trailing recurrence markers ("… @monthly", "… @ 1st monday")
//   • strip trailing location handles ("… @Prom", "… @Salon")
//   • fix casing, expand "Prom" → "Promenade"
//   • rename salon meetings to "{Salon} Team Meeting" so they read the same across locations
function enhanceTitle(raw: string): string {
  let s = (raw || '').trim()
  s = s.replace(/\s*@\s*(monthly|weekly|bi-?weekly|biweekly|daily|yearly|annually|quarterly|every\b.*|\d+\s*(st|nd|rd|th)\b.*)$/i, '')
  s = s.replace(/\s*@\s*(prom(enade)?|bayfront|village|salon)\s*$/i, '')
  s = s.replace(/\s{2,}/g, ' ').trim()
  s = titleCase(s)
  s = s.replace(/\bProm\b(?!enade)/g, 'Promenade')
  s = s.replace(/\b(Bayfront|Village|Promenade)\s+(Staff\s+|Team\s+)?Meeting\b/i,
    (_m: string, salon: string) => `${salon.charAt(0).toUpperCase()}${salon.slice(1).toLowerCase()} Team Meeting`)
  return s.trim()
}
function categoryFor(t: string): string {
  if (/academy|series|training|education|excellence|class|workshop/.test(t)) return 'education'
  if (/photo\s?shoot|photoshoot|shoot|podcast|sogp/.test(t)) return 'other'
  if (/care week|salon care|campaign/.test(t)) return 'other'
  return 'team_meeting'
}
function locationFor(text: string): { id: string | null; name: string } {
  const t = (text || '').toLowerCase()
  if (/bayfront|bay front/.test(t)) return { id: LOC.bayfront, name: 'ROP Bayfront' }
  if (/village|venetian/.test(t)) return { id: LOC.village, name: 'ROP Village' }
  if (/promenade|bonita/.test(t)) return { id: LOC.promenade, name: 'ROP Promenade' }
  return { id: null, name: text || '' }
}
// Who's it for? Returns audience + optional target users / department.
function routeFor(lc: string): { audience: string; users: string[] | null; dept: string | null } {
  if (/newsletter|market|flyer/.test(lc)) return { audience: 'users', users: [PEOPLE.lexi, PEOPLE.rob], dept: null }
  if (/sogp|podcast/.test(lc)) return { audience: 'users', users: [PEOPLE.rob, PEOPLE.zach], dept: null }
  if (/academy|advanced|excellence|series|stylist academy|silver stylist|model monday|business building|in training/.test(lc)) return { audience: 'department', users: null, dept: DEPT_STYLING }
  return { audience: 'all', users: null, dept: null }
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
const ROP5_LINE = '\n\n🚀 On the agenda: ROP 5.0 — where we\'re taking the salons next. Come ready with your ideas, wins, and energy for what\'s ahead.'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok')
  if (req.headers.get('x-cron-secret') !== CRON_SECRET)
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const log = async (ok: boolean, detail: unknown) => {
    try { await admin.from('integration_sync_log').insert({ source: 'google_calendar', ok, detail }) } catch { /* ignore */ }
  }

  try {
    const { data: cfg } = await admin.from('integration_config').select('key,value').in('key', ['calendar_ics_url', 'calendar_denylist', 'academy_user_ids'])
    const rows = new Map((cfg ?? []).map((r: any) => [r.key, r.value]))
    const url = (rows.get('calendar_ics_url') || '').trim()
    if (!url) { await log(true, { skipped: 'no url' }); return new Response(JSON.stringify({ ok: true, skipped: 'no url' }), { headers: { 'Content-Type': 'application/json' } }) }
    const deny = ((rows.get('calendar_denylist') || DEFAULT_DENY.join(',')).toLowerCase()).split(',').map((s) => s.trim()).filter(Boolean)
    // Who attends advanced/academy classes — sourced from Boulevard's "Silver" + "Stylist in Training"
    // rosters (plus Sara & Jenn), captured in integration_config.academy_user_ids. Not the whole styling team.
    let academyIds: string[] = []
    try { const raw = rows.get('academy_user_ids'); academyIds = Array.isArray(raw) ? raw : JSON.parse(raw || '[]') } catch { academyIds = [] }

    const res = await fetch(url, { headers: { 'User-Agent': 'ROP-Chat-calendar-sync/1.0' } })
    if (!res.ok) { await log(false, { fetch_status: res.status }); return new Response(JSON.stringify({ ok: false, error: `feed ${res.status}` }), { status: 502, headers: { 'Content-Type': 'application/json' } }) }
    const vevents = parseEvents(await res.text())

    // Active staff grouped by home salon — used to invite only that location's team to its meeting.
    const staffByLocation = new Map<string, string[]>()
    const { data: profs } = await admin.from('profiles').select('id,location_id').eq('is_active', true)
    for (const p of (profs ?? []) as any[]) {
      if (!p.location_id) continue
      const arr = staffByLocation.get(p.location_id) ?? []
      arr.push(p.id)
      staffByLocation.set(p.location_id, arr)
    }

    const now = Date.now()
    const from = now - WINDOW_BACK_DAYS * 864e5
    const to = now + WINDOW_FWD_DAYS * 864e5
    const in90 = now + 90 * 864e5

    const overrides = new Set<string>()
    for (const ev of vevents) if (ev.recurrenceId) overrides.add(`${ev.uid}::${ev.recurrenceId.date.getTime()}`)

    const desired: any[] = []
    const seen = new Set<string>()

    for (const ev of vevents) {
      const rawTitle = ev.summary.trim()
      const title = enhanceTitle(rawTitle)
      if (!title) continue
      const lc = title.toLowerCase()
      if (/^[a-z]+ out$/i.test(rawTitle) || /^[a-z]+ out$/i.test(title.trim())) continue // "Sara Out" / OOO markers
      if (deny.some((k) => lc.includes(k))) continue

      const durationMs = ev.start && ev.end ? (ev.end.date.getTime() - ev.start.date.getTime()) : (ev.start?.allDay ? 864e5 : null)
      // Detect the salon from LOCATION first, then the ORIGINAL title (keeps "@Prom" handles enhanceTitle strips).
      let loc = locationFor(ev.location)
      if (!loc.id) { const lt = locationFor(`${rawTitle} ${title}`); if (lt.id) loc = lt }
      const category = categoryFor(lc)

      // Salon team meetings go only to that location's staff + Marina, Rob & Zach — not the whole company.
      let route = routeFor(lc)
      if (/team meeting|staff meeting/.test(lc) && loc.id) {
        const staff = staffByLocation.get(loc.id) ?? []
        route = { audience: 'users', users: [...new Set([...staff, PEOPLE.marina, PEOPLE.rob, PEOPLE.zach])], dept: null }
      }
      // Advanced classes / academies → only the academy roster (Silver + Stylists in Training + Sara & Jenn).
      if (route.dept === DEPT_STYLING && academyIds.length) {
        route = { audience: 'users', users: academyIds, dept: null }
      }

      const build = (startMs: number, key: string, cancelled: boolean) => {
        if (seen.has(key)) return
        seen.add(key)
        const endMs = durationMs != null ? startMs + durationMs : null
        let desc = ev.description && ev.description.trim().length > 1
          ? ev.description.trim()
          : `${title}${loc.name ? ' · ' + loc.name : ''}\n${fmtWhen(startMs, endMs, !!ev.start?.allDay)}`
        if (/team meeting|staff meeting/.test(lc) && startMs <= in90) desc += ROP5_LINE
        desired.push({
          external_uid: key, source: 'google_calendar',
          title, description: desc.slice(0, 4000), category, format: 'in_person',
          location: loc.name || (ev.location || null), location_id: loc.id,
          starts_at: new Date(startMs).toISOString(), ends_at: endMs != null ? new Date(endMs).toISOString() : null,
          timezone: CAL_TZ, organizer: null, created_by: null,
          audience: route.audience, department_id: route.dept, target_user_ids: route.users,
          is_cancelled: cancelled || ev.status === 'CANCELLED', updated_at: new Date().toISOString(),
        })
      }

      if (ev.recurrenceId) { build(ev.start!.date.getTime(), `gcal:${ev.uid}::${ev.recurrenceId.date.getTime()}`, ev.status === 'CANCELLED'); continue }
      if (ev.rrule) {
        for (const ms of expand(ev, from, to)) {
          if (overrides.has(`${ev.uid}::${ms}`)) continue
          build(ms, `gcal:${ev.uid}::${ms}`, false)
        }
      } else {
        const ms = ev.start!.date.getTime()
        if ((durationMs != null ? ms + durationMs : ms) >= from && ms <= to) build(ms, `gcal:${ev.uid}`, false)
      }
    }

    let upserted = 0, failed = 0
    for (const r of desired) {
      const { error } = await admin.from('events').upsert(r, { onConflict: 'external_uid' })
      if (error) failed++; else upserted++
    }

    const { data: existing } = await admin.from('events')
      .select('id,external_uid,is_cancelled').eq('source', 'google_calendar')
      .gte('starts_at', new Date(from).toISOString()).lte('starts_at', new Date(to).toISOString())
    let cancelled = 0
    for (const e of (existing ?? []) as any[]) {
      if (!seen.has(e.external_uid) && !e.is_cancelled) {
        await admin.from('events').update({ is_cancelled: true, updated_at: new Date().toISOString() }).eq('id', e.id)
        cancelled++
      }
    }

    const summary = { vevents: vevents.length, upserted, failed, cancelled }
    await log(true, summary)
    return new Response(JSON.stringify({ ok: true, ...summary }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    await log(false, { error: String((e as Error).message ?? e) })
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
