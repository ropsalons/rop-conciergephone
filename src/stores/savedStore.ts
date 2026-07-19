import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { MessageReminderRow } from '@/types'

// A saved message (with the light message preview needed to render it in the Saved list).
export interface SavedPreview {
  id: string
  body: string
  metadata: Record<string, unknown> | null
  user_id: string
  channel_id: string | null
  conversation_id: string | null
  is_deleted: boolean
  created_at: string
}

interface SavedState {
  loaded: boolean
  reminders: MessageReminderRow[]
  messagesById: Record<string, SavedPreview>
  savedIds: Set<string>
  load: () => Promise<void>
  toggleSave: (messageId: string) => Promise<void>
  setReminder: (messageId: string, remindAt: string | null, note?: string | null) => Promise<void>
  remove: (messageId: string) => Promise<void>
}

export const useSavedStore = create<SavedState>((set, get) => ({
  loaded: false,
  reminders: [],
  messagesById: {},
  savedIds: new Set(),

  load: async () => {
    const me = useAuthStore.getState().user?.id
    if (!me) return
    const { data: rem } = await supabase
      .from('message_reminders')
      .select('*')
      .eq('user_id', me)
      .order('created_at', { ascending: false })
    const reminders = (rem as MessageReminderRow[]) ?? []
    const ids = reminders.map((r) => r.message_id)
    let messagesById: Record<string, SavedPreview> = {}
    if (ids.length) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('id,body,metadata,user_id,channel_id,conversation_id,is_deleted,created_at')
        .in('id', ids)
      messagesById = Object.fromEntries(((msgs as SavedPreview[]) ?? []).map((m) => [m.id, m]))
    }
    set({
      loaded: true,
      reminders,
      messagesById,
      savedIds: new Set(reminders.map((r) => r.message_id)),
    })
  },

  // Save toggles a bookmark with no scheduled reminder. If a reminder already exists on the
  // message, removing the save removes the reminder too (they share one row).
  toggleSave: async (messageId) => {
    const me = useAuthStore.getState().user?.id
    if (!me) return
    if (get().savedIds.has(messageId)) {
      await supabase.from('message_reminders').delete().eq('user_id', me).eq('message_id', messageId)
    } else {
      await supabase
        .from('message_reminders')
        .upsert({ user_id: me, message_id: messageId } as never, { onConflict: 'user_id,message_id' })
    }
    await get().load()
  },

  setReminder: async (messageId, remindAt, note) => {
    const me = useAuthStore.getState().user?.id
    if (!me) return
    await supabase.from('message_reminders').upsert(
      {
        user_id: me,
        message_id: messageId,
        remind_at: remindAt,
        note: note ?? null,
        fired_at: null,
      } as never,
      { onConflict: 'user_id,message_id' },
    )
    await get().load()
  },

  remove: async (messageId) => {
    const me = useAuthStore.getState().user?.id
    if (!me) return
    await supabase.from('message_reminders').delete().eq('user_id', me).eq('message_id', messageId)
    await get().load()
  },
}))
