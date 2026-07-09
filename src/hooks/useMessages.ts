import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import type { MessageWithAuthor, MessageReactionRow, FileRow, MessageRow, Profile } from '@/types'
import { uuid } from '@/lib/utils'

const PAGE = 30

export interface Target {
  channelId?: string
  conversationId?: string
}

interface SendInput {
  body: string
  mentions?: string[]
  parentId?: string | null
  files?: Array<Omit<FileRow, 'id' | 'created_at' | 'uploader_id'>>
}

export function useMessages(target: Target, opts: { parentId?: string | null } = {}) {
  const me = useAuthStore((s) => s.user?.id)
  const [messages, setMessages] = useState<MessageWithAuthor[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const oldestRef = useRef<string | null>(null)
  const key = target.channelId ?? target.conversationId ?? ''
  const column = target.channelId ? 'channel_id' : 'conversation_id'
  const parentFilter = opts.parentId ?? null

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
    setLoading(true)
    let q = supabase
      .from('messages')
      .select('*')
      .eq(column, key)
      .order('created_at', { ascending: false })
      .limit(PAGE)
    q = parentFilter ? q.eq('parent_message_id', parentFilter) : q.is('parent_message_id', null)
    const { data } = await q
    const rows = ((data as MessageRow[]) ?? []).reverse()
    setHasMore(((data as MessageRow[]) ?? []).length === PAGE)
    oldestRef.current = rows[0]?.created_at ?? null
    setMessages(await hydrate(rows))
    setLoading(false)
  }, [key, column, parentFilter, hydrate])

  const loadMore = useCallback(async () => {
    if (!key || !oldestRef.current) return
    let q = supabase
      .from('messages')
      .select('*')
      .eq(column, key)
      .lt('created_at', oldestRef.current)
      .order('created_at', { ascending: false })
      .limit(PAGE)
    q = parentFilter ? q.eq('parent_message_id', parentFilter) : q.is('parent_message_id', null)
    const { data } = await q
    const older = ((data as MessageRow[]) ?? []).reverse()
    setHasMore(((data as MessageRow[]) ?? []).length === PAGE)
    if (older.length) {
      oldestRef.current = older[0].created_at
      const hydrated = await hydrate(older)
      setMessages((prev) => [...hydrated, ...prev])
    }
  }, [key, column, parentFilter, hydrate])

  useEffect(() => {
    load()
  }, [load])

  // Realtime: messages + reactions -------------------------------------------
  useEffect(() => {
    if (!key) return
    const ch = supabase
      .channel(`msgs:${column}:${key}:${parentFilter ?? 'root'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `${column}=eq.${key}` },
        async (payload) => {
          const row = payload.new as MessageRow
          const matchesScope = parentFilter
            ? row.parent_message_id === parentFilter
            : row.parent_message_id === null
          if (!matchesScope) {
            // A reply bumped a root message's reply_count — reflect it.
            if (row.parent_message_id) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === row.parent_message_id
                    ? { ...m, reply_count: m.reply_count + 1, last_reply_at: row.created_at }
                    : m,
                ),
              )
            }
            return
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
      const optimistic: MessageWithAuthor = {
        id: `temp-${clientId}`,
        channel_id: target.channelId ?? null,
        conversation_id: target.conversationId ?? null,
        user_id: me,
        parent_message_id: input.parentId ?? null,
        body: input.body,
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
          body: input.body,
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
    await supabase
      .from('messages')
      .update({ is_deleted: true, deleted_at: new Date().toISOString(), body: '' })
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
