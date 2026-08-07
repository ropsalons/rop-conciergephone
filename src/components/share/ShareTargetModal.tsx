import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Feedback'
import { uploadAttachment } from '@/lib/files'
import { takeSharedMedia, clearShareFlag } from '@/lib/shareTarget'
import { cn } from '@/lib/utils'

// "Share to ROP Chat" — opens when the app is launched from the phone's share sheet (Android).
// Shows the shared photos/videos, lets you pick a channel + add a caption, and posts them.
export function ShareTargetModal() {
  const me = useAuthStore((s) => s.user?.id)
  const channels = useChatStore((s) => s.channels)
  const toast = useUIStore((s) => s.toast)
  const navigate = useNavigate()

  const [files, setFiles] = useState<File[] | null>(null)
  const [caption, setCaption] = useState('')
  const [channelId, setChannelId] = useState('')
  const [q, setQ] = useState('')
  const [sending, setSending] = useState(false)
  const [open, setOpen] = useState(false)

  // Grab the shared files once, on mount.
  useEffect(() => {
    let cancelled = false
    takeSharedMedia().then((shared) => {
      clearShareFlag()
      if (cancelled || !shared) return
      setFiles(shared.files)
      setCaption(shared.text || '')
      setOpen(true)
    })
    return () => { cancelled = true }
  }, [])

  const previews = useMemo(
    () => (files ?? []).map((f) => ({ f, url: URL.createObjectURL(f), isVideo: f.type.startsWith('video/') })),
    [files],
  )
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews])

  const postable = useMemo(
    () => channels.filter((c) => !c.is_archived).filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase())),
    [channels, q],
  )

  function close() {
    setOpen(false)
    setFiles(null)
  }

  async function send() {
    if (!me || !channelId || sending || !files?.length) return
    setSending(true)
    try {
      const metas = await Promise.all(files.map((f) => uploadAttachment(f, me)))
      const { data, error } = await supabase
        .from('messages')
        .insert({ channel_id: channelId, user_id: me, body: caption.trim(), metadata: {} } as never)
        .select('id')
        .single()
      if (error || !data) throw error ?? new Error('Could not post')
      const msgId = (data as { id: string }).id
      await supabase.from('files').insert(metas.map((f) => ({ ...f, message_id: msgId, channel_id: channelId, uploader_id: me })) as never)
      toast({ kind: 'success', title: 'Shared to ROP Chat', body: `${files.length} ${files.length === 1 ? 'file' : 'files'} posted.` })
      close()
      navigate(`/channel/${channelId}?m=${msgId}`)
    } catch (e) {
      toast({ kind: 'error', title: 'Could not share', body: String((e as Error).message ?? e) })
    } finally {
      setSending(false)
    }
  }

  if (!open || !files?.length) return null

  return (
    <Modal open onClose={close} title="Share to ROP Chat">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {previews.map((p, i) => (
            <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border border-white/10 bg-brand-950/60">
              {p.isVideo ? (
                <video src={p.url} className="h-full w-full object-cover" muted />
              ) : (
                <img src={p.url} alt="" className="h-full w-full object-cover" />
              )}
              {p.isVideo && <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">▶</span>}
            </div>
          ))}
        </div>

        <div>
          <label className="label">Add a caption <span className="text-slate-500">(optional)</span></label>
          <input className="input" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Say something…" />
        </div>

        <div>
          <label className="label">Post to which channel?</label>
          <input className="input mb-2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your channels…" />
          <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-brand-950/40 p-1">
            {postable.map((c) => (
              <button
                key={c.id}
                onClick={() => setChannelId(c.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition',
                  channelId === c.id ? 'bg-brand-500/20 text-white ring-1 ring-brand-400' : 'text-slate-200 hover:bg-white/5',
                )}
              >
                <span className="text-slate-500">#</span>
                <span className="truncate">{c.name}</span>
              </button>
            ))}
            {postable.length === 0 && <p className="px-2 py-3 text-center text-xs text-slate-500">No channels match.</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={close} className="btn-ghost px-4 py-1.5 text-sm">Cancel</button>
          <button onClick={send} disabled={!channelId || sending} className="btn-primary flex items-center gap-2 px-4 py-1.5 text-sm disabled:opacity-50">
            {sending && <Spinner className="h-4 w-4" />}
            {sending ? 'Posting…' : 'Share'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
