import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useUIStore } from '@/stores/uiStore'
import { Modal } from '@/components/ui/Modal'
import { displayName } from '@/lib/utils'
import { DOW_LONG } from '@/lib/schedule'
import type { ScheduleDefaultShiftRow, ScheduleOverrideRow, ScheduleRole } from '@/types'

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '')

// Quick one-off edit for a single person on a single day. Writes a
// schedule_override so their normal week is left untouched — "reset to normal"
// removes the override.
export function DayEditModal({ userId, workDate, onClose, onSaved }: {
  userId: string; workDate: string; onClose: () => void; onSaved: () => void
}) {
  const profilesById = useDirectoryStore((s) => s.profilesById)
  const locations = useDirectoryStore((s) => s.locations)
  const me = useAuthStore((s) => s.user?.id)
  const toast = useUIStore((s) => s.toast)

  const p = profilesById[userId]
  const d = new Date(workDate + 'T12:00:00')

  const [loading, setLoading] = useState(true)
  const [hasOverride, setHasOverride] = useState(false)
  const [working, setWorking] = useState(true)
  const [role, setRole] = useState<ScheduleRole>('desk')
  const [locId, setLocId] = useState<string | null>(null)
  const [start, setStart] = useState('08:30')
  const [end, setEnd] = useState('17:00')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    ;(async () => {
      const [{ data: ov }, { data: defs }] = await Promise.all([
        supabase.from('schedule_overrides').select('*').eq('user_id', userId).eq('work_date', workDate).limit(1),
        supabase.from('schedule_default_shifts').select('*').eq('user_id', userId).eq('weekday', d.getDay()).eq('is_active', true).limit(1),
      ])
      const o = (ov as ScheduleOverrideRow[])?.[0]
      const def = (defs as ScheduleDefaultShiftRow[])?.[0]
      if (o) {
        setHasOverride(true)
        setWorking(!o.is_off)
        setRole((o.role ?? 'desk') as ScheduleRole)
        setLocId(o.location_id)
        setStart(hhmm(o.start_time) || '08:30')
        setEnd(hhmm(o.end_time) || '17:00')
        setNote(o.note ?? '')
      } else if (def) {
        setWorking(true)
        setRole(def.role)
        setLocId(def.location_id)
        setStart(hhmm(def.start_time))
        setEnd(hhmm(def.end_time))
        setNote('')
      } else {
        setWorking(false)
        setLocId(p?.location_id ?? null)
      }
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, workDate])

  async function save() {
    setSaving(true)
    try {
      await supabase.from('schedule_overrides').delete().eq('user_id', userId).eq('work_date', workDate)
      const { error } = await supabase.from('schedule_overrides').insert({
        user_id: userId, work_date: workDate, is_off: !working,
        role: working ? role : null,
        location_id: working && role === 'desk' ? locId : null,
        start_time: working ? start : null,
        end_time: working ? end : null,
        note: note || null,
        created_by: me,
      })
      if (error) throw error
      toast({ kind: 'success', title: 'Day updated' })
      onSaved()
    } catch (e: any) {
      toast({ kind: 'error', title: 'Could not save', body: e?.message })
    } finally {
      setSaving(false)
    }
  }

  async function resetNormal() {
    setSaving(true)
    try {
      await supabase.from('schedule_overrides').delete().eq('user_id', userId).eq('work_date', workDate)
      toast({ kind: 'success', title: 'Back to normal' })
      onSaved()
    } catch (e: any) {
      toast({ kind: 'error', title: 'Could not reset', body: e?.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} size="md"
      title={`${displayName(p)} · ${DOW_LONG[d.getDay()]} ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
      footer={
        <>
          {hasOverride && <button onClick={resetNormal} disabled={saving} className="btn-ghost mr-auto px-3 py-1.5 text-sm">Reset to normal</button>}
          <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary px-4 py-1.5 text-sm">{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex rounded-lg border border-white/10 p-0.5 text-sm">
            <button onClick={() => setWorking(true)} className={working ? 'flex-1 rounded-md bg-brand-500 px-3 py-1.5 font-medium text-white' : 'flex-1 rounded-md px-3 py-1.5 font-medium text-slate-300'}>Working</button>
            <button onClick={() => setWorking(false)} className={!working ? 'flex-1 rounded-md bg-brand-500 px-3 py-1.5 font-medium text-white' : 'flex-1 rounded-md px-3 py-1.5 font-medium text-slate-300'}>Off</button>
          </div>

          {working ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Role</label>
                  <select className="input" value={role} onChange={(e) => setRole(e.target.value as ScheduleRole)}>
                    <option value="desk">Desk</option>
                    <option value="phones">Phones</option>
                    <option value="offsite">Offsite</option>
                  </select>
                </div>
                {role === 'desk' && (
                  <div>
                    <label className="label">Salon</label>
                    <select className="input" value={locId ?? ''} onChange={(e) => setLocId(e.target.value || null)}>
                      <option value="">Salon…</option>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start</label>
                  <input type="time" step={900} className="input" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div>
                  <label className="label">End</label>
                  <input type="time" step={900} className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Note (optional)</label>
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. covering Bayfront, on phones till noon…" />
              </div>
            </>
          ) : (
            <div>
              <label className="label">Reason (optional)</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. sick, personal — shows on the schedule" />
              <p className="mt-1 text-[11px] text-slate-500">This just marks the day off on the grid. For a formal request that needs approval + coverage, use “Request time off.”</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
