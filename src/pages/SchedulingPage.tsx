import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useUIStore } from '@/stores/uiStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { FullPageLoader, EmptyState } from '@/components/ui/Feedback'
import { Tag } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Calendar, Plus } from '@/components/ui/Icons'
import { SCHEDULING_TYPES, canManage } from '@/lib/constants'
import { cn, displayName, timeAgo } from '@/lib/utils'
import type { SchedulingPostRow, SchedulingType } from '@/types'

type StatusFilter = 'open' | 'filled' | 'cancelled' | 'all'

const STATUS_TONE: Record<SchedulingPostRow['status'], 'green' | 'brand' | 'slate'> = {
  open: 'green',
  filled: 'brand',
  cancelled: 'slate',
}
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'filled', label: 'Filled' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
]
const typeLabel = (key: string) => SCHEDULING_TYPES.find((t) => t.key === key)?.label ?? key

function formatShiftDate(date: string | null): string | null {
  if (!date) return null
  try {
    return format(new Date(`${date}T00:00:00`), 'EEE, MMM d, yyyy')
  } catch {
    return date
  }
}

export function SchedulingPage() {
  const me = useAuthStore((s) => s.user?.id)
  const role = useAuthStore((s) => s.profile?.role)
  const { profilesById } = useDirectoryStore()
  const locations = useDirectoryStore((s) => s.locations)
  const toast = useUIStore((s) => s.toast)

  const [posts, setPosts] = useState<SchedulingPostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [showNew, setShowNew] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase
      .from('scheduling_posts')
      .select('*')
      .order('created_at', { ascending: false })
    setPosts((data as SchedulingPostRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const shown = useMemo(
    () =>
      posts.filter(
        (p) =>
          (statusFilter === 'all' || p.status === statusFilter) &&
          (typeFilter === 'all' || p.type === typeFilter) &&
          (locationFilter === 'all' || p.location_id === locationFilter),
      ),
    [posts, statusFilter, typeFilter, locationFilter],
  )

  const locationName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? null

  async function updateStatus(post: SchedulingPostRow, patch: Partial<SchedulingPostRow>, msg: string) {
    setBusyId(post.id)
    const { data, error } = await supabase
      .from('scheduling_posts')
      .update(patch)
      .eq('id', post.id)
      .select('*')
      .single()
    setBusyId(null)
    if (error || !data) return toast({ kind: 'error', title: 'Could not update post' })
    setPosts((prev) => prev.map((x) => (x.id === post.id ? (data as SchedulingPostRow) : x)))
    toast({ kind: 'success', title: msg })
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Calendar className="h-5 w-5" />}
        title="Scheduling"
        subtitle="Open shifts & coverage"
        actions={
          me ? (
            <button onClick={() => setShowNew(true)} className="btn-primary px-3 py-1.5 text-sm">
              <Plus className="h-4 w-4" /> Post
            </button>
          ) : undefined
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              className={cn(
                'chip border transition',
                statusFilter === s.key
                  ? 'border-brand-400 bg-brand-500/20 text-brand-100'
                  : 'border-white/10 text-slate-300 hover:bg-white/5',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <select className="input max-w-[10rem]" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All types</option>
            {SCHEDULING_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            className="input max-w-[12rem]"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
          >
            <option value="all">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <FullPageLoader label="Loading posts…" />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-8 w-8" />}
            title="No posts here"
            body="Open shifts, coverage requests, and staffing needs will appear here."
            action={
              me ? (
                <button onClick={() => setShowNew(true)} className="btn-primary mt-2">
                  Post a shift
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {shown.map((p) => {
              const author = p.author_id ? profilesById[p.author_id] : null
              const claimer = p.claimed_by ? profilesById[p.claimed_by] : null
              const isAuthor = p.author_id === me
              const canManagePost = isAuthor || canManage(role)
              const busy = busyId === p.id
              return (
                <article key={p.id} className="card p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Tag tone="purple">{typeLabel(p.type)}</Tag>
                    <Tag tone={STATUS_TONE[p.status]}>{p.status}</Tag>
                    <span className="ml-auto text-xs text-slate-500">{timeAgo(p.created_at)}</span>
                  </div>
                  <h2 className="text-base font-semibold text-white">{p.title}</h2>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
                    {locationName(p.location_id) && <span>{locationName(p.location_id)}</span>}
                    {formatShiftDate(p.shift_date) && <span>{formatShiftDate(p.shift_date)}</span>}
                  </div>
                  {p.details && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{p.details}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {author && (
                      <span className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Avatar profile={author} size="xs" /> {displayName(author)}
                      </span>
                    )}
                    {p.status === 'filled' && claimer && (
                      <span className="text-xs text-brand-300">Claimed by {displayName(claimer)}</span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      {p.status === 'open' && !isAuthor && me && (
                        <button
                          onClick={() => updateStatus(p, { status: 'filled', claimed_by: me }, 'You claimed this')}
                          disabled={busy}
                          className="btn-gold px-3 py-1 text-xs"
                        >
                          I can cover
                        </button>
                      )}
                      {canManagePost && p.status !== 'cancelled' && (
                        <button
                          onClick={() => updateStatus(p, { status: 'cancelled' }, 'Post cancelled')}
                          disabled={busy}
                          className="btn-ghost px-3 py-1 text-xs"
                        >
                          Cancel
                        </button>
                      )}
                      {canManagePost && p.status !== 'open' && (
                        <button
                          onClick={() => updateStatus(p, { status: 'open', claimed_by: null }, 'Post reopened')}
                          disabled={busy}
                          className="btn-ghost px-3 py-1 text-xs"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {showNew && (
        <NewPostModal
          me={me}
          locations={locations}
          onClose={() => setShowNew(false)}
          onCreated={(row) => {
            setPosts((prev) => [row, ...prev])
            setShowNew(false)
            toast({ kind: 'success', title: 'Post created' })
          }}
          onError={() => toast({ kind: 'error', title: 'Could not create post' })}
        />
      )}
    </div>
  )
}

function NewPostModal({
  me,
  locations,
  onClose,
  onCreated,
  onError,
}: {
  me: string | undefined
  locations: { id: string; name: string }[]
  onClose: () => void
  onCreated: (row: SchedulingPostRow) => void
  onError: () => void
}) {
  const [type, setType] = useState<SchedulingType>(SCHEDULING_TYPES[0].key)
  const [title, setTitle] = useState('')
  const [locationId, setLocationId] = useState('')
  const [shiftDate, setShiftDate] = useState('')
  const [details, setDetails] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!title.trim() || !me) return
    setSaving(true)
    const { data, error } = await supabase
      .from('scheduling_posts')
      .insert({
        type,
        title: title.trim(),
        location_id: locationId || null,
        shift_date: shiftDate || null,
        details: details.trim() || null,
        author_id: me,
        status: 'open',
      })
      .select('*')
      .single()
    setSaving(false)
    if (error || !data) return onError()
    onCreated(data as SchedulingPostRow)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Post a shift"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">
            Cancel
          </button>
          <button onClick={submit} disabled={saving || !title.trim()} className="btn-primary px-4 py-1.5 text-sm">
            {saving ? 'Posting…' : 'Post'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as SchedulingType)}>
            {SCHEDULING_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Saturday front desk" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Location</label>
            <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Select…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Shift date</label>
            <input type="date" className="input" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Details</label>
          <textarea
            className="input min-h-[90px]"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Times, expectations, anything helpful…"
          />
        </div>
      </div>
    </Modal>
  )
}
