import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useUIStore } from '@/stores/uiStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { Tag } from '@/components/ui/Badge'
import { EmptyState, FullPageLoader, Spinner } from '@/components/ui/Feedback'
import { Shield, Plus, Trash, Archive, Search, Hash, Users, ClipboardList, Edit } from '@/components/ui/Icons'
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
  { key: 'activity', label: 'Activity' },
  { key: 'channels', label: 'Channels' },
  { key: 'email', label: 'Send Email' },
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
        {tab === 'activity' && <ActivityTab />}
        {tab === 'channels' && <ChannelsTab me={me ?? ''} logAudit={logAudit} />}
        {tab === 'email' && <EmailTab logAudit={logAudit} />}
        {tab === 'acks' && <AcksTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'storage' && <StorageTab />}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Activity — who's logging in and using the app                       */
/* ------------------------------------------------------------------ */

interface ActivityRow {
  id: string
  full_name: string | null
  display_name: string | null
  role: string
  title: string | null
  location_name: string | null
  is_active: boolean
  presence: string
  last_seen_at: string | null
  created_at: string
  last_sign_in_at: string | null
  has_account: boolean
  msgs_7d: number
  msgs_30d: number
  last_message_at: string | null
}

// A person's "last active" is the most recent of their live heartbeat or their last login.
const lastActive = (r: ActivityRow) => r.last_seen_at ?? r.last_sign_in_at

