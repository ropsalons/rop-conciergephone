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
import { RichText } from '@/components/messages/RichText'
import { Megaphone, Pin, Plus, Trash, Check, Users, Calendar } from '@/components/ui/Icons'
import { canModerate } from '@/lib/constants'
import { displayName, timeAgo } from '@/lib/utils'
import type { AnnouncementRow, AnnouncementAudience, Profile } from '@/types'

const AUDIENCE_TONE = { all: 'brand', location: 'gold', department: 'purple' } as const

export function AnnouncementsPage() {
  const me = useAuthStore((s) => s.user?.id)
  const profile = useAuthStore((s) => s.profile)
  const profilesById = useDirectoryStore((s) => s.profilesById)
  const profiles = useDirectoryStore((s) => s.profiles)
  const locations = useDirectoryStore((s) => s.locations)
  const departments = useDirectoryStore((s) => s.departments)
  const toast = useUIStore((s) => s.toast)
  const isLeader = canModerate(profile?.role)

  const [items, setItems] = useState<AnnouncementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [acked, setAcked] = useState<Set<string>>(new Set())
  const [showCompose, setShowCompose] = useState(false)
  const [reportFor, setReportFor] = useState<AnnouncementRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const locationsById = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations])
  const departmentsById = useMemo(() => Object.fromEntries(departments.map((d) => [d.id, d])), [departments])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
    const rows = (data as AnnouncementRow[]) ?? []
    setItems(rows)
    if (me && rows.length) {
      const { data: ackData } = await supabase
        .from('announcement_acknowledgements')
        .select('announcement_id')
        .eq('user_id', me)
        .in('announcement_id', rows.map((r) => r.id))
      setAcked(new Set((ackData ?? []).map((r) => r.announcement_id)))
    } else {
      setAcked(new Set())
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me])

  function audienceLabel(a: AnnouncementRow): string {
    if (a.audience === 'location') return locationsById[a.location_id ?? '']?.name ?? 'Location'
    if (a.audience === 'department') return departmentsById[a.department_id ?? '']?.name ?? 'Department'
    return 'Everyone'
  }

  async function acknowledge(a: AnnouncementRow) {
    if (!me) return
    setBusyId(a.id)
    const { error } = await supabase
      .from('announcement_acknowledgements')
      .insert({ announcement_id: a.id, user_id: me })
    setBusyId(null)
    if (error) {
      toast({ kind: 'error', title: 'Could not acknowledge', body: error.message })
      return
    }
    setAcked((prev) => new Set(prev).add(a.id))
    toast({ kind: 'success', title: 'Acknowledged' })
  }

  async function togglePin(a: AnnouncementRow) {
    setBusyId(a.id)
    const { error } = await supabase
      .from('announcements')
      .update({ is_pinned: !a.is_pinned })
      .eq('id', a.id)
    setBusyId(null)
    if (error) {
      toast({ kind: 'error', title: 'Could not update', body: error.message })
      return
    }
    void load()
  }

  async function remove(a: AnnouncementRow) {
    if (!window.confirm(`Delete announcement “${a.title}”? This cannot be undone.`)) return
    setBusyId(a.id)
    const { error } = await supabase.from('announcements').delete().eq('id', a.id)
    setBusyId(null)
    if (error) {
      toast({ kind: 'error', title: 'Could not delete', body: error.message })
      return
    }
    setItems((prev) => prev.filter((x) => x.id !== a.id))
    toast({ kind: 'success', title: 'Announcement deleted' })
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        backTo="/"
        backAlways
        icon={<Megaphone className="h-5 w-5" />}
        title="Announcements"
        subtitle="Company-wide news and updates"
        actions={
          isLeader ? (
            <button onClick={() => setShowCompose(true)} className="btn-primary px-3 py-1.5 text-sm">
              <Plus className="h-4 w-4" /> New announcement
            </button>
          ) : undefined
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <FullPageLoader label="Loading announcements…" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="h-8 w-8" />}
            title="No announcements yet"
            body={isLeader ? 'Post the first announcement for your team.' : 'Check back soon for company news.'}
            action={
              isLeader ? (
                <button onClick={() => setShowCompose(true)} className="btn-primary mt-2">
                  New announcement
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {items.map((a) => {
              const author = a.author_id ? profilesById[a.author_id] : null
              const isAcked = acked.has(a.id)
              const expired = a.expires_at ? new Date(a.expires_at).getTime() < Date.now() : false
              return (
                <article key={a.id} className="card p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {a.is_pinned && (
                        <span className="inline-flex items-center gap-1 text-gold-300" title="Pinned">
                          <Pin className="h-4 w-4" />
                        </span>
                      )}
                      <h2 className="text-base font-semibold text-white">{a.title}</h2>
                    </div>
                    {isLeader && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => togglePin(a)}
                          disabled={busyId === a.id}
                          className={a.is_pinned ? 'rounded-lg p-1.5 text-gold-300 hover:bg-white/10' : 'rounded-lg p-1.5 text-slate-400 hover:bg-white/10'}
                          title={a.is_pinned ? 'Unpin' : 'Pin to top'}
                        >
                          <Pin className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => remove(a)}
                          disabled={busyId === a.id}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/20 hover:text-red-300"
                          title="Delete"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="text-sm leading-relaxed text-slate-200">
                    <RichText text={a.body} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    {author && (
                      <span className="flex items-center gap-1.5">
                        <Avatar profile={author} size="xs" />
                        {displayName(author)}
                      </span>
                    )}
                    <span>·</span>
                    <span>{timeAgo(a.created_at)}</span>
                    <Tag tone={AUDIENCE_TONE[a.audience]}>{audienceLabel(a)}</Tag>
                    {a.expires_at && (
                      <span className={expired ? 'flex items-center gap-1 text-red-300' : 'flex items-center gap-1 text-slate-400'}>
                        <Calendar className="h-3.5 w-3.5" />
                        {expired ? 'Expired' : `Expires ${new Date(a.expires_at).toLocaleDateString()}`}
                      </span>
                    )}
                  </div>

                  {(a.requires_ack || isLeader) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                      {a.requires_ack &&
                        (isAcked ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-300">
                            <Check className="h-4 w-4" /> Acknowledged
                          </span>
                        ) : (
                          <button
                            onClick={() => acknowledge(a)}
                            disabled={busyId === a.id}
                            className="btn-gold px-3 py-1.5 text-sm"
                          >
                            Acknowledge
                          </button>
                        ))}
                      {isLeader && a.requires_ack && (
                        <button onClick={() => setReportFor(a)} className="btn-ghost px-3 py-1.5 text-sm">
                          <Users className="h-4 w-4" /> View acknowledgements
                        </button>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>

      {isLeader && (
        <ComposeModal
          open={showCompose}
          onClose={() => setShowCompose(false)}
          onCreated={() => {
            setShowCompose(false)
            void load()
          }}
        />
      )}

      {isLeader && reportFor && (
        <AckReportModal
          announcement={reportFor}
          profiles={profiles}
          onClose={() => setReportFor(null)}
        />
      )}
    </div>
  )
}

function ComposeModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const me = useAuthStore((s) => s.user?.id)
  const locations = useDirectoryStore((s) => s.locations)
  const departments = useDirectoryStore((s) => s.departments)
  const toast = useUIStore((s) => s.toast)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<AnnouncementAudience>('all')
  const [locationId, setLocationId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const [requiresAck, setRequiresAck] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')
  const [busy, setBusy] = useState(false)

  function reset() {
    setTitle('')
    setBody('')
    setAudience('all')
    setLocationId('')
    setDepartmentId('')
    setIsPinned(false)
    setRequiresAck(false)
    setExpiresAt('')
  }

  const valid =
    title.trim() &&
    body.trim() &&
    (audience !== 'location' || locationId) &&
    (audience !== 'department' || departmentId)

  async function submit() {
    if (!me || !valid) return
    setBusy(true)
    const { error } = await supabase.from('announcements').insert({
      title: title.trim(),
      body: body.trim(),
      author_id: me,
      audience,
      location_id: audience === 'location' ? locationId : null,
      department_id: audience === 'department' ? departmentId : null,
      is_pinned: isPinned,
      requires_ack: requiresAck,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    })
    setBusy(false)
    if (error) {
      toast({ kind: 'error', title: 'Could not post', body: error.message })
      return
    }
    toast({ kind: 'success', title: 'Announcement posted' })
    reset()
    onCreated()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New announcement"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !valid} onClick={submit}>
            Post announcement
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's the news?" autoFocus />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea className="input min-h-[120px] resize-y" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your announcement…" />
        </div>
        <div>
          <label className="label">Audience</label>
          <select className="input" value={audience} onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}>
            <option value="all">Everyone</option>
            <option value="location">Specific location</option>
            <option value="department">Specific department</option>
          </select>
        </div>
        {audience === 'location' && (
          <div>
            <label className="label">Location</label>
            <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Select a location…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {audience === 'department' && (
          <div>
            <label className="label">Department</label>
            <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Select a department…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label">Expiration (optional)</label>
          <input type="date" className="input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} />
          Pin to top
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} />
          Require acknowledgement
        </label>
      </div>
    </Modal>
  )
}

function AckReportModal({
  announcement,
  profiles,
  onClose,
}: {
  announcement: AnnouncementRow
  profiles: Profile[]
  onClose: () => void
}) {
  const [ackMap, setAckMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    supabase
      .from('announcement_acknowledgements')
      .select('user_id, acknowledged_at')
      .eq('announcement_id', announcement.id)
      .then(({ data }) => {
        if (!active) return
        setAckMap(Object.fromEntries((data ?? []).map((r) => [r.user_id, r.acknowledged_at])))
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [announcement.id])

  const audience = useMemo(() => {
    const active = profiles.filter((p) => p.is_active)
    if (announcement.audience === 'location') return active.filter((p) => p.location_id === announcement.location_id)
    if (announcement.audience === 'department') return active.filter((p) => p.department_id === announcement.department_id)
    return active
  }, [profiles, announcement])

  const acknowledged = audience.filter((p) => ackMap[p.id])
  const notYet = audience.filter((p) => !ackMap[p.id])

  return (
    <Modal open onClose={onClose} title="Acknowledgements" size="md">
      {loading ? (
        <div className="py-8">
          <FullPageLoader label="Loading report…" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200">
            <span className="font-semibold text-white">{acknowledged.length}</span> of{' '}
            <span className="font-semibold text-white">{audience.length}</span> acknowledged
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-300">
              <Check className="h-4 w-4" /> Acknowledged ({acknowledged.length})
            </h3>
            {acknowledged.length === 0 ? (
              <p className="text-sm text-slate-500">No one has acknowledged yet.</p>
            ) : (
              <div className="space-y-1">
                {acknowledged.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                    <Avatar profile={p} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-white">{displayName(p)}</span>
                    <span className="text-[11px] text-slate-400">{timeAgo(ackMap[p.id])}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
              Not yet ({notYet.length})
            </h3>
            {notYet.length === 0 ? (
              <p className="text-sm text-slate-500">Everyone has acknowledged. 🎉</p>
            ) : (
              <div className="space-y-1">
                {notYet.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                    <Avatar profile={p} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{displayName(p)}</span>
                    <span className="text-[11px] capitalize text-slate-500">{p.role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
