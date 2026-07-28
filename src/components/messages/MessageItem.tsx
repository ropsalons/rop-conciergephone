import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { MessageWithAuthor } from '@/types'
import type { ParentPreview } from './MessageList'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { Avatar } from '@/components/ui/Avatar'
import { RichText } from './RichText'
import { RichCard } from './RichCard'
import { FileChip } from '@/components/files/FileChip'
import { messageTime, displayName, cn } from '@/lib/utils'
import { QUICK_EMOJIS, canManage, isAdmin } from '@/lib/constants'
import { Smile, Reply, Pin, Edit, Trash, Check, X, MoreHorizontal, Link as LinkIcon, Bookmark, Clock, ClipboardList, Smartphone } from '@/components/ui/Icons'
import { supabase } from '@/lib/supabase'
import { useUIStore } from '@/stores/uiStore'
import { useSavedStore } from '@/stores/savedStore'
import { useChatStore } from '@/stores/chatStore'
import { RemindModal } from './RemindModal'
import { ForwardModal } from './ForwardModal'

interface Props {
  message: MessageWithAuthor
  grouped?: boolean
  showThread?: boolean
  parentPreview?: ParentPreview
  onJumpToParent?: () => void
  onReact: (emoji: string) => void
  onReply?: () => void
  onEdit: (body: string) => void
  onDelete: () => void
  onTogglePin?: (pinned: boolean) => void
}

