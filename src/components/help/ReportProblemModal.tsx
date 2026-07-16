import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUIStore } from '@/stores/uiStore'
import { Modal } from '@/components/ui/Modal'
import { APP_VERSION } from '@/lib/version'
import { AlertTriangle } from '@/components/ui/Icons'

// A short device/browser summary attached to every report so Rob has something to go on
// without having to ask "what phone / what screen were you on?"
function deviceContext(): string {
  const ua = navigator.userAgent
  let device = 'Device'
  if (/iPhone|iPad|iPod/.test(ua)) device = 'iPhone/iPad'
  else if (/Android/.test(ua)) device = 'Android'
  else if (/Macintosh/.test(ua)) device = 'Mac'
  else if (/Windows/.test(ua)) device = 'Windows'
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone
  const where = (window.location.hash || '#/').replace(/^#/, '')
  return `${device} · ${standalone ? 'installed app' : 'browser'} · v${APP_VERSION} · on ${where}`
}

export function ReportProblemModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useUIStore((s) => s.toast)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const message = text.trim()
    if (!message || busy) return
    setBusy(true)
    const { error } = await supabase.rpc('report_app_problem', {
      p_message: message,
      p_context: deviceContext(),
    })
    setBusy(false)
    if (error) {
      toast({ kind: 'error', title: 'Could not send report', body: error.message })
      return
    }
    toast({ kind: 'success', title: 'Report sent', body: 'Thanks — Rob has been notified.' })
    setText('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-gold-300" />
          <span>Report a problem</span>
        </div>
      }
      footer={
        <>
          <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !text.trim()}
            className="btn-primary px-4 py-1.5 text-sm"
          >
            {busy ? 'Sending…' : 'Send report'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-300">
          Something not working right? Tell us what happened and we&apos;ll get on it. Your report
          goes to a private <b>App Support</b> channel and notifies Rob directly.
        </p>
        <textarea
          className="input min-h-[120px] text-base sm:text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What went wrong? What were you trying to do?"
          autoFocus
        />
        <p className="text-xs text-slate-500">
          We&apos;ll automatically include your device and app version to help us fix it faster.
        </p>
      </div>
    </Modal>
  )
}
