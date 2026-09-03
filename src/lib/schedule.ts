// Helpers for the Schedule feature. Shift times are stored as Postgres `time`
// ('HH:MM:SS') — plain wall-clock (Eastern), not instants — so we format them
// directly without timezone math.

export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// '08:30:00' -> '8:30a' ; '18:00:00' -> '6p'
export function fmtTime(t?: string | null): string {
  if (!t) return ''
  const [hs, ms] = t.split(':')
  let h = parseInt(hs, 10)
  const m = parseInt(ms ?? '0', 10)
  if (isNaN(h)) return ''
  const ap = h >= 12 ? 'p' : 'a'
  h = h % 12
  if (h === 0) h = 12
  return m ? `${h}:${String(m).padStart(2, '0')}${ap}` : `${h}${ap}`
}

export function fmtRange(s?: string | null, e?: string | null): string {
  if (!s && !e) return ''
  return `${fmtTime(s)}–${fmtTime(e)}`
}

// Decimal hours between two 'HH:MM' times (same day).
export function hoursBetween(s?: string | null, e?: string | null): number {
  if (!s || !e) return 0
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60)
}

export function startOfWeekMonday(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay() // 0 Sun .. 6 Sat
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day)) // back to Monday
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

// Local YYYY-MM-DD (matches how we compare to `date` columns).
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function weekLabel(monday: Date): string {
  const sun = addDays(monday, 6)
  const o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const a = monday.toLocaleDateString('en-US', o)
  const b = sun.toLocaleDateString('en-US', o)
  return `${a} – ${b}`
}

export function dayHeadLabel(d: Date): string {
  return `${DOW_SHORT[d.getDay()]} ${d.getDate()}`
}

// Is dateStr (YYYY-MM-DD) within [start,end] inclusive?
export function dateInRange(dateStr: string, start: string, end: string): boolean {
  return dateStr >= start && dateStr <= end
}