export function MessageItem({ message, grouped, showThread = true, parentPreview, onJumpToParent, onReact, onReply, onEdit, onDelete, onTogglePin }: Props) {
  const me = useAuthStore((s) => s.user?.id)
  const myAccess = useAuthStore((s) => s.profile?.access_level)
  const profilesById = useDirectoryStore((s) => s.profilesById)
  const toast = useUIStore((s) => s.toast)
  const [showEmoji, setShowEmoji] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)
  const [remindOpen, setRemindOpen] = useState(false)
  const [forwardOpen, setForwardOpen] = useState(false)
  const isSaved = useSavedStore((s) => s.savedIds.has(message.id))
  const toggleSave = useSavedStore((s) => s.toggleSave)
  const longPress = useRef<number | null>(null)

  function startLongPress() {
    cancelLongPress()
    longPress.current = window.setTimeout(() => {
      setSheetOpen(true)
      longPress.current = null
    }, 450)
  }
  function cancelLongPress() {
    if (longPress.current) {
      clearTimeout(longPress.current)
      longPress.current = null
    }
  }

  const mentionNames = useMemo(() => {
    const set = new Set<string>()
    useDirectoryStore.getState().profiles.forEach((p) => set.add(displayName(p).toLowerCase()))
    return set
  }, [])

  const isMine = message.user_id === me
  const canModerate = isMine || canManage(myAccess)
  const canForward = isAdmin(myAccess) // admins can forward any message to a connected project
  // A leader/admin can text the other people on this message a link to it (nudge someone who doesn't
  // check ROP Chat often). Works in DMs and in PRIVATE channels (small groups) — NOT public channels,
  // where "text everyone" would be a mass blast.
  const channelType = useChatStore(
    (s) => (message.channel_id ? s.channels.find((c) => c.id === message.channel_id)?.type : undefined),
  )
  const isDM = !message.channel_id && !!message.conversation_id
  const canTextLink = canManage(myAccess) && (isDM || channelType === 'private')
  const [texting, setTexting] = useState(false)

  async function textLink(done?: () => void) {
    if (texting) return
    setTexting(true)
    try {
      // Who else is on this thread? DMs → conversation members; private channels → channel members.
      let otherIds: string[] = []
      if (message.channel_id) {
        const { data } = await supabase.from('channel_members').select('user_id').eq('channel_id', message.channel_id)
        otherIds = (data ?? []).map((m: { user_id: string }) => m.user_id).filter((id) => id !== me)
      } else if (message.conversation_id) {
        const { data } = await supabase.from('direct_conversation_members').select('user_id').eq('conversation_id', message.conversation_id)
        otherIds = (data ?? []).map((m: { user_id: string }) => m.user_id).filter((id) => id !== me)
      }
      if (!otherIds.length) { toast({ kind: 'error', title: 'No one to text here' }); return }
      const { data: profs } = await supabase
        .from('profiles').select('id, phone, full_name, display_name').in('id', otherIds)
      const recips = (profs ?? []).filter((p) => p.phone && String(p.phone).trim())
      if (!recips.length) {
        toast({ kind: 'error', title: 'No phone number on file', body: 'Nobody here has a phone number saved, so I can’t text a link.' })
        return
      }
      const names = recips.map((r) => (r.display_name || r.full_name || 'them').split(/\s+/)[0]).join(', ')
      // Guard against an accidental group blast: confirm when it's more than one person.
      if (recips.length > 1 && !window.confirm(`Text a link to this message to ${recips.length} people (${names})?`)) return
      const link = messageLink()
      const myName = displayName(useAuthStore.getState().profile).split(/\s+/)[0]
      const body = `${myName} sent you a message in ROP Chat: ${link}`
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: { to: recips.map((r) => r.phone), body },
      })
      if (error || !data?.ok) throw new Error(error?.message || data?.error || 'Text failed to send.')
      toast({ kind: 'success', title: 'Text sent', body: `Sent ${names} a link to this message.` })
    } catch (e) {
      toast({ kind: 'error', title: 'Could not send text', body: String((e as Error).message ?? e) })
    } finally {
      setTexting(false)
      done?.()
    }
  }
  const isTemp = message.id.startsWith('temp-')
  // When rendered in the channel flow, a reply is indented with a left bar and shows a small
  // "replying to …" chip. Inside the thread panel no preview is passed, so it renders normally.
  const showReplyContext = !!parentPreview

  // A shareable deep link to THIS message — open it (or text it to someone) and the app jumps to the
  // conversation and highlights the message. On phones we use the native share sheet (so it's one tap
  // to text it); otherwise we copy it to the clipboard.
  function messageLink() {
    const path = message.channel_id ? `/channel/${message.channel_id}` : `/dm/${message.conversation_id}`
    return `${window.location.origin}/#${path}?m=${message.id}`
  }
  async function shareLink(done?: () => void) {
    const url = messageLink()
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string; url?: string }) => Promise<void> }
    if (nav.share) {
      try { await nav.share({ title: 'ROP Chat', text: 'Message in ROP Chat', url }) } catch { /* cancelled */ }
      done?.()
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast({ kind: 'success', title: 'Link copied', body: 'Paste it into a text or email to share.' })
    } catch {
      window.prompt('Copy this link to the message:', url)
    }
    done?.()
  }

  // Imported Slack history is owned by the archive account but carries the original
  // author's name (and reactions) in metadata — surface those instead.
  const meta = message.metadata as Record<string, any>
  const archivedAuthor = typeof meta?.slack_author === 'string' ? (meta.slack_author as string) : undefined
  // AI-agent messages are authored by the Integrations account but carry an explicit agent identity;
  // surface the agent name + an AI badge so it's never mistaken for a hand-typed employee message.
  const aiAgent = meta?.ai_agent && typeof meta.ai_agent === 'object' ? (meta.ai_agent as { name?: string; provider?: string }) : undefined
  const aiName = aiAgent ? (typeof meta.author_name === 'string' ? meta.author_name : aiAgent.name) : undefined
  const displayAuthor = archivedAuthor
    ? ({ id: `slack:${archivedAuthor}`, full_name: archivedAuthor } as any)
    : message.author
  const slackReactions: Array<{ name: string; count: number }> = Array.isArray(meta?.slack_reactions)
    ? meta.slack_reactions
    : []

  // Group reactions by emoji.
  const reactionGroups = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean; users: string[] }>()
    for (const r of message.reactions ?? []) {
      const g = map.get(r.emoji) ?? { count: 0, mine: false, users: [] }
      g.count++
      if (r.user_id === me) g.mine = true
      const nm = profilesById[r.user_id]
      if (nm) g.users.push(displayName(nm))
      map.set(r.emoji, g)
    }
    return [...map.entries()]
  }, [message.reactions, me, profilesById])

  if (message.is_deleted) {
    return (
      <div className="px-4 py-1 pl-16 text-sm italic text-slate-500">This message was deleted.</div>
    )
  }

  return (
    <div
      data-mid={message.id}
      className={cn(
        'group relative flex gap-3 hover:bg-white/[0.03]',
        grouped ? 'py-0.5' : 'mt-3 py-0.5',
        showReplyContext
          ? 'ml-3 border-l-2 border-brand-400/40 bg-brand-400/[0.03] pl-2 pr-3 sm:ml-4 sm:pr-4'
          : 'px-3 sm:px-4',
      )}
      onTouchStart={() => { if (!editing && !isTemp) startLongPress() }}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
    >
      <div className="w-10 shrink-0">
        {!grouped ? (
          <Avatar profile={displayAuthor} size="md" showPresence={!archivedAuthor} />
        ) : (
          <span className="mt-1 hidden text-[10px] text-slate-600 group-hover:block">
            {messageTime(message.created_at).split(' ').slice(-2).join(' ')}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {showReplyContext && parentPreview && (
          <button
            onClick={onJumpToParent}
            title="Go to the message this is replying to"
            className="mb-0.5 flex max-w-full items-center gap-1 truncate text-left text-[11px] text-slate-500 hover:text-slate-300"
          >
            <Reply className="h-3 w-3 shrink-0 -scale-x-100 text-brand-300/70" />
            <span className="shrink-0 font-medium text-slate-400">{parentPreview.name}</span>
            <span className="truncate text-slate-500">
              {parentPreview.deleted ? 'deleted message' : parentPreview.snippet}
            </span>
          </button>
        )}
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-white">
              {aiName ?? archivedAuthor ?? displayName(message.author)}
            </span>
            {aiAgent && (
              <span className="rounded bg-brand-400/20 px-1.5 text-[10px] font-semibold text-brand-200" title={`AI agent${aiAgent.provider ? ` · ${aiAgent.provider}` : ''}`}>
                🤖 AI{aiAgent.provider ? ` · ${aiAgent.provider}` : ''}
              </span>
            )}
            <span className="text-[11px] text-slate-500">{messageTime(message.created_at)}</span>
            {archivedAuthor && (
              <span className="rounded bg-white/10 px-1.5 text-[10px] font-medium text-slate-400">archived</span>
            )}
            {message.is_pinned && <Pin className="h-3 w-3 text-gold-400" />}
            {isSaved && <Bookmark className="h-3 w-3 fill-current text-gold-400" />}
          </div>
        )}

        {editing ? (
          <div className="mt-1">
            <textarea
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              autoFocus
            />
            <div className="mt-1 flex gap-2">
              <button
                className="btn-primary px-2 py-1 text-xs"
                onClick={() => { onEdit(draft.trim()); setEditing(false) }}
              >
                <Check className="h-3.5 w-3.5" /> Save
              </button>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setEditing(false); setDraft(message.body) }}>
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </div>
          </div>
        ) : meta?.format === 'html' && typeof meta.html === 'string' ? (
          <div className={cn(isTemp && 'opacity-60')}>
            <RichCard html={meta.html} title={typeof meta.card_title === 'string' ? meta.card_title : undefined} />
            {message.is_edited && <span className="ml-1 text-[10px] text-slate-500">(updated)</span>}
          </div>
        ) : (
          <div className={cn('text-sm leading-relaxed text-slate-200', isTemp && 'opacity-60')}>
            <RichText text={message.body} mentionNames={mentionNames} />
            {message.is_edited && <span className="ml-1 text-[10px] text-slate-500">(edited)</span>}
          </div>
        )}

        {/* Attachments */}
        {message.files && message.files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.files.map((f) => (
              <FileChip key={f.id} file={f} />
            ))}
          </div>
        )}

        {/* Reactions */}
        {reactionGroups.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {reactionGroups.map(([emoji, g]) => (
              <button
                key={emoji}
                onClick={() => onReact(emoji)}
                title={g.users.join(', ')}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition',
                  g.mine
                    ? 'border-brand-400/60 bg-brand-400/20 text-brand-100'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
                )}
              >
                <span>{emoji}</span>
                <span className="font-medium">{g.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Imported Slack reactions (read-only) */}
        {reactionGroups.length === 0 && slackReactions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {slackReactions.map((r) => (
              <span
                key={r.name}
                className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-400"
                title={`:${r.name}:`}
              >
                <span>:{r.name}:</span>
                <span className="font-medium">{r.count}</span>
              </span>
            ))}
          </div>
        )}

        {/* Thread indicator */}
        {showThread && message.reply_count > 0 && onReply && (
          <button
            onClick={onReply}
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-brand-300 hover:bg-brand-400/10"
          >
            <Reply className="h-3.5 w-3.5" />
            {message.reply_count} {message.reply_count === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>

      {/* Touch: ⋯ opens the action sheet (long-press does too). Hidden on desktop. */}
      {!editing && !isTemp && (
        <button
          onClick={() => setSheetOpen(true)}
          className="absolute -top-2 right-2 rounded-lg border border-white/10 bg-brand-800 p-1.5 text-slate-300 shadow-lg lg:hidden"
          title="Message actions"
          aria-label="Message actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}

      {/* Desktop hover actions */}
      {!editing && !isTemp && (
        <div className="absolute -top-3 right-3 hidden items-center gap-0.5 rounded-lg border border-white/10 bg-brand-800 px-1 py-0.5 shadow-lg group-hover:flex">
          <div className="relative">
            <button onClick={() => setShowEmoji((v) => !v)} className="rounded p-1.5 text-slate-300 hover:bg-white/10" title="React">
              <Smile className="h-4 w-4" />
            </button>
            {showEmoji && (
              <div className="absolute right-0 top-full z-10 mt-1 flex gap-1 rounded-xl border border-white/10 bg-brand-800 p-1.5 shadow-2xl">
                {QUICK_EMOJIS.map((e) => (
                  <button key={e} onClick={() => { onReact(e); setShowEmoji(false) }} className="rounded p-1 text-base hover:bg-white/10">
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          {showThread && onReply && (
            <button onClick={onReply} className="rounded p-1.5 text-slate-300 hover:bg-white/10" title="Reply in thread">
              <Reply className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => shareLink()} className="rounded p-1.5 text-slate-300 hover:bg-white/10" title="Copy link to this message">
            <LinkIcon className="h-4 w-4" />
          </button>
          <button onClick={() => setRemindOpen(true)} className="rounded p-1.5 text-slate-300 hover:bg-white/10" title="Remind me about this later">
            <Clock className="h-4 w-4" />
          </button>
          <button onClick={() => toggleSave(message.id)} className="rounded p-1.5 text-slate-300 hover:bg-white/10" title={isSaved ? 'Remove from Saved' : 'Save for later'}>
            <Bookmark className={cn('h-4 w-4', isSaved && 'fill-current text-gold-400')} />
          </button>
          {canForward && (
            <button onClick={() => setForwardOpen(true)} className="rounded p-1.5 text-brand-300 hover:bg-white/10" title="Send to a project (Command Center, etc.)">
              <ClipboardList className="h-4 w-4" />
            </button>
          )}
          {canTextLink && (
            <button onClick={() => textLink()} disabled={texting} className="rounded p-1.5 text-emerald-300 hover:bg-white/10 disabled:opacity-50" title="Text them a link to this message">
              <Smartphone className="h-4 w-4" />
            </button>
          )}
          {onTogglePin && canManage(myAccess) && (
            <button onClick={() => onTogglePin(!message.is_pinned)} className="rounded p-1.5 text-slate-300 hover:bg-white/10" title={message.is_pinned ? 'Unpin' : 'Pin'}>
              <Pin className={cn('h-4 w-4', message.is_pinned && 'text-gold-400')} />
            </button>
          )}
          {isMine && (
            <button onClick={() => setEditing(true)} className="rounded p-1.5 text-slate-300 hover:bg-white/10" title="Edit">
              <Edit className="h-4 w-4" />
            </button>
          )}
          {canModerate && (
            <button onClick={() => setConfirmDel(true)} className="ml-0.5 rounded p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400" title="Delete">
              <Trash className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Mobile action sheet (long-press a message, or tap ⋯) */}
      {sheetOpen && !editing && !isTemp && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setSheetOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-white/10 bg-brand-900 p-3 shadow-2xl"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
            <div className="mb-2 flex justify-center gap-2">
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => { onReact(e); setSheetOpen(false) }}
                  className="rounded-xl bg-white/5 px-3 py-2 text-xl active:bg-white/15"
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="divide-y divide-white/5">
              <SheetItem
                icon={<LinkIcon className="h-5 w-5" />}
                label="Copy / share link to message"
                onClick={() => shareLink(() => setSheetOpen(false))}
              />
              <SheetItem
                icon={<Clock className="h-5 w-5" />}
                label="Remind me about this later"
                onClick={() => { setSheetOpen(false); setRemindOpen(true) }}
              />
              <SheetItem
                icon={<Bookmark className={cn('h-5 w-5', isSaved && 'fill-current text-gold-400')} />}
                label={isSaved ? 'Remove from Saved' : 'Save for later'}
                onClick={() => { toggleSave(message.id); setSheetOpen(false) }}
              />
              {canForward && (
                <SheetItem
                  icon={<ClipboardList className="h-5 w-5 text-brand-300" />}
                  label="Send to a project (Command Center…)"
                  onClick={() => { setSheetOpen(false); setForwardOpen(true) }}
                />
              )}
              {canTextLink && (
                <SheetItem
                  icon={<Smartphone className="h-5 w-5 text-emerald-300" />}
                  label={texting ? 'Texting…' : 'Text them a link to this message'}
                  onClick={() => textLink(() => setSheetOpen(false))}
                />
              )}
              {showThread && onReply && (
                <SheetItem icon={<Reply className="h-5 w-5" />} label="Reply in thread" onClick={() => { onReply(); setSheetOpen(false) }} />
              )}
              {onTogglePin && canManage(myAccess) && (
                <SheetItem
                  icon={<Pin className={cn('h-5 w-5', message.is_pinned && 'text-gold-400')} />}
                  label={message.is_pinned ? 'Unpin message' : 'Pin message'}
                  onClick={() => { onTogglePin(!message.is_pinned); setSheetOpen(false) }}
                />
              )}
              {isMine && (
                <SheetItem icon={<Edit className="h-5 w-5" />} label="Edit message" onClick={() => { setEditing(true); setSheetOpen(false) }} />
              )}
              {canModerate && (
                <SheetItem icon={<Trash className="h-5 w-5" />} label="Delete message" danger onClick={() => { setSheetOpen(false); setConfirmDel(true) }} />
              )}
            </div>
          </div>
        </div>
      )}

      {remindOpen && <RemindModal messageId={message.id} onClose={() => setRemindOpen(false)} />}
      {forwardOpen && <ForwardModal messageId={message.id} onClose={() => setForwardOpen(false)} />}

      {/* Delete confirmation — a tap never deletes on its own; you have to confirm here. */}
      {confirmDel && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={() => setConfirmDel(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full max-w-xs rounded-2xl border border-white/10 bg-brand-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold text-white">Delete this message?</p>
            <p className="mt-1 text-sm text-slate-400">It will be removed for everyone in this conversation.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmDel(false)} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
              <button onClick={() => { setConfirmDel(false); onDelete() }} className="btn-danger px-4 py-2 text-sm">
                <Trash className="h-4 w-4" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SheetItem({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn('flex w-full items-center gap-3 px-2 py-3.5 text-left text-[15px] active:bg-white/5', danger ? 'text-red-400' : 'text-slate-100')}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
