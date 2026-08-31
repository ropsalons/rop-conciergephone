import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useUIStore } from '@/stores/uiStore'
import { FullPageLoader, EmptyState } from '@/components/ui/Feedback'
import { Tag } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { EventFormModal } from '@/components/events/EventFormModal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  Calendar, ChevronLeft, Clock, MapPin, Users, Bell, BellOff, Link as LinkIcon,
  Edit, Trash, Check, AlertTriangle, Smartphone,
} from '@/components/ui/Icons'
import { canManage, RSVP_OPTIONS } from '@/lib/constants'
import { cn, displayName } from '@/lib/utils'
import {
  categoryMeta, categoryGradient, isAcademyCategory, eventDayLabel, eventTimeRange, mapsUrl, eventRecipients,
} from '@/lib/events'
import type { EventRow, EventRsvpRow, RsvpResponse } from '@/types'

export function EventDetailPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const me = useAuthStore((s) => s.user?.id)
  const access = useAuthStore((s) => s.profile?.access_level)
  const profiles = useDirectoryStore((s) => s.profiles)
  const profilesById = useDirectoryStore((s) => s.profilesById)
  const toast = useUIStore((s) => s.toast)

  const [event, setEvent] = useState<EventRow | null>(null)
  const [rsvps, setRsvps] = useState<EventRsvpRow[]>([])
  const [views, setViews] = useState(0)
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmText, setConfirmText] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!eventId) return
    const { data: ev } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle()
    if (!ev) { setNotFound(true); setLoading(false); return }
    setEvent(ev as EventRow)
    const [{ data: rs }, { count }, { data: sub }] = await Promise.all([
      supabase.from('event_rsvps').select('*').eq('event_id', eventId),
      supabase.from('event_views').select('*', { count: 'exact', head: true }).eq('event_id', eventId),
      me ? supabase.from('event_subscriptions').select('event_id').eq('event_id', eventId).eq('user_id', me).maybeSingle() : Promise.resolve({ data: null }),
    ])
    setRsvps((rs as EventRsvpRow[]) ?? [])
    setViews(count ?? 0)
    setSubscribed(!!sub)
    setLoading(false)
    // Record the view (fire and forget).
    supabase.rpc('mark_event_viewed', { p_event_id: eventId })
  }
  useEffect(() => { setLoading(true); setNotFound(false); load() /* eslint-disable-next-line */ }, [eventId])

  const myResponse = useMemo(() => rsvps.find((r) => r.user_id === me)?.response ?? null, [rsvps, me])
  const byResponse = useMemo(() => {
    const m: Record<RsvpResponse, EventRsvpRow[]> = { going: [], interested: [], cant_go: [] }
    for (const r of rsvps) (m[r.response] ??= []).push(r)
    return m
  }, [rsvps])

  const recipients = useMemo(() => (event ? eventRecipients(event, profiles) : []), [event, profiles])
  const noResponders = useMemo(() => {
    const responded = new Set(rsvps.map((r) => r.user_id))
    return recipients.filter((p) => !responded.has(p.id))
  }, [recipients, rsvps])
  const noResponse = noResponders.length
  // Non-responders we can actually text (a mobile number on file).
  const textablePhones = useMemo(
    () => [...new Set(noResponders.map((p) => p.phone).filter((x): x is string => !!x && x.trim().length >= 10))],
    [noResponders],
  )

  const canEdit = !!event && (canManage(access) || event.created_by === me)

  async function setRsvp(resp: RsvpResponse) {
    if (!eventId || !me) return
    const next = myResponse === resp ? null : resp
    // optimistic
    setRsvps((prev) => {
      const others = prev.filter((r) => r.user_id !== me)
      return next ? [...others, { event_id: eventId, user_id: me, response: next, created_at: '', updated_at: '' }] : others
    })
    if (next) await supabase.rpc('set_event_rsvp', { p_event_id: eventId, p_response: next })
    else await supabase.rpc('clear_event_rsvp', { p_event_id: eventId })
    if (next) setSubscribed(true)
  }

  async function toggleSubscribe() {
    if (!eventId) return
    const next = !subscribed
    setSubscribed(next)
    await supabase.rpc('set_event_subscription', { p_event_id: eventId, p_on: next })
  }

  async function share() {
    const url = `${window.location.origin}/#/events/${eventId}`
    try {
      if (navigator.share) await navigator.share({ title: event?.title ?? 'Event', url })
      else { await navigator.clipboard.writeText(url); toast({ kind: 'success', title: 'Link copied' }) }
    } catch { /* cancelled */ }
  }

  async function sendReminder() {
    if (!eventId) return
    setBusy(true)
    const { data, error } = await supabase.rpc('notify_event', { p_event_id: eventId, p_kind: 'reminder' })
    setBusy(false)
    if (error) return toast({ kind: 'error', title: 'Could not send reminder', body: error.message })
    toast({ kind: 'success', title: 'Reminder sent', body: `${typeof data === 'number' ? data : 0} people nudged.` })
  }

  // Text (SMS) the non-responders a reminder + a tap-to-RSVP link that opens this event in the app.
  async function textReminder() {
    if (!event || !eventId) return
    if (!textablePhones.length) {
      return toast({ kind: 'error', title: 'No one to text', body: 'Everyone has responded, or the non-responders have no mobile number on file.' })
    }
    setBusy(true)
    const link = `${window.location.origin}/#/events/${eventId}`
    const body =
      `Reminder from ROP: "${event.title}" — ${eventDayLabel(event)}, ${eventTimeRange(event)} ET` +
      `${event.location ? ` at ${event.location}` : ''}. Can you make it? Tap to RSVP in ROP Chat: ${link}`
    const { data, error } = await supabase.functions.invoke('send-sms', { body: { to: textablePhones, body } })
    setBusy(false)
    const sent = (data as { sent?: number } | null)?.sent
    if (error || (data as { ok?: boolean } | null)?.ok === false) {
      return toast({ kind: 'error', title: 'Could not send texts', body: error?.message ?? 'Only admins can send texts. Ask an admin to send it.' })
    }
    toast({ kind: 'success', title: 'Texts sent', body: `${typeof sent === 'number' ? sent : textablePhones.length} people texted a reminder + RSVP link.` })
  }

  async function cancelEvent() {
    if (!event) return
    setBusy(true)
    const { data, error } = await supabase.from('events').update({ is_cancelled: !event.is_cancelled }).eq('id', event.id).select('*').single()
    setBusy(false)
    if (error || !data) return toast({ kind: 'error', title: 'Could not update event' })
    setEvent(data as EventRow)
    toast({ kind: 'success', title: (data as EventRow).is_cancelled ? 'Event cancelled' : 'Event restored' })
  }

  async function doDelete() {
    if (!event) return
    const { error } = await supabase.from('events').delete().eq('id', event.id)
    if (error) return toast({ kind: 'error', title: 'Could not delete event', body: error.message })
    toast({ kind: 'success', title: 'Event deleted' })
    navigate('/events')
  }

  if (loading) return <FullPageLoader label="Loading event…" />
  if (notFound || !event)
    return (
      <div className="p-6">
        <EmptyState icon={<Calendar className="h-8 w-8" />} title="Event not found" body="It may have been deleted."
          action={<button onClick={() => navigate('/events')} className="btn-primary mt-2">Back to Events</button>} />
      </div>
    )

  const cat = categoryMeta(event.category)

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn('relative flex h-36 items-center justify-center bg-gradient-to-br sm:h-44', categoryGradient(event.category))}>
          {isAcademyCategory(event.category) ? (
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2">
                <span className="text-2xl opacity-80">⭐</span>
                <span className="text-6xl drop-shadow-lg">{cat.emoji}</span>
                <span className="text-2xl opacity-80">⭐</span>
              </div>
              <span className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-white/85">Advanced Training</span>
            </div>
          ) : (
            <span className="text-6xl drop-shadow-lg">{cat.emoji}</span>
          )}
          <button onClick={() => navigate('/events')} className="absolute left-3 top-3 flex items-center gap-1 rounded-lg bg-black/30 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-black/50">
            <ChevronLeft className="h-4 w-4" /> Events
          </button>
          {event.is_cancelled && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-bold uppercase tracking-wider text-red-200">Cancelled</span>
          )}
        </div>

        <div className="mx-auto max-w-3xl p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Tag tone="slate">{event.format === 'virtual' ? 'Virtual' : 'In Person'} · {cat.label}</Tag>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={share} title="Share link" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><LinkIcon className="h-4 w-4" /></button>
              <button onClick={toggleSubscribe} title={subscribed ? 'Notifications on' : 'Notify me of changes'}
                className={cn('rounded-lg p-2 hover:bg-white/10', subscribed ? 'text-gold-300' : 'text-slate-400 hover:text-white')}>
                {subscribed ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              </button>
              {canEdit && (
                <>
                  <button onClick={() => setEditing(true)} title="Edit" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><Edit className="h-4 w-4" /></button>
                  <button onClick={() => setConfirmDelete(true)} title="Delete" className="rounded-lg p-2 text-slate-400 hover:bg-red-500/20 hover:text-red-300"><Trash className="h-4 w-4" /></button>
                </>
              )}
            </div>
          </div>

          <h1 className="text-xl font-bold text-white sm:text-2xl">{event.title}</h1>

          {/* RSVP */}
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Will you attend?</p>
            <div className="grid grid-cols-3 gap-2">
              {RSVP_OPTIONS.map((o) => {
                const on = myResponse === o.key
                return (
                  <button key={o.key} onClick={() => setRsvp(o.key)}
                    className={cn('flex flex-col items-center gap-1 rounded-xl border p-3 text-sm font-medium transition',
                      on ? 'border-brand-400 bg-brand-500/20 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10')}>
                    <span className="text-lg">{o.emoji}</span>
                    {o.label}
                    {on && <Check className="h-3.5 w-3.5 text-brand-300" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Details */}
          <div className="mt-5 space-y-3 rounded-xl border border-white/10 bg-brand-950/40 p-4 text-sm">
            <Row icon={<Clock className="h-4 w-4" />} label="When">
              {eventDayLabel(event)}<br />
              <span className="text-slate-300">{eventTimeRange(event)} ET</span>
            </Row>
            {event.location && (
              <Row icon={<MapPin className="h-4 w-4" />} label={event.format === 'virtual' ? 'Link' : 'Location'}>
                {event.format === 'virtual' && /^https?:\/\//.test(event.location) ? (
                  <a href={event.location} target="_blank" rel="noreferrer" className="text-brand-200 underline">{event.location}</a>
                ) : (
                  <a href={mapsUrl(event.location)} target="_blank" rel="noreferrer" className="text-brand-200 underline">{event.location}</a>
                )}
              </Row>
            )}
            {event.organizer && <Row label="Organizer">{event.organizer}</Row>}
            {event.price && <Row label="Price">{event.price}</Row>}
            <Row icon={<Users className="h-4 w-4" />} label="Invited">
              {recipients.length} {recipients.length === 1 ? 'person' : 'people'} · {noResponse} no response · {views} view{views === 1 ? '' : 's'}
            </Row>
            {event.created_by && profilesById[event.created_by] && (
              <Row label="Created by">{displayName(profilesById[event.created_by])}</Row>
            )}
          </div>

          {event.description && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Description</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{event.description}</p>
            </div>
          )}

          {/* Manager actions */}
          {canEdit && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={sendReminder} disabled={busy} className="btn-ghost px-3 py-1.5 text-sm">
                <Bell className="h-4 w-4" /> Send reminder to non-responders
              </button>
              <button onClick={() => setConfirmText(true)} disabled={busy || textablePhones.length === 0}
                title={textablePhones.length === 0 ? 'No non-responders with a mobile number on file' : undefined}
                className="btn-ghost px-3 py-1.5 text-sm text-brand-200">
                <Smartphone className="h-4 w-4" /> Text reminder{textablePhones.length ? ` (${textablePhones.length})` : ''}
              </button>
              <button onClick={cancelEvent} disabled={busy} className="btn-ghost px-3 py-1.5 text-sm text-amber-300">
                <AlertTriangle className="h-4 w-4" /> {event.is_cancelled ? 'Restore event' : 'Cancel event'}
              </button>
            </div>
          )}

          {/* Scoreboard */}
          <div className="mt-6 space-y-4">
            {RSVP_OPTIONS.map((o) => {
              const list = byResponse[o.key] ?? []
              return (
                <div key={o.key}>
                  <p className="mb-2 text-sm font-semibold text-white">{o.emoji} {o.label} <span className="text-slate-400">({list.length})</span></p>
                  {list.length === 0 ? (
                    <p className="text-xs text-slate-500">No one yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {list.map((r) => {
                        const p = profilesById[r.user_id]
                        if (!p) return null
                        return (
                          <span key={r.user_id} className="flex items-center gap-1.5 rounded-full bg-white/5 py-1 pl-1 pr-3 text-xs text-slate-200">
                            <Avatar profile={p} size="xs" /> {displayName(p)}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {editing && (
        <EventFormModal existing={event} onClose={() => setEditing(false)}
          onSaved={(row) => { setEditing(false); setEvent(row); toast({ kind: 'success', title: 'Event updated' }) }} />
      )}
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={doDelete}
        title="Delete this event?" body="This removes the event and everyone's responses. This can't be undone." confirmLabel="Delete" danger />
      <ConfirmDialog open={confirmText} onClose={() => setConfirmText(false)} onConfirm={textReminder}
        title={`Text ${textablePhones.length} ${textablePhones.length === 1 ? 'person' : 'people'}?`}
        body={`This sends a text reminder about "${event.title}" — with a tap-to-RSVP link — to everyone invited who hasn't responded yet and has a mobile number on file.`}
        confirmLabel="Send texts" />
    </div>
  )
}

function Row({ icon, label, children }: { icon?: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="flex items-start gap-1.5 text-slate-200">
        {icon && <span className="mt-0.5 text-slate-500">{icon}</span>}
        <span>{children}</span>
      </span>
    </div>
  )
}
