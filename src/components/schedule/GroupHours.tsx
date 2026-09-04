import { Fragment, useMemo, useState } from 'react'
import { useDirectoryStore } from '@/stores/directoryStore'
import { Avatar } from '@/components/ui/Avatar'
import { Refresh } from '@/components/ui/Icons'
import { cn, displayName } from '@/lib/utils'
import { dateKey, dayHeadLabel } from '@/lib/schedule'

export type ActualRow = { user_id: string; work_date: string; location: string | null; department: string | null; hours: number }
export type BlvdRow = { user_id: string; work_date: string; location: string | null; role_name: string | null; scheduled_hours: number | null; booked_hours: number | null }
export type AssocSchedRow = { user_id: string; weekday: number; hours: number | null; location: string | null }
export type GroupKey = 'stylists' | 'associates' | 'other'

const GROUP_DEFS: Record<GroupKey, { label: string; depts: string[]; roles: string[]; useBlvd: boolean }> = {
  stylists: { label: 'Stylists', depts: ['Stylist', 'Nails', 'Assistant', 'Specialist'], roles: ['stylist', 'assistant', 'specialist'], useBlvd: true },
  associates: { label: 'Associates', depts: ['Associate'], roles: ['associate'], useBlvd: false },
  other: { label: 'Other', depts: ['Marketing', 'Social'], roles: ['marketing', 'media', 'leadership'], useBlvd: false },
}

const fmtH = (n: number) => `${Math.round(n * 10) / 10}h`
function salonShort(name?: string | null): string {
  if (!name) return ''
  if (/bayfront/i.test(name)) return 'Bay'
  if (/village/i.test(name)) return 'Vill'
  if (/promenade|bonita/i.test(name)) return 'Prom'
  if (/remote/i.test(name)) return 'Remote'
  return name.split(' ')[0]
}
type Row = { user_id: string; work_date: string; location: string | null; hours: number }

