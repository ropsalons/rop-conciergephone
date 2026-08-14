import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUIStore } from '@/stores/uiStore'
import { Modal } from '@/components/ui/Modal'
import { Send } from '@/components/ui/Icons'
import { displayName } from '@/lib/utils'
import type { Profile } from '@/types'

const APP_URL = 'https://chat.ropsalons.com'

// The standard "you've been picked to try ROP Chat" invite. Editable before sending. Written plainly
// (about a 10th-grade reading level): says who it's really from, what ROP Chat is, that they were
// selected as an early tester, and the few steps to get it on their phone (iPhone or Android) or a
// computer. Login matches the new phone + 4-digit PIN flow, and replies point to Marina.
//
// IMPORTANT: keep this text plain ASCII (straight quotes/apostrophes, hyphens, no emoji or bullets).
// A single "smart" quote, em-dash, bullet, or emoji flips the whole SMS into Unicode mode, which cuts
// each segment from 153 chars to 67 and roughly doubles the per-text cost for no benefit.
function defaultMessage(p: Profile): string {
  const first = (displayName(p).trim().split(/\s+/)[0] || 'there')
  return (
    `Hi ${first}! This is a real text from Robert of Philadelphia (ROP) - you can trust it.\n\n` +
    `We built our own team app, ROP Chat. If you were with us years back, it works a lot like Slack - ` +
    `but it's ours, and it even has all our old channels and history in it. It does a lot more than ` +
    `anything we've used before.\n\n` +
    `You've been picked as one of the first to try it. We're still using Symphony for now and moving ` +
    `everyone over slowly - you're one of the first.\n\n` +
    `To start, open this on your phone: ${APP_URL}\n` +
    `Tap "First time here? Set up your PIN," enter your mobile number, and pick a 4-digit PIN. That's ` +
    `your login from now on.\n\n` +
    `To keep it handy like an app:\n` +
    `- iPhone: open the link in Safari, tap the Share icon, then "Add to Home Screen."\n` +
    `- Android: open the link in Chrome, tap the menu (three dots), then "Install app."\n\n` +
    `On a computer instead? Open the link in Chrome and click "Install" - nice for concierge.\n\n` +
    `One last thing once you're in and set up: post a quick message in the Announcements channel so ` +
    `we know you made it - just say you logged in.\n\n` +
    `Questions or need help getting in? Text Marina - she's helping everyone get started.`
  )
}

export function InviteModal({
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

  // Re-seed the message whenever the modal opens for a (new) person.
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
      // Light audit trail so we can see who's been invited (fire-and-forget).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (supabase.rpc as any)('log_event', {
        p_action: 'invite_sent',
        p_entity_type: 'profile',
        p_metadata: { channel: 'sms', profile_id: recipient!.id },
      }).then(() => {}, () => {})
      toast({ kind: 'success', title: 'Invite sent', body: `${displayName(recipient!)} was texted at ${phone}.` })
      onClose()
    } catch (err: any) {
      toast({ kind: 'error', title: 'Invite not sent', body: err?.message ?? String(err) })
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Invite ${displayName(recipient)} to ROP Chat`}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            {phone ? `Texts the invite to ${phone}` : 'No phone number on file'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost px-3 py-1.5 text-sm">Cancel</button>
            <button
              onClick={send}
              disabled={!phone || !message.trim() || sending}
              className="btn-primary px-3 py-1.5 text-sm"
            >
              <Send className="h-4 w-4" /> {sending ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </div>
      }
    >
      {!phone ? (
        <p className="text-sm text-slate-300">
          {displayName(recipient)} doesn’t have a mobile number on file, so we can’t text them an invite. Add
          one in Admin → Users → Edit details, then try again.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-400">
            This texts {displayName(recipient)} a friendly invite that explains what ROP Chat is and walks them
            through setting it up on their phone (or desktop) with their mobile number + a 4-digit PIN. Edit it
            however you like before sending.
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={14}
            className="input w-full resize-y text-[13px] leading-relaxed"
          />
        </>
      )}
    </Modal>
  )
}
