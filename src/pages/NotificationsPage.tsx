import { useCallback, useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { FullPageLoader, EmptyState } from '@/components/ui/Feedback'
import {
  Bell, MessageSquare, Megaphone, AlertTriangle, Smile, Reply, Hash, CheckCheck, Trash, X, Clock,
} from '@/components/ui/Icons'
import { timeAgo, cn } from '@/lib/utils'
import type { NotificationRow, NotificationType } from '@/types'

const TYPE_META: Record<NotificationType, { label: string; icon: ComponentType<{ className?: string }>; tint: string }> = {
  urgent: { label: 'Urgent', icon: AlertTriangle, tint: 'text-red-400' },
  mention: { label: 'Mention', icon: Hash, tint: 'text-brand-200' },
  dm: { label: 'Message', icon: MessageSquare, tint: 'text-brand-200' },
  thread_reply: { label: 'Reply', icon: Reply, tint: 'text-sky-300' },
  reaction: { label: 'Reaction', icon: Smile, tint: 'text-gold-300' },
  announcement: { label: 'Announcement', icon: Megaphone, tint: 'text-brand-200' },
  channel: { label: 'Channel', icon: Hash, tint: 'text-brand-200' },
  channel_invite: { label: 'Invite', icon: Hash, tint: 'text-emerald-300' },
  reminder: { label: 'Reminder', icon: Clock, tint: 'text-gold-300' },
  system: { label: 'System', icon: Bell, tint: 'text-slate-300' },
}

export function NotificationsPage() {
  const me = useAuthStore((s) => s.user?.id)
  const profilesById = useDirectoryStore((s) => s.profilesById)
  const navigate = useNavigate()
  const [items, setItems] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchItems = useCallback(async () => {
    if (!me) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', me)
      .order('created_at', { ascending: false })
      .limit(100)
    setItems((data as NotificationRow[]) ?? [])
    setLoading(false)
  }, [me])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  useEffect(() => {
    if (!me) return
    const ch = supabase
      .channel('notif-page:' + me)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + me }, (payload) => {
        const row = payload.new as NotificationRow
        setItems((prev) => (prev.some((n) => n.id === row.id) ? prev : [row, ...prev]))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [me])

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
    await supabase.rpc('mark_all_notifications_read')
    await useChatStore.getState().refreshUnread()
  }

  const dismiss = async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id))
    await supabase.from('notifications').delete().eq('id', id)
    await useChatStore.getState().refreshUnread()
  }

  const clearAll = async () => {
    if (!me || !items.length) return
    if (!confirm('Clear all notifications? This removes them from this list.')) return
    setItems([])
    await supabase.from('notifications').delete().eq('user_id', me)
    await useChatStore.getState().refreshUnread()
  }

  const openNotification = async (n: NotificationRow) => {
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
      await useChatStore.getState().refreshUnread()
    }
    if (n.link) navigate(n.link)
  }

  if (loading) return <FullPageLoader label="Loading notifications…" />

  const unreadCount = items.filter((n) => !n.is_read).length

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        icon={<Bell className="h-5 w-5" />}
        actions={
          items.length > 0 ? (
            <div className="flex items-center gap-1">
              <button onClick={markAllRead} disabled={unreadCount === 0} className="btn-ghost px-2.5 py-1.5 text-sm disabled:opacity-40" title="Mark all as read">
                <CheckCheck className="h-4 w-4" /> <span className="hidden sm:inline">Mark all read</span>
              </button>
              <button onClick={clearAll} className="btn-ghost px-2.5 py-1.5 text-sm text-slate-400 hover:text-red-300" title="Clear all notifications">
                <Trash className="h-4 w-4" /> <span className="hidden sm:inline">Clear all</span>
              </button>
            </div>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {items.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-8 w-8" />}
            title="You're all caught up"
            body="Mentions, messages, replies and alerts show up here — newest first."
          />
        ) : (
          <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
            {items.map((n) => {
              const meta = TYPE_META[n.type] ?? TYPE_META.system
              const Icon = meta.icon
              const actor = n.actor_id ? profilesById[n.actor_id] : undefined
              const unread = !n.is_read
              return (
                <div
                  key={n.id}
                  className={cn(
                    'group relative flex items-start gap-3 border-l-2 border-b border-white/5 px-3 py-3 transition',
                    unread ? 'border-l-gold-400 bg-gold-400/[0.06]' : 'border-l-transparent hover:bg-white/[0.03]',
                  )}
                >
                  <button onClick={() => openNotification(n)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                    {actor ? (
                      <Avatar profile={actor} size="sm" />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                        <Icon className={cn('h-4 w-4', meta.tint)} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className={cn('h-3 w-3 shrink-0', meta.tint)} />
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{meta.label}</span>
                        <span className="text-[11px] text-slate-500">· {timeAgo(n.created_at)}</span>
                        {unread && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-gold-400" />}
                      </div>
                      <p className={cn('mt-0.5 text-sm', unread ? 'font-semibold text-white' : 'text-slate-200')}>{n.title}</p>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{n.body}</p>}
                    </div>
                  </button>
                  <button
                    onClick={() => dismiss(n.id)}
                    title="Dismiss"
                    aria-label="Dismiss notification"
                    className="shrink-0 rounded-lg p-1.5 text-slate-500 opacity-60 hover:bg-white/10 hover:text-white focus:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
