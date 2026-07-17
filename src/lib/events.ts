import { EVENT_CATEGORIES } from '@/lib/constants'
import type { EventRow, Profile } from '@/types'

export function categoryMeta(key: string) {
  return EVENT_CATEGORIES.find((c) => c.key === key) ?? { key, label: 'Event', emoji: '📅' }
}

// A stable gradient per category so cover-less events still look distinct.
const GRADIENTS: Record<string, string> = {
  team_meeting: 'from-indigo-600 to-violet-700',
  workshop: 'from-amber-500 to-orange-600',
  class: 'from-sky-500 to-blue-700',
  training: 'from-emerald-500 to-teal-700',
  community: 'from-rose-500 to-pink-700',
  social: 'from-fuchsia-500 to-purple-700',
  other: 'from-slate-600 to-slate-800',
}
export function categoryGradient(key: string): string {
  return GRADIENTS[key] ?? GRADIENTS.other
}

function fmt(iso: string, tz: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/New_York', ...opts }).format(new Date(iso))
}

export function eventDateLabel(e: Pick<EventRow, 'starts_at' | 'timezone'>): string {
  return fmt(e.starts_at, e.timezone, { month: 'short', day: 'numeric', year: 'numeric' })
}
export function eventDayLabel(e: Pick<EventRow, 'starts_at' | 'timezone'>): string {
  return fmt(e.starts_at, e.timezone, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
export function eventTimeRange(e: Pick<EventRow, 'starts_at' | 'ends_at' | 'timezone'>): string {
  const s = fmt(e.starts_at, e.timezone, { hour: 'numeric', minute: '2-digit' })
  if (!e.ends_at) return s
  const en = fmt(e.ends_at, e.timezone, { hour: 'numeric', minute: '2-digit' })
  return `${s} – ${en}`
}

// Recipients implied by an event's audience, computed from the loaded directory.
export function eventRecipients(e: EventRow, profiles: Profile[]): Profile[] {
  const active = profiles.filter((p) => p.is_active)
  if (e.audience === 'location') return active.filter((p) => p.location_id === e.location_id)
  if (e.audience === 'department') return active.filter((p) => p.department_id === e.department_id)
  if (e.audience === 'users') return active.filter((p) => (e.target_user_ids ?? []).includes(p.id))
  return active
}

export function mapsUrl(location: string): string {
  return 'https://maps.google.com/?q=' + encodeURIComponent(location)
}

// --- Timezone-aware datetime <-> wall-clock input helpers --------------------
// Events are entered/displayed in the event's timezone (ET). These convert
// between a UTC ISO instant and a `YYYY-MM-DDTHH:mm` wall-clock string in that tz.

export function utcToZonedInput(iso: string | null, tz: string): string {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz || 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  let hh = g('hour'); if (hh === '24') hh = '00'
  return `${g('year')}-${g('month')}-${g('day')}T${hh}:${g('minute')}`
}

export function zonedInputToUtc(wall: string, tz: string): string | null {
  if (!wall) return null
  const [datePart, timePart] = wall.split('T')
  const [Y, M, D] = datePart.split('-').map(Number)
  const [h, mi] = (timePart || '00:00').split(':').map(Number)
  const utcGuess = Date.UTC(Y, M - 1, D, h, mi)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz || 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date(utcGuess))
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  let hh = n('hour'); if (hh === 24) hh = 0
  const asSeenUTC = Date.UTC(n('year'), n('month') - 1, n('day'), hh, n('minute'))
  const offset = asSeenUTC - utcGuess
  return new Date(utcGuess - offset).toISOString()
}
