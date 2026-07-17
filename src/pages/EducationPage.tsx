import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useUIStore } from '@/stores/uiStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { FullPageLoader, EmptyState, Spinner } from '@/components/ui/Feedback'
import { Tag } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { RichText } from '@/components/messages/RichText'
import { GraduationCap, Plus, Check, Users } from '@/components/ui/Icons'
import { EDUCATION_CATEGORIES, canPostEducation } from '@/lib/constants'
import { cn, displayName, timeAgo } from '@/lib/utils'
import type { EducationUpdateRow, EducationAckRow, Profile } from '@/types'

const CATEGORY_TONE: Record<string, 'brand' | 'purple' | 'gold' | 'slate'> = {
  class: 'brand',
  formula: 'purple',
  product_tip: 'gold',
  general: 'slate',
}
const categoryLabel = (key: string) => EDUCATION_CATEGORIES.find((c) => c.key === key)?.label ?? key

export function EducationPage() {
  const me = useAuthStore((s) => s.user?.id)
  const role = useAuthStore((s) => s.profile?.role)
  const { profilesById } = useDirectoryStore()
  const locations = useDirectoryStore((s) => s.locations)
  const people = useDirectoryStore((s) => s.profiles)
  const toast = useUIStore((s) => s.toast)

  const [updates, setUpdates] = useState<EducationUpdateRow[]>([])
  const [ackedIds, setAckedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [showNew, setShowNew] = useState(false)
  const [reportFor, setReportFor] = useState<EducationUpdateRow | null>(null)

  const canPost = canPostEducation(role)

  async function load() {
    const [updatesRes, acksRes] = await Promise.all([
      supabase.from('education_updates').select('*').order('created_at', { ascending: false }),
      me
        ? supabase.from('education_acknowledgements').select('education_id').eq('user_id', me)
        : Promise.resolve({ data: [] as { education_id: string }[] }),
    ])
    setUpdates((updatesRes.data as EducationUpdateRow[]) ?? [])
    setAckedIds(new Set(((acksRes.data as { education_id: string }[]) ?? []).map((a) => a.education_id)))
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shown = useMemo(
    () => (filter === 'all' ? updates : updates.filter((u) => u.category === filter)),
    [updates, filter],
  )

  async function markRead(id: string) {
    if (!me) return
    const { error } = await supabase.from('education_acknowledgements').insert({ education_id: id, user_id: me })
    if (error) return toast({ kind: 'error', title: 'Could not mark as read' })
    setAckedIds((prev) => new Set(prev).add(id))
    toast({ kind: 'success', title: 'Marked as read' })
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        backTo="/"
        backAlways
        icon={<GraduationCap className="h-5 w-5" />}
        title="Education"
        subtitle="Updates & required reading"
        actions={
          canPost ? (
            <button onClick={() => setShowNew(true)} className="btn-primary px-3 py-1.5 text-sm">
              <Plus className="h-4 w-4" /> Post update
            </button>
          ) : undefined
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </FilterChip>
          {EDUCATION_CATEGORIES.map((c) => (
            <FilterChip key={c.key} active={filter === c.key} onClick={() => setFilter(c.key)}>
              {c.label}
            </FilterChip>
          ))}
        </div>

        {loading ? (
          <FullPageLoader label="Loading education…" />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<GraduationCap className="h-8 w-8" />}
            title="Nothing here yet"
            body={filter === 'all' ? 'Education updates will appear here.' : 'No updates in this category.'}
          />
        ) : (
          <div className="space-y-3">
            {shown.map((u) => {
              const author = u.author_id ? profilesById[u.author_id] : null
              const acked = ackedIds.has(u.id)
              return (
                <article key={u.id} className="card p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Tag tone={CATEGORY_TONE[u.category] ?? 'slate'}>{categoryLabel(u.category)}</Tag>
                    {u.required_reading && <Tag tone="red">Required reading</Tag>}
                    <span className="ml-auto text-xs text-slate-500">{timeAgo(u.created_at)}</span>
                  </div>
                  <h2 className="text-base font-semibold text-white">{u.title}</h2>
                  <div className="mt-1 text-sm leading-relaxed text-slate-200">
                    <RichText text={u.body} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {author && (
                      <span className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Avatar profile={author} size="xs" /> {displayName(author)}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      {u.requires_ack &&
                        (acked ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-400">
                            <Check className="h-4 w-4" /> Read
                          </span>
                        ) : (
                          <button onClick={() => markRead(u.id)} className="btn-gold px-3 py-1 text-xs">
                            Mark as read
                          </button>
                        ))}
                      {canPost && (
                        <button onClick={() => setReportFor(u)} className="btn-ghost px-3 py-1 text-xs">
                          <Users className="h-3.5 w-3.5" /> Report
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
        <NewUpdateModal
          me={me}
          locations={locations}
          onClose={() => setShowNew(false)}
          onCreated={(row) => {
            setUpdates((prev) => [row, ...prev])
            setShowNew(false)
            toast({ kind: 'success', title: 'Update posted' })
          }}
          onError={() => toast({ kind: 'error', title: 'Could not post update' })}
        />
      )}

      {reportFor && (
        <AckReportModal update={reportFor} people={people} onClose={() => setReportFor(null)} />
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'chip border transition',
        active ? 'border-brand-400 bg-brand-500/20 text-brand-100' : 'border-white/10 text-slate-300 hover:bg-white/5',
      )}
    >
      {children}
    </button>
  )
}

function NewUpdateModal({
  me,
  locations,
  onClose,
  onCreated,
  onError,
}: {
  me: string | undefined
  locations: { id: string; name: string }[]
  onClose: () => void
  onCreated: (row: EducationUpdateRow) => void
  onError: () => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<string>(EDUCATION_CATEGORIES[0].key)
  const [requiredReading, setRequiredReading] = useState(false)
  const [requiresAck, setRequiresAck] = useState(false)
  const [locationId, setLocationId] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!title.trim() || !body.trim() || !me) return
    setSaving(true)
    const { data, error } = await supabase
      .from('education_updates')
      .insert({
        title: title.trim(),
        body: body.trim(),
        category,
        required_reading: requiredReading,
        requires_ack: requiresAck,
        location_id: locationId || null,
        author_id: me,
      })
      .select('*')
      .single()
    setSaving(false)
    if (error || !data) return onError()
    onCreated(data as EducationUpdateRow)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Post education update"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !title.trim() || !body.trim()}
            className="btn-primary px-4 py-1.5 text-sm"
          >
            {saving ? 'Posting…' : 'Post update'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Update title" />
        </div>
        <div>
          <label className="label">Body</label>
          <textarea
            className="input min-h-[120px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Supports **bold**, *italic*, `code`, links…"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Category</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {EDUCATION_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Location (optional)</label>
            <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={requiredReading} onChange={(e) => setRequiredReading(e.target.checked)} />
          Mark as required reading
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} />
          Require acknowledgement (track who has read)
        </label>
      </div>
    </Modal>
  )
}

function AckReportModal({
  update,
  people,
  onClose,
}: {
  update: EducationUpdateRow
  people: Profile[]
  onClose: () => void
}) {
  const [ackMap, setAckMap] = useState<Map<string, string> | null>(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('education_acknowledgements')
      .select('user_id, acknowledged_at')
      .eq('education_id', update.id)
      .then(({ data }) => {
        if (!alive) return
        const rows = (data as EducationAckRow[]) ?? []
        setAckMap(new Map(rows.map((r) => [r.user_id, r.acknowledged_at])))
      })
    return () => {
      alive = false
    }
  }, [update.id])

  const audience = useMemo(
    () =>
      people.filter(
        (p) => p.is_active && (!update.location_id || p.location_id === update.location_id),
      ),
    [people, update.location_id],
  )

  const read = ackMap ? audience.filter((p) => ackMap.has(p.id)) : []
  const notRead = ackMap ? audience.filter((p) => !ackMap.has(p.id)) : []

  return (
    <Modal open onClose={onClose} size="lg" title={`Read report · ${update.title}`}>
      {!ackMap ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            {read.length} of {audience.length} have read this
            {update.location_id ? ' (location audience)' : ''}.
          </p>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-400">
              Read ({read.length})
            </h3>
            <div className="space-y-1">
              {read.length === 0 && <p className="text-sm text-slate-500">No one yet.</p>}
              {read.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-sm text-slate-200">
                  <Avatar profile={p} size="xs" /> {displayName(p)}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-400">
              Not yet ({notRead.length})
            </h3>
            <div className="space-y-1">
              {notRead.length === 0 && <p className="text-sm text-slate-500">Everyone is caught up.</p>}
              {notRead.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-sm text-slate-300">
                  <Avatar profile={p} size="xs" /> {displayName(p)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
