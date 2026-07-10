import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type {
  ChannelWithMeta,
  ConversationWithMeta,
  Profile,
  UnreadSummary,
} from '@/types'
import { useAuthStore } from './authStore'

interface ChatState {
  channels: ChannelWithMeta[]
  conversations: ConversationWithMeta[]
  unreadByChannel: Record<string, number>
  unreadByConversation: Record<string, number>
  notificationsCount: number
  mentionsCount: number
  loaded: boolean

  loadSidebar: () => Promise<void>
  refreshUnread: () => Promise<void>
  markChannelRead: (channelId: string) => Promise<void>
  markConversationRead: (conversationId: string) => Promise<void>
  bumpConversation: (conversationId: string) => void
  toggleFavorite: (channelId: string, value: boolean) => Promise<void>
}

// Favorites float to the top; within each group channels are alphabetical by name.
function sortChannels(list: ChannelWithMeta[]): ChannelWithMeta[] {
  return [...list].sort((a, b) => {
    if (!!a.is_favorite !== !!b.is_favorite) return a.is_favorite ? -1 : 1
    return (a.name ?? '').localeCompare(b.name ?? '')
  })
}

export const useChatStore = create<ChatState>((set, get) => ({
  channels: [],
  conversations: [],
  unreadByChannel: {},
  unreadByConversation: {},
  notificationsCount: 0,
  mentionsCount: 0,
  loaded: false,

  loadSidebar: async () => {
    const me = useAuthStore.getState().user?.id
    if (!me) return

    // Channels I belong to.
    const { data: memberRows } = await supabase
      .from('channel_members')
      .select('is_muted, is_favorite, channels(*)')
      .eq('user_id', me)
    const channels: ChannelWithMeta[] = sortChannels(
      (memberRows ?? [])
        .map((r: any) => ({
          ...(r.channels as ChannelWithMeta),
          is_muted: r.is_muted,
          is_favorite: r.is_favorite,
          is_member: true,
        }))
        .filter((c: ChannelWithMeta) => c && c.id && !c.is_archived),
    )

    // Conversations I belong to.
    const { data: convRows } = await supabase
      .from('direct_conversation_members')
      .select('is_muted, direct_conversations(*)')
      .eq('user_id', me)
    const conversations: ConversationWithMeta[] = (convRows ?? [])
      .map((r: any) => ({ ...(r.direct_conversations as ConversationWithMeta), is_muted: r.is_muted }))
      .filter((c: ConversationWithMeta) => c && c.id)

    // Resolve members for every conversation in one query.
    const convIds = conversations.map((c) => c.id)
    if (convIds.length) {
      const { data: allMembers } = await supabase
        .from('direct_conversation_members')
        .select('conversation_id, profiles(*)')
        .in('conversation_id', convIds)
      const byConv: Record<string, Profile[]> = {}
      for (const row of (allMembers ?? []) as any[]) {
        const cid = row.conversation_id as string
        ;(byConv[cid] ??= []).push(row.profiles as Profile)
      }
      for (const c of conversations) c.members = byConv[c.id] ?? []
    }
    conversations.sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))

    set({ channels, conversations, loaded: true })
    await get().refreshUnread()
  },

  refreshUnread: async () => {
    const { data } = await supabase.rpc('get_unread_summary')
    const summary = data as UnreadSummary | null
    if (!summary) return
    set({
      unreadByChannel: Object.fromEntries(summary.channels.map((c) => [c.channel_id, c.unread])),
      unreadByConversation: Object.fromEntries(
        summary.conversations.map((c) => [c.conversation_id, c.unread]),
      ),
      notificationsCount: summary.notifications,
      mentionsCount: summary.mentions,
    })
  },

  markChannelRead: async (channelId) => {
    await supabase.rpc('mark_channel_read', { cid: channelId })
    set((s) => {
      const next = { ...s.unreadByChannel }
      delete next[channelId]
      return { unreadByChannel: next }
    })
  },

  markConversationRead: async (conversationId) => {
    await supabase.rpc('mark_conversation_read', { convid: conversationId })
    set((s) => {
      const next = { ...s.unreadByConversation }
      delete next[conversationId]
      return { unreadByConversation: next }
    })
  },

  bumpConversation: (conversationId) => {
    set((s) => {
      const conv = s.conversations.find((c) => c.id === conversationId)
      if (!conv) return s
      const rest = s.conversations.filter((c) => c.id !== conversationId)
      return { conversations: [{ ...conv, last_message_at: new Date().toISOString() }, ...rest] }
    })
  },

  toggleFavorite: async (channelId, value) => {
    const me = useAuthStore.getState().user?.id
    if (!me) return
    // Optimistic: update + re-sort the sidebar immediately.
    set((s) => ({
      channels: sortChannels(
        s.channels.map((c) => (c.id === channelId ? { ...c, is_favorite: value } : c)),
      ),
    }))
    const { error } = await supabase
      .from('channel_members')
      .update({ is_favorite: value })
      .eq('channel_id', channelId)
      .eq('user_id', me)
    if (error) {
      // Revert on failure.
      set((s) => ({
        channels: sortChannels(
          s.channels.map((c) => (c.id === channelId ? { ...c, is_favorite: !value } : c)),
        ),
      }))
    }
  },
}))
