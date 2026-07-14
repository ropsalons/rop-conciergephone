import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import type { ChannelRow, ChannelMemberRow, Profile } from '@/types'

export interface ChannelMember extends ChannelMemberRow {
  profile?: Profile
}

export function useChannel(channelId?: string) {
  const me = useAuthStore((s) => s.user?.id)
  const [channel, setChannel] = useState<ChannelRow | null>(null)
  const [members, setMembers] = useState<ChannelMember[]>([])
  const [isMember, setIsMember] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadMembers = useCallback(async () => {
    if (!channelId) return
    const { data } = await supabase
      .from('channel_members')
      .select('*, profiles(*)')
      .eq('channel_id', channelId)
    const rows = ((data as any[]) ?? []).map((r) => ({ ...r, profile: r.profiles as Profile }))
    setMembers(rows)
    setIsMember(rows.some((r) => r.user_id === me))
  }, [channelId, me])

  const load = useCallback(async () => {
    if (!channelId) return
    setLoading(true)
    const { data } = await supabase.from('channels').select('*').eq('id', channelId).maybeSingle()
    setChannel((data as ChannelRow) ?? null)
    await loadMembers()
    setLoading(false)
  }, [channelId, loadMembers])

  useEffect(() => {
    load()
  }, [load])

  const join = useCallback(async () => {
    if (!channelId || !me) return
    await supabase.from('channel_members').insert({ channel_id: channelId, user_id: me } as any)
    await loadMembers()
    await useChatStore.getState().loadSidebar()
  }, [channelId, me, loadMembers])

  const leave = useCallback(async () => {
    if (!channelId || !me) return
    await supabase.from('channel_members').delete().eq('channel_id', channelId).eq('user_id', me)
    await useChatStore.getState().loadSidebar()
  }, [channelId, me])

  // Per-channel notification level: 'all' (every post), 'mentions' (default), 'mute' (nothing).
  // is_muted is kept in sync so unread badges + older checks keep working.
  const setNotifyLevel = useCallback(
    async (level: 'all' | 'mentions' | 'mute') => {
      if (!channelId || !me) return
      await supabase
        .from('channel_members')
        .update({ notify_level: level, is_muted: level === 'mute' } as any)
        .eq('channel_id', channelId)
        .eq('user_id', me)
      await loadMembers()
      await useChatStore.getState().loadSidebar()
    },
    [channelId, me, loadMembers],
  )

  return { channel, members, isMember, loading, reload: load, loadMembers, join, leave, setNotifyLevel }
}
