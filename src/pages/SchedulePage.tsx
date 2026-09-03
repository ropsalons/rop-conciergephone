import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useUIStore } from '@/stores/uiStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { FullPageLoader, EmptyState } from '@/components/ui/Feedback'
import { Avatar } from '@/components/ui/Avatar'
import { Clock, ChevronLeft, Plus, Smartphone, Settings } from '@/components/ui/Icons'
import { isAdmin, canManage } from '@/lib/constants'
import { cn, displayName } from '@/lib/utils'
import {
  addDays, dateKey, startOfWeekMonday, weekLabel, dayHeadLabel, fmtRange, dateInRange, hoursBetween,
} from '@/lib/schedule'
import type {
  ScheduleDefaultShiftRow, ScheduleQualificationRow, ScheduleTargetRow,
  TimeOffRequestRow, ScheduleCoverageRow, ScheduleOverrideRow, ScheduleRole, LocationRow,
} from '@/types'
import { TimeOffModal } from '@/components/schedule/TimeOffModal'
import { ManageScheduleModal } from '@/components/schedule/ManageScheduleModal'
import { DayEditModal } from '@/components/schedule/DayEditModal'

type Entry =
  | { kind: 'shift'; time: string; hours: number; role: ScheduleRole; locId: string | null; alsoPhones: boolean; note?: string | null }
  | { kind: 'offsite'; time: string; hours: number; note?: string | null }
  | { kind: 'off'; reason?: string | null; coverNote?: 'covered' | 'needs coverage' }
  | { kind: 'covering'; time: string; hours: number; role: 'desk' | 'phones'; locId: string | null; forName: string; note?: string | null }

const PHONES = 'phones'
const OFFSITE = 'offsite'

function salonShort(name?: string): string {
  if (!name) return ''
  if (/bayfront/i.test(name)) return 'Bay'
  if (/village/i.test(name)) return 'Vill'
  if (/promenade/i.test(name)) return 'Prom'
  return name.split(' ')[0]
}
const fmtH = (n: number) => `${Math.round(n * 10) / 10}h`

// Which "location bucket" a scheduled entry counts toward. A desk shift (even if
// also on phones) counts toward its salon; a phones shift toward Phones.
function schedBucket(e: Entry): string | null {
  if (e.kind === 'shift') return e.role === 'phones' ? PHONES : (e.locId ?? OFFSITE)
  if (e.kind === 'covering') return e.role === 'phones' ? PHONES : (e.locId ?? OFFSITE)
  if (e.kind === 'offsite') return OFFSITE
  return null
}
// Map a ROP Time location string ('Bayfront'/'Village'/'Promenade'/'Remote') to a bucket key.
function actualBucket(loc: string | null, locations: LocationRow[]): string {
  if (!loc) return OFFSITE
  if (/remote/i.test(loc)) return PHONES
  const m = locations.find((l) => salonShort(l.name) === salonShort(loc))
  return m ? m.id : OFFSITE
}

