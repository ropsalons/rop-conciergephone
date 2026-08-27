import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import type { MessageWithAuthor, MessageReactionRow, FileRow, MessageRow, Profile } from '@/types'
import { uuid } from '@/lib/utils'

const PAGE = 30

// In-memory cache of the last-loaded messages per channel/DM/thread. Revisiting a conversation shows
// its messages instantly from here while a fresh copy loads in the background — so navigating between
// channels feels immediate instead of blank-then-load. Lives for the session (cleared on reload).
const messageCache = new Map<string, MessageWithAuthor[]>()

export interface Target {
  channelId?: string
  conversationId?: string
}

interface SendInput {
  body: string
  mentions?: string[]
  parentId?: string | null
  html?: boolean // send the body as a rendered HTML card (shown in the same sandbox as API cards)
  files?: Array<Omit<FileRow, 'id' | 'created_at' | 'uploader_id'>>
}

// Plain-text fallback for an HTML message (used for search, previews and notifications).
const stripHtml = (s: string) =>
  s.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)

export function useMessages(target: Target, opts: { parentId?: string | null; focusId?: string | null } = {}) {
  const me = useAuthStore((s) => s.user?.id)
  const key = target.channelId ?? target.conversationId ?? ''
  const column = target.channelId ? 'channel_id' : 'conversation_id'
  const parentFilter = opts.parentId ?? null
  const focusId = opts.focusId ?? null
  const cacheKey = `${column}:${key}:${parentFilter ?? 'root'}`
  const [messages, setMessages] = useState<MessageWithAuthor[]>(() => messageCache.get(cacheKey) ?? [])
  const [loading, setLoading] = useState(() => !messageCache.has(cacheKey))
  const [hasMore, setHasMore] = useState(false)
  const oldestRef = useRef<string | null>(null)

  // When the target changes, immediately swap to that conversation's cached messages (no blank flash)
  // and only show the loader if we've never loaded it. This runs during render — the standard React
  // "reset state when a key changes" pattern — so the stale conversation never paints.
  const prevKey = useRef(cacheKey)
  if (prevKey.current !== cacheKey) {
    prevKey.current = cacheKey
    setMessages(messageCache.get(cacheKey) ?? [])
    setLoading(!messageCache.has(cacheKey))
  }

  // Keep the cache fresh as messages change (realtime, sends, reactions), excluding optimistic temps.
  useEffect(() => {
    if (key) messageCache.set(cacheKey, messages.filter((m) => !m.id.startsWith('temp-')))
  }, [messages, key, cacheKey])

  const hydrate = useCallback(async (rows: MessageRow[]): Promise<MessageWithAuthor[]> => {
    if (!rows.length) return []
    const ids = rows.map((r) => r.id)
    const dir = useDirectoryStore.getState()
    const [{ data: reactions }, { data: files }] = await Promise.all([
      supabase.from('message_reactions').select('*').in('message_id', ids),
      supabase.from('files').select('*').in('message_id', ids),
    ])
    // Ensure any unknown authors are present in the directory cache.
    const missing = [...new Set(rows.map((r) => r.user_id))].filter((id) => !dir.profilesById[id])
    if (missing.length) {
      const { data } = await supabase.from('profiles').select('*').in('id', missing)
      ;(data as Profile[] | null)?.forEach((p) => dir.upsertProfile(p))
    }
    const byId = useDirectoryStore.getState().profilesById
    const rx = (reactions ?? []) as MessageReactionRow[]
    const fl = (files ?? []) as FileRow[]
    return rows.map((r) => ({
      ...r,
      author: byId[r.user_id] ?? null,
      reactions: rx.filter((x) => x.message_id === r.id),
      files: fl.filter((x) => x.message_id === r.id),
    }))
  }, [])

  const load = useCallback(async () => {
    if (!key) return
    // Only show the loader when we have nothing cached to display; otherwise refresh silently.
    if (!messageCache.has(cacheKey)) setLoading(true)

    // Deep-linked to a specific message (search result / notification / shared link)? Load the page
    // AROUND it — the target plus context on both sides — instead of the newest page. This lets a
    // click on a search hit from months ago land ON that message, not at the bottom of the channel.
    // (Skips the thread panel, and only kicks in when the target isn't already in view.)
    if (focusId && !parentFilter && !messageCache.get(cacheKey)?.some((m) => m.id === focusId)) {
      const { data: tgt } = await supabase.from('messages').select('created_at').eq('id', focusId).eq(column, key).maybeSingle()
      const at = (tgt as { created_at?: string } | null)?.created_at
      if (at) {
        const [olderRes, newerRes] = await Promise.all([
          supabase.from('messages').select('*').eq(column, key).lte('created_at', at).order('created_at', { ascending: false }).limit(PAGE),
          supabase.from('messages').select('*').eq(column, key).gt('created_at', at).order('created_at', { ascending: true }).limit(15),
        ])
        const older = ((olderRes.data as MessageRow[]) ?? []).reverse() // …oldest → target
        const newer = (newerRes.data as MessageRow[]) ?? [] // a little context below the target
        const rows = [...older, ...newer]
        if (rows.length) {
          setHasMore(((olderRes.data as MessageRow[]) ?? []).length === PAGE)
          oldestRef.current = rows[0]?.created_at ?? null
          const hydrated = await hydrate(rows)
          messageCache.set(cacheKey, hydrated)
          setMessages(hydrated)
          setLoading(false)
          return
        }
      }
      // Target not found/visible — fall through to a normal newest-page load.
    }

    let q = supabase
      .from('messages')
      .select('*')
      .eq(column, key)
      .order('created_at', { ascending: false })
      .limit(PAGE)
    // Thread panel loads one parent's replies. The channel view loads EVERYTHING (roots + replies)
    // so replies show inline in the flow instead of being hidden behind the thread panel.
    if (parentFilter) q = q.eq('parent_message_id', parentFilter)
    const { data } = await q
    const rows = ((data as MessageRow[]) ?? []).reverse()
    setHasMore(((data as MessageRow[]) ?? []).length === PAGE)
    oldestRef.current = rows[0]?.created_at ?? null
    const hydrated = await hydrate(rows)
    messageCache.set(cacheKey, hydrated)
    setMessages(hydrated)
    setLoading(false)
  }, [key, column, parentFilter, hydrate, cacheKey, focusId])

  const loadMore = useCallback(async () => {
    if (!key || !oldestRef.current) return
    let q = supabase
      .from('messages')
      .select('*')
      .eq(column, key)
      .lt('created_at', oldestRef.current)
      .order('created_at', { ascending: false })
      .limit(PAGE)
    if (parentFilter) q = q.eq('parent_message_id', parentFilter)
    const { data } = await q
    const older = ((data as MessageRow[]) ?? []).reverse()
    setHasMore(((data as MessageRow[]) ?? []).length === PAGE)
    if (older.length) {
      oldestRef.current = older[0].created_at
      const hydrated = await hydrate(older)
      setMessages((prev) => [...hydrated, ...prev])
    }
  }, [key, column, parentFilter, hydrate])

  // Catch up on any messages NEWER than what we already have, and merge them in — WITHOUT resetting
  // to the newest page. Used by the focus/visibility/online self-heal so that switching windows while
  // reading history no longer throws away the older pages you just loaded (which looked like "it won't
  // let me load anything older"). If nothing is loaded yet, fall back to a normal load.
  const syncLatest = useCallback(async () => {
    if (!key || parentFilter) return
    const loaded = messageCache.get(cacheKey)?.filter((m) => !m.id.startsWith('temp-')) ?? []
    const newest = loaded.length ? loaded[loaded.length - 1].created_at : null
    if (!newest) { void load(); return }
    let q = supabase
      .from('messages')
      .select('*')
      .eq(column, key)
      .gt('created_at', newest)
      .order('created_at', { ascending: true })
      .limit(200)
    if (parentFilter) q = q.eq('parent_message_id', parentFilter)
    const { data } = await q
    const rows = (data as MessageRow[]) ?? []
    if (!rows.length) return
    const hydrated = await hydrate(rows)
    setMessages((prev) => {
      const have = new Set(prev.map((m) => m.id))
      const add = hydrated.filter((h) => !have.has(h.id))
      return add.length ? [...prev, ...add] : prev
    })
  }, [key, column, parentFilter, cacheKey, hydrate, load])

  useEffect(() => {
    load()
  }, [load])

  // Self-heal the "new messages don't load" problem: the realtime socket can quietly drop while the
  // app is backgrounded or the network blips, so re-sync whenever the app comes back to the
  // foreground or the connection returns. We only pull in NEWER messages and merge them, so reading
  // back through history survives a window switch. (Skipped for deep-linked views so we don't yank
  // the user off a message they navigated to.)
  useEffect(() => {
    if (!key || parentFilter || focusId) return
    const refetch = () => { if (document.visibilityState === 'visible') void syncLatest() }
    window.addEventListener('focus', refetch)
    document.addEventListener('visibilitychange', refetch)
    window.addEventListener('online', refetch)
    return () => {
      window.removeEventListener('focus', refetch)
      document.removeEventListener('visibilitychange', refetch)
      window.removeEventListener('online', refetch)
    }
  }, [key, parentFilter, focusId, syncLatest])

  // Realtime: messages + reactions -------------------------------------------
  useEffect(() => {
    if (!key) return
    // Unique topic per subscription. Reusing a fixed topic could hand back a channel that was
    // already subscribed (e.g. a thread reopened before its old channel finished tearing down),
    // and adding `.on()` to an already-subscribed channel throws — which blanked the thread panel.
    const ch = supabase
      .channel(`msgs:${column}:${key}:${parentFilter ?? 'root'}:${uuid()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `${column}=eq.${key}` },
        async (payload) => {
          const row = payload.new as MessageRow
          if (parentFilter) {
            // Thread panel: only this parent's replies belong here.
            if (row.parent_message_id !== parentFilter) return
          } else if (row.parent_message_id) {
            // Channel scope: a reply also bumps its parent's reply-count indicator…
            setMessages((prev) =>
              prev.map((m) =>
                m.id === row.parent_message_id
                  ? { ...m, reply_count: m.reply_count + 1, last_reply_at: row.created_at }
                  : m,
              ),
            )
            // …and then renders inline in the flow (falls through to append below).
          }
          const [hydrated] = await hydrate([row])
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, hydrated]))
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `${column}=eq.${key}` },
        (payload) => {
          const row = payload.new as MessageRow
          setMessages((prev) =>
            prev.map((m) => (m.id === row.id ? { ...m, ...row, author: m.author, reactions: m.reactions, files: m.files } : m)),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `${column}=eq.${key}` },
        (payload) => {
          const oldId = (payload.old as MessageRow).id
          setMessages((prev) => prev.filter((m) => m.id !== oldId))
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, async (payload) => {
        const mid = (payload.new as MessageReactionRow)?.message_id ?? (payload.old as MessageReactionRow)?.message_id
        if (!mid) return
        setMessages((prev) => {
          if (!prev.some((m) => m.id === mid)) return prev
          supabase
            .from('message_reactions')
            .select('*')
            .eq('message_id', mid)
            .then(({ data }) =>
              setMessages((cur) =>
                cur.map((m) => (m.id === mid ? { ...m, reactions: (data as MessageReactionRow[]) ?? [] } : m)),
              ),
            )
          return prev
        })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [key, column, parentFilter, hydrate])

  // Mutations -----------------------------------------------------------------
  const send = useCallback(
    async (input: SendInput) => {
      if (!me || !key) return
      const clientId = uuid()
      const metadata: Record<string, unknown> = { client_id: clientId }
      if (input.mentions?.length) metadata.mentions = input.mentions
      if (input.html) {
        metadata.format = 'html'
        metadata.html = input.body
      }
      // For HTML messages the visible body becomes a stripped preview; the raw HTML lives in metadata.
      const storedBody = input.html ? stripHtml(input.body) : input.body
      const optimistic: MessageWithAuthor = {
        id: `temp-${clientId}`,
        channel_id: target.channelId ?? null,
        conversation_id: target.conversationId ?? null,
        user_id: me,
        parent_message_id: input.parentId ?? null,
        body: storedBody,
        message_type: 'user',
        metadata,
        reply_count: 0,
        last_reply_at: null,
        is_edited: false,
        edited_at: null,
        is_deleted: false,
        deleted_at: null,
        is_pinned: false,
        pinned_by: null,
        pinned_at: null,
        created_at: new Date().toISOString(),
        author: useDirectoryStore.getState().profilesById[me] ?? null,
        reactions: [],
        files: [],
      }
      if (!input.parentId) setMessages((prev) => [...prev, optimistic])

      const { data, error } = await supabase
        .from('messages')
        .insert({
          [column]: key,
          user_id: me,
          body: storedBody,
          parent_message_id: input.parentId ?? null,
          metadata,
        } as any)
        .select('*')
        .single()

      if (error || !data) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
        throw error
      }
      const row = data as MessageRow

      // Attach any uploaded files to the new message.
      if (input.files?.length) {
        await supabase.from('files').insert(
          input.files.map((f) => ({
            ...f,
            message_id: row.id,
            uploader_id: me,
            [column]: key,
          })) as any,
        )
      }
      const [hydrated] = await hydrate([row])
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== optimistic.id)
        return withoutTemp.some((m) => m.id === row.id) ? withoutTemp : [...withoutTemp, hydrated]
      })
      return row
    },
    [me, key, column, target.channelId, target.conversationId, hydrate],
  )

  const edit = useCallback(async (id: string, body: string) => {
    await supabase.from('messages').update({ body, is_edited: true, edited_at: new Date().toISOString() }).eq('id', id)
  }, [])

  const remove = useCallback(async (id: string) => {
    // Soft-delete only — keep the original body in the row (hidden from the UI) so an accidental
    // delete can always be restored. Previously we wiped the body to '', which destroyed the text.
    await supabase
      .from('messages')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id)
  }, [])

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!me) return
      const msg = messages.find((m) => m.id === messageId)
      const mine = msg?.reactions?.find((r) => r.emoji === emoji && r.user_id === me)
      if (mine) {
        await supabase.from('message_reactions').delete().eq('id', mine.id)
      } else {
        await supabase.from('message_reactions').insert({ message_id: messageId, user_id: me, emoji } as any)
      }
    },
    [me, messages],
  )

  const togglePin = useCallback(async (id: string, pinned: boolean) => {
    if (!me) return
    await supabase
      .from('messages')
      .update({ is_pinned: pinned, pinned_by: pinned ? me : null, pinned_at: pinned ? new Date().toISOString() : null })
      .eq('id', id)
  }, [me])

  return { messages, loading, hasMore, loadMore, reload: load, send, edit, remove, toggleReaction, togglePin }
}
