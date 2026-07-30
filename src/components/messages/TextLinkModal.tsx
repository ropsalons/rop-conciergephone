import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Feedback'
import { Check } from '@/components/ui/Icons'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { displayName, cn } from '@/lib/utils'

interface Person { id: string; name: string; phone: string }

// Leader/admin action: text one or more people an SMS with a deep link to a specific ROP Chat
// message. Works from any channel or DM — you pick exactly who to text (no mass blast).
export function TextLinkModal({ link, suggest = [], onClose }: { link: string; suggest?: string[]; onClose: () => void }) {
  const me = useAuthStore((s) => s.user?.id)
  const myProfile = useAuthStore((s) => s.profile)
  const toast = useUIStore((s) => s.toast)
  const [people, setPeople] = useState<Person[] | null>(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)

  useEffect(() => {
    supabase
      .from('profiles').select('id, full_name, display_name, phone').eq('is_active', true).order('full_name')
      .then(({ data }) => {
        const list: Person[] = []
        for (const p of (data ?? []) as Array<{ id: string; full_name: string | null; display_name: string | null; phone: string | null }>) {
          if (p.id === me || !p.phone || !String(p.phone).trim()) continue
          list.push({ id: p.id, name: p.display_name || p.full_name || 'Unknown', phone: p.phone })
        }
        setPeople(list)
        // Pre-select anyone the message @mentioned, so the common case is one tap.
        if (suggest.length) {
          const pre = new Set<string>()
          for (const p of list) {
            const first = p.name.toLowerCase().split(/\s+/)[0]
            if (suggest.some((s) => s && (first === s || p.name.toLowerCase().includes(s)))) pre.add(p.id)
          }
          if (pre.size) setSel(pre)
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = people ?? []
    return s ? list.filter((p) => p.name.toLowerCase().includes(s)) : list
  }, [people, q])

  function toggle(id: string) {
    setSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  async function send() {
    if (sending || !sel.size) return
    setSending(true)
    const chosen = (people ?? []).filter((p) => sel.has(p.id))
    const myName = displayName(myProfile).split(/\s+/)[0]
    const body = `${myName} sent you a message in ROP Chat: ${link}`
    const { data, error } = await supabase.functions.invoke('send-sms', { body: { to: chosen.map((p) => p.phone), body } })
    setSending(false)
    if (error || !(data as { ok?: boolean })?.ok)
      return toast({ kind: 'error', title: 'Could not send text', body: error?.message || (data as { error?: string })?.error || 'Failed to send.' })
    toast({ kind: 'success', title: 'Text sent', body: `Sent a link to ${chosen.map((p) => p.name.split(/\s+/)[0]).join(', ')}.` })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Text a link to this message">
      <p className="mb-3 text-sm text-slate-400">
        Pick who to text. They’ll get a text with a link that opens straight to this message.
      </p>
      <input className="input mb-2" placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {people === null ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-400"><Spinner /> Loading…</div>
      ) : (
        <>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {filtered.length === 0 && <p className="py-4 text-sm text-slate-500">No one with a phone number matches.</p>}
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition',
                  sel.has(p.id) ? 'border-emerald-400 bg-emerald-400/10' : 'border-white/10 bg-brand-950/40 hover:bg-white/5',
                )}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-white">{p.name}</span>
                <span className={cn('flex h-4 w-4 items-center justify-center rounded-full border', sel.has(p.id) ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-white/20')}>
                  {sel.has(p.id) && <Check className="h-3 w-3" />}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={send} disabled={!sel.size || sending} className="btn-primary px-4 py-1.5 text-sm">
              {sending ? 'Sending…' : sel.size ? `Text ${sel.size} ${sel.size === 1 ? 'person' : 'people'}` : 'Text'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
