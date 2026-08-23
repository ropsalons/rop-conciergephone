import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { FullPageLoader, EmptyState } from '@/components/ui/Feedback'
import { Tag } from '@/components/ui/Badge'
import { Calendar, Plus, Clock, MapPin, Users } from '@/components/ui/Icons'
import { EventFormModal } from '@/components/events/EventFormModal'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { categoryMeta, categoryGradient, isAcademyCategory, eventDateLabel, eventTimeRange } from '@/lib/events'
import type { EventRow } from '@/types'

export function EventsPage() {
  const navigate = useNavigate()
  const me = useAuthStore((s) => s.user?.id)
  const toast = useUIStore((s) => s.toast)
  const [events, setEvents] = useState<EventRow[]>([])
  const [goingCounts, setGoingCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [showNew, setShowNew] = useState(false)

  async function load() {
    const [{ data: evs }, { data: rsvps }] = await Promise.all([
      supabase.from('events').select('*').order('starts_at', { ascending: true }),
      supabase.from('event_rsvps').select('event_id').eq('response', 'going'),
    ])
    const counts: Record<string, number> = {}
    for (const r of (rsvps as { event_id: string }[]) ?? []) counts[r.event_id] = (counts[r.event_id] ?? 0) + 1
    setGoingCounts(counts)
    setEvents((evs as EventRow[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const now = Date.now()
  const { upcoming, past } = useMemo(() => {
    const up: EventRow[] = []
    const pa: EventRow[] = []
    for (const e of events) {
      const end = e.ends_at ? Date.parse(e.ends_at) : Date.parse(e.starts_at)
      if (end >= now) up.push(e)
      else pa.push(e)
    }
    up.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    pa.sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))
    return { upcoming: up, past: pa }
  }, [events, now])

  const shown = tab === 'upcoming' ? upcoming : past

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        backTo="/"
        backAlways
        icon={<Calendar className="h-5 w-5" />}
        title="Events"
        subtitle={`${upcoming.length} upcoming`}
        actions={
          me ? (
            <button onClick={() => setShowNew(true)} className="btn-primary px-3 py-1.5 text-sm">
              <Plus className="h-4 w-4" /> Post event
            </button>
          ) : undefined
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex gap-1 rounded-lg bg-brand-950/60 p-1 text-sm">
            <button onClick={() => setTab('upcoming')} className={cn('flex-1 rounded-md px-3 py-1.5 font-medium', tab === 'upcoming' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white')}>
              Upcoming ({upcoming.length})
            </button>
            <button onClick={() => setTab('past')} className={cn('flex-1 rounded-md px-3 py-1.5 font-medium', tab === 'past' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white')}>
              Past ({past.length})
            </button>
          </div>

          {loading ? (
            <FullPageLoader label="Loading events…" />
          ) : shown.length === 0 ? (
            <EmptyState
              icon={<Calendar className="h-8 w-8" />}
              title={tab === 'upcoming' ? 'No upcoming events' : 'No past events'}
              body={tab === 'upcoming' ? 'Post an event so the team can RSVP.' : 'Past events will show here.'}
              action={me && tab === 'upcoming' ? <button onClick={() => setShowNew(true)} className="btn-primary mt-2">Post event</button> : undefined}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {shown.map((e) => {
                const cat = categoryMeta(e.category)
                const going = goingCounts[e.id] ?? 0
                return (
                  <button key={e.id} onClick={() => navigate(`/events/${e.id}`)}
                    className="card overflow-hidden p-0 text-left transition hover:border-white/20">
                    <div className={cn('relative flex h-24 items-center justify-center bg-gradient-to-br', categoryGradient(e.category))}>
                      {isAcademyCategory(e.category) ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-lg opacity-80">⭐</span>
                          <span className="text-4xl drop-shadow">{cat.emoji}</span>
                          <span className="text-lg opacity-80">⭐</span>
                          <span className="pointer-events-none absolute bottom-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/85">Advanced Training</span>
                        </div>
                      ) : (
                        <span className="text-4xl drop-shadow">{cat.emoji}</span>
                      )}
                      {e.is_cancelled && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-bold uppercase tracking-wide text-red-200">Cancelled</span>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <Tag tone="slate">{e.format === 'virtual' ? 'Virtual' : 'In Person'} · {cat.label}</Tag>
                      </div>
                      <p className="truncate text-sm font-semibold text-white">{e.title}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-300">
                        <Clock className="h-3.5 w-3.5 text-slate-400" /> {eventDateLabel(e)} · {eventTimeRange(e)}
                      </p>
                      {e.location && (
                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-slate-400">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-500" /> <span className="truncate">{e.location}</span>
                        </p>
                      )}
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-emerald-300">
                        <Users className="h-3.5 w-3.5" /> {going} going
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <EventFormModal
          onClose={() => setShowNew(false)}
          onSaved={(row, notified) => {
            setShowNew(false)
            toast({ kind: 'success', title: 'Event posted', body: notified ? `${notified} people notified.` : undefined })
            navigate(`/events/${row.id}`)
          }}
        />
      )}
    </div>
  )
}
