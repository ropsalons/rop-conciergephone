import { useMemo, useState } from 'react'
import type { MessageWithAuthor } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { Avatar } from '@/components/ui/Avatar'
import { RichText } from './RichText'
import { RichCard } from './RichCard'
import { FileChip } from '@/components/files/FileChip'
import { messageTime, displayName, cn } from '@/lib/utils'
import { QUICK_EMOJIS, canManage } from '@/lib/constants'
import { Smile, Reply, Pin, Edit, Trash, Check, X, MoreHorizontal } from '@/components/ui/Icons'

interface Props {
  message: MessageWithAuthor
  grouped?: boolean
  showThread?: boolean
  onReact: (emoji: string) => void
  onReply?: () => void
  onEdit: (body: string) => void
  onDelete: () => void
  onTogglePin?: (pinned: boolean) => void
}

export function MessageItem({ message, grouped, showThread = true, onReact, onReply, onEdit, onDelete, onTogglePin }: Props) {
  const me = useAuthStore((s) => s.user?.id)
  const myRole = useAuthStore((s) => s.profile?.role)
  const profilesById = useDirectoryStore((s) => s.profilesById)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)

  const mentionNames = useMemo(() => {
    const set = new Set<string>()
    useDirectoryStore.getState().profiles.forEach((p) => set.add(displayName(p).toLowerCase()))
    return set
  }, [])

  const isMine = message.user_id === me
  const canModerate = isMine || canManage(myRole)
  const isTemp = message.id.startsWith('temp-')

  // Imported Slack history is owned by the archive account but carries the original
  // author's name (and reactions) in metadata — surface those instead.
  const meta = message.metadata as Record<string, any>
  const archivedAuthor = typeof meta?.slack_author === 'string' ? (meta.slack_author as string) : undefined
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
    <div className={cn('group relative flex gap-3 px-3 hover:bg-white/[0.03] sm:px-4', grouped ? 'py-0.5' : 'mt-3 py-0.5')}>
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
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-white">
              {archivedAuthor ?? displayName(message.author)}
            </span>
            <span className="text-[11px] text-slate-500">{messageTime(message.created_at)}</span>
            {archivedAuthor && (
              <span className="rounded bg-white/10 px-1.5 text-[10px] font-medium text-slate-400">archived</span>
            )}
            {message.is_pinned && <Pin className="h-3 w-3 text-gold-400" />}
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

      {/* Tap-to-reveal handle for touch devices (desktop uses hover) */}
      {!editing && !isTemp && (
        <button
          onClick={() => setShowActions((v) => !v)}
          className="absolute -top-2 right-2 rounded-lg border border-white/10 bg-brand-800 p-1.5 text-slate-300 shadow-lg lg:hidden"
          title="Message actions"
          aria-label="Message actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}

      {/* Actions — hover on desktop, tap the ⋯ on touch */}
      {!editing && !isTemp && (
        <div
          className={cn(
            'absolute -top-3 right-3 items-center gap-0.5 rounded-lg border border-white/10 bg-brand-800 px-1 py-0.5 shadow-lg group-hover:flex',
            showActions ? 'flex' : 'hidden',
          )}
        >
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
          {onTogglePin && canManage(myRole) && (
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
            <button onClick={onDelete} className="rounded p-1.5 text-slate-300 hover:bg-white/10 hover:text-red-400" title="Delete">
              <Trash className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
