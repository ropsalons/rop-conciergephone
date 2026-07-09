import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useUIStore } from '@/stores/uiStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { Tag } from '@/components/ui/Badge'
import { EmptyState, FullPageLoader, Spinner } from '@/components/ui/Feedback'
import { Shield, Plus, Trash, Archive, Search, Hash, Users, ClipboardList } from '@/components/ui/Icons'
import { isAdmin, ROLE_LABELS } from '@/lib/constants'
import { cn, displayName, formatBytes, timeAgo } from '@/lib/utils'
import type {
  Profile,
  ChannelRow,
  ChannelType,
  AnnouncementRow,
  UrgentAlertRow,
  AuditLogRow,
  MessageRow,
} from '@/types'

type LogAudit = (
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Record<string, unknown>,
) => Promise<void>

const TABS = [
  { key: 'users', label: 'Users' },
  { key: 'channels', label: 'Channels' },
  { key: 'acks', label: 'Acknowledgements' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'storage', label: 'Storage & Export' },
] as const
type TabKey = (typeof TABS)[number]['key']

export function AdminPage() {
  const profile = useAuthStore((s) => s.profile)
  const me = useAuthStore((s) => s.user?.id)
  const loaded = useDirectoryStore((s) => s.loaded)
  const load = useDirectoryStore((s) => s.load)
  const [tab, setTab] = useState<TabKey>('users')

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const logAudit: LogAudit = useCallback(
    async (action, entityType, entityId, metadata = {}) => {
      if (!me) return
      await supabase.from('audit_logs').insert({
        actor_id: me,
        action,
        entity_type: entityType,
        entity_id: entityId,
        metadata,
      })
    },
    [me],
  )

  if (!isAdmin(profile?.role)) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Admin Panel" icon={<Shield className="h-5 w-5" />} />
        <EmptyState
          icon={<Shield className="h-8 w-8" />}
          title="Admins only"
          body="You need administrator access to view this page."
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Admin Panel"
        subtitle="Manage users, channels, and system settings"
        icon={<Shield className="h-5 w-5" />}
      />
      <div className="flex gap-1 overflow-x-auto border-b border-white/10 bg-brand-900/40 px-2 py-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition',
              tab === t.key ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'users' && <UsersTab logAudit={logAudit} />}
        {tab === 'channels' && <ChannelsTab me={me ?? ''} logAudit={logAudit} />}
        {tab === 'acks' && <AcksTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'storage' && <StorageTab />}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Users                                                              */
/* ------------------------------------------------------------------ */

