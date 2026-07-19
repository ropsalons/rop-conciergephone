import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useUIStore } from '@/stores/uiStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { Tag, AccessBadge } from '@/components/ui/Badge'
import { FullPageLoader, EmptyState } from '@/components/ui/Feedback'
import { Search, Users, MessageSquare } from '@/components/ui/Icons'
import { ROLE_LABELS, titleLabel } from '@/lib/constants'
import { displayName } from '@/lib/utils'
import type { Profile } from '@/types'

export function DirectoryPage() {
  const navigate = useNavigate()
  const me = useAuthStore((s) => s.user?.id)
  const toast = useUIStore((s) => s.toast)
  const profiles = useDirectoryStore((s) => s.profiles)
  const locations = useDirectoryStore((s) => s.locations)
  const departments = useDirectoryStore((s) => s.departments)
  const loaded = useDirectoryStore((s) => s.loaded)

  const [q, setQ] = useState('')
  const [locationId, setLocationId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [role, setRole] = useState('')
  const [sort, setSort] = useState<'name' | 'active' | 'newest' | 'tenure'>('name')
  const [selected, setSelected] = useState<Profile | null>(null)
  const [busy, setBusy] = useState(false)

  const startYear = (p: Profile) => ((p as any).hire_date ? String((p as any).hire_date).slice(0, 4) : null)

  useEffect(() => {
    if (profiles.length === 0) void useDirectoryStore.getState().load()
  }, [profiles.length])

  const locationName = useMemo(
    () => Object.fromEntries(locations.map((l) => [l.id, l.name])),
    [locations],
  )
  const departmentName = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d.name])),
    [departments],
  )

  const roleOptions = useMemo(() => {
    const set = new Set(profiles.map((p) => p.role))
    return [...set].sort((a, b) => (ROLE_LABELS[a] ?? a).localeCompare(ROLE_LABELS[b] ?? b))
  }, [profiles])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return profiles
      .filter((p) => p.is_active)
      .filter((p) => {
        if (!needle) return true
        return (
          displayName(p).toLowerCase().includes(needle) ||
          (p.title ?? '').toLowerCase().includes(needle)
        )
      })
      .filter((p) => (locationId ? p.location_id === locationId : true))
      .filter((p) => (departmentId ? p.department_id === departmentId : true))
      .filter((p) => (role ? p.role === role : true))
  }, [profiles, q, locationId, departmentId, role])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const lm = (p: any) => (p.last_seen_at ? Date.parse(p.last_seen_at) : 0)
    const hy = (p: any) => (p.hire_date ? Date.parse(p.hire_date) : 0)
    if (sort === 'active') arr.sort((a, b) => lm(b) - lm(a))
    else if (sort === 'newest') arr.sort((a, b) => hy(b) - hy(a))
    else if (sort === 'tenure') arr.sort((a, b) => (hy(a) || 8e15) - (hy(b) || 8e15))
    else arr.sort((a, b) => displayName(a).localeCompare(displayName(b)))
    return arr
  }, [filtered, sort])

  async function message(p: Profile) {
    if (p.id === me) return // you can't DM yourself
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('get_or_create_dm', { other_user: p.id })
      if (error) throw error
      setSelected(null)
      navigate(`/dm/${data as string}`)
    } catch (err: any) {
      toast({ kind: 'error', title: 'Could not open conversation', body: err.message })
    } finally {
      setBusy(false)
    }
  }

  if (!loaded && profiles.length === 0) return <FullPageLoader label="Loading directory…" />

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Directory" subtitle={`${filtered.length} people`} icon={<Users className="h-5 w-5" />} />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-brand-900 px-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              className="flex-1 bg-transparent py-2 text-sm focus:outline-none"
              placeholder="Search by name or title"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="input py-1.5 text-sm" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <select className="input py-1.5 text-sm" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <select className="input py-1.5 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All roles</option>
              {roleOptions.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
              ))}
            </select>
            <select className="input py-1.5 text-sm" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} title="Sort">
              <option value="name">Sort: A–Z</option>
              <option value="active">Sort: Recently active</option>
              <option value="newest">Sort: Newest hires</option>
              <option value="tenure">Sort: Longest here</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="No people found"
            body="Try adjusting your search or filters."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((p) => (
              <div key={p.id} className="card flex items-center gap-3 p-3">
                <button onClick={() => setSelected(p)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar profile={p} size="md" showPresence />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-white">
                      <span className="truncate">{displayName(p)}</span>
                      <AccessBadge access={p.access_level} />
                      {startYear(p) && <span className="text-[11px] font-medium text-gold-300/90">· since {startYear(p)}</span>}
                    </p>
                    <p className="truncate text-xs text-slate-400">{p.title || titleLabel(p.role, p.secondary_role) || p.role}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {[p.location_id ? locationName[p.location_id] : null, p.department_id ? departmentName[p.department_id] : null]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                  </div>
                </button>
                {p.id === me ? (
                  <span className="shrink-0 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-400">
                    You
                  </span>
                ) : (
                  <button
                    onClick={() => void message(p)}
                    disabled={busy}
                    title={`Message ${displayName(p)}`}
                    aria-label={`Message ${displayName(p)}`}
                    className="btn-primary shrink-0 gap-1 px-2.5 py-1.5 text-xs"
                  >
                    <MessageSquare className="h-4 w-4" /> Message
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Profile"
        footer={
          selected ? (
            <>
              <button className="btn-ghost" onClick={() => setSelected(null)}>Close</button>
              {selected.id !== me && (
                <button className="btn-primary" disabled={busy} onClick={() => message(selected)}>
                  <MessageSquare className="h-4 w-4" /> Message
                </button>
              )}
            </>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar profile={selected} size="xl" showPresence />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-lg font-semibold text-white">
                  <span className="truncate">{displayName(selected)}</span>
                  <AccessBadge access={selected.access_level} />
                </p>
                <p className="truncate text-sm text-slate-400">{selected.title || titleLabel(selected.role, selected.secondary_role) || selected.role}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Tag tone="brand">{titleLabel(selected.role, selected.secondary_role) || ROLE_LABELS[selected.role] || selected.role}</Tag>
                  <Tag tone={selected.presence === 'online' ? 'green' : selected.presence === 'away' ? 'amber' : 'slate'}>
                    {selected.presence}
                  </Tag>
                </div>
              </div>
            </div>

            <dl className="space-y-2 text-sm">
              <Field label="Location" value={selected.location_id ? locationName[selected.location_id] : null} />
              <Field label="Department" value={selected.department_id ? departmentName[selected.department_id] : null} />
              <Field label="With ROP since" value={startYear(selected)} />
              <Field label="Phone" value={selected.phone} />
              {selected.custom_status && <Field label="Status" value={selected.custom_status} />}
            </dl>

            {selected.bio && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">About</p>
                <p className="whitespace-pre-wrap text-sm text-slate-300">{selected.bio}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-right text-slate-200">{value || '—'}</dd>
    </div>
  )
}
