import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useUIStore } from '@/stores/uiStore'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { Check } from '@/components/ui/Icons'
import { EVENT_CATEGORIES, canManage } from '@/lib/constants'
import { cn, displayName } from '@/lib/utils'
import { utcToZonedInput, zonedInputToUtc } from '@/lib/events'
import type { EventRow, EventAudience, EventCategory, EventFormat } from '@/types'

const TZ = 'America/New_York'

export function EventFormModal({
  existing,
  onClose,
  onSaved,
}: {
  existing?: EventRow | null
  onClose: () => void
  onSaved: (row: EventRow, notified: number) => void
}) {
  const me = useAuthStore((s) => s.user?.id)
  const access = useAuthStore((s) => s.profile?.access_level)
  const locations = useDirectoryStore((s) => s.locations)
  const departments = useDirectoryStore((s) => s.departments)
  const profiles = useDirectoryStore((s) => s.profiles)
  const toast = useUIStore((s) => s.toast)

  const editing = !!existing
  const [title, setTitle] = useState(existing?.title ?? '')
  const [category, setCategory] = useState<EventCategory>(existing?.category ?? 'team_meeting')
  const [format, setFormat] = useState<EventFormat>(existing?.format ?? 'in_person')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [location, setLocation] = useState(existing?.location ?? '')
  const [startAt, setStartAt] = useState(existing ? utcToZonedInput(existing.starts_at, TZ) : '')
  const [endAt, setEndAt] = useState(existing ? utcToZonedInput(existing.ends_at, TZ) : '')
  const [organizer, setOrganizer] = useState(existing?.organizer ?? '')
  const [price, setPrice] = useState(existing?.price ?? '')
  const [audience, setAudience] = useState<EventAudience>(existing?.audience ?? 'all')
  const [locationId, setLocationId] = useState(existing?.location_id ?? '')
  const [departmentId, setDepartmentId] = useState(existing?.department_id ?? '')
  const [targetIds, setTargetIds] = useState<string[]>(existing?.target_user_ids ?? [])
  const [userQuery, setUserQuery] = useState('')
  const [notify, setNotify] = useState(false)
  const [saving, setSaving] = useState(false)

  const canBlast = canManage(access) || (editing && existing?.created_by === me)

  const people = useMemo(() => profiles.filter((p) => p.is_active && p.id !== me), [profiles, me])
  const shownPeople = useMemo(() => {
    const q = userQuery.trim().toLowerCase()
    if (!q) return people
    return people.filter((p) => displayName(p).toLowerCase().includes(q) || (p.role ?? '').toLowerCase().includes(q))
  }, [people, userQuery])

  const valid =
    title.trim() &&
    startAt &&
    (audience !== 'location' || locationId) &&
    (audience !== 'department' || departmentId) &&
    (audience !== 'users' || targetIds.length > 0)

  async function submit() {
    if (!valid || !me || saving) return
    setSaving(true)
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      category,
      format,
      location: location.trim() || null,
      starts_at: zonedInputToUtc(startAt, TZ) as string,
      ends_at: endAt ? zonedInputToUtc(endAt, TZ) : null,
      timezone: TZ,
      organizer: organizer.trim() || null,
      price: price.trim() || null,
      audience,
      location_id: audience === 'location' ? locationId : null,
      department_id: audience === 'department' ? departmentId : null,
      target_user_ids: audience === 'users' ? targetIds : null,
    }
    let row: EventRow | null = null
    if (editing && existing) {
      const { data, error } = await supabase.from('events').update(payload).eq('id', existing.id).select('*').single()
      if (error || !data) { setSaving(false); toast({ kind: 'error', title: 'Could not save event', body: error?.message }); return }
      row = data as EventRow
    } else {
      const { data, error } = await supabase.from('events').insert({ ...payload, created_by: me }).select('*').single()
      if (error || !data) { setSaving(false); toast({ kind: 'error', title: 'Could not create event', body: error?.message }); return }
      row = data as EventRow
    }
    let notified = 0
    if (notify && canBlast && row) {
      const { data } = await supabase.rpc('notify_event', { p_event_id: row.id, p_kind: 'new' })
      notified = typeof data === 'number' ? data : 0
    }
    setSaving(false)
    onSaved(row, notified)
  }

  const toggleUser = (id: string) =>
    setTargetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={editing ? 'Edit event' : 'Create event'}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">Cancel</button>
          <button onClick={submit} disabled={!valid || saving} className="btn-primary px-4 py-1.5 text-sm">
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create event'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Event name</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bayfront Staff Meeting" autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Type</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value as EventCategory)}>
              {EVENT_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Format</label>
            <select className="input" value={format} onChange={(e) => setFormat(e.target.value as EventFormat)}>
              <option value="in_person">In Person</option>
              <option value="virtual">Virtual</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Starts</label>
            <input type="datetime-local" className="input" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>
          <div>
            <label className="label">Ends <span className="text-slate-500">(optional)</span></label>
            <input type="datetime-local" className="input" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </div>
        </div>
        <p className="-mt-2 text-[11px] text-slate-500">Times are Eastern (ET).</p>

        <div>
          <label className="label">{format === 'virtual' ? 'Link or platform' : 'Location'} <span className="text-slate-500">(optional)</span></label>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={format === 'virtual' ? 'Zoom / Google Meet link' : 'Address'} />
        </div>

        <div>
          <label className="label">Description <span className="text-slate-500">(optional)</span></label>
          <textarea className="input min-h-[90px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this event about?" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Organizer <span className="text-slate-500">(optional)</span></label>
            <input className="input" value={organizer} onChange={(e) => setOrganizer(e.target.value)} placeholder="e.g. Jenn and Rob" />
          </div>
          <div>
            <label className="label">Price <span className="text-slate-500">(optional)</span></label>
            <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. $295" />
          </div>
        </div>

        <div>
          <label className="label">Who's invited</label>
          <select className="input" value={audience} onChange={(e) => setAudience(e.target.value as EventAudience)}>
            <option value="all">Everyone</option>
            <option value="location">A specific location</option>
            <option value="department">A specific department</option>
            <option value="users">Specific people</option>
          </select>
        </div>

        {audience === 'location' && (
          <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Select a location…</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        {audience === 'department' && (
          <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">Select a department…</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        {audience === 'users' && (
          <div>
            <input className="input mb-2" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Search people…" />
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-brand-900/60 p-2">
              {shownPeople.map((p) => {
                const on = targetIds.includes(p.id)
                return (
                  <button key={p.id} type="button" onClick={() => toggleUser(p.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/5">
                    <Avatar profile={p} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-white">{displayName(p)}</span>
                    <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border', on ? 'border-brand-400 bg-brand-500' : 'border-white/20')}>
                      {on && <Check className="h-3 w-3 text-white" />}
                    </span>
                  </button>
                )
              })}
              {shownPeople.length === 0 && <p className="px-2 py-3 text-center text-sm text-slate-500">No one matches.</p>}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{targetIds.length} selected</p>
          </div>
        )}

        {canBlast && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-gold-400/30 bg-gold-400/10 p-3 text-sm text-slate-100">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-gold-500" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span>
              <span className="font-semibold">Notify everyone invited now</span>
              <span className="block text-xs text-slate-400">Sends a push + in-app notification with a link asking them to respond.</span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  )
}