function UsersTab({ logAudit }: { logAudit: LogAudit }) {
  const profiles = useDirectoryStore((s) => s.profiles)
  const roles = useDirectoryStore((s) => s.roles)
  const locations = useDirectoryStore((s) => s.locations)
  const departments = useDirectoryStore((s) => s.departments)
  const reload = useDirectoryStore((s) => s.load)
  const toast = useUIStore((s) => s.toast)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const roleOptions = roles.length
    ? roles.map((r) => ({ value: r.key, label: r.label }))
    : Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))

  const q = search.trim().toLowerCase()
  const filtered = q
    ? profiles.filter(
        (p) =>
          p.full_name?.toLowerCase().includes(q) ||
          p.email?.toLowerCase().includes(q) ||
          p.role?.toLowerCase().includes(q),
      )
    : profiles

  async function patchUser(
    p: Profile,
    patch: Partial<Profile>,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    setBusyId(p.id)
    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', p.id)
      .select('*')
      .single()
    if (error || !data) {
      setBusyId(null)
      toast({ kind: 'error', title: 'Update failed', body: error?.message })
      return
    }
    await reload()
    await logAudit(action, 'profile', p.id, metadata)
    setBusyId(null)
    toast({ kind: 'success', title: 'User updated', body: displayName(data as Profile) })
  }

  function toggleActive(p: Profile) {
    if (
      p.is_active &&
      !window.confirm(`Deactivate ${displayName(p)}? They will lose access to the app.`)
    )
      return
    void patchUser(
      p,
      { is_active: !p.is_active },
      p.is_active ? 'deactivate_user' : 'reactivate_user',
      { is_active: !p.is_active },
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          className="input pl-9"
          placeholder="Search by name, email or role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Users className="h-8 w-8" />} title="No users found" />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <div key={p.id} className="card space-y-3 p-3">
              <div className="flex items-center gap-3">
                <Avatar profile={p} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{displayName(p)}</p>
                  <p className="truncate text-xs text-slate-400">{p.email ?? 'No email'}</p>
                </div>
                <Tag tone={p.is_active ? 'green' : 'red'}>{p.is_active ? 'Active' : 'Inactive'}</Tag>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="block">
                  <span className="label">Role</span>
                  <select
                    className="input"
                    value={p.role}
                    disabled={busyId === p.id}
                    onChange={(e) =>
                      patchUser(p, { role: e.target.value }, 'change_role', {
                        from: p.role,
                        to: e.target.value,
                      })
                    }
                  >
                    {roleOptions.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="label">Location</span>
                  <select
                    className="input"
                    value={p.location_id ?? ''}
                    disabled={busyId === p.id}
                    onChange={(e) =>
                      patchUser(
                        p,
                        { location_id: e.target.value || null },
                        'change_location',
                        { location_id: e.target.value || null },
                      )
                    }
                  >
                    <option value="">No location</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="label">Department</span>
                  <select
                    className="input"
                    value={p.department_id ?? ''}
                    disabled={busyId === p.id}
                    onChange={(e) =>
                      patchUser(
                        p,
                        { department_id: e.target.value || null },
                        'change_department',
                        { department_id: e.target.value || null },
                      )
                    }
                  >
                    <option value="">No department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => toggleActive(p)}
                  disabled={busyId === p.id}
                  className={p.is_active ? 'btn-danger px-3 py-1.5 text-sm' : 'btn-primary px-3 py-1.5 text-sm'}
                >
                  {p.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Channels                                                           */
/* ------------------------------------------------------------------ */

const CHANNEL_TYPES: { value: ChannelType; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'admin', label: 'Admin' },
  { value: 'location', label: 'Location' },
  { value: 'department', label: 'Department' },
]

function ChannelsTab({ me, logAudit }: { me: string; logAudit: LogAudit }) {
  const locations = useDirectoryStore((s) => s.locations)
  const departments = useDirectoryStore((s) => s.departments)
  const toast = useUIStore((s) => s.toast)
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const fetchChannels = useCallback(async () => {
    const [chRes, memRes] = await Promise.all([
      supabase.from('channels').select('*').order('name'),
      supabase.from('channel_members').select('channel_id'),
    ])
    setChannels((chRes.data as ChannelRow[]) ?? [])
    const map: Record<string, number> = {}
    for (const m of (memRes.data as { channel_id: string }[]) ?? []) {
      map[m.channel_id] = (map[m.channel_id] ?? 0) + 1
    }
    setCounts(map)
    setLoading(false)
  }, [])

  useEffect(() => {
    void fetchChannels()
  }, [fetchChannels])

  async function toggleArchive(c: ChannelRow) {
    const { error } = await supabase
      .from('channels')
      .update({ is_archived: !c.is_archived })
      .eq('id', c.id)
    if (error) {
      toast({ kind: 'error', title: 'Failed', body: error.message })
      return
    }
    await logAudit(c.is_archived ? 'unarchive_channel' : 'archive_channel', 'channel', c.id, {
      name: c.name,
    })
    toast({ kind: 'success', title: c.is_archived ? 'Channel unarchived' : 'Channel archived' })
    void fetchChannels()
  }

  async function removeChannel(c: ChannelRow) {
    if (!window.confirm(`Delete channel #${c.name}? This permanently removes it and its messages.`))
      return
    const { error } = await supabase.from('channels').delete().eq('id', c.id)
    if (error) {
      toast({ kind: 'error', title: 'Delete failed', body: error.message })
      return
    }
    await logAudit('delete_channel', 'channel', c.id, { name: c.name })
    toast({ kind: 'success', title: 'Channel deleted', body: `#${c.name}` })
    void fetchChannels()
  }

  if (loading) return <FullPageLoader label="Loading channels…" />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{channels.length} channels</p>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-sm">
          <Plus className="h-4 w-4" />
          Create channel
        </button>
      </div>

      {channels.length === 0 ? (
        <EmptyState icon={<Hash className="h-8 w-8" />} title="No channels yet" />
      ) : (
        <div className="space-y-2">
          {channels.map((c) => (
            <div key={c.id} className="card flex items-center gap-3 p-3">
              <Hash className="h-5 w-5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {c.name}
                  {c.is_default && <span className="ml-2 text-[11px] text-gold-300">default</span>}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {c.type} · {counts[c.id] ?? 0} members
                </p>
              </div>
              {c.is_archived && <Tag tone="amber">Archived</Tag>}
              <button
                onClick={() => toggleArchive(c)}
                title={c.is_archived ? 'Unarchive' : 'Archive'}
                className="rounded-lg p-2 text-slate-300 hover:bg-white/10"
              >
                <Archive className="h-4 w-4" />
              </button>
              <button
                onClick={() => removeChannel(c)}
                title="Delete"
                className="rounded-lg p-2 text-red-300 hover:bg-red-500/10"
              >
                <Trash className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateChannelModal
          me={me}
          locations={locations}
          departments={departments}
          onClose={() => setShowCreate(false)}
          onCreated={async (c) => {
            await logAudit('create_channel', 'channel', c.id, { name: c.name, type: c.type })
            setShowCreate(false)
            void fetchChannels()
          }}
        />
      )}
    </div>
  )
}

function CreateChannelModal({
  me,
  locations,
  departments,
  onClose,
  onCreated,
}: {
  me: string
  locations: { id: string; name: string }[]
  departments: { id: string; name: string }[]
  onClose: () => void
  onCreated: (c: ChannelRow) => void | Promise<void>
}) {
  const toast = useUIStore((s) => s.toast)
  const [name, setName] = useState('')
  const [type, setType] = useState<ChannelType>('public')
  const [locationId, setLocationId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [description, setDescription] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)

  async function create() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast({ kind: 'error', title: 'Name required' })
      return
    }
    if (type === 'location' && !locationId) {
      toast({ kind: 'error', title: 'Pick a location' })
      return
    }
    if (type === 'department' && !departmentId) {
      toast({ kind: 'error', title: 'Pick a department' })
      return
    }
    const slug =
      trimmed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || `channel-${Date.now()}`

    setSaving(true)
    const { data, error } = await supabase
      .from('channels')
      .insert({
        name: trimmed,
        slug,
        type,
        description: description.trim() || null,
        location_id: type === 'location' ? locationId : null,
        department_id: type === 'department' ? departmentId : null,
        is_default: isDefault,
        created_by: me,
      })
      .select('*')
      .single()
    setSaving(false)
    if (error || !data) {
      toast({ kind: 'error', title: 'Create failed', body: error?.message })
      return
    }
    toast({ kind: 'success', title: 'Channel created', body: `#${trimmed}` })
    void onCreated(data as ChannelRow)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Create channel"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button onClick={create} disabled={saving} className="btn-primary flex items-center gap-2 px-3 py-1.5 text-sm">
            {saving && <Spinner className="h-4 w-4" />}
            Create
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. front-desk" />
        </label>

        <label className="block">
          <span className="label">Type</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as ChannelType)}>
            {CHANNEL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        {type === 'location' && (
          <label className="block">
            <span className="label">Location</span>
            <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Select location…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {type === 'department' && (
          <label className="block">
            <span className="label">Department</span>
            <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Select department…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="label">Description</span>
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Default channel (auto-join for everyone)
        </label>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Acknowledgements                                                   */
/* ------------------------------------------------------------------ */

function AcksTab() {
  const profiles = useDirectoryStore((s) => s.profiles)
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([])
  const [alerts, setAlerts] = useState<UrgentAlertRow[]>([])
  const [sel, setSel] = useState('')
  const [ackIds, setAckIds] = useState<Set<string>>(new Set())
  const [loadingAcks, setLoadingAcks] = useState(false)

  useEffect(() => {
    void (async () => {
      const [annRes, alertRes] = await Promise.all([
        supabase.from('announcements').select('*').order('created_at', { ascending: false }),
        supabase.from('urgent_alerts').select('*').order('created_at', { ascending: false }),
      ])
      setAnnouncements((annRes.data as AnnouncementRow[]) ?? [])
      setAlerts((alertRes.data as UrgentAlertRow[]) ?? [])
    })()
  }, [])

  useEffect(() => {
    if (!sel) {
      setAckIds(new Set())
      return
    }
    const [kind, id] = sel.split(':')
    setLoadingAcks(true)
    void (async () => {
      const res =
        kind === 'announcement'
          ? await supabase.from('announcement_acknowledgements').select('user_id').eq('announcement_id', id)
          : await supabase.from('urgent_alert_acknowledgements').select('user_id').eq('alert_id', id)
      setAckIds(new Set(((res.data as { user_id: string }[]) ?? []).map((r) => r.user_id)))
      setLoadingAcks(false)
    })()
  }, [sel])

  const [kind, id] = sel ? sel.split(':') : ['', '']
  const announcement = kind === 'announcement' ? announcements.find((a) => a.id === id) : undefined
  const urgentAlert = kind === 'alert' ? alerts.find((a) => a.id === id) : undefined
  const active = profiles.filter((p) => p.is_active)

  let audience: Profile[] = []
  if (announcement) {
    audience =
      announcement.audience === 'location'
        ? active.filter((p) => p.location_id === announcement.location_id)
        : announcement.audience === 'department'
          ? active.filter((p) => p.department_id === announcement.department_id)
          : active
  } else if (urgentAlert) {
    audience =
      urgentAlert.audience === 'location'
        ? active.filter((p) => p.location_id === urgentAlert.location_id)
        : urgentAlert.audience === 'department'
          ? active.filter((p) => p.department_id === urgentAlert.department_id)
          : urgentAlert.audience === 'users'
            ? active.filter((p) => (urgentAlert.target_user_ids ?? []).includes(p.id))
            : active
  }

  const acked = audience.filter((p) => ackIds.has(p.id))
  const notAcked = audience.filter((p) => !ackIds.has(p.id))
  const hasSelection = Boolean(announcement || urgentAlert)

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="label">Choose an item to report on</span>
        <select className="input" value={sel} onChange={(e) => setSel(e.target.value)}>
          <option value="">Select…</option>
          {announcements.length > 0 && (
            <optgroup label="Announcements">
              {announcements.map((a) => (
                <option key={a.id} value={`announcement:${a.id}`}>
                  {a.title}
                </option>
              ))}
            </optgroup>
          )}
          {alerts.length > 0 && (
            <optgroup label="Urgent alerts">
              {alerts.map((a) => (
                <option key={a.id} value={`alert:${a.id}`}>
                  {a.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      {!hasSelection ? (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title="Pick an announcement or alert"
          body="Select an item above to see who has acknowledged it."
        />
      ) : loadingAcks ? (
        <FullPageLoader label="Loading acknowledgements…" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="card p-3 text-center">
              <p className="text-2xl font-bold text-white">{audience.length}</p>
              <p className="text-xs text-slate-400">Audience</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-2xl font-bold text-emerald-400">{acked.length}</p>
              <p className="text-xs text-slate-400">Acknowledged</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-2xl font-bold text-red-400">{notAcked.length}</p>
              <p className="text-xs text-slate-400">Outstanding</p>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">
              Escalation — not yet acknowledged ({notAcked.length})
            </h3>
            {notAcked.length === 0 ? (
              <p className="text-sm text-emerald-400">Everyone has acknowledged. 🎉</p>
            ) : (
              <div className="space-y-1">
                {notAcked.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
                    <Avatar profile={p} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{displayName(p)}</p>
                      <p className="truncate text-xs text-slate-400">{p.email ?? p.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Audit log                                                          */
/* ------------------------------------------------------------------ */

function AuditTab() {
  const profilesById = useDirectoryStore((s) => s.profilesById)
  const [logs, setLogs] = useState<AuditLogRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      setLogs((data as AuditLogRow[]) ?? [])
      setLoading(false)
    })()
  }, [])

  if (loading) return <FullPageLoader label="Loading audit log…" />
  if (logs.length === 0)
    return <EmptyState icon={<ClipboardList className="h-8 w-8" />} title="No audit entries yet" />

  return (
    <div className="space-y-2">
      {logs.map((log) => {
        const actor = log.actor_id ? profilesById[log.actor_id] : undefined
        const hasMeta = log.metadata && Object.keys(log.metadata).length > 0
        return (
          <div key={log.id} className="card p-3">
            <div className="flex items-center gap-3">
              {actor ? <Avatar profile={actor} size="sm" /> : <div className="h-8 w-8 rounded-full bg-white/10" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">
                  <span className="font-semibold">{actor ? displayName(actor) : 'System'}</span>{' '}
                  <span className="text-slate-300">{log.action}</span>
                </p>
                <p className="truncate text-xs text-slate-400">
                  {log.entity_type ?? 'system'} · {timeAgo(log.created_at)}
                </p>
              </div>
            </div>
            {hasMeta && (
              <pre className="mt-2 overflow-x-auto rounded-lg bg-black/30 px-2 py-1.5 text-[11px] text-slate-300">
                {JSON.stringify(log.metadata)}
              </pre>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Storage & Export                                                   */
/* ------------------------------------------------------------------ */

function StorageTab() {
  const profilesById = useDirectoryStore((s) => s.profilesById)
  const toast = useUIStore((s) => s.toast)
  const [totalBytes, setTotalBytes] = useState(0)
  const [fileCount, setFileCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([])
  const [channelId, setChannelId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    void (async () => {
      const [filesRes, chRes] = await Promise.all([
        supabase.from('files').select('size_bytes').limit(1000),
        supabase.from('channels').select('id, name').order('name'),
      ])
      const rows = (filesRes.data as { size_bytes: number }[]) ?? []
      setTotalBytes(rows.reduce((sum, r) => sum + (r.size_bytes ?? 0), 0))
      setFileCount(rows.length)
      setChannels((chRes.data as { id: string; name: string }[]) ?? [])
      setLoading(false)
    })()
  }, [])

  async function exportCsv() {
    if (!channelId) {
      toast({ kind: 'error', title: 'Pick a channel to export' })
      return
    }
    setExporting(true)
    let query = supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
    if (from) query = query.gte('created_at', from)
    if (to) query = query.lte('created_at', `${to}T23:59:59`)
    const { data, error } = await query
    setExporting(false)
    if (error) {
      toast({ kind: 'error', title: 'Export failed', body: error.message })
      return
    }
    const messages = (data as MessageRow[]) ?? []
    const cell = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = ['created_at,author,body']
    for (const m of messages) {
      const author = profilesById[m.user_id]
      lines.push([m.created_at, displayName(author), m.body].map(cell).join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const chName = channels.find((c) => c.id === channelId)?.name ?? 'channel'
    a.href = url
    a.download = `messages-${chName}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ kind: 'success', title: 'Export ready', body: `${messages.length} messages` })
  }

  if (loading) return <FullPageLoader label="Loading storage…" />

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">Storage usage</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="card p-3 text-center">
            <p className="text-2xl font-bold text-white">{formatBytes(totalBytes)}</p>
            <p className="text-xs text-slate-400">Total stored</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-2xl font-bold text-white">{fileCount}</p>
            <p className="text-xs text-slate-400">Files{fileCount >= 1000 ? '+' : ''}</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">Message export</h3>
        <div className="space-y-3">
          <label className="block">
            <span className="label">Channel</span>
            <select className="input" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">Select channel…</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label">From</span>
              <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">To</span>
              <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <button
            onClick={exportCsv}
            disabled={exporting}
            className="btn-gold flex items-center gap-2 px-4 py-2 text-sm"
          >
            {exporting && <Spinner className="h-4 w-4" />}
            Export CSV
          </button>
        </div>
      </div>
    </div>
  )
}
