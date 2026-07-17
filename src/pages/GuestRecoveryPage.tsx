import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useUIStore } from '@/stores/uiStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { FullPageLoader, EmptyState } from '@/components/ui/Feedback'
import { Tag } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { LifeBuoy, Plus } from '@/components/ui/Icons'
import { GUEST_RECOVERY_STATUSES, canManage } from '@/lib/constants'
import { displayName, timeAgo } from '@/lib/utils'
import type { GuestRecoveryRow, GuestRecoveryStatus, Urgency } from '@/types'

const URGENCY_TONE: Record<Urgency, 'slate' | 'amber' | 'red'> = {
  low: 'slate',
  medium: 'amber',
  high: 'red',
}
const URGENCY_LABEL: Record<Urgency, string> = { low: 'Low', medium: 'Medium', high: 'High' }

export function GuestRecoveryPage() {
  const me = useAuthStore((s) => s.user?.id)
  const role = useAuthStore((s) => s.profile?.role)
  const { profilesById, locations } = useDirectoryStore()
  const people = useDirectoryStore((s) => s.profiles)
  const toast = useUIStore((s) => s.toast)

  const [items, setItems] = useState<GuestRecoveryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [active, setActive] = useState<GuestRecoveryRow | null>(null)

  async function load() {
    const { data } = await supabase
      .from('guest_recovery_items')
      .select('*')
      .order('created_at', { ascending: false })
    setItems((data as GuestRecoveryRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const locationName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? null
  const activeProfiles = useMemo(() => people.filter((p) => p.is_active), [people])

  const byStatus = useMemo(() => {
    const map: Record<string, GuestRecoveryRow[]> = {}
    for (const s of GUEST_RECOVERY_STATUSES) map[s.key] = []
    for (const it of items) (map[it.status] ??= []).push(it)
    return map
  }, [items])

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        backTo="/"
        backAlways
        icon={<LifeBuoy className="h-5 w-5" />}
        title="Guest Recovery"
        subtitle={`${items.length} issue${items.length === 1 ? '' : 's'} tracked`}
        actions={
          me ? (
            <button onClick={() => setShowNew(true)} className="btn-primary px-3 py-1.5 text-sm">
              <Plus className="h-4 w-4" /> Log guest issue
            </button>
          ) : undefined
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <FullPageLoader label="Loading guest issues…" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<LifeBuoy className="h-8 w-8" />}
            title="No guest issues logged"
            body="When a guest needs recovery, log it here to track it to resolution."
            action={
              me ? (
                <button onClick={() => setShowNew(true)} className="btn-primary mt-2">
                  Log guest issue
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {GUEST_RECOVERY_STATUSES.map((col) => {
              const list = byStatus[col.key] ?? []
              return (
                <section key={col.key} className="min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
                    <h2 className="text-sm font-semibold text-white">{col.label}</h2>
                    <span className="text-xs text-slate-400">{list.length}</span>
                  </div>
                  <div className="space-y-2">
                    {list.map((it) => {
                      const owner = it.owner_id ? profilesById[it.owner_id] : null
                      return (
                        <button
                          key={it.id}
                          onClick={() => setActive(it)}
                          className="card w-full p-3 text-left transition hover:border-white/20"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-white">{it.guest_name}</span>
                            <Tag tone={URGENCY_TONE[it.urgency]}>{URGENCY_LABEL[it.urgency]}</Tag>
                          </div>
                          {locationName(it.location_id) && (
                            <p className="mb-1 text-[11px] text-slate-400">{locationName(it.location_id)}</p>
                          )}
                          <p className="line-clamp-3 text-xs text-slate-300">{it.issue_summary}</p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            {owner ? (
                              <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                <Avatar profile={owner} size="xs" /> {displayName(owner)}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-500">Unassigned</span>
                            )}
                            <span className="text-[11px] text-slate-500">{timeAgo(it.created_at)}</span>
                          </div>
                        </button>
                      )
                    })}
                    {list.length === 0 && (
                      <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-slate-500">
                        None
                      </p>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {showNew && (
        <NewIssueModal
          me={me}
          locations={locations}
          people={activeProfiles}
          onClose={() => setShowNew(false)}
          onCreated={(row) => {
            setItems((prev) => [row, ...prev])
            setShowNew(false)
            toast({ kind: 'success', title: 'Guest issue logged' })
          }}
          onError={() => toast({ kind: 'error', title: 'Could not log issue' })}
        />
      )}

      {active && (
        <DetailModal
          item={active}
          me={me}
          canEdit={canManage(role) || active.owner_id === me || active.created_by === me}
          people={activeProfiles}
          locationName={locationName(active.location_id)}
          onClose={() => setActive(null)}
          onSaved={(row) => {
            setItems((prev) => prev.map((x) => (x.id === row.id ? row : x)))
            setActive(null)
            toast({ kind: 'success', title: 'Issue updated' })
          }}
          onError={() => toast({ kind: 'error', title: 'Could not save changes' })}
        />
      )}
    </div>
  )
}

function NewIssueModal({
  me,
  locations,
  people,
  onClose,
  onCreated,
  onError,
}: {
  me: string | undefined
  locations: { id: string; name: string }[]
  people: import('@/types').Profile[]
  onClose: () => void
  onCreated: (row: GuestRecoveryRow) => void
  onError: () => void
}) {
  const [guestName, setGuestName] = useState('')
  const [locationId, setLocationId] = useState('')
  const [issue, setIssue] = useState('')
  const [urgency, setUrgency] = useState<Urgency>('medium')
  const [ownerId, setOwnerId] = useState('')
  const [involved, setInvolved] = useState<string[]>([])
  const [memberQuery, setMemberQuery] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleInvolved = (id: string) =>
    setInvolved((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  // Type to filter the staff list instead of scrolling from the A's.
  const shownPeople = memberQuery.trim()
    ? people.filter((p) => displayName(p).toLowerCase().includes(memberQuery.trim().toLowerCase()))
    : people

  async function submit() {
    if (!guestName.trim() || !issue.trim() || !me) return
    setSaving(true)
    const { data, error } = await supabase
      .from('guest_recovery_items')
      .insert({
        guest_name: guestName.trim(),
        location_id: locationId || null,
        issue_summary: issue.trim(),
        urgency,
        owner_id: ownerId || null,
        involved_user_ids: involved.length ? involved : null,
        notes: notes.trim() || null,
        created_by: me,
        status: 'new',
      })
      .select('*')
      .single()
    setSaving(false)
    if (error || !data) return onError()
    onCreated(data as GuestRecoveryRow)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Log guest issue"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !guestName.trim() || !issue.trim()}
            className="btn-primary px-4 py-1.5 text-sm"
          >
            {saving ? 'Saving…' : 'Log issue'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Guest name</label>
          <input className="input" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Guest name" />
        </div>
        <div>
          <label className="label">Location</label>
          <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Select location…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Issue summary</label>
          <textarea
            className="input min-h-[90px]"
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
            placeholder="What happened?"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Urgency</label>
            <select className="input" value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className="label">Owner</label>
            <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {displayName(p)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Involved team members</label>
          <input
            className="input mb-2"
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
            placeholder="Search staff…"
          />
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-white/10 p-2">
            {shownPeople.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-slate-200 hover:bg-white/5">
                <input type="checkbox" checked={involved.includes(p.id)} onChange={() => toggleInvolved(p.id)} />
                {displayName(p)}
              </label>
            ))}
            {shownPeople.length === 0 && (
              <p className="px-1 py-2 text-center text-xs text-slate-500">No staff match “{memberQuery.trim()}”.</p>
            )}
          </div>
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea
            className="input min-h-[60px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional context…"
          />
        </div>
      </div>
    </Modal>
  )
}

function DetailModal({
  item,
  me,
  canEdit,
  people,
  locationName,
  onClose,
  onSaved,
  onError,
}: {
  item: GuestRecoveryRow
  me: string | undefined
  canEdit: boolean
  people: import('@/types').Profile[]
  locationName: string | null
  onClose: () => void
  onSaved: (row: GuestRecoveryRow) => void
  onError: () => void
}) {
  const [status, setStatus] = useState<GuestRecoveryStatus>(item.status)
  const [ownerId, setOwnerId] = useState(item.owner_id ?? '')
  const [notes, setNotes] = useState(item.notes ?? '')
  const [resolution, setResolution] = useState(item.resolution ?? '')
  const [saving, setSaving] = useState(false)
  const { profilesById } = useDirectoryStore()

  async function save() {
    if (!me) return
    setSaving(true)
    const patch: Partial<GuestRecoveryRow> = {
      status,
      owner_id: ownerId || null,
      notes: notes.trim() || null,
      resolution: resolution.trim() || null,
    }
    patch.resolved_at = status === 'resolved' ? item.resolved_at ?? new Date().toISOString() : null
    const { data, error } = await supabase
      .from('guest_recovery_items')
      .update(patch)
      .eq('id', item.id)
      .select('*')
      .single()
    setSaving(false)
    if (error || !data) return onError()
    onSaved(data as GuestRecoveryRow)
  }

  const involved = (item.involved_user_ids ?? []).map((id) => profilesById[id]).filter(Boolean)

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={item.guest_name}
      footer={
        canEdit ? (
          <>
            <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">
              Cancel
            </button>
            <button onClick={save} disabled={saving} className="btn-primary px-4 py-1.5 text-sm">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        ) : (
          <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">
            Close
          </button>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <Tag tone={URGENCY_TONE[item.urgency]}>{URGENCY_LABEL[item.urgency]} urgency</Tag>
          {locationName && <span>{locationName}</span>}
          <span>Opened {timeAgo(item.created_at)}</span>
        </div>

        <div>
          <label className="label">Issue</label>
          <p className="whitespace-pre-wrap text-sm text-slate-200">{item.issue_summary}</p>
        </div>

        {involved.length > 0 && (
          <div>
            <label className="label">Involved</label>
            <div className="flex flex-wrap gap-2">
              {involved.map((p) => (
                <span key={p!.id} className="flex items-center gap-1.5 text-xs text-slate-300">
                  <Avatar profile={p!} size="xs" /> {displayName(p!)}
                </span>
              ))}
            </div>
          </div>
        )}

        {canEdit ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Status</label>
                <select className="input" value={status} onChange={(e) => setStatus(e.target.value as GuestRecoveryStatus)}>
                  {GUEST_RECOVERY_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Owner</label>
                <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {displayName(p)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input min-h-[70px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {status === 'resolved' && (
              <div>
                <label className="label">Resolution</label>
                <textarea
                  className="input min-h-[70px]"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  placeholder="How was this resolved?"
                />
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <label className="label">Status</label>
              <p className="text-sm capitalize text-slate-200">{item.status.replace('_', ' ')}</p>
            </div>
            {item.notes && (
              <div>
                <label className="label">Notes</label>
                <p className="whitespace-pre-wrap text-sm text-slate-200">{item.notes}</p>
              </div>
            )}
            {item.resolution && (
              <div>
                <label className="label">Resolution</label>
                <p className="whitespace-pre-wrap text-sm text-slate-200">{item.resolution}</p>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
