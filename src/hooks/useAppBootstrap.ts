import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { syncExistingSubscription } from '@/lib/push'
import type { NotificationRow } from '@/types'

// Runs once when the authenticated shell mounts: loads directory + sidebar, wires up the
// global notification stream, and maintains presence.
export function useAppBootstrap() {
  const userId = useAuthStore((s) => s.user?.id)
  const prefs = useAuthStore((s) => s.profile?.notification_prefs)

  useEffect(() => {
    if (!userId) return
    useDirectoryStore.getState().load()
    useChatStore.getState().loadSidebar()
    // Self-heal: if this device is already subscribed in the browser but the row never
    // saved, persist it now (covers a half-finished enable).
    void syncExistingSubscription(userId)

    const { toast } = useUIStore.getState()
    const chat = useChatStore.getState()

    // --- Notification stream -------------------------------------------------
    const notifChannel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as NotificationRow
          chat.refreshUnread()
          const allow = prefs
          // When mobile push is on, the service worker shows the OS notification — don't double up.
          const osNotify = !!allow?.browser_push && !allow?.mobile_push
          if (n.type === 'urgent') {
            toast({ kind: 'urgent', title: n.title, body: n.body ?? undefined })
            maybeBrowserNotify(n, (allow?.urgent ?? true) && osNotify)
          } else if (n.type === 'mention' && allow?.mentions !== false) {
            toast({ kind: 'info', title: n.title, body: n.body ?? undefined })
            maybeBrowserNotify(n, osNotify)
          } else if (n.type === 'dm' && allow?.dm !== false) {
            toast({ kind: 'info', title: n.title, body: n.body ?? undefined })
            maybeBrowserNotify(n, osNotify)
          } else if (n.type === 'announcement' && allow?.announcements !== false) {
            toast({ kind: 'info', title: n.title, body: n.body ?? undefined })
          }
        },
      )
      .subscribe()

    // --- Sidebar changes (added to a channel / new DM) -----------------------
    const membershipChannel = supabase
      .channel(`membership:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'channel_members', filter: `user_id=eq.${userId}` },
        () => chat.loadSidebar(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_conversation_members', filter: `user_id=eq.${userId}` },
        () => chat.loadSidebar(),
      )
      .subscribe()

    // --- Presence heartbeat --------------------------------------------------
    const setPresence = (presence: 'online' | 'away' | 'offline') =>
      supabase.from('profiles').update({ presence, last_seen_at: new Date().toISOString() }).eq('id', userId)
    setPresence('online')
    const heartbeat = setInterval(() => setPresence(document.hidden ? 'away' : 'online'), 60_000)
    const onVisibility = () => setPresence(document.hidden ? 'away' : 'online')
    const onUnload = () => setPresence('offline')
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', onUnload)

    return () => {
      supabase.removeChannel(notifChannel)
      supabase.removeChannel(membershipChannel)
      clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [userId, prefs])
}

function maybeBrowserNotify(n: NotificationRow, enabled?: boolean) {
  if (!enabled) return
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    new Notification(n.title, { body: n.body ?? undefined, icon: '/icons/icon-192.png', tag: n.id })
  } catch {
    /* ignore */
  }
}
