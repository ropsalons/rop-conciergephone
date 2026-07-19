import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MessageWithAuthor, Profile } from '@/types'
import { MessageItem } from './MessageItem'
import { FullPageLoader } from '@/components/ui/Feedback'
import { supabase } from '@/lib/supabase'
import { useDirectoryStore } from '@/stores/directoryStore'
import { dayLabel, displayName, sameDay } from '@/lib/utils'

export interface ParentPreview {
  name: string
  snippet: string
  deleted: boolean
}

// Short one-line preview of the message a reply is answering (author + text snippet).
function buildPreview(
  row: { body: string; metadata: unknown; user_id: string; is_deleted?: boolean },
  profilesById: Record<string, Profile | undefined>,
): ParentPreview {
  const meta = (row.metadata as Record<string, any>) ?? {}
  const name =
    (typeof meta.slack_author === 'string' && meta.slack_author) ||
    (typeof meta.author_name === 'string' && meta.author_name) ||
    displayName(profilesById[row.user_id]) ||
    'Someone'
  const raw =
    meta?.format === 'html' && typeof meta.html === 'string'
      ? meta.html.replace(/<[^>]+>/g, ' ')
      : row.body
  const snippet = row.is_deleted ? '' : raw.replace(/\s+/g, ' ').trim().slice(0, 80)
  return { name, snippet, deleted: !!row.is_deleted }
}

interface Props {
  messages: MessageWithAuthor[]
  loading: boolean
  hasMore: boolean
  loadMore: () => void
  onReact: (id: string, emoji: string) => void
  onOpenThread?: (id: string) => void
  onEdit: (id: string, body: string) => void
  onDelete: (id: string) => void
  onTogglePin?: (id: string, pinned: boolean) => void
  showThreads?: boolean
  highlightId?: string
}

export function MessageList({
  messages,
  loading,
  hasMore,
  loadMore,
  onReact,
  onOpenThread,
  onEdit,
  onDelete,
  onTogglePin,
  showThreads = true,
  highlightId,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevLen = useRef(0)
  const prevHeight = useRef(0)
  const flashedFor = useRef<string | null>(null)
  const profilesById = useDirectoryStore((s) => s.profilesById)

  // Preview of the message each reply is answering. Prefer the parent already loaded in this view;
  // for parents scrolled out of the page, fetch a light copy once.
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages])
  const [fetchedParents, setFetchedParents] = useState<Record<string, ParentPreview>>({})
  useEffect(() => {
    const missing = [
      ...new Set(
        messages
          .filter((m) => m.parent_message_id && !byId.has(m.parent_message_id))
          .map((m) => m.parent_message_id as string),
      ),
    ].filter((id) => !fetchedParents[id])
    if (!missing.length) return
    let active = true
    supabase
      .from('messages')
      .select('id,body,user_id,metadata,is_deleted')
      .in('id', missing)
      .then(({ data }) => {
        if (!active || !data) return
        const dir = useDirectoryStore.getState().profilesById
        const add: Record<string, ParentPreview> = {}
        for (const r of data as any[]) add[r.id] = buildPreview(r, dir)
        setFetchedParents((prev) => ({ ...prev, ...add }))
      })
    return () => {
      active = false
    }
  }, [messages, byId, fetchedParents])

  function previewFor(parentId: string): ParentPreview | undefined {
    const loaded = byId.get(parentId)
    if (loaded) return buildPreview(loaded, profilesById)
    return fetchedParents[parentId]
  }

  // Jump to (and flash) the original message a reply points at.
  function jumpToMessage(id: string) {
    const el = scrollRef.current?.querySelector(`[data-mid="${CSS.escape(id)}"]`) as HTMLElement | null
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('msg-flash')
    window.setTimeout(() => el.classList.remove('msg-flash'), 2600)
  }

  // Opened from a shared link (…?m=<id>): scroll to that exact message and flash it, once it's
  // loaded. If it isn't in the loaded page, we simply stay in the conversation.
  useEffect(() => {
    if (!highlightId || flashedFor.current === highlightId) return
    const el = scrollRef.current?.querySelector(`[data-mid="${CSS.escape(highlightId)}"]`) as HTMLElement | null
    if (!el) return
    flashedFor.current = highlightId
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('msg-flash')
    window.setTimeout(() => el.classList.remove('msg-flash'), 2600)
  }, [highlightId, messages])

  // Auto-scroll to newest when appropriate; preserve position when prepending history.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const appended = messages.length > prevLen.current
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (prevLen.current === 0 && messages.length) {
      el.scrollTop = el.scrollHeight
    } else if (appended && nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else if (!appended && el.scrollHeight > prevHeight.current) {
      // history prepended — keep viewport steady
      el.scrollTop += el.scrollHeight - prevHeight.current
    }
    prevLen.current = messages.length
    prevHeight.current = el.scrollHeight
  }, [messages])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      if (el.scrollTop < 80 && hasMore) loadMore()
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [hasMore, loadMore])

  if (loading && messages.length === 0) return <FullPageLoader label="Loading messages…" />

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto py-2">
      {hasMore && (
        <div className="py-2 text-center">
          <button onClick={loadMore} className="btn-ghost px-3 py-1 text-xs">
            Load earlier messages
          </button>
        </div>
      )}
      {messages.length === 0 && (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
          No messages yet — say hello 👋
        </div>
      )}
      {messages.map((m, i) => {
        const prev = messages[i - 1]
        const newDay = !prev || !sameDay(prev.created_at, m.created_at)
        const isReply = !!m.parent_message_id
        const grouped =
          !newDay &&
          prev &&
          prev.user_id === m.user_id &&
          new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000 &&
          !prev.is_deleted &&
          // Replies always stand on their own (avatar + "replying to" chip), and never absorb the
          // message after them into a group.
          !isReply &&
          !prev.parent_message_id
        const parentPreview = isReply ? previewFor(m.parent_message_id as string) : undefined
        return (
          <div key={m.id}>
            {newDay && (
              <div className="my-3 flex items-center gap-3 px-4">
                <div className="h-px flex-1 bg-white/10" />
                <span className="rounded-full bg-white/5 px-3 py-0.5 text-[11px] font-medium text-slate-400">
                  {dayLabel(m.created_at)}
                </span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
            )}
            <MessageItem
              message={m}
              grouped={!!grouped}
              showThread={showThreads}
              parentPreview={parentPreview}
              onJumpToParent={isReply ? () => jumpToMessage(m.parent_message_id as string) : undefined}
              onReact={(e) => onReact(m.id, e)}
              onReply={onOpenThread ? () => onOpenThread(m.id) : undefined}
              onEdit={(body) => onEdit(m.id, body)}
              onDelete={() => onDelete(m.id)}
              onTogglePin={onTogglePin ? (p) => onTogglePin(m.id, p) : undefined}
            />
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
