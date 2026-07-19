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
import { AlertTriangle, Plus, Check, Users } from '@/components/ui/Icons'
import { canModerate } from '@/lib/constants'
import { cn, displayName, timeAgo } from '@/lib/utils'
import type { UrgentAlertRow, AlertAudience, Profile } from '@/types'

export function UrgentAlertsPage() {
  const me = useAuthStore((s) => s.user?.id)
  const profile = useAuthStore((s) => s.profile)
  const profilesById = useDirectoryStore((s) => s.profilesById)
  const profiles = useDirectoryStore((s) => s.profiles)
  const locations = useDirectoryStore((s) => s.locations)
  const departments = useDirectoryStore((s) => s.departments)
  const toast = useUIStore((s) => s.toast)
  const isLeader = canModerate(profile?.access_level)

  const [items, setItems] = useState<UrgentAlertRow[]>([])
  const [loading, setLoading] = useState(true)
  const [acked, setAcked] = useState<Set<string>>(new Set())
  const [showCompose, setShowCompose] = useState(false)
  const [reportFor, setReportFor] = useState<UrgentAlertRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const locationsById = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l])), [locations])
  const departmentsById = useMemo(() => Object.fromEntries(departments.map((d) => [d.id, d])), [departments])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('urgent_alerts')
      .select('*')
      .order('created_at', { ascending: false })
    const rows = (data as UrgentAlertRow[]) ?? []
    setItems(rows)
    if (me && rows.length) {
      const { data: ackData } = await supabase
        .from('urgent_alert_acknowledgements')
        .select('alert_id')
        .eq('user_id', me)
        .in('alert_id', rows.map((r) => r.id))
      setAcked(new Set((ackData ?? []).map((r) => r.alert_id)))
    } else {
      setAcked(new Set())
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me])

  function audienceLabel(a: UrgentAlertRow): string {
    if (a.audience === 'location') return locationsById[a.location_id ?? '']?.name ?? 'Location'
    if (a.audience === 'department') return departmentsById[a.department_id ?? '']?.name ?? 'Department'
    if (a.audience === 'users') return `${a.target_user_ids?.length ?? 0} people`
    return 'Everyone'
  }

  async function acknowledge(a: UrgentAlertRow) {
    if (!me) return
    setBusyId(a.id)
    const { error } = await supabase
      .from('urgent_alert_acknowledgements')
      .insert({ alert_id: a.id, user_id: me })
    setBusyId(null)
    if (error) {
      toast({ kind: 'error', title: 'Could not acknowledge', body: error.message })
      return
    }
    setAcked((prev) => new Set(prev).add(a.id))
    toast({ kind: 'success', title: 'Acknowledged' })
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        backTo="/"
        backAlways
        icon={<AlertTriangle className="h-5 w-5 text-red-400" />}
        title="Urgent Alerts"
        subtitle="Time-sensitive, high-priority notices"
        actions={
          isLeader ? (
            <button onClick={() => setShowCompose(true)} className="btn-danger px-3 py-1.5 text-sm">
              <Plus className="h-4 w-4" /> Send urgent alert
            </button>
          ) : undefined
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <FullPageLoader label="Loading alerts…" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<AlertTriangle className="h-8 w-8" />}
            title="No urgent alerts"
            body={isLeader ? 'Send an urgent alert when something needs immediate attention.' : "You're all caught up — no active alerts."}
            action={
              isLeader ? (
                <button onClick={() => setShowCompose(true)} className="btn-danger mt-2">
                  Send urgent alert
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {items.map((a) => {
              const author = a.author_id ? profilesById[a.author_id] : null
              const isAcked = acked.has(a.id)
              const critical = a.severity === 'critical'
              return (
                <article
                  key={a.id}
                  className={cn(
                    'rounded-xl border-2 p-4 shadow-lg',
                    critical ? 'border-red-500 bg-red-950/40 animate-pulse-alert' : 'border-red-500/50 bg-red-950/25',
                  )}
                >
                  <div className="mb-2 flex items-start gap-2">
                    <AlertTriangle className={cn('mt-0.5 h-5 w-5 shrink-0', critical ? 'text-red-400' : 'text-red-300')} />
                    <h2 className="flex-1 text-base font-semibold text-white">{a.title}</h2>
                    <Tag tone="red">{critical ? 'Critical' : 'Urgent'}</Tag>
                  </div>

                  <div className="text-sm leading-relaxed text-slate-100">
                    <RichText text={a.body} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                    {author && (
                      <span className="flex items-center gap-1.5">
                        <Avatar profile={author} size="xs" />
                        {displayName(author)}
                      </span>
                    )}
                    <span>·</span>
                    <span>{timeAgo(a.created_at)}</span>
                    <Tag tone="amber">{audienceLabel(a)}</Tag>
                  </div>

                  {(a.requires_ack || isLeader) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-red-500/30 pt-3">
                      {a.requires_ack &&
                        (isAcked ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-300">
                            <Check className="h-4 w-4" /> Acknowledged
                          </span>
                        ) : (
                          <button
                            onClick={() => acknowledge(a)}
                            disabled={busyId === a.id}
                            className="btn-danger px-3 py-1.5 text-sm"
                          >
                            I saw this
                          </button>
                        ))}
                      {isLeader && a.requires_ack && (
                        <button onClick={() => setReportFor(a)} className="btn-ghost px-3 py-1.5 text-sm">
                          <Users className="h-4 w-4" /> Acknowledgement report
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
        <AckReportModal alert={reportFor} profiles={profiles} onClose={() => setReportFor(null)} />
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
  const profiles = useDirectoryStore((s) => s.profiles)
  const locations = useDirectoryStore((s) => s.locations)
  const departments = useDirectoryStore((s) => s.departments)
  const toast = useUIStore((s) => s.toast)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [severity, setSeverity] = useState<'urgent' | 'critical'>('urgent')
  const [audience, setAudience] = useState<AlertAudience>('all')
  const [locationId, setLocationId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [targetUserIds, setTargetUserIds] = useState<string[]>([])
  const [requiresAck, setRequiresAck] = useState(true)
  const [userQuery, setUserQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const people = useMemo(
    () => profiles.filter((p) => p.is_active && p.id !== me),
    [profiles, me],
  )

  // Type to filter instead of scrolling the whole roster from the A's.
  const shownPeople = useMemo(() => {
    const q = userQuery.trim().toLowerCase()
    if (!q) return people
    return people.filter((p) => displayName(p).toLowerCase().includes(q) || (p.role ?? '').toLowerCase().includes(q))
  }, [people, userQuery])

  function reset() {
    setTitle('')
    setBody('')
    setSeverity('urgent')
    setAudience('all')
    setLocationId('')
    setDepartmentId('')
    setTargetUserIds([])
    setRequiresAck(true)
  }

  function toggleUser(id: string) {
    setTargetUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const valid =
    title.trim() &&
    body.trim() &&
    (audience !== 'location' || locationId) &&
    (audience !== 'department' || departmentId) &&
    (audience !== 'users' || targetUserIds.length > 0)

  async function submit() {
    if (!me || !valid) return
    setBusy(true)
    const { error } = await supabase.from('urgent_alerts').insert({
      title: title.trim(),
      body: body.trim(),
      author_id: me,
      severity,
      audience,
      location_id: audience === 'location' ? locationId : null,
      department_id: audience === 'department' ? departmentId : null,
      target_user_ids: audience === 'users' ? targetUserIds : null,
      requires_ack: requiresAck,
    })
    setBusy(false)
    if (error) {
      toast({ kind: 'error', title: 'Could not send alert', body: error.message })
      return
    }
    toast({ kind: 'urgent', title: 'Urgent alert sent', body: 'Your team has been notified.' })
    reset()
    onCreated()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send urgent alert"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-danger" disabled={busy || !valid} onClick={submit}>
            Send alert
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's happening?" autoFocus />
        </div>
        <div>
          <label className="label">Details</label>
          <textarea className="input min-h-[110px] resize-y" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What does the team need to do?" />
        </div>
        <div>
          <label className="label">Severity</label>
          <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value as 'urgent' | 'critical')}>
            <option value="urgent">Urgent</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div>
          <label className="label">Audience</label>
          <select className="input" value={audience} onChange={(e) => setAudience(e.target.value as AlertAudience)}>
            <option value="all">Everyone</option>
            <option value="location">Specific location</option>
            <option value="department">Specific department</option>
            <option value="users">Specific people</option>
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
        {audience === 'users' && (
          <div>
            <label className="label">People ({targetUserIds.length} selected)</label>
            <input
              className="input mb-2"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Search people…"
            />
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-brand-900/60 p-2">
              {shownPeople.map((p) => {
                const on = targetUserIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleUser(p.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
                  >
                    <Avatar profile={p} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{displayName(p)}</p>
                      <p className="truncate text-[11px] capitalize text-slate-400">{p.role}</p>
                    </div>
                    <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border', on ? 'border-brand-400 bg-brand-500' : 'border-white/20')}>
                      {on && <Check className="h-3 w-3 text-white" />}
                    </span>
                  </button>
                )
              })}
              {shownPeople.length === 0 && (
                <p className="px-2 py-3 text-center text-sm text-slate-500">
                  {people.length === 0 ? 'No people available.' : `No one matches “${userQuery.trim()}”.`}
                </p>
              )}
            </div>
          </div>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" className="h-4 w-4 accent-red-500" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} />
          Require acknowledgement
        </label>
      </div>
    </Modal>
  )
}

function AckReportModal({
  alert,
  profiles,
  onClose,
}: {
  alert: UrgentAlertRow
  profiles: Profile[]
  onClose: () => void
}) {
  const [ackMap, setAckMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    supabase
      .from('urgent_alert_acknowledgements')
      .select('user_id, acknowledged_at')
      .eq('alert_id', alert.id)
      .then(({ data }) => {
        if (!active) return
        setAckMap(Object.fromEntries((data ?? []).map((r) => [r.user_id, r.acknowledged_at])))
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [alert.id])

  const audience = useMemo(() => {
    const active = profiles.filter((p) => p.is_active)
    if (alert.audience === 'location') return active.filter((p) => p.location_id === alert.location_id)
    if (alert.audience === 'department') return active.filter((p) => p.department_id === alert.department_id)
    if (alert.audience === 'users') {
      const ids = new Set(alert.target_user_ids ?? [])
      return active.filter((p) => ids.has(p.id))
    }
    return active
  }, [profiles, alert])

  const acknowledged = audience.filter((p) => ackMap[p.id])
  const notYet = audience.filter((p) => !ackMap[p.id])

  return (
    <Modal open onClose={onClose} title="Acknowledgement report" size="md">
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
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-300">
              Not yet — needs follow-up ({notYet.length})
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
