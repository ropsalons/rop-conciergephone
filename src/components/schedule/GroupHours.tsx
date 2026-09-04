import { Fragment, useMemo } from 'react'
import { useDirectoryStore } from '@/stores/directoryStore'
import { Avatar } from '@/components/ui/Avatar'
import { cn, displayName } from '@/lib/utils'
import { dateKey, dayHeadLabel } from '@/lib/schedule'

export type ActualRow = { user_id: string; work_date: string; location: string | null; department: string | null; hours: number }
export type GroupKey = 'stylists' | 'associates' | 'other'

// Which ROP Time departments + ROP Chat roles belong to each tab. Hours are
// attributed by the department the person actually clocked as that day, so a
// dual-role person (e.g. a silver stylist who sometimes works associate) lands
// in the right tab for the hours they worked in that role.
const GROUP_DEFS: Record<GroupKey, { label: string; depts: string[]; roles: string[] }> = {
  stylists: { label: 'Stylists', depts: ['Stylist', 'Nails', 'Assistant', 'Specialist'], roles: ['stylist', 'assistant', 'specialist'] },
  associates: { label: 'Associates', depts: ['Associate'], roles: ['associate'] },
  other: { label: 'Other', depts: ['Marketing'], roles: ['marketing', 'media', 'leadership'] },
}

const fmtH = (n: number) => `${Math.round(n * 10) / 10}h`
function salonShort(name?: string | null): string {
  if (!name) return ''
  if (/bayfront/i.test(name)) return 'Bay'
  if (/village/i.test(name)) return 'Vill'
  if (/promenade/i.test(name)) return 'Prom'
  if (/remote/i.test(name)) return 'Remote'
  return name.split(' ')[0]
}

