import { useCallback, useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { Dot } from '@/components/ui/Badge'
import { FullPageLoader, EmptyState } from '@/components/ui/Feedback'
import {
  Bell,
  MessageSquare,
  Megaphone,
  AlertTriangle,
  Smile,
  Reply,
  Hash,
  CheckCheck,
} from '@/components/ui/Icons'
import { timeAgo } from '@/lib/utils'
import type { NotificationRow, NotificationType } from '@/types'

const TYPE_META: Record<
  NotificationType,
  { label: string; icon: ComponentType<{ className?: string }>; tint: string }
> = {
  urgent: { label: 'Urgent alerts', icon: AlertTriangle, tint: 'text-red-400' },
  mention: { label: 'Mentions', icon: Hash, tint: 'text-brand-200' },
  dm: { label: 'Direct messages', icon: MessageSquare, tint: 'text-brand-200' },
  thread_reply: { label: 'Thread replies', icon: Reply, tint: 'text-sky-300' },
  reaction: { label: 'Reactions', icon: Smile, tint: 'text-gold-300' },
  announcement: { label: 'Announcements', icon: Megaphone, tint: 'text-brand-200' },
  channel_invite: { label: 'Channel invites', icon: Hash, tint: 'text-emerald-300' },
  system: { label: 'System', icon: Bell, tint: 'text-slate-300' },
}

// Order groups are rendered in.
const TYPE_ORDER: NotificationType[] = [
  'urgent',
  'mention',
  'dm',
  'thread_reply',
  'reaction',
  'announcement',
  'channel_invite',
  'system',
]

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

  // Live-prepend new notifications for this user.
  useEffect(() => {
    if (!me) return
    const ch = supabase
      .channel('notif-page:' + me)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + me },
        (payload) => {
          const row = payload.new as NotificationRow
          setItems((prev) => (prev.some((n) => n.id === row.id) ? prev : [row, ...prev]))
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [me])

  const markAllRead = async () => {
    await supabase.rpc('mark_all_notifications_read')
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
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

  const hasUnread = items.some((n) => !n.is_read)

  // Group by type, preserving created_at desc order within each group.
  const groups = TYPE_ORDER.map((type) => ({
    type,
    rows: items.filter((n) => n.type === type),
  })).filter((g) => g.rows.length > 0)

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Notifications"
        icon={<Bell className="h-5 w-5" />}
        actions={
          items.length > 0 ? (
            <button
              onClick={markAllRead}
              disabled={!hasUnread}
              className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-40"
            >
              <CheckCheck className="h-4 w-4" /> Mark all read
            </button>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-8 w-8" />}
            title="You're all caught up"
            body="Notifications about mentions, messages, and announcements will show up here."
          />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-5">
            {groups.map(({ type, rows }) => {
              const meta = TYPE_META[type]
              const Icon = meta.icon
              return (
                <section key={type}>
                  <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <Icon className={`h-4 w-4 ${meta.tint}`} />
                    {meta.label}
                  </h2>
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/5">
                    {rows.map((n) => {
                      const actor = n.actor_id ? profilesById[n.actor_id] : undefined
                      return (
                        <button
                          key={n.id}
                          onClick={() => openNotification(n)}
                          className={`flex w-full items-start gap-3 px-3 py-3 text-left transition hover:bg-white/5 ${
                            n.is_read ? '' : 'bg-brand-500/10'
                          }`}
                        >
                          {actor ? (
                            <Avatar profile={actor} size="sm" />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                              <Icon className={`h-4 w-4 ${meta.tint}`} />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-white">{n.title}</p>
                            {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{n.body}</p>}
                            <p className="mt-1 text-[11px] text-slate-500">{timeAgo(n.created_at)}</p>
                          </div>
                          {!n.is_read && <Dot className="mt-2 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
