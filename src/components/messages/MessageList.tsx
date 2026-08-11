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
  const contentRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevLen = useRef(0)
  const prevHeight = useRef(0)
  const flashedFor = useRef<string | null>(null)
  // Whether we're "stuck" to the newest message. True on open and whenever the user is at the
  // bottom; false once they scroll up to read history. Drives the auto-scroll below.
  const stick = useRef(true)
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

  // Center a message inside THIS scroll container. We do the math by hand (rect delta) rather than
  // el.scrollIntoView(): on iOS Safari, scrollIntoView on an element inside a nested scroller often
  // scrolls the wrong ancestor (or nothing), which is why tapping a notification "didn't bring me
  // to it." Returns true when the message was on screen and we scrolled to it.
  function focusMessage(id: string, flash: boolean): boolean {
    const container = scrollRef.current
    if (!container) return false
    const el = container.querySelector(`[data-mid="${CSS.escape(id)}"]`) as HTMLElement | null
    if (!el) return false
    const cRect = container.getBoundingClientRect()
    const eRect = el.getBoundingClientRect()
    container.scrollTop += eRect.top - cRect.top - (container.clientHeight - el.clientHeight) / 2
    if (flash) {
      el.classList.add('msg-flash')
      window.setTimeout(() => el.classList.remove('msg-flash'), 2600)
    }
    return true
  }

  // Try now, then again as late content (images, rich cards) shifts offsets — re-centering each time
  // so the target doesn't drift off screen. Flashes once.
  const focusTimers = useRef<number[]>([])
  function clearFocusTimers() {
    focusTimers.current.forEach((t) => window.clearTimeout(t))
    focusTimers.current = []
  }
  function focusMessageSoon(id: string, doFlash: boolean) {
    stick.current = false // stay on the target, don't let auto-scroll yank to the bottom
    clearFocusTimers()
    let flashed = false
    const attempt = () => {
      const ok = focusMessage(id, doFlash && !flashed)
      if (ok && doFlash) flashed = true
    }
    attempt()
    focusTimers.current = [80, 250, 600, 1200].map((d) => window.setTimeout(attempt, d))
  }
  useEffect(() => () => clearFocusTimers(), [])

  // Tap the reply banner → jump to (and flash) the message it answers.
  function jumpToMessage(id: string) {
    focusMessageSoon(id, true)
  }

  // Opened from a shared link / notification (…?m=<id>): scroll to that message and flash it. If it
  // isn't in the loaded page yet, keep loading older pages until it appears (bounded), so an older
  // linked message still lands instead of dumping you at the bottom.
  const autoLoadTries = useRef(0)
  useEffect(() => {
    autoLoadTries.current = 0
  }, [highlightId])
  useEffect(() => {
    if (!highlightId || flashedFor.current === highlightId) return
    const inDom = scrollRef.current?.querySelector(`[data-mid="${CSS.escape(highlightId)}"]`)
    if (inDom) {
      flashedFor.current = highlightId
      focusMessageSoon(highlightId, true)
      return
    }
    // Not on screen yet. If it's not even in memory, pull older pages until it shows up.
    const inState = messages.some((m) => m.id === highlightId)
    if (!inState && hasMore && autoLoadTries.current < 8) {
      autoLoadTries.current++
      loadMore()
    }
  }, [highlightId, messages, hasMore, loadMore])

  // Auto-scroll to newest when appropriate; preserve position when prepending history.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const appended = messages.length > prevLen.current
    const grew = el.scrollHeight > prevHeight.current
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (prevLen.current === 0 && messages.length) {
      // First load in this channel. A deep link (…?m=<id>) positions itself on that message, so
      // don't pin to the bottom in that case; otherwise land on the newest message.
      if (highlightId) {
        stick.current = false
      } else {
        el.scrollTop = el.scrollHeight
        stick.current = true
      }
    } else if (appended && (nearBottom || stick.current)) {
      // A new message arrived while we're at the bottom — follow it.
      el.scrollTop = el.scrollHeight
    } else if (!appended && grew && !stick.current) {
      // Older history prepended while reading up — keep the viewport steady.
      el.scrollTop += el.scrollHeight - prevHeight.current
    }
    prevLen.current = messages.length
    prevHeight.current = el.scrollHeight
  }, [messages])

  // Keep pinned to the bottom while content is still settling (images, rich cards, videos loading
  // grow the page AFTER first render). Without this, opening an image-heavy channel scrolled to the
  // "bottom" too early and then landed mid-list once the images pushed everything down.
  useEffect(() => {
    const el = scrollRef.current
    const content = contentRef.current
    if (!el || !content || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(content)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      // Sticking = user is at (or near) the bottom. Scrolling up releases the stick so we don't
      // yank them back down while they read; scrolling back to the bottom re-engages it.
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
      if (el.scrollTop < 80 && hasMore) loadMore()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [hasMore, loadMore])

  if (loading && messages.length === 0) return <FullPageLoader label="Loading messages…" />

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto py-2">
      <div ref={contentRef} className="min-h-full">
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
            {/* Replies stay in the normal (bottom-of-flow) order, but are clearly indented with a
                colored rule so they read as a reply — and the tappable "Replying to…" banner inside
                jumps up to the original. */}
            <div className={isReply ? 'ml-3 border-l-2 border-brand-400/50 pl-1 sm:ml-8 sm:pl-2' : undefined}>
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
          </div>
        )
      })}
      <div ref={bottomRef} />
      </div>
    </div>
  )
}
