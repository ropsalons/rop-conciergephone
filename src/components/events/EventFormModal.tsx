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
  const [capacity, setCapacity] = useState(existing?.capacity != null ? String(existing.capacity) : '')
  const [registrationOpen, setRegistrationOpen] = useState(existing?.registration_open ?? true)
  const [coverUrl, setCoverUrl] = useState(existing?.cover_url ?? '')
  const [uploadingCover, setUploadingCover] = useState(false)
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
    location.trim() && // location is now required (a salon or free text)
    (audience !== 'location' || locationId) &&
    (audience !== 'department' || departmentId) &&
    (audience !== 'users' || targetIds.length > 0)

  async function onPickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !me) return
    if (!file.type.startsWith('image/')) return toast({ kind: 'error', title: 'Pick an image file' })
    if (file.size > 5 * 1024 * 1024) return toast({ kind: 'error', title: 'Too large', body: 'Cover images must be under 5 MB.' })
    setUploadingCover(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${me}/events/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type })
      if (error) throw error
      setCoverUrl(supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl)
    } catch (err) {
      toast({ kind: 'error', title: 'Cover upload failed', body: String((err as Error).message ?? err) })
    } finally {
      setUploadingCover(false)
    }
  }

  async function submit() {
    if (!valid || !me || saving) return
    setSaving(true)
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      category,
      format,
      location: location.trim(),
      starts_at: zonedInputToUtc(startAt, TZ) as string,
      ends_at: endAt ? zonedInputToUtc(endAt, TZ) : null,
      timezone: TZ,
      organizer: organizer.trim() || null,
      price: price.trim() || null,
      capacity: capacity.trim() ? Math.max(0, Math.floor(Number(capacity)) || 0) : null,
      registration_open: registrationOpen,
      cover_url: coverUrl || null,
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
          <label className="label">{format === 'virtual' ? 'Link or platform' : 'Location'} <span className="text-rose-300">*</span></label>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={format === 'virtual' ? 'Zoom / Google Meet link' : 'A salon below, or type an address'} />
          {format !== 'virtual' && locations.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {locations.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLocation(l.name)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition',
                    location.trim() === l.name ? 'border-brand-400 bg-brand-400/10 text-white' : 'border-white/15 text-slate-300 hover:bg-white/5',
                  )}
                >
                  {l.name}
                </button>
              ))}
            </div>
          )}
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
            <label className="label">Cost <span className="text-slate-500">(optional)</span></label>
            <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. Covered by ROP or $45" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Capacity <span className="text-slate-500">(optional)</span></label>
            <input type="number" min="0" className="input" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Blank = unlimited" />
          </div>
          <div>
            <label className="label">Cover image <span className="text-slate-500">(optional)</span></label>
            {coverUrl ? (
              <div className="flex items-center gap-2">
                <img src={coverUrl} alt="" className="h-9 w-14 rounded object-cover" />
                <button type="button" onClick={() => setCoverUrl('')} className="text-xs text-rose-300 hover:underline">Remove</button>
              </div>
            ) : (
              <label className="btn-ghost inline-flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm">
                {uploadingCover ? 'Uploading…' : 'Upload image'}
                <input type="file" accept="image/*" className="hidden" onChange={onPickCover} disabled={uploadingCover} />
              </label>
            )}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-100">
          <input type="checkbox" className="h-4 w-4 accent-gold-500" checked={registrationOpen} onChange={(e) => setRegistrationOpen(e.target.checked)} />
          <span>Registration open <span className="text-slate-400">— turn off to close sign-ups</span></span>
        </label>

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
