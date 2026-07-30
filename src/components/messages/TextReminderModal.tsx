import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUIStore } from '@/stores/uiStore'
import { Modal } from '@/components/ui/Modal'
import { Send } from '@/components/ui/Icons'
import { displayName } from '@/lib/utils'
import type { Profile } from '@/types'

const APP_URL = 'https://chat.ropsalons.com'

// Pre-filled "you have a message waiting" text with a link + how-to-log-in/install instructions.
// Admins use this to nudge someone who isn't in the app yet to come read a DM.
function defaultMessage(p: Profile): string {
  const first = (displayName(p).trim().split(/\s+/)[0] || 'there')
  return (
    `Hi ${first}, you have a message waiting for you in ROP Chat — our private team app.\n\n` +
    `Open it here: ${APP_URL}\n\n` +
    `To log in: use your FIRST name and your passcode = the last 4 digits of your phone number ` +
    `(if that doesn't work, try rop2020).\n\n` +
    `Tip: on iPhone open the link in Safari, tap the Share icon, then "Add to Home Screen" so it ` +
    `installs like an app. On Android, open in Chrome and choose "Install app."\n\n` +
    `— The AI Assistant for Robert of Philadelphia (ROP)`
  )
}

export function TextReminderModal({
  open,
  onClose,
  recipient,
}: {
  open: boolean
  onClose: () => void
  recipient: Profile | null
}) {
  const toast = useUIStore((s) => s.toast)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [initedFor, setInitedFor] = useState<string | null>(null)

  // Re-seed the message whenever the modal opens for a (new) recipient.
  if (open && recipient && initedFor !== recipient.id) {
    setInitedFor(recipient.id)
    setMessage(defaultMessage(recipient))
  }
  if (!open || !recipient) return null

  const phone = recipient.phone?.trim()

  async function send() {
    if (!phone || !message.trim() || sending) return
    setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: { to: phone, body: message.trim() },
      })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.results?.[0]?.error || data?.error || 'Text could not be sent')
      toast({ kind: 'success', title: 'Text sent', body: `${displayName(recipient)} was notified at ${phone}.` })
      onClose()
    } catch (err: any) {
      toast({ kind: 'error', title: 'Text not sent', body: err?.message ?? String(err) })
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Text ${displayName(recipient)} a reminder`}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            {phone ? `Sends an SMS to ${phone}` : 'No phone number on file'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost px-3 py-1.5 text-sm">Cancel</button>
            <button
              onClick={send}
              disabled={!phone || !message.trim() || sending}
              className="btn-primary px-3 py-1.5 text-sm"
            >
              <Send className="h-4 w-4" /> {sending ? 'Sending…' : 'Send text'}
            </button>
          </div>
        </div>
      }
    >
      {!phone ? (
        <p className="text-sm text-slate-300">
          {displayName(recipient)} doesn’t have a phone number on file, so we can’t text them. Add one in
          Admin → Users → Edit details, then try again.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-400">
            This texts {displayName(recipient)} that they have a message waiting, with a link and how to log
            in / install the app. Edit it however you like before sending.
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={10}
            className="input w-full resize-y font-mono text-[13px] leading-relaxed"
          />
        </>
      )}
    </Modal>
  )
}