export function SchedulePage() {
  const access = useAuthStore((s) => s.profile?.access_level)
  const me = useAuthStore((s) => s.user?.id)
  const myProfile = useAuthStore((s) => s.profile)
  const profilesById = useDirectoryStore((s) => s.profilesById)
  const profiles = useDirectoryStore((s) => s.profiles)
  const locations = useDirectoryStore((s) => s.locations)
  const departments = useDirectoryStore((s) => s.departments)
  const toast = useUIStore((s) => s.toast)

  const manager = isAdmin(access) // owner/admin: approve, manage
  const canSeeActual = canManage(access) // leader+ can view actual hours
  const conciergeDeptId = useMemo(() => departments.find((d) => d.slug === 'concierge')?.id ?? null, [departments])
  const canView =
    manager ||
    canManage(access) ||
    (!!conciergeDeptId && myProfile?.department_id === conciergeDeptId) ||
    myProfile?.role === 'concierge' ||
    myProfile?.secondary_role === 'concierge'

  const [monday, setMonday] = useState(() => startOfWeekMonday(new Date()))
  const [defaults, setDefaults] = useState<ScheduleDefaultShiftRow[]>([])
  const [quals, setQuals] = useState<ScheduleQualificationRow[]>([])
  const [targets, setTargets] = useState<ScheduleTargetRow[]>([])
  const [timeOff, setTimeOff] = useState<TimeOffRequestRow[]>([])
  const [coverage, setCoverage] = useState<ScheduleCoverageRow[]>([])
  const [overrides, setOverrides] = useState<ScheduleOverrideRow[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'grid' | 'day'>('grid')
  const [showActual, setShowActual] = useState(false)
  const [actual, setActual] = useState<{ user_id: string; work_date: string; location: string | null; hours: number }[]>([])
  const [actualLoading, setActualLoading] = useState(false)
  const [showRequest, setShowRequest] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [editCell, setEditCell] = useState<{ uid: string; dk: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [assigning, setAssigning] = useState<string | null>(null)

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday])
  const weekStartKey = dateKey(monday)
  const weekEndKey = dateKey(addDays(monday, 6))

  const load = useCallback(async () => {
    const [d, q, t] = await Promise.all([
      supabase.from('schedule_default_shifts').select('*').eq('is_active', true),
      supabase.from('schedule_qualifications').select('*'),
      supabase.from('schedule_targets').select('*'),
    ])
    setDefaults((d.data as ScheduleDefaultShiftRow[]) ?? [])
    setQuals((q.data as ScheduleQualificationRow[]) ?? [])
    setTargets((t.data as ScheduleTargetRow[]) ?? [])
    const [to, cov, ov] = await Promise.all([
      supabase.from('time_off_requests').select('*').lte('start_date', weekEndKey).gte('end_date', weekStartKey),
      supabase.from('schedule_coverage').select('*').gte('work_date', weekStartKey).lte('work_date', weekEndKey),
      supabase.from('schedule_overrides').select('*').gte('work_date', weekStartKey).lte('work_date', weekEndKey),
    ])
    setTimeOff((to.data as TimeOffRequestRow[]) ?? [])
    setCoverage((cov.data as ScheduleCoverageRow[]) ?? [])
    setOverrides((ov.data as ScheduleOverrideRow[]) ?? [])
    setLoading(false)
  }, [weekStartKey, weekEndKey])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // Pull actual hours from ROP Time when the toggle is on.
  useEffect(() => {
    if (!showActual || !canSeeActual) return
    let cancelled = false
    setActualLoading(true)
    ;(async () => {
      const { data, error } = await (supabase.rpc as any)('sched_actual_hours', { p_start: weekStartKey, p_end: weekEndKey })
      if (cancelled) return
      if (error) toast({ kind: 'error', title: 'Could not load actual hours', body: error.message })
      setActual(error ? [] : ((data as any[]) ?? []))
      setActualLoading(false)
    })()
    return () => { cancelled = true }
  }, [showActual, canSeeActual, weekStartKey, weekEndKey, toast])

  const scheduleUserIds = useMemo(() => {
    const s = new Set<string>()
    defaults.forEach((d) => s.add(d.user_id))
    coverage.forEach((c) => { if (c.covering_user_id) s.add(c.covering_user_id); if (c.covered_user_id) s.add(c.covered_user_id) })
    profiles.forEach((p) => { if (p.is_active && conciergeDeptId && p.department_id === conciergeDeptId) s.add(p.id) })
    return [...s].filter((id) => profilesById[id])
  }, [defaults, coverage, profiles, conciergeDeptId, profilesById])

  const groups = useMemo(() => {
    const byLoc = new Map<string | null, string[]>()
    for (const uid of scheduleUserIds) {
      const loc = profilesById[uid]?.location_id ?? null
      const arr = byLoc.get(loc) ?? []
      arr.push(uid)
      byLoc.set(loc, arr)
    }
    const sortUsers = (ids: string[]) => ids.sort((a, b) => displayName(profilesById[a]).localeCompare(displayName(profilesById[b])))
    const out: { key: string; label: string; userIds: string[] }[] = []
    for (const loc of locations) {
      const ids = byLoc.get(loc.id)
      if (ids?.length) out.push({ key: loc.id, label: loc.name, userIds: sortUsers(ids) })
    }
    const remote = byLoc.get(null)
    if (remote?.length) out.push({ key: 'remote', label: 'Remote phones', userIds: sortUsers(remote) })
    return out
  }, [scheduleUserIds, profilesById, locations])

  const locName = useCallback((id?: string | null) => locations.find((l) => l.id === id)?.name, [locations])

  const { cells, pendingCells } = useMemo(() => {
    const m = new Map<string, Entry[]>()
    const pend = new Set<string>()
    const push = (uid: string, dk: string, e: Entry) => {
      const k = `${uid}|${dk}`
      const a = m.get(k) ?? []
      a.push(e)
      m.set(k, a)
    }
    for (const d of days) {
      const dk = dateKey(d)
      const wd = d.getDay()
      for (const uid of scheduleUserIds) {
        const off = timeOff.find((t) => t.user_id === uid && t.status === 'approved' && dateInRange(dk, t.start_date, t.end_date))
        const pending = timeOff.find((t) => t.user_id === uid && t.status === 'pending' && dateInRange(dk, t.start_date, t.end_date))
        if (pending) pend.add(`${uid}|${dk}`)
        const ovs = overrides.filter((o) => o.user_id === uid && o.work_date === dk)
        const ovOff = ovs.find((o) => o.is_off)
        if (off) {
          const cov = coverage.filter((c) => c.covered_user_id === uid && c.work_date === dk && c.status !== 'cancelled')
          const coverNote = cov.length ? (cov.every((c) => c.covering_user_id) ? 'covered' : 'needs coverage') : undefined
          push(uid, dk, { kind: 'off', reason: off.reason, coverNote })
          continue
        }
        if (ovOff) {
          push(uid, dk, { kind: 'off', reason: ovOff.note })
          continue
        }
        const ovShift = ovs.find((o) => !o.is_off)
        if (ovShift) {
          const h = hoursBetween(ovShift.start_time, ovShift.end_time)
          if (ovShift.role === 'offsite') push(uid, dk, { kind: 'offsite', time: fmtRange(ovShift.start_time, ovShift.end_time), hours: h, note: ovShift.note })
          else push(uid, dk, { kind: 'shift', time: fmtRange(ovShift.start_time, ovShift.end_time), hours: h, role: (ovShift.role ?? 'desk') as ScheduleRole, locId: ovShift.location_id, alsoPhones: ovShift.also_phones, note: ovShift.note })
        } else {
          const ds = defaults.filter((x) => x.user_id === uid && x.weekday === wd)
          for (const s of ds) {
            const h = hoursBetween(s.start_time, s.end_time)
            if (s.role === 'offsite') push(uid, dk, { kind: 'offsite', time: fmtRange(s.start_time, s.end_time), hours: h, note: s.note })
            else push(uid, dk, { kind: 'shift', time: fmtRange(s.start_time, s.end_time), hours: h, role: s.role, locId: s.location_id, alsoPhones: s.also_phones, note: s.note })
          }
        }
      }
    }
    for (const c of coverage) {
      if (!c.covering_user_id || c.status === 'cancelled') continue
      const forName = c.covered_user_id ? displayName(profilesById[c.covered_user_id]) : 'open shift'
      push(c.covering_user_id, c.work_date, { kind: 'covering', time: fmtRange(c.start_time, c.end_time), hours: hoursBetween(c.start_time, c.end_time), role: c.role, locId: c.location_id, forName, note: c.note })
    }
    return { cells: m, pendingCells: pend }
  }, [days, scheduleUserIds, timeOff, overrides, coverage, defaults, profilesById])

  // ── Hours totals (scheduled from the grid; actual from ROP Time) ──────────────
  const schedByUser = useMemo(() => {
    const m = new Map<string, number>()
    for (const [k, entries] of cells) {
      const uid = k.split('|')[0]
      for (const e of entries) if ('hours' in e) m.set(uid, (m.get(uid) ?? 0) + e.hours)
    }
    return m
  }, [cells])
  const schedByBucket = useMemo(() => {
    const m = new Map<string, number>()
    for (const entries of cells.values()) {
      for (const e of entries) {
        const b = schedBucket(e)
        if (b && 'hours' in e) m.set(b, (m.get(b) ?? 0) + e.hours)
      }
    }
    return m
  }, [cells])
  const actualByCell = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of actual) m.set(`${r.user_id}|${r.work_date}`, (m.get(`${r.user_id}|${r.work_date}`) ?? 0) + Number(r.hours))
    return m
  }, [actual])
  const actualByUser = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of actual) m.set(r.user_id, (m.get(r.user_id) ?? 0) + Number(r.hours))
    return m
  }, [actual])
  const actualByBucket = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of actual) {
      const b = actualBucket(r.location, locations)
      m.set(b, (m.get(b) ?? 0) + Number(r.hours))
    }
    return m
  }, [actual, locations])

  const bucketList = useMemo(() => {
    const out = locations.map((l) => ({ key: l.id, label: l.name.split(' ')[0] }))
    out.push({ key: PHONES, label: 'Phones' }, { key: OFFSITE, label: 'Offsite' })
    return out
  }, [locations])

  const totalForUser = useCallback((uid: string) => (showActual ? actualByUser.get(uid) : schedByUser.get(uid)) ?? 0, [showActual, actualByUser, schedByUser])
  const totalForBucket = useCallback((b: string) => (showActual ? actualByBucket.get(b) : schedByBucket.get(b)) ?? 0, [showActual, actualByBucket, schedByBucket])
  const grandTotal = useMemo(() => bucketList.reduce((s, b) => s + totalForBucket(b.key), 0), [bucketList, totalForBucket])

  const pendingRequests = useMemo(() => timeOff.filter((t) => t.status === 'pending'), [timeOff])
  const openCoverage = useMemo(() => coverage.filter((c) => c.status === 'open').sort((a, b) => a.work_date.localeCompare(b.work_date)), [coverage])

  const eligible = useCallback(
    (uid: string, role: 'desk' | 'phones', locId: string | null) =>
      quals.some((q) => q.user_id === uid && q.role === role && (q.location_id === null || locId === null || q.location_id === locId)),
    [quals],
  )
  const phonesTargetFor = useCallback(
    (wd: number) => targets.filter((t) => t.scope === 'phones' && (t.weekday === null || t.weekday === wd)).reduce((mx, t) => Math.max(mx, t.min_count), 0),
    [targets],
  )
  const phonesOnDate = useCallback(
    (dk: string) => {
      let n = 0
      for (const uid of scheduleUserIds) {
        const es = cells.get(`${uid}|${dk}`) ?? []
        if (es.some((e) => (e.kind === 'shift' && (e.role === 'phones' || e.alsoPhones)) || (e.kind === 'covering' && e.role === 'phones'))) n++
      }
      return n
    },
    [cells, scheduleUserIds],
  )

  async function rpc(name: 'sched_decide_time_off' | 'sched_claim_coverage' | 'sched_assign_coverage', args: Record<string, unknown>, ok: string) {
    setBusy(JSON.stringify(args))
    try {
      const { error } = await (supabase.rpc as any)(name, args)
      if (error) throw error
      toast({ kind: 'success', title: ok })
      await load()
    } catch (e: any) {
      toast({ kind: 'error', title: 'Something went wrong', body: e?.message })
    } finally {
      setBusy(null)
      setAssigning(null)
    }
  }

  if (!canView) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader backTo="/" backAlways icon={<Clock className="h-5 w-5" />} title="Schedule" />
        <div className="p-6">
          <EmptyState icon={<Clock className="h-8 w-8" />} title="Not enabled for your team yet"
            body="The schedule is currently set up for the Concierge team. Ask an admin to add your department." />
        </div>
      </div>
    )
  }

  const todayKey = dateKey(new Date())

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        backTo="/"
        backAlways
        icon={<Clock className="h-5 w-5" />}
        title="Schedule"
        subtitle="Concierge — who's on & off"
        actions={
          <div className="flex items-center gap-2">
            {canSeeActual && (
              <div className="flex rounded-lg border border-white/10 p-0.5 text-xs">
                {([['sched', 'Scheduled'], ['actual', 'Actual']] as const).map(([k, lbl]) => (
                  <button key={k} onClick={() => setShowActual(k === 'actual')}
                    className={cn('rounded-md px-2.5 py-1 font-medium', (showActual ? 'actual' : 'sched') === k ? 'bg-gold-500 text-black' : 'text-slate-300 hover:text-white')}>
                    {lbl}
                  </button>
                ))}
              </div>
            )}
            <div className="flex rounded-lg border border-white/10 p-0.5 text-xs">
              {(['grid', 'day'] as const).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={cn('rounded-md px-3 py-1 font-medium', view === v ? 'bg-brand-500 text-white' : 'text-slate-300 hover:text-white')}>
                  {v === 'grid' ? 'Week' : 'By day'}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <button onClick={() => setMonday(addDays(monday, -7))} aria-label="Previous week" className="rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/10">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="min-w-[8.5rem] text-center text-sm font-semibold text-white">{weekLabel(monday)}</div>
              <button onClick={() => setMonday(addDays(monday, 7))} aria-label="Next week" className="rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/10">
                <ChevronLeft className="h-4 w-4 rotate-180" />
              </button>
              <button onClick={() => setMonday(startOfWeekMonday(new Date()))} className="ml-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10">
                Today
              </button>
              {showActual && <span className="ml-1 text-xs text-gold-300">{actualLoading ? 'Loading actual hours…' : 'Actual hours from ROP Time'}</span>}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setShowRequest(true)} className="btn-primary px-3 py-1.5 text-sm">
                <span className="inline-flex items-center gap-1"><Plus className="h-4 w-4" /> Request time off</span>
              </button>
              {manager && (
                <button onClick={() => setManageOpen(true)} className="btn-ghost px-3 py-1.5 text-sm" title="Manage schedules">
                  <span className="inline-flex items-center gap-1"><Settings className="h-4 w-4" /> Manage</span>
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <FullPageLoader label="Loading schedule…" />
          ) : (
            <>
              <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 px-3 py-2 text-xs text-slate-300">
                <span className="font-semibold text-brand-200">Need a day off?</span> Tap{' '}
                <span className="font-semibold text-white">Request time off</span> at the top of this page — pick your dates, say if you need someone to cover, and send. A manager approves it and everyone involved is notified.
              </div>

              {manager && pendingRequests.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-900/10 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-300">Needs approval</p>
                  <div className="space-y-2">
                    {pendingRequests.map((r) => {
                      const p = profilesById[r.user_id]
                      return (
                        <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-black/20 px-3 py-2">
                          <Avatar profile={p} size="xs" />
                          <span className="text-sm font-medium text-white">{displayName(p)}</span>
                          <span className="text-xs text-slate-300">
                            {r.start_date === r.end_date ? r.start_date : `${r.start_date} → ${r.end_date}`}
                            {r.needs_coverage ? ' · needs coverage' : r.cover_user_id ? ` · cover: ${displayName(profilesById[r.cover_user_id])}` : ''}
                            {r.reason ? ` · ${r.reason}` : ''}
                          </span>
                          <div className="ml-auto flex gap-1">
                            <button disabled={!!busy} onClick={() => rpc('sched_decide_time_off', { p_id: r.id, p_approve: true }, 'Approved')}
                              className="rounded-md bg-emerald-600/80 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-600">Approve</button>
                            <button disabled={!!busy} onClick={() => rpc('sched_decide_time_off', { p_id: r.id, p_approve: false }, 'Denied')}
                              className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-white/20">Deny</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {openCoverage.length > 0 && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-900/10 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-300">Needs coverage</p>
                  <div className="space-y-2">
                    {openCoverage.map((c) => {
                      const canClaim = manager || (me && eligible(me, c.role, c.location_id))
                      const eligiblePeople = scheduleUserIds.filter((uid) => uid !== c.covered_user_id && eligible(uid, c.role, c.location_id))
                      return (
                        <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-black/20 px-3 py-2">
                          <span className="text-sm font-medium text-white">
                            {new Date(c.work_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <span className="text-xs text-slate-300">
                            {c.role === 'phones' ? 'Remote phones' : salonShort(locName(c.location_id)) + ' desk'}
                            {c.start_time ? ` · ${fmtRange(c.start_time, c.end_time)}` : ''}
                            {c.covered_user_id ? ` · for ${displayName(profilesById[c.covered_user_id])}` : ''}
                            {c.note ? ` · ${c.note}` : ''}
                          </span>
                          <div className="ml-auto flex items-center gap-1">
                            {canClaim && (
                              <button disabled={!!busy} onClick={() => rpc('sched_claim_coverage', { p_id: c.id }, 'You got it — thanks!')}
                                className="rounded-md bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-400">
                                {manager ? 'Take it' : 'I can cover'}
                              </button>
                            )}
                            {manager && (
                              assigning === c.id ? (
                                <select autoFocus defaultValue="" onChange={(e) => e.target.value && rpc('sched_assign_coverage', { p_id: c.id, p_user: e.target.value }, 'Assigned')}
                                  className="input py-1 text-xs">
                                  <option value="" disabled>Assign to…</option>
                                  {eligiblePeople.map((uid) => <option key={uid} value={uid}>{displayName(profilesById[uid])}</option>)}
                                </select>
                              ) : (
                                <button onClick={() => setAssigning(c.id)} className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-white/20">Assign…</button>
                              )
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {groups.length === 0 ? (
                <EmptyState icon={<Clock className="h-8 w-8" />} title="No schedules yet"
                  body={manager ? 'Use Manage to set up each person’s normal week.' : 'Nothing scheduled yet.'} />
              ) : view === 'grid' ? (
                <>
                  <ScheduleGrid days={days} groups={groups} cells={cells} pendingCells={pendingCells} profilesById={profilesById}
                    locName={locName} todayKey={todayKey} phonesOnDate={phonesOnDate} phonesTargetFor={phonesTargetFor}
                    showActual={showActual} actualByCell={actualByCell} totalForUser={totalForUser}
                    onEditCell={manager ? (uid, dk) => setEditCell({ uid, dk }) : undefined} />
                  <TotalsStrip bucketList={bucketList} totalForBucket={totalForBucket} grandTotal={grandTotal} showActual={showActual} />
                </>
              ) : (
                <ScheduleDayView days={days} groups={groups} cells={cells} profilesById={profilesById} locName={locName}
                  todayKey={todayKey} phonesOnDate={phonesOnDate} phonesTargetFor={phonesTargetFor} showActual={showActual} actualByCell={actualByCell} />
              )}

              <p className="text-[11px] leading-relaxed text-slate-500">
                Bold green = someone covering a shift. Amber dot = pending time-off request. Times are Eastern.
                {canSeeActual ? ' Toggle Scheduled/Actual up top to compare planned vs worked hours (actual pulled live from ROP Time). Totals: a desk shift counts toward its salon even if they’re also on phones; phones-only time counts toward Phones.' : ''}
                {manager ? ' Managers: tap any day in the grid to change it just for that day, or use Manage for normal weeks, cover qualifications, and phones/desk targets.' : ' Request time off with the button above — a manager approves it.'}
              </p>
            </>
          )}
        </div>
      </div>

      {showRequest && (
        <TimeOffModal onClose={() => setShowRequest(false)} onSaved={() => { setShowRequest(false); toast({ kind: 'success', title: 'Time-off request sent', body: 'A manager will review it.' }); load() }} />
      )}
      {manageOpen && (
        <ManageScheduleModal userIds={scheduleUserIds} onClose={() => setManageOpen(false)} onSaved={() => load()} />
      )}
      {editCell && (
        <DayEditModal userId={editCell.uid} workDate={editCell.dk} onClose={() => setEditCell(null)} onSaved={() => { setEditCell(null); load() }} />
      )}
    </div>
  )
}

// ── Location totals strip ─────────────────────────────────────────────────────
function TotalsStrip({ bucketList, totalForBucket, grandTotal, showActual }: {
  bucketList: { key: string; label: string }[]; totalForBucket: (b: string) => number; grandTotal: number; showActual: boolean
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-brand-950/40 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {showActual ? 'Actual hours by location (worked)' : 'Scheduled hours by location'}
      </p>
      <div className="flex flex-wrap gap-2">
        {bucketList.map((b) => (
          <div key={b.key} className="rounded-lg bg-white/5 px-3 py-1.5 text-sm">
            <span className="text-slate-300">{b.label}</span>{' '}
            <span className={cn('font-semibold', showActual ? 'text-gold-200' : 'text-white')}>{fmtH(totalForBucket(b.key))}</span>
          </div>
        ))}
        <div className="ml-auto rounded-lg bg-white/10 px-3 py-1.5 text-sm">
          <span className="text-slate-300">Total</span>{' '}
          <span className={cn('font-bold', showActual ? 'text-gold-200' : 'text-white')}>{fmtH(grandTotal)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Cell rendering ────────────────────────────────────────────────────────────
function CellEntries({ entries, locName, homeLocId }: { entries: Entry[]; locName: (id?: string | null) => string | undefined; homeLocId: string | null }) {
  if (!entries.length) return <span className="text-slate-600">·</span>
  return (
    <div className="space-y-1">
      {entries.map((e, i) => {
        if (e.kind === 'off') {
          return (
            <div key={i} className="text-[11px] leading-tight">
              <span className="text-slate-500">Off</span>
              {e.reason ? <span className="text-slate-600"> · {e.reason}</span> : null}
              {e.coverNote ? <div className={e.coverNote === 'covered' ? 'text-emerald-400/80' : 'text-rose-300'}>{e.coverNote}</div> : null}
            </div>
          )
        }
        if (e.kind === 'offsite') {
          return (
            <div key={i} className="text-[11px] leading-tight text-sky-300">
              <span className="font-medium">Offsite</span> <span className="text-sky-400/70">{e.time}</span>
              {e.note ? <div className="text-slate-500">{e.note}</div> : null}
            </div>
          )
        }
        if (e.kind === 'covering') {
          return (
            <div key={i} className="rounded bg-emerald-500/10 px-1 py-0.5 text-[11px] leading-tight">
              <div className="font-semibold text-emerald-300">Covering {e.forName}</div>
              <div className="text-emerald-200/80">{e.time}{e.role === 'phones' ? ' · phones' : e.locId ? ' · ' + salonShort(locName(e.locId)) : ''}</div>
              {e.note ? <div className="text-emerald-200/60">{e.note}</div> : null}
            </div>
          )
        }
        const away = e.locId && e.locId !== homeLocId
        return (
          <div key={i} className="text-[11px] leading-tight text-slate-100">
            <span className="font-medium">{e.time}</span>
            {e.role === 'phones' ? <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-brand-500/15 px-1 text-[10px] text-brand-200"><Smartphone className="h-3 w-3" /> Remote</span> : null}
            {e.alsoPhones ? <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-brand-500/15 px-1 text-[10px] text-brand-200"><Smartphone className="h-3 w-3" /> phones</span> : null}
            {away ? <span className="ml-1 rounded bg-white/10 px-1 text-[10px] text-slate-300">{salonShort(locName(e.locId))}</span> : null}
            {e.note && /verify|est\./i.test(e.note) ? <span className="ml-1 text-amber-400/70" title={e.note}>⚠</span> : null}
          </div>
        )
      })}
    </div>
  )
}

// Actual worked hours for a single cell.
function ActualCell({ hours, wasScheduled }: { hours: number | undefined; wasScheduled: boolean }) {
  if (hours && hours > 0) return <span className="text-[12px] font-semibold text-gold-200">{fmtH(hours)}</span>
  if (wasScheduled) return <span className="text-[11px] text-rose-300/70" title="Scheduled but no hours recorded">0</span>
  return <span className="text-slate-600">·</span>
}

function ScheduleGrid({ days, groups, cells, pendingCells, profilesById, locName, todayKey, phonesOnDate, phonesTargetFor, showActual, actualByCell, totalForUser, onEditCell }: {
  days: Date[]; groups: { key: string; label: string; userIds: string[] }[]; cells: Map<string, Entry[]>; pendingCells: Set<string>
  profilesById: Record<string, any>; locName: (id?: string | null) => string | undefined; todayKey: string
  phonesOnDate: (dk: string) => number; phonesTargetFor: (wd: number) => number
  showActual: boolean; actualByCell: Map<string, number>; totalForUser: (uid: string) => number
  onEditCell?: (uid: string, dk: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/5 text-xs text-slate-400">
            <th className="sticky left-0 z-10 bg-brand-950 px-3 py-2 text-left font-medium">Person</th>
            {days.map((d) => {
              const dk = dateKey(d)
              const tgt = phonesTargetFor(d.getDay())
              const on = phonesOnDate(dk)
              const short = tgt > 0 && on < tgt
              return (
                <th key={dk} className={cn('min-w-[5.5rem] px-2 py-2 text-center font-medium', dk === todayKey && 'bg-brand-500/10 text-brand-200')}>
                  <div>{dayHeadLabel(d)}</div>
                  <div className={cn('mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-normal', short ? 'text-rose-300' : 'text-slate-500')} title="People on phones vs target">
                    <Smartphone className="h-3 w-3" />{on}{tgt > 0 ? `/${tgt}` : ''}
                  </div>
                </th>
              )
            })}
            <th className="min-w-[4rem] px-2 py-2 text-right font-medium">{showActual ? 'Actual' : 'Sched'}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g.key} group={g} days={days} cells={cells} pendingCells={pendingCells} profilesById={profilesById}
              locName={locName} todayKey={todayKey} showActual={showActual} actualByCell={actualByCell} totalForUser={totalForUser} onEditCell={onEditCell} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupRows({ group, days, cells, pendingCells, profilesById, locName, todayKey, showActual, actualByCell, totalForUser, onEditCell }: {
  group: { key: string; label: string; userIds: string[] }; days: Date[]; cells: Map<string, Entry[]>; pendingCells: Set<string>
  profilesById: Record<string, any>; locName: (id?: string | null) => string | undefined; todayKey: string
  showActual: boolean; actualByCell: Map<string, number>; totalForUser: (uid: string) => number
  onEditCell?: (uid: string, dk: string) => void
}) {
  return (
    <>
      <tr>
        <td colSpan={days.length + 2} className="sticky left-0 bg-brand-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {group.label}
        </td>
      </tr>
      {group.userIds.map((uid) => {
        const p = profilesById[uid]
        const homeLoc = p?.location_id ?? null
        return (
          <tr key={uid} className="border-b border-white/5 align-top">
            <td className="sticky left-0 z-10 whitespace-nowrap bg-brand-950 px-3 py-2">
              <div className="flex items-center gap-2">
                <Avatar profile={p} size="xs" />
                <span className="text-sm text-slate-100">{displayName(p)}</span>
              </div>
            </td>
            {days.map((d) => {
              const dk = dateKey(d)
              const key = `${uid}|${dk}`
              const entries = cells.get(key) ?? []
              const pending = pendingCells.has(key)
              const wasScheduled = entries.some((e) => e.kind !== 'off')
              return (
                <td key={dk}
                  onClick={onEditCell ? () => onEditCell(uid, dk) : undefined}
                  className={cn('relative px-2 py-2', dk === todayKey && 'bg-brand-500/5', onEditCell && 'cursor-pointer hover:bg-white/5')}
                  title={onEditCell ? 'Tap to edit this day' : undefined}>
                  {pending && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400" title="Pending time-off request" />}
                  {showActual ? <ActualCell hours={actualByCell.get(key)} wasScheduled={wasScheduled} /> : <CellEntries entries={entries} locName={locName} homeLocId={homeLoc} />}
                </td>
              )
            })}
            <td className="px-2 py-2 text-right">
              <span className={cn('text-sm font-semibold', showActual ? 'text-gold-200' : 'text-white')}>{fmtH(totalForUser(uid))}</span>
            </td>
          </tr>
        )
      })}
    </>
  )
}

// ── By-day view ───────────────────────────────────────────────────────────────
function ScheduleDayView({ days, groups, cells, profilesById, locName, todayKey, phonesOnDate, phonesTargetFor, showActual, actualByCell }: {
  days: Date[]; groups: { key: string; label: string; userIds: string[] }[]; cells: Map<string, Entry[]>
  profilesById: Record<string, any>; locName: (id?: string | null) => string | undefined; todayKey: string
  phonesOnDate: (dk: string) => number; phonesTargetFor: (wd: number) => number
  showActual: boolean; actualByCell: Map<string, number>
}) {
  const allUserIds = groups.flatMap((g) => g.userIds)
  return (
    <div className="space-y-3">
      {days.map((d) => {
        const dk = dateKey(d)
        const tgt = phonesTargetFor(d.getDay())
        const on = phonesOnDate(dk)
        const short = tgt > 0 && on < tgt
        const working = allUserIds
          .map((uid) => ({ uid, entries: (cells.get(`${uid}|${dk}`) ?? []).filter((e) => e.kind !== 'off') }))
          .filter((r) => r.entries.length)
        const off = allUserIds.filter((uid) => (cells.get(`${uid}|${dk}`) ?? []).some((e) => e.kind === 'off'))
        return (
          <div key={dk} className={cn('rounded-xl border border-white/10 bg-brand-950/40 p-3', dk === todayKey && 'ring-1 ring-brand-500/40')}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                {d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                {dk === todayKey ? <span className="ml-2 rounded bg-brand-500/20 px-1.5 py-0.5 text-[10px] text-brand-200">Today</span> : null}
              </h3>
              <span className={cn('inline-flex items-center gap-1 text-xs', short ? 'text-rose-300' : 'text-slate-400')}>
                <Smartphone className="h-3.5 w-3.5" /> {on}{tgt > 0 ? `/${tgt}` : ''} on phones
              </span>
            </div>
            {working.length === 0 ? (
              <p className="text-xs text-slate-500">No one scheduled.</p>
            ) : (
              <div className="space-y-1.5">
                {working.map(({ uid, entries }) => {
                  const p = profilesById[uid]
                  const act = actualByCell.get(`${uid}|${dk}`)
                  return (
                    <div key={uid} className="flex items-start gap-2">
                      <Avatar profile={p} size="xs" />
                      <span className="w-28 shrink-0 truncate text-sm text-slate-100">{displayName(p)}</span>
                      <div className="min-w-0 flex-1"><CellEntries entries={entries} locName={locName} homeLocId={p?.location_id ?? null} /></div>
                      {showActual && <span className="shrink-0 text-xs font-semibold text-gold-200">{act ? fmtH(act) : '—'}</span>}
                    </div>
                  )
                })}
              </div>
            )}
            {off.length > 0 && (
              <p className="mt-2 border-t border-white/5 pt-2 text-[11px] text-slate-500">
                Off: {off.map((uid) => displayName(profilesById[uid])).join(', ')}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