export function GroupHours({ groupKey, days, actual, blvd, assocSched, actualLoading, todayKey, onRefresh, refreshing }: {
  groupKey: GroupKey; days: Date[]; actual: ActualRow[]; blvd: BlvdRow[]; assocSched: AssocSchedRow[]; actualLoading: boolean; todayKey: string
  onRefresh?: () => void; refreshing?: boolean
}) {
  const profiles = useDirectoryStore((s) => s.profiles)
  const profilesById = useDirectoryStore((s) => s.profilesById)
  const locations = useDirectoryStore((s) => s.locations)
  const def = GROUP_DEFS[groupKey]
  const [mode, setMode] = useState<'actual' | 'scheduled'>('actual')
  const scheduledSupported = groupKey === 'stylists' || groupKey === 'associates'

  // ROP Time rows for this group (by the department actually worked).
  const ropRows = useMemo<Row[]>(() => {
    const dset = new Set(def.depts.map((d) => d.toLowerCase()))
    return actual.filter((r) => r.department && dset.has(r.department.toLowerCase()))
      .map((r) => ({ user_id: r.user_id, work_date: r.work_date, location: r.location, hours: Number(r.hours) }))
  }, [actual, def.depts])
  const ropUsers = useMemo(() => new Set(ropRows.map((r) => r.user_id)), [ropRows])

  // People shown in this tab: home role in the group, plus anyone with hours logged here.
  const userIds = useMemo(() => {
    const s = new Set<string>()
    const roles = new Set(def.roles)
    // Roster = people whose home role is in this group, plus anyone who logged
    // hours in this group's departments. (Boulevard is used for scheduled hours
    // but NOT for membership — it schedules concierge/coordinators too, who
    // don't belong on the Stylists page.)
    profiles.forEach((p) => { if (p.is_active && (roles.has(p.role) || (p.secondary_role && roles.has(p.secondary_role)))) s.add(p.id) })
    ropRows.forEach((r) => s.add(r.user_id))
    if (groupKey === 'associates') assocSched.forEach((a) => s.add(a.user_id))
    // Never list guests, vendor reps, bots, or test accounts.
    return [...s].filter((id) => { const p = profilesById[id]; return p && !p.is_external && !p.is_external_guest })
  }, [profiles, ropRows, assocSched, groupKey, profilesById, def.roles])
  const idSet = useMemo(() => new Set(userIds), [userIds])

  const blvdForGroup = useMemo(() => (def.useBlvd ? blvd.filter((b) => idSet.has(b.user_id)) : []), [blvd, idSet, def.useBlvd])

  // Scheduled rows (Boulevard rostered hours) and actual rows (ROP Time worked,
  // with Boulevard booked hours filling in for people who don't clock).
  const schedRows = useMemo<Row[]>(() => {
    if (groupKey === 'stylists') {
      return blvdForGroup.map((b) => ({ user_id: b.user_id, work_date: b.work_date, location: b.location, hours: Number(b.scheduled_hours ?? 0) })).filter((r) => r.hours > 0)
    }
    if (groupKey === 'associates') {
      // Expand each associate's inferred weekday hours onto the visible week.
      const mine = assocSched.filter((a) => idSet.has(a.user_id))
      const out: Row[] = []
      for (const a of mine) {
        for (const d of days) {
          if (d.getDay() === a.weekday && (a.hours ?? 0) > 0) out.push({ user_id: a.user_id, work_date: dateKey(d), location: a.location, hours: Number(a.hours) })
        }
      }
      return out
    }
    return []
  }, [groupKey, blvdForGroup, assocSched, idSet, days])
  const actualRows = useMemo<Row[]>(() => {
    const bookedFallback = blvdForGroup
      .filter((b) => !ropUsers.has(b.user_id))
      .map((b) => ({ user_id: b.user_id, work_date: b.work_date, location: b.location, hours: Number(b.booked_hours ?? 0) }))
      .filter((r) => r.hours > 0)
    return [...ropRows, ...bookedFallback]
  }, [ropRows, blvdForGroup, ropUsers])

  const rows = mode === 'scheduled' && scheduledSupported ? schedRows : actualRows

  const cell = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) { const k = `${r.user_id}|${r.work_date}`; m.set(k, (m.get(k) ?? 0) + r.hours) }
    return m
  }, [rows])
  const totalByUser = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.user_id, (m.get(r.user_id) ?? 0) + r.hours)
    return m
  }, [rows])

  const groups = useMemo(() => {
    const byLoc = new Map<string | null, string[]>()
    for (const uid of userIds) { const loc = profilesById[uid]?.location_id ?? null; const arr = byLoc.get(loc) ?? []; arr.push(uid); byLoc.set(loc, arr) }
    const sortU = (ids: string[]) => ids.sort((a, b) => (totalByUser.get(b) ?? 0) - (totalByUser.get(a) ?? 0) || displayName(profilesById[a]).localeCompare(displayName(profilesById[b])))
    const out: { key: string; label: string; userIds: string[] }[] = []
    for (const l of locations) { const ids = byLoc.get(l.id); if (ids?.length) out.push({ key: l.id, label: l.name, userIds: sortU(ids) }) }
    const none = byLoc.get(null); if (none?.length) out.push({ key: 'none', label: 'No home salon', userIds: sortU(none) })
    return out
  }, [userIds, profilesById, locations, totalByUser])

  const bucketList = useMemo(() => {
    const out = locations.map((l) => ({ key: salonShort(l.name), label: l.name.split(' ')[0] }))
    out.push({ key: 'Remote', label: 'Remote' }, { key: 'Other', label: 'Other' })
    return out
  }, [locations])
  const byBucket = useMemo(() => {
    const m = new Map<string, number>()
    const keys = new Set(bucketList.map((b) => b.key))
    for (const r of rows) {
      const s = salonShort(r.location)
      const key = /remote/i.test(r.location ?? '') ? 'Remote' : keys.has(s) ? s : 'Other'
      m.set(key, (m.get(key) ?? 0) + r.hours)
    }
    return m
  }, [rows, bucketList])
  const grand = useMemo(() => [...byBucket.values()].reduce((a, b) => a + b, 0), [byBucket])

  const toggle = scheduledSupported ? (
    <div className="flex rounded-lg border border-white/10 p-0.5 text-xs">
      {([['scheduled', 'Scheduled'], ['actual', 'Actual']] as const).map(([k, lbl]) => (
        <button key={k} onClick={() => setMode(k)} className={cn('rounded-md px-2.5 py-1 font-medium', mode === k ? 'bg-gold-500 text-black' : 'text-slate-300 hover:text-white')}>{lbl}</button>
      ))}
    </div>
  ) : null

  if (actualLoading) return <p className="py-8 text-center text-sm text-slate-400">Loading {def.label.toLowerCase()} hours…</p>
  if (userIds.length === 0) return <p className="py-8 text-center text-sm text-slate-500">No {def.label.toLowerCase()} hours recorded for this week yet.</p>

  return (
    <div className="space-y-3">
      {scheduledSupported && (
        <div className="flex flex-wrap items-center gap-2">
          {toggle}
          {onRefresh && groupKey === 'stylists' && (
            <button onClick={onRefresh} disabled={refreshing} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-50">
              <Refresh className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} /> {refreshing ? 'Refreshing…' : 'Refresh now'}
            </button>
          )}
          <span className="text-xs text-slate-400">
            {groupKey === 'associates'
              ? (mode === 'scheduled' ? 'Typical week (inferred from ROP Time)' : 'Worked hours from ROP Time')
              : (mode === 'scheduled' ? 'Rostered hours from Boulevard' : 'Worked hours (ROP Time; booked hours for staff who don’t clock)')}
          </span>
        </div>
      )}
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
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{def.label} — {mode === 'scheduled' ? 'scheduled' : 'actual'} hours by location</p>
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
      <p className="text-[11px] text-slate-500">
        {groupKey === 'stylists'
          ? 'Scheduled = Boulevard rostered hours. Actual = worked hours from ROP Time, with Boulevard booked-appointment hours for staff who don’t clock. Dual-role people count in each tab only for the hours worked in that role.'
          : groupKey === 'associates'
          ? 'Scheduled = each person’s typical week, inferred from their last 8 weeks in ROP Time (Boulevard associate schedules aren’t reliable). Actual = worked hours from ROP Time.'
          : 'Live worked hours from ROP Time.'}
      </p>
    </div>
  )
}
