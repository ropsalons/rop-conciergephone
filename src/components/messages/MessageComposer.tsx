import { useRef, useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useUIStore } from '@/stores/uiStore'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Feedback'
import { Send, Paperclip, Smile, X, Code } from '@/components/ui/Icons'
import { QUICK_EMOJIS } from '@/lib/constants'
import { cn, displayName, extractMentionQuery } from '@/lib/utils'
import { uploadAttachment, type PendingFile } from '@/lib/files'
import type { Profile } from '@/types'

interface Props {
  onSend: (input: { body: string; mentions: string[]; files: PendingFile[]; html?: boolean }) => Promise<unknown>
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
}

export function MessageComposer({ onSend, placeholder = 'Write a message…', disabled, autoFocus }: Props) {
  const me = useAuthStore((s) => s.user?.id)
  const profiles = useDirectoryStore((s) => s.profiles)
  const toast = useUIStore((s) => s.toast)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [pending, setPending] = useState<PendingFile[]>([])
  const [uploading, setUploading] = useState(0)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [htmlMode, setHtmlMode] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const mentionsRef = useRef<Array<{ token: string; id: string }>>([])
  const dragDepth = useRef(0) // dragenter/leave fire on children too — count depth to avoid flicker
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px'
  }, [text])

  const mentionMatches: Profile[] =
    mentionQuery !== null
      ? profiles
          .filter((p) => p.id !== me && p.is_active)
          .filter((p) => displayName(p).toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, 6)
      : []

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setText(val)
    setMentionQuery(htmlMode ? null : extractMentionQuery(val, e.target.selectionStart ?? val.length))
  }

  function insertMention(p: Profile) {
    const ta = taRef.current
    if (!ta) return
    const caret = ta.selectionStart ?? text.length
    const before = text.slice(0, caret).replace(/@[\w.'-]*$/, '')
    const token = `@${displayName(p)}`
    const after = text.slice(caret)
    const next = `${before}${token} ${after}`
    mentionsRef.current.push({ token: token.slice(1).toLowerCase(), id: p.id })
    setText(next)
    setMentionQuery(null)
    setTimeout(() => ta.focus(), 0)
  }

  async function addFiles(files: File[]) {
    if (!me || !files.length) return
    for (const file of files) {
      setUploading((n) => n + 1)
      try {
        const meta = await uploadAttachment(file, me)
        setPending((prev) => [...prev, meta])
      } catch (err: any) {
        toast({ kind: 'error', title: 'Upload failed', body: err.message })
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    await addFiles(files)
  }

  // Drag a file (or several) anywhere onto the composer to attach it — no need to hit the paperclip.
  function onDragEnter(e: React.DragEvent) {
    if (disabled || !Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    dragDepth.current += 1
    setDragOver(true)
  }
  function onDragOver(e: React.DragEvent) {
    if (disabled || !Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault() // required so the browser fires `drop` instead of opening the file
    e.dataTransfer.dropEffect = 'copy'
  }
  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragOver(false)
  }
  function onDrop(e: React.DragEvent) {
    dragDepth.current = 0
    setDragOver(false)
    if (disabled) return
    const files = Array.from(e.dataTransfer.files ?? [])
    if (!files.length) return
    e.preventDefault()
    addFiles(files)
  }

  async function submit() {
    const body = text.trim()
    if ((!body && pending.length === 0) || sending || disabled) return
    setSending(true)
    // Only keep mentions whose token still appears in the body.
    const mentions = [
      ...new Set(
        mentionsRef.current.filter((m) => body.toLowerCase().includes(`@${m.token}`)).map((m) => m.id),
      ),
    ]
    try {
      await onSend({ body, mentions: htmlMode ? [] : mentions, files: pending, html: htmlMode })
      setText('')
      setPending([])
      mentionsRef.current = []
      setMentionQuery(null)
    } catch (err: any) {
      toast({ kind: 'error', title: 'Message not sent', body: err?.message })
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !mentionMatches.length) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div
      className="relative border-t border-white/10 bg-brand-900/40 px-2 pt-2 pb-safe sm:px-3 sm:pt-3"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-1 z-20 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-brand-400 bg-brand-900/90 text-center">
          <Paperclip className="h-6 w-6 text-brand-300" />
          <p className="text-sm font-semibold text-brand-100">Drop to attach</p>
        </div>
      )}
      {mentionMatches.length > 0 && (
        <div className="absolute bottom-full left-3 mb-1 w-64 overflow-hidden rounded-xl border border-white/10 bg-brand-800 shadow-2xl">
          {mentionMatches.map((p) => (
            <button
              key={p.id}
              onClick={() => insertMention(p)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/10"
            >
              <Avatar profile={p} size="xs" />
              <span className="truncate text-slate-100">{displayName(p)}</span>
              <span className="ml-auto text-[11px] capitalize text-slate-500">{p.role}</span>
            </button>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pending.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-white/10 px-2 py-1 text-xs">
              <Paperclip className="h-3.5 w-3.5" />
              <span className="max-w-[140px] truncate">{f.name}</span>
              <button onClick={() => setPending((prev) => prev.filter((_, idx) => idx !== i))}>
                <X className="h-3.5 w-3.5 text-slate-400 hover:text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-brand-900 px-2 py-1.5">
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
          title="Attach file"
        >
          {uploading > 0 ? <Spinner className="h-4 w-4" /> : <Paperclip className="h-5 w-5" />}
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={onPickFiles} />
        <button
          onClick={() => setHtmlMode((v) => !v)}
          aria-pressed={htmlMode}
          className={cn('rounded-lg p-2 hover:bg-white/10', htmlMode ? 'bg-gold-400/20 text-gold-300' : 'text-slate-400 hover:text-white')}
          title={htmlMode ? 'HTML mode is ON — your message will render as HTML. Tap to turn off.' : 'Send as HTML (paste HTML to render it)'}
        >
          <Code className="h-5 w-5" />
        </button>
        <textarea
          ref={taRef}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={htmlMode ? 'Paste HTML — it will render as a card…' : placeholder}
          rows={1}
          autoFocus={autoFocus}
          disabled={disabled}
          className="max-h-44 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        <div className="relative">
          <button
            onClick={() => setEmojiOpen((v) => !v)}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
            title="Emoji"
          >
            <Smile className="h-5 w-5" />
          </button>
          {emojiOpen && (
            <div className="absolute bottom-full right-0 mb-1 flex flex-wrap gap-1 rounded-xl border border-white/10 bg-brand-800 p-2 shadow-2xl">
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => { setText((t) => t + e); setEmojiOpen(false); taRef.current?.focus() }}
                  className="rounded-lg p-1 text-lg hover:bg-white/10"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={submit}
          disabled={sending || disabled || (!text.trim() && pending.length === 0)}
          className="btn-primary rounded-lg px-3 py-2"
          title="Send"
        >
          {sending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-1 hidden px-1 text-[11px] text-slate-500 sm:block">
        {htmlMode ? (
          <span className="text-gold-300/90">HTML mode — your message will render as HTML in a safe sandbox. Tap <Code className="inline h-3 w-3" /> to turn off.</span>
        ) : (
          <>
            <span className="font-semibold">Enter</span> to send · <span className="font-semibold">Shift+Enter</span> for a new line · **bold** *italic* `code`
          </>
        )}
      </p>
    </div>
  )
}
