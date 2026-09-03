import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useUIStore } from '@/stores/uiStore'
import { Modal } from '@/components/ui/Modal'
import { displayName } from '@/lib/utils'
import { dateKey } from '@/lib/schedule'

// A concierge member requests time off. Optionally names who's covering, or flags
// that coverage needs to be found. A manager approves it.
export function TimeOffModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const me = useAuthStore((s) => s.user?.id)
  const profiles = useDirectoryStore((s) => s.profiles)
  const departments = useDirectoryStore((s) => s.departments)
  const toast = useUIStore((s) => s.toast)

  const today = dateKey(new Date())
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [reason, setReason] = useState('')
  const [coverMode, setCoverMode] = useState<'none' | 'named' | 'need'>('none')
  const [coverUser, setCoverUser] = useState('')
  const [saving, setSaving] = useState(false)

  const conciergeDeptId = useMemo(() => departments.find((d) => d.slug === 'concierge')?.id ?? null, [departments])
  const coworkers = useMemo(
    () => profiles.filter((p) => p.is_active && p.id !== me && (p.department_id === conciergeDeptId || p.role === 'concierge')),
    [profiles, me, conciergeDeptId],
  )

  const valid = start && end && end >= start && (coverMode !== 'named' || coverUser)

  async function submit() {
    if (!valid) return
    setSaving(true)
    try {
      const { error } = await (supabase.rpc as any)('sched_request_time_off', {
        p_start: start,
        p_end: end,
        p_reason: reason || null,
        p_cover_user: coverMode === 'named' ? coverUser : null,
        p_needs_coverage: coverMode === 'need',
      })
      if (error) throw error
      onSaved()
    } catch (e: any) {
      toast({ kind: 'error', title: 'Could not send request', body: e?.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} size="md" title="Request time off"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">Cancel</button>
          <button onClick={submit} disabled={!valid || saving} className="btn-primary px-4 py-1.5 text-sm">
            {saving ? 'Sending…' : 'Send request'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={start} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value) }} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Reason (optional)</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Vacation, appointment, personal…" />
        </div>

        <div>
          <label className="label">Coverage</label>
          <div className="space-y-1.5">
            {([
              ['none', 'No coverage needed'],
              ['named', 'I have someone to cover'],
              ['need', 'I need coverage found'],
            ] as const).map(([k, lbl]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-slate-200">
                <input type="radio" name="coverMode" checked={coverMode === k} onChange={() => setCoverMode(k)} />
                {lbl}
              </label>
            ))}
          </div>
          {coverMode === 'named' && (
            <select className="input mt-2" value={coverUser} onChange={(e) => setCoverUser(e.target.value)}>
              <option value="">Who's covering you?</option>
              {coworkers.map((p) => <option key={p.id} value={p.id}>{displayName(p)}</option>)}
            </select>
          )}
        </div>
      </div>
    </Modal>
  )
}
