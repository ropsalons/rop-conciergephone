import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useUIStore } from '@/stores/uiStore'
import { Modal } from '@/components/ui/Modal'
import { Plus, Trash } from '@/components/ui/Icons'
import { displayName } from '@/lib/utils'
import { DOW_SHORT } from '@/lib/schedule'
import { uuid } from '@/lib/utils'
import type { ScheduleDefaultShiftRow, ScheduleQualificationRow, ScheduleTargetRow, ScheduleRole } from '@/types'

type Draft = {
  key: string
  weekday: number
  role: ScheduleRole
  location_id: string | null
  start_time: string // HH:MM
  end_time: string
  also_phones: boolean
  note: string
}

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '')

// Admin editor for the concierge schedule: each person's normal week + who can
// cover what, plus phones/desk headcount targets. Saving replaces that person's
// template (clean upsert), matching how the seed was built.
export function ManageScheduleModal({ userIds, onClose, onSaved }: { userIds: string[]; onClose: () => void; onSaved: () => void }) {
  const profiles = useDirectoryStore((s) => s.profiles)
  const profilesById = useDirectoryStore((s) => s.profilesById)
  const departments = useDirectoryStore((s) => s.departments)
  const locations = useDirectoryStore((s) => s.locations)
  const toast = useUIStore((s) => s.toast)

  const conciergeDeptId = useMemo(() => departments.find((d) => d.slug === 'concierge')?.id ?? null, [departments])
  // People you can edit: everyone already scheduled + all active concierge.
  const people = useMemo(() => {
    const ids = new Set(userIds)
    profiles.forEach((p) => { if (p.is_active && (p.department_id === conciergeDeptId || p.role === 'concierge')) ids.add(p.id) })
    return [...ids].filter((id) => profilesById[id]).sort((a, b) => displayName(profilesById[a]).localeCompare(displayName(profilesById[b])))
  }, [userIds, profiles, profilesById, conciergeDeptId])

  const [tab, setTab] = useState<'week' | 'targets'>('week')
  const [uid, setUid] = useState(people[0] ?? '')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [quals, setQuals] = useState<{ role: 'desk' | 'phones'; location_id: string | null }[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [targets, setTargets] = useState<ScheduleTargetRow[]>([])

  useEffect(() => {
    if (!uid) return
    setLoading(true)
    ;(async () => {
      const [d, q] = await Promise.all([
        supabase.from('schedule_default_shifts').select('*').eq('user_id', uid).order('weekday'),
        supabase.from('schedule_qualifications').select('*').eq('user_id', uid),
      ])
      setDrafts(((d.data as ScheduleDefaultShiftRow[]) ?? []).map((s) => ({
        key: s.id, weekday: s.weekday, role: s.role, location_id: s.location_id,
        start_time: hhmm(s.start_time), end_time: hhmm(s.end_time), also_phones: s.also_phones, note: s.note ?? '',
      })))
      setQuals(((q.data as ScheduleQualificationRow[]) ?? []).map((x) => ({ role: x.role, location_id: x.location_id })))
      setLoading(false)
    })()
  }, [uid])

  const loadTargets = async () => {
    const { data } = await supabase.from('schedule_targets').select('*').order('scope')
    setTargets((data as ScheduleTargetRow[]) ?? [])
  }
  useEffect(() => { if (tab === 'targets') loadTargets() }, [tab])

  function addShift() {
    setDrafts((d) => [...d, { key: uuid(), weekday: 2, role: 'desk', location_id: profilesById[uid]?.location_id ?? null, start_time: '08:30', end_time: '17:00', also_phones: false, note: '' }])
  }
  function updateShift(key: string, patch: Partial<Draft>) {
    setDrafts((d) => d.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }
  function removeShift(key: string) {
    setDrafts((d) => d.filter((s) => s.key !== key))
  }

  const hasQual = (role: 'desk' | 'phones', locId: string | null) => quals.some((q) => q.role === role && q.location_id === locId)
  function toggleQual(role: 'desk' | 'phones', locId: string | null) {
    setQuals((qs) => (hasQual(role, locId) ? qs.filter((q) => !(q.role === role && q.location_id === locId)) : [...qs, { role, location_id: locId }]))
  }

  async function saveWeek() {
    if (!uid) return
    setSaving(true)
    try {
      await supabase.from('schedule_default_shifts').delete().eq('user_id', uid)
      if (drafts.length) {
        const rows = drafts.map((s) => ({
          user_id: uid, weekday: s.weekday, role: s.role,
          location_id: s.role === 'desk' ? s.location_id : null,
          start_time: s.start_time, end_time: s.end_time, also_phones: s.role === 'desk' ? s.also_phones : false,
          note: s.note || null, is_active: true,
        }))
        const { error } = await supabase.from('schedule_default_shifts').insert(rows)
        if (error) throw error
      }
      await supabase.from('schedule_qualifications').delete().eq('user_id', uid)
      if (quals.length) {
        const { error } = await supabase.from('schedule_qualifications').insert(quals.map((q) => ({ user_id: uid, role: q.role, location_id: q.location_id })))
        if (error) throw error
      }
      toast({ kind: 'success', title: 'Schedule saved', body: displayName(profilesById[uid]) })
      onSaved()
    } catch (e: any) {
      toast({ kind: 'error', title: 'Could not save', body: e?.message })
    } finally {
      setSaving(false)
    }
  }

  async function addTarget() {
    const { error } = await supabase.from('schedule_targets').insert({ scope: 'phones', weekday: null, location_id: null, start_time: '11:00', end_time: '14:00', min_count: 2, note: null })
    if (error) toast({ kind: 'error', title: 'Could not add', body: error.message })
    else loadTargets()
  }
  async function delTarget(id: string) {
    await supabase.from('schedule_targets').delete().eq('id', id)
    loadTargets()
  }
  async function patchTarget(id: string, patch: Partial<ScheduleTargetRow>) {
    setTargets((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    await supabase.from('schedule_targets').update(patch).eq('id', id)
  }

  return (
    <Modal open onClose={onClose} size="lg" title="Manage schedules"
      footer={
        tab === 'week' ? (
          <>
            <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">Close</button>
            <button onClick={saveWeek} disabled={saving || !uid} className="btn-primary px-4 py-1.5 text-sm">{saving ? 'Saving…' : 'Save schedule'}</button>
          </>
        ) : (
          <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">Close</button>
        )
      }
    >
      <div className="mb-3 flex rounded-lg border border-white/10 p-0.5 text-xs">
        {(['week', 'targets'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={t === tab ? 'flex-1 rounded-md bg-brand-500 px-3 py-1 font-medium text-white' : 'flex-1 rounded-md px-3 py-1 font-medium text-slate-300 hover:text-white'}>
            {t === 'week' ? "Normal week" : 'Coverage targets'}
          </button>
        ))}
      </div>

      {tab === 'week' ? (
        <div className="space-y-4">
          <div>
            <label className="label">Person</label>
            <select className="input" value={uid} onChange={(e) => setUid(e.target.value)}>
              {people.map((id) => <option key={id} value={id}>{displayName(profilesById[id])}</option>)}
            </select>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="label mb-0">Normal week</label>
                  <button onClick={addShift} className="inline-flex items-center gap-1 text-xs text-brand-300 hover:underline"><Plus className="h-3.5 w-3.5" /> Add shift</button>
                </div>
                {drafts.length === 0 ? (
                  <p className="text-xs text-slate-500">No shifts — this person shows as off all week. Add shifts for their normal days.</p>
                ) : (
                  <div className="space-y-2">
                    {drafts.slice().sort((a, b) => a.weekday - b.weekday).map((s) => (
                      <div key={s.key} className="rounded-lg border border-white/10 bg-black/20 p-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <select className="input w-auto py-1 text-xs" value={s.weekday} onChange={(e) => updateShift(s.key, { weekday: Number(e.target.value) })}>
                            {DOW_SHORT.map((d, i) => <option key={i} value={i}>{d}</option>)}
                          </select>
                          <select className="input w-auto py-1 text-xs" value={s.role} onChange={(e) => updateShift(s.key, { role: e.target.value as ScheduleRole })}>
                            <option value="desk">Desk</option>
                            <option value="phones">Phones</option>
                            <option value="offsite">Offsite</option>
                          </select>
                          {s.role === 'desk' && (
                            <select className="input w-auto py-1 text-xs" value={s.location_id ?? ''} onChange={(e) => updateShift(s.key, { location_id: e.target.value || null })}>
                              <option value="">Salon…</option>
                              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                          )}
                          <input type="time" step={900} className="input w-auto py-1 text-xs" value={s.start_time} onChange={(e) => updateShift(s.key, { start_time: e.target.value })} />
                          <span className="text-xs text-slate-500">–</span>
                          <input type="time" step={900} className="input w-auto py-1 text-xs" value={s.end_time} onChange={(e) => updateShift(s.key, { end_time: e.target.value })} />
                          <button onClick={() => removeShift(s.key)} className="ml-auto rounded p-1 text-slate-400 hover:bg-white/10 hover:text-rose-300" title="Remove"><Trash className="h-4 w-4" /></button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          {s.role === 'desk' && (
                            <label className="flex items-center gap-1.5 text-xs text-slate-300">
                              <input type="checkbox" checked={s.also_phones} onChange={(e) => updateShift(s.key, { also_phones: e.target.checked })} />
                              also on phones
                            </label>
                          )}
                          <input className="input flex-1 py-1 text-xs" placeholder="Note (optional)" value={s.note} onChange={(e) => updateShift(s.key, { note: e.target.value })} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="label">Can cover</label>
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-1.5 text-sm text-slate-200">
                    <input type="checkbox" checked={hasQual('phones', null)} onChange={() => toggleQual('phones', null)} /> Phones
                  </label>
                  {locations.map((l) => (
                    <label key={l.id} className="flex items-center gap-1.5 text-sm text-slate-200">
                      <input type="checkbox" checked={hasQual('desk', l.id)} onChange={() => toggleQual('desk', l.id)} /> {l.name} desk
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">Only people checked here show up as options to cover that slot.</p>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">How many people should be on each slot. The week view flags days that fall short.</p>
            <button onClick={addTarget} className="inline-flex items-center gap-1 text-xs text-brand-300 hover:underline"><Plus className="h-3.5 w-3.5" /> Add target</button>
          </div>
          {targets.length === 0 ? (
            <p className="text-xs text-slate-500">No targets yet.</p>
          ) : (
            <div className="space-y-2">
              {targets.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
                  <select className="input w-auto py-1 text-xs" value={t.scope} onChange={(e) => patchTarget(t.id, { scope: e.target.value as 'desk' | 'phones', location_id: e.target.value === 'phones' ? null : t.location_id })}>
                    <option value="phones">Phones</option>
                    <option value="desk">Desk</option>
                  </select>
                  {t.scope === 'desk' && (
                    <select className="input w-auto py-1 text-xs" value={t.location_id ?? ''} onChange={(e) => patchTarget(t.id, { location_id: e.target.value || null })}>
                      <option value="">Any salon</option>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  )}
                  <select className="input w-auto py-1 text-xs" value={t.weekday ?? ''} onChange={(e) => patchTarget(t.id, { weekday: e.target.value === '' ? null : Number(e.target.value) })}>
                    <option value="">Every day</option>
                    {DOW_SHORT.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                  <span className="text-slate-400">need</span>
                  <input type="number" min={1} className="input w-16 py-1 text-xs" value={t.min_count} onChange={(e) => patchTarget(t.id, { min_count: Math.max(1, Number(e.target.value)) })} />
                  <input type="time" step={900} className="input w-auto py-1 text-xs" value={hhmm(t.start_time)} onChange={(e) => patchTarget(t.id, { start_time: e.target.value || null })} />
                  <span className="text-slate-500">–</span>
                  <input type="time" step={900} className="input w-auto py-1 text-xs" value={hhmm(t.end_time)} onChange={(e) => patchTarget(t.id, { end_time: e.target.value || null })} />
                  <button onClick={() => delTarget(t.id)} className="ml-auto rounded p-1 text-slate-400 hover:bg-white/10 hover:text-rose-300"><Trash className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
