import { useEffect, useLayoutEffect, useRef } from 'react'
import type { MessageWithAuthor } from '@/types'
import { MessageItem } from './MessageItem'
import { FullPageLoader } from '@/components/ui/Feedback'
import { dayLabel, sameDay } from '@/lib/utils'

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
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevLen = useRef(0)
  const prevHeight = useRef(0)

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
        const grouped =
          !newDay &&
          prev &&
          prev.user_id === m.user_id &&
          new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000 &&
          !prev.is_deleted
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
