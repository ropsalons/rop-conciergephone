import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useUIStore } from '@/stores/uiStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { Tag } from '@/components/ui/Badge'
import { FullPageLoader, EmptyState } from '@/components/ui/Feedback'
import { Search, Users, MessageSquare } from '@/components/ui/Icons'
import { ROLE_LABELS } from '@/lib/constants'
import { displayName } from '@/lib/utils'
import type { Profile } from '@/types'

export function DirectoryPage() {
  const navigate = useNavigate()
  const toast = useUIStore((s) => s.toast)
  const profiles = useDirectoryStore((s) => s.profiles)
  const locations = useDirectoryStore((s) => s.locations)
  const departments = useDirectoryStore((s) => s.departments)
  const loaded = useDirectoryStore((s) => s.loaded)

  const [q, setQ] = useState('')
  const [locationId, setLocationId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [role, setRole] = useState('')
  const [selected, setSelected] = useState<Profile | null>(null)
  const [busy, setBusy] = useState(false)

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

  async function message(p: Profile) {
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
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="card flex items-center gap-3 p-3 text-left hover:bg-white/5"
              >
                <Avatar profile={p} size="md" showPresence />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{displayName(p)}</p>
                  <p className="truncate text-xs text-slate-400">{p.title || ROLE_LABELS[p.role] || p.role}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {[p.location_id ? locationName[p.location_id] : null, p.department_id ? departmentName[p.department_id] : null]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                </div>
              </button>
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
              <button className="btn-primary" disabled={busy} onClick={() => message(selected)}>
                <MessageSquare className="h-4 w-4" /> Message
              </button>
            </>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar profile={selected} size="xl" showPresence />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-white">{displayName(selected)}</p>
                <p className="truncate text-sm text-slate-400">{selected.title || ROLE_LABELS[selected.role] || selected.role}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Tag tone="brand">{ROLE_LABELS[selected.role] ?? selected.role}</Tag>
                  <Tag tone={selected.presence === 'online' ? 'green' : selected.presence === 'away' ? 'amber' : 'slate'}>
                    {selected.presence}
                  </Tag>
                </div>
              </div>
            </div>

            <dl className="space-y-2 text-sm">
              <Field label="Location" value={selected.location_id ? locationName[selected.location_id] : null} />
              <Field label="Department" value={selected.department_id ? departmentName[selected.department_id] : null} />
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
