import { useState } from 'react'
import { format, isToday, isTomorrow } from 'date-fns'
import { Modal } from '@/components/ui/Modal'
import { useSavedStore } from '@/stores/savedStore'
import { useUIStore } from '@/stores/uiStore'
import { Clock } from '@/components/ui/Icons'

// Quick reminder choices, computed in the viewer's local (Eastern) time.
function quickOptions(): { key: string; label: string; date: Date }[] {
  const now = new Date()
  const inHour = new Date(now.getTime() + 60 * 60 * 1000)
  const evening = new Date(now)
  evening.setHours(18, 0, 0, 0)
  if (evening <= now) evening.setDate(evening.getDate() + 1)
  const tomorrowAM = new Date(now)
  tomorrowAM.setDate(tomorrowAM.getDate() + 1)
  tomorrowAM.setHours(9, 0, 0, 0)
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  return [
    { key: 'hour', label: 'In 1 hour', date: inHour },
    { key: 'evening', label: 'This evening', date: evening },
    { key: 'tomorrow', label: 'Tomorrow morning', date: tomorrowAM },
    { key: 'week', label: 'Next week', date: nextWeek },
  ]
}

export function whenLabel(d: Date): string {
  const t = format(d, 'h:mm a')
  if (isToday(d)) return `today at ${t}`
  if (isTomorrow(d)) return `tomorrow at ${t}`
  return `${format(d, 'EEE, MMM d')} at ${t}`
}

export function RemindModal({
  messageId,
  onClose,
  existing,
}: {
  messageId: string
  onClose: () => void
  existing?: boolean
}) {
  const setReminder = useSavedStore((s) => s.setReminder)
  const toast = useUIStore((s) => s.toast)
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)

  async function choose(date: Date) {
    if (busy) return
    if (isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      toast({ kind: 'error', title: 'Pick a time in the future' })
      return
    }
    setBusy(true)
    await setReminder(messageId, date.toISOString())
    setBusy(false)
    toast({ kind: 'success', title: existing ? 'Reminder updated' : 'Reminder set', body: `We’ll remind you ${whenLabel(date)}.` })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Remind me about this">
      <div className="space-y-2">
        {quickOptions().map((o) => (
          <button
            key={o.key}
            onClick={() => choose(o.date)}
            disabled={busy}
            className="flex w-full items-center justify-between rounded-lg border border-white/10 px-3 py-2.5 text-left text-sm text-slate-100 hover:bg-white/5 disabled:opacity-50"
          >
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand-300" /> {o.label}
            </span>
            <span className="text-xs text-slate-400">{whenLabel(o.date)}</span>
          </button>
        ))}
        <div className="pt-2">
          <label className="label">Or pick a date &amp; time</label>
          <div className="flex gap-2">
            <input type="datetime-local" className="input" value={custom} onChange={(e) => setCustom(e.target.value)} />
            <button
              disabled={!custom || busy}
              onClick={() => choose(new Date(custom))}
              className="btn-primary whitespace-nowrap px-3 py-1.5 text-sm"
            >
              Set
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Times are Eastern (ET). You’ll get a notification + a push to your phone.</p>
        </div>
      </div>
    </Modal>
  )
}