function ActivityTab() {
  const [rows, setRows] = useState<ActivityRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [onlySignedIn, setOnlySignedIn] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    setRows(null)
    setErr(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase.rpc as any)('user_activity').then(({ data, error }: any) => {
      if (!alive) return
      if (error) setErr(error.message)
      else setRows((data as ActivityRow[]) ?? [])
    })
    return () => {
      alive = false
    }
  }, [nonce])

  const summary = useMemo(() => {
    const now = Date.now()
    const DAY = 86_400_000
    const within = (iso: string | null, ms: number) => !!iso && now - new Date(iso).getTime() < ms
    const list = rows ?? []
    return {
      activeToday: list.filter((r) => within(lastActive(r), DAY)).length,
      active7: list.filter((r) => within(lastActive(r), 7 * DAY)).length,
      signedIn: list.filter((r) => r.last_sign_in_at).length,
      never: list.filter((r) => !r.last_sign_in_at).length,
    }
  }, [rows])

  const filtered = useMemo(() => {
    const list = rows ?? []
    return list
      .filter((r) => !onlySignedIn || r.last_sign_in_at)
      .filter((r) => {
        if (!q) return true
        const s = q.toLowerCase()
        return displayName(r as any).toLowerCase().includes(s) || (r.location_name ?? '').toLowerCase().includes(s)
      })
  }, [rows, q, onlySignedIn])

  function downloadCsv() {
    const head = ['Name', 'Role', 'Location', 'Signed up?', 'Last login', 'Last active', 'Msgs 7d', 'Msgs 30d']
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = (rows ?? []).map((r) =>
      [
        displayName(r as any),
        r.role,
        r.location_name ?? '',
        r.last_sign_in_at ? 'yes' : 'no',
        r.last_sign_in_at ?? '',
        lastActive(r) ?? '',
        r.msgs_7d,
        r.msgs_30d,
      ]
        .map(esc)
        .join(','),
    )
    const csv = [head.map(esc).join(','), ...lines].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `rop-chat-activity-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (err)
    return (
      <EmptyState icon={<Users className="h-8 w-8" />} title="Couldn't load activity" body={err} />
    )
  if (!rows) return <FullPageLoader label="Loading activity…" />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Active today" value={summary.activeToday} />
        <StatTile label="Active this week" value={summary.active7} />
        <StatTile label="Signed in (ever)" value={summary.signedIn} />
        <StatTile label="Never signed in" value={summary.never} muted />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or salon…"
            className="input w-full pl-8"
          />
        </div>
        <button
          onClick={() => setOnlySignedIn((v) => !v)}
          className={cn('rounded-lg border px-3 py-2 text-sm', onlySignedIn ? 'border-brand-400/60 bg-brand-400/15 text-brand-100' : 'border-white/10 text-slate-300 hover:bg-white/10')}
        >
          Signed-in only
        </button>
        <button onClick={() => setNonce((n) => n + 1)} className="btn-ghost px-3 py-2 text-sm">Refresh</button>
        <button onClick={downloadCsv} className="btn-ghost px-3 py-2 text-sm">Download CSV</button>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10">
        {filtered.map((r, i) => (
          <div
            key={r.id}
            className={cn('flex items-center gap-3 px-3 py-2.5', i > 0 && 'border-t border-white/5')}
          >
            <Avatar profile={r as any} size="sm" showPresence={false} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-white">{displayName(r as any)}</span>
                {!r.last_sign_in_at && <Tag className="bg-slate-700/60 text-slate-300">Never signed in</Tag>}
              </div>
              <p className="truncate text-xs text-slate-500">
                <span className="capitalize">{ROLE_LABELS[r.role] ?? r.role}</span>
                {r.location_name ? ` · ${r.location_name}` : ''}
              </p>
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-xs text-slate-300">{r.last_sign_in_at ? timeAgo(r.last_sign_in_at) : '—'}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-600">last login</p>
            </div>
            <div className="w-24 text-right">
              <p className="text-xs text-slate-300">{lastActive(r) ? timeAgo(lastActive(r)!) : '—'}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-600">last active</p>
            </div>
            <div className="w-14 text-right">
              <p className="text-sm font-semibold text-white">{r.msgs_30d}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-600">msgs 30d</p>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-500">No one matches.</p>}
      </div>
      <p className="text-xs text-slate-500">
        “Last login” is when they last signed in. “Last active” also counts the app being open (live
        heartbeat). New sign-ins and activity start filling in as people use the updated app.
      </p>
    </div>
  )
}

function StatTile({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <p className={cn('text-2xl font-bold', muted ? 'text-slate-400' : 'text-white')}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Send Email (broadcast to staff / anyone via Resend)                 */
/* ------------------------------------------------------------------ */

type RecipMode = 'all' | 'location' | 'people' | 'custom'

function EmailTab({ logAudit }: { logAudit: LogAudit }) {
  const profiles = useDirectoryStore((s) => s.profiles)
  const locations = useDirectoryStore((s) => s.locations)
  const myEmail = useAuthStore((s) => s.profile?.email)
  const toast = useUIStore((s) => s.toast)

  const [mode, setMode] = useState<RecipMode>('all')
  const [locationId, setLocationId] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [custom, setCustom] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')

  const withEmail = useMemo(() => profiles.filter((p) => p.is_active && p.email), [profiles])

  const recipients = useMemo<string[]>(() => {
    if (mode === 'all') return withEmail.map((p) => p.email as string)
    if (mode === 'location') return withEmail.filter((p) => p.location_id === locationId).map((p) => p.email as string)
    if (mode === 'people') return withEmail.filter((p) => picked.has(p.id)).map((p) => p.email as string)
    return custom
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))
  }, [mode, withEmail, locationId, picked, custom])

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase()
    return withEmail
      .filter((p) => !q || `${p.full_name} ${p.display_name ?? ''} ${p.email}`.toLowerCase().includes(q))
      .slice(0, 100)
  }, [withEmail, search])

  async function send() {
    const to = [...new Set(recipients)]
    if (!subject.trim()) return toast({ kind: 'error', title: 'Subject required' })
    if (!message.trim()) return toast({ kind: 'error', title: 'Message required' })
    if (!to.length) return toast({ kind: 'error', title: 'No recipients' })
    if (!window.confirm(`Send this email to ${to.length} recipient${to.length === 1 ? '' : 's'}?`)) return

    const html =
      `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:600px;margin:auto">` +
      `<div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:18px 20px;border-radius:14px 14px 0 0"><b style="font-size:16px">Robert of Philadelphia</b></div>` +
      `<div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 14px 14px;padding:20px">` +
      `<h2 style="margin:0 0 10px;font-size:18px">${escapeHtml(subject)}</h2>` +
      `<div style="font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(message)}</div>` +
      `</div></div>`

    setSending(true)
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: { bcc: to, subject: subject.trim(), html, text: message, replyTo: myEmail || undefined },
    })
    setSending(false)
    if (error || !(data as any)?.ok) {
      toast({ kind: 'error', title: 'Send failed', body: (data as any)?.error || error?.message })
      return
    }
    await logAudit('send_email', 'email', null, { subject: subject.trim(), recipients: to.length, mode })
    toast({ kind: 'success', title: 'Email sent', body: `Delivered to ${to.length} recipient${to.length === 1 ? '' : 's'}.` })
    setSubject('')
    setMessage('')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold text-white">Send an email</h2>
        <p className="text-xs text-slate-400">
          Sends from <b>notifications@rop2020.com</b> via Resend. Recipients are hidden from each other (BCC). Replies go to your email.
        </p>

        <div>
          <span className="label">Recipients</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {(
              [
                ['all', 'All active staff'],
                ['location', 'By location'],
                ['people', 'Choose people'],
                ['custom', 'Custom addresses'],
              ] as [RecipMode, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold',
                  mode === k ? 'border-brand-400 bg-brand-400/20 text-brand-100' : 'border-white/15 text-slate-300 hover:bg-white/5',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'location' && (
          <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Select location…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}

        {mode === 'people' && (
          <div className="rounded-xl border border-white/10 bg-brand-950/40 p-2">
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/10 bg-brand-900 px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                className="flex-1 bg-transparent py-2 text-sm focus:outline-none"
                placeholder="Search staff…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {filteredPeople.map((p) => {
                const on = picked.has(p.id)
                return (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setPicked((prev) => {
                          const next = new Set(prev)
                          on ? next.delete(p.id) : next.add(p.id)
                          return next
                        })
                      }
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-white">{displayName(p)}</span>
                    <span className="truncate text-[11px] text-slate-500">{p.email}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {mode === 'custom' && (
          <textarea
            className="input"
            rows={3}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Enter email addresses separated by commas or new lines"
          />
        )}

        <label className="block">
          <span className="label">Subject</span>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" />
        </label>

        <label className="block">
          <span className="label">Message</span>
          <textarea className="input" rows={8} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write your message…" />
        </label>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">{recipients.length} recipient{recipients.length === 1 ? '' : 's'}</span>
          <button onClick={send} disabled={sending} className="btn-primary flex items-center gap-2 px-4 py-1.5 text-sm">
            {sending && <Spinner className="h-4 w-4" />}
            Send email
          </button>
        </div>
      </div>
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
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
  const [editing, setEditing] = useState<Profile | null>(null)
  const [form, setForm] = useState({ full_name: '', display_name: '', title: '', phone: '' })

  function openEdit(p: Profile) {
    setForm({
      full_name: p.full_name ?? '',
      display_name: p.display_name ?? '',
      title: p.title ?? '',
      phone: p.phone ?? '',
    })
    setEditing(p)
  }

  async function saveEdit() {
    if (!editing) return
    await patchUser(
      editing,
      {
        full_name: form.full_name.trim() || editing.full_name,
        display_name: form.display_name.trim() || null,
        title: form.title.trim() || null,
        phone: form.phone.trim() || null,
      },
      'edit_profile',
      { fields: ['full_name', 'display_name', 'title', 'phone'] },
    )
    setEditing(null)
  }

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

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => openEdit(p)}
                  disabled={busyId === p.id}
                  className="btn-ghost px-3 py-1.5 text-sm"
                >
                  Edit details
                </button>
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

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${displayName(editing)}` : 'Edit member'}
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button
              className="btn-primary px-3 py-1.5 text-sm"
              disabled={busyId === editing?.id}
              onClick={saveEdit}
            >
              Save changes
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="label">Full name</span>
            <input className="input" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
          </label>
          <label className="block">
            <span className="label">Display name (nickname shown everywhere)</span>
            <input className="input" placeholder="e.g. Rob" value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} />
          </label>
          <label className="block">
            <span className="label">Title</span>
            <input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <label className="block">
            <span className="label">Phone</span>
            <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </label>
          <p className="text-xs text-slate-400">
            Role, location, department and active status are changed on the card behind this dialog.
          </p>
        </div>
      </Modal>
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
  const [editing, setEditing] = useState<ChannelRow | null>(null)

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
                onClick={() => setEditing(c)}
                title="Edit name, topic, type…"
                className="rounded-lg p-2 text-slate-300 hover:bg-white/10"
              >
                <Edit className="h-4 w-4" />
              </button>
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

      {editing && (
        <EditChannelModal
          channel={editing}
          locations={locations}
          departments={departments}
          onClose={() => setEditing(null)}
          onSaved={async (c) => {
            await logAudit('update_channel', 'channel', c.id, { name: c.name, type: c.type })
            setEditing(null)
            void fetchChannels()
          }}
        />
      )}
    </div>
  )
}

function EditChannelModal({
  channel,
  locations,
  departments,
  onClose,
  onSaved,
}: {
  channel: ChannelRow
  locations: { id: string; name: string }[]
  departments: { id: string; name: string }[]
  onClose: () => void
  onSaved: (c: ChannelRow) => void | Promise<void>
}) {
  const toast = useUIStore((s) => s.toast)
  const [name, setName] = useState(channel.name)
  const [type, setType] = useState<ChannelType>(channel.type as ChannelType)
  const [locationId, setLocationId] = useState(channel.location_id ?? '')
  const [departmentId, setDepartmentId] = useState(channel.department_id ?? '')
  const [topic, setTopic] = useState(channel.topic ?? '')
  const [description, setDescription] = useState(channel.description ?? '')
  const [isDefault, setIsDefault] = useState(!!channel.is_default)
  const [isArchived, setIsArchived] = useState(!!channel.is_archived)
  const [saving, setSaving] = useState(false)

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) return toast({ kind: 'error', title: 'Name required' })
    if (type === 'location' && !locationId) return toast({ kind: 'error', title: 'Pick a location' })
    if (type === 'department' && !departmentId) return toast({ kind: 'error', title: 'Pick a department' })
    const slug =
      trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || channel.slug

    setSaving(true)
    const { data, error } = await supabase
      .from('channels')
      .update({
        name: trimmed,
        slug,
        type,
        topic: topic.trim() || null,
        description: description.trim() || null,
        location_id: type === 'location' ? locationId : null,
        department_id: type === 'department' ? departmentId : null,
        is_default: isDefault,
        is_archived: isArchived,
      })
      .eq('id', channel.id)
      .select('*')
      .single()
    setSaving(false)
    if (error || !data) return toast({ kind: 'error', title: 'Save failed', body: error?.message })
    toast({ kind: 'success', title: 'Channel updated', body: `#${trimmed}` })
    void onSaved(data as ChannelRow)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit #${channel.name}`}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 px-3 py-1.5 text-sm">
            {saving && <Spinner className="h-4 w-4" />}
            Save changes
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
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
          <span className="label">Topic</span>
          <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Short topic shown under the name" />
        </label>

        <label className="block">
          <span className="label">Description</span>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Default channel (auto-join for everyone)
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={isArchived} onChange={(e) => setIsArchived(e.target.checked)} />
          Archived (read-only, hidden from active lists)
        </label>
      </div>
    </Modal>
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
