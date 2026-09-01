import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { FullPageLoader, EmptyState } from '@/components/ui/Feedback'
import { Avatar } from '@/components/ui/Avatar'
import { GraduationCap, ChevronDown, Check } from '@/components/ui/Icons'
import { canManage } from '@/lib/constants'
import { cn, displayName } from '@/lib/utils'
import { eventDayLabel } from '@/lib/events'
import type { EventRow, EventAttendanceRow } from '@/types'

// Master education / training / meeting log. Every event that carries CE hours or a credit type
// shows here with its attendance, and each person accrues an all-time hours transcript.
export function TrainingLogPage() {
  const navigate = useNavigate()
  const access = useAuthStore((s) => s.profile?.access_level)
  const profilesById = useDirectoryStore((s) => s.profilesById)

  const [events, setEvents] = useState<EventRow[]>([])
  const [attendance, setAttendance] = useState<EventAttendanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'events' | 'people'>('events')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      // Tracked = anything set up with credit hours or a credit type.
      const { data: evs } = await supabase
        .from('events')
        .select('*')
        .or('credit_hours.not.is.null,credit_type.not.is.null')
        .order('starts_at', { ascending: false })
      const list = (evs as EventRow[]) ?? []
      setEvents(list)
      if (list.length) {
        const { data: att } = await supabase.from('event_attendance').select('*').in('event_id', list.map((e) => e.id))
        setAttendance((att as EventAttendanceRow[]) ?? [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const attByEvent = useMemo(() => {
    const m: Record<string, EventAttendanceRow[]> = {}
    for (const a of attendance) (m[a.event_id] ??= []).push(a)
    return m
  }, [attendance])

  // Per-person transcript: total hours + events attended, all-time.
  const byPerson = useMemo(() => {
    const m: Record<string, { hours: number; events: { event: EventRow; hours: number }[] }> = {}
    const evById: Record<string, EventRow> = Object.fromEntries(events.map((e) => [e.id, e]))
    for (const a of attendance) {
      if (a.status !== 'attended') continue
      const ev = evById[a.event_id]
      if (!ev) continue
      const rec = (m[a.user_id] ??= { hours: 0, events: [] })
      rec.hours += a.hours ?? 0
      rec.events.push({ event: ev, hours: a.hours ?? 0 })
    }
    return Object.entries(m)
      .map(([user_id, v]) => ({ user_id, ...v }))
      .sort((x, y) => y.hours - x.hours)
  }, [attendance, events])

  if (!canManage(access)) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader backTo="/" backAlways icon={<GraduationCap className="h-5 w-5" />} title="Training Log" />
        <div className="p-6">
          <EmptyState icon={<GraduationCap className="h-8 w-8" />} title="Managers only"
            body="Attendance and continuing-education hours are visible to leaders and admins." />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        backTo="/"
        backAlways
        icon={<GraduationCap className="h-5 w-5" />}
        title="Training Log"
        subtitle="Attendance & continuing-education hours"
        actions={
          <div className="flex rounded-lg border border-white/10 p-0.5 text-xs">
            {(['events', 'people'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={cn('rounded-md px-3 py-1 font-medium capitalize', view === v ? 'bg-brand-500 text-white' : 'text-slate-300 hover:text-white')}>
                {v === 'events' ? 'By event' : 'By person'}
              </button>
            ))}
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl">
          {loading ? (
            <FullPageLoader label="Loading training log…" />
          ) : events.length === 0 ? (
            <EmptyState icon={<GraduationCap className="h-8 w-8" />} title="No tracked events yet"
              body="Give an event Credit hours or a Credit type when you create it, and it'll show here with attendance and hours." />
          ) : view === 'events' ? (
            <div className="space-y-2">
              {events.map((ev) => {
                const rows = attByEvent[ev.id] ?? []
                const attended = rows.filter((a) => a.status === 'attended')
                const open = expanded === ev.id
                return (
                  <div key={ev.id} className="rounded-xl border border-white/10 bg-brand-950/40">
                    <button onClick={() => setExpanded(open ? null : ev.id)} className="flex w-full items-center gap-3 p-3 text-left">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{ev.title}</p>
                        <p className="text-xs text-slate-400">
                          {eventDayLabel(ev)}
                          {ev.credit_type ? ` · ${ev.credit_type}` : ''}
                          {ev.credit_hours != null ? ` · ${ev.credit_hours} hr` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-emerald-300">{attended.length} attended</span>
                      <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-500 transition', open && 'rotate-180')} />
                    </button>
                    {open && (
                      <div className="border-t border-white/10 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs text-slate-400">{attended.length} attended · {attended.reduce((s, a) => s + (a.hours ?? 0), 0)} hrs credited</span>
                          <button onClick={() => navigate(`/events/${ev.id}`)} className="text-xs text-brand-300 hover:underline">Open event →</button>
                        </div>
                        {rows.length === 0 ? (
                          <p className="text-xs text-slate-500">No attendance marked yet — open the event to mark who showed.</p>
                        ) : (
                          <div className="space-y-1">
                            {rows.map((a) => {
                              const p = profilesById[a.user_id]
                              if (!p) return null
                              return (
                                <div key={a.user_id} className="flex items-center gap-2 text-sm">
                                  <Avatar profile={p} size="xs" />
                                  <span className="min-w-0 flex-1 truncate text-slate-100">{displayName(p)}</span>
                                  <span className={cn('text-xs',
                                    a.status === 'attended' ? 'text-emerald-300' : a.status === 'no_show' ? 'text-rose-300' : 'text-slate-400')}>
                                    {a.status === 'attended' ? `Attended · ${a.hours} hr` : a.status === 'no_show' ? 'No-show' : 'Excused'}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {byPerson.length === 0 ? (
                <EmptyState icon={<Check className="h-8 w-8" />} title="No hours logged yet"
                  body="Once you mark people attended on an event, their hours add up here." />
              ) : (
                byPerson.map((row) => {
                  const p = profilesById[row.user_id]
                  if (!p) return null
                  const open = expanded === `p:${row.user_id}`
                  return (
                    <div key={row.user_id} className="rounded-xl border border-white/10 bg-brand-950/40">
                      <button onClick={() => setExpanded(open ? null : `p:${row.user_id}`)} className="flex w-full items-center gap-3 p-3 text-left">
                        <Avatar profile={p} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{displayName(p)}</p>
                          <p className="text-xs text-slate-400">{row.events.length} event{row.events.length === 1 ? '' : 's'} attended</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-gold-200">{row.hours} hrs</span>
                        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-500 transition', open && 'rotate-180')} />
                      </button>
                      {open && (
                        <div className="space-y-1 border-t border-white/10 p-3">
                          {row.events
                            .slice()
                            .sort((a, b) => (b.event.starts_at ?? '').localeCompare(a.event.starts_at ?? ''))
                            .map(({ event: ev, hours }) => (
                              <button key={ev.id} onClick={() => navigate(`/events/${ev.id}`)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-white/5">
                                <span className="min-w-0 flex-1 truncate text-sm text-slate-100">{ev.title}</span>
                                <span className="shrink-0 text-xs text-slate-400">{eventDayLabel(ev)}</span>
                                <span className="shrink-0 text-xs font-medium text-gold-200">{hours} hr</span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