export function GroupHours({ groupKey, days, actual, actualLoading, todayKey }: {
  groupKey: GroupKey; days: Date[]; actual: ActualRow[]; actualLoading: boolean; todayKey: string
}) {
  const profiles = useDirectoryStore((s) => s.profiles)
  const profilesById = useDirectoryStore((s) => s.profilesById)
  const locations = useDirectoryStore((s) => s.locations)
  const def = GROUP_DEFS[groupKey]

  // Rows for this group only (by the department actually worked).
  const rows = useMemo(() => {
    const dset = new Set(def.depts.map((d) => d.toLowerCase()))
    return actual.filter((r) => r.department && dset.has(r.department.toLowerCase()))
  }, [actual, def.depts])

  // People to show: anyone whose home role is in this group, plus anyone who
  // logged hours in this group's departments this week.
  const userIds = useMemo(() => {
    const s = new Set<string>()
    const roles = new Set(def.roles)
    profiles.forEach((p) => { if (p.is_active && (roles.has(p.role) || (p.secondary_role && roles.has(p.secondary_role)))) s.add(p.id) })
    rows.forEach((r) => s.add(r.user_id))
    return [...s].filter((id) => profilesById[id])
  }, [profiles, rows, def.roles, profilesById])

  const cell = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const k = `${r.user_id}|${r.work_date}`
      m.set(k, (m.get(k) ?? 0) + Number(r.hours))
    }
    return m
  }, [rows])
  const totalByUser = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.user_id, (m.get(r.user_id) ?? 0) + Number(r.hours))
    return m
  }, [rows])

  // Group people by home salon for readability.
  const groups = useMemo(() => {
    const byLoc = new Map<string | null, string[]>()
    for (const uid of userIds) {
      const loc = profilesById[uid]?.location_id ?? null
      const arr = byLoc.get(loc) ?? []
      arr.push(uid)
      byLoc.set(loc, arr)
    }
    const sortU = (ids: string[]) => ids.sort((a, b) => (totalByUser.get(b) ?? 0) - (totalByUser.get(a) ?? 0) || displayName(profilesById[a]).localeCompare(displayName(profilesById[b])))
    const out: { key: string; label: string; userIds: string[] }[] = []
    for (const l of locations) { const ids = byLoc.get(l.id); if (ids?.length) out.push({ key: l.id, label: l.name, userIds: sortU(ids) }) }
    const none = byLoc.get(null); if (none?.length) out.push({ key: 'none', label: 'No home salon', userIds: sortU(none) })
    return out
  }, [userIds, profilesById, locations, totalByUser])

  // Location totals (by where the hours were actually worked).
  const bucketList = useMemo(() => {
    const out = locations.map((l) => ({ key: salonShort(l.name), label: l.name.split(' ')[0] }))
    out.push({ key: 'Remote', label: 'Remote' }, { key: 'Other', label: 'Other' })
    return out
  }, [locations])
  const byBucket = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const known = bucketList.some((b) => b.key === salonShort(r.location))
      const key = /remote/i.test(r.location ?? '') ? 'Remote' : known ? salonShort(r.location) : 'Other'
      m.set(key, (m.get(key) ?? 0) + Number(r.hours))
    }
    return m
  }, [rows, bucketList])
  const grand = useMemo(() => [...byBucket.values()].reduce((a, b) => a + b, 0), [byBucket])

  if (actualLoading) return <p className="py-8 text-center text-sm text-slate-400">Loading {def.label.toLowerCase()} hours from ROP Time…</p>
  if (userIds.length === 0) return <p className="py-8 text-center text-sm text-slate-500">No {def.label.toLowerCase()} hours recorded for this week yet.</p>

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 text-xs text-slate-400">
              <th className="sticky left-0 z-10 bg-brand-950 px-3 py-2 text-left font-medium">Person</th>
              {days.map((d) => (
                <th key={dateKey(d)} className={cn('min-w-[4.5rem] px-2 py-2 text-center font-medium', dateKey(d) === todayKey && 'bg-brand-500/10 text-brand-200')}>{dayHeadLabel(d)}</th>
              ))}
              <th className="min-w-[4rem] px-2 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.key}>
                <tr>
                  <td colSpan={days.length + 2} className="sticky left-0 bg-brand-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.label}</td>
                </tr>
                {g.userIds.map((uid) => (
                  <tr key={uid} className="border-b border-white/5">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-brand-950 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar profile={profilesById[uid]} size="xs" />
                        <span className="text-sm text-slate-100">{displayName(profilesById[uid])}</span>
                      </div>
                    </td>
                    {days.map((d) => {
                      const h = cell.get(`${uid}|${dateKey(d)}`)
                      return (
                        <td key={dateKey(d)} className={cn('px-2 py-2 text-center', dateKey(d) === todayKey && 'bg-brand-500/5')}>
                          {h && h > 0 ? <span className="text-[12px] font-semibold text-gold-200">{fmtH(h)}</span> : <span className="text-slate-600">·</span>}
                        </td>
                      )
                    })}
                    <td className="px-2 py-2 text-right"><span className="text-sm font-semibold text-gold-200">{fmtH(totalByUser.get(uid) ?? 0)}</span></td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-white/10 bg-brand-950/40 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{def.label} — actual hours by location (worked)</p>
        <div className="flex flex-wrap gap-2">
          {bucketList.map((b) => (
            <div key={b.key} className="rounded-lg bg-white/5 px-3 py-1.5 text-sm">
              <span className="text-slate-300">{b.label}</span>{' '}
              <span className="font-semibold text-gold-200">{fmtH(byBucket.get(b.key) ?? 0)}</span>
            </div>
          ))}
          <div className="ml-auto rounded-lg bg-white/10 px-3 py-1.5 text-sm">
            <span className="text-slate-300">Total</span>{' '}
            <span className="font-bold text-gold-200">{fmtH(grand)}</span>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">Live actual hours from ROP Time. Dual-role people (e.g. a stylist who sometimes works associate) count in each tab only for the hours they worked in that role. Scheduled hours for this group are coming next.</p>
    </div>
  )
}
