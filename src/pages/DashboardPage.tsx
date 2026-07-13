import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useChatStore } from '@/stores/chatStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { UnreadBadge, Tag } from '@/components/ui/Badge'
import { FullPageLoader } from '@/components/ui/Feedback'
import {
  AlertTriangle,
  Megaphone,
  Star,
  LifeBuoy,
  Calendar,
  Hash,
  MessageSquare,
  ChevronLeft,
} from '@/components/ui/Icons'
import { SHOUTOUT_CATEGORIES } from '@/lib/constants'
import { displayName, timeAgo, cn } from '@/lib/utils'
import type { UrgentAlertRow, AnnouncementRow, ShoutoutRow } from '@/types'

const CATEGORY_EMOJI: Record<string, string> = Object.fromEntries(
  SHOUTOUT_CATEGORIES.map((c) => [c.key, c.emoji]),
)

const QUICK_ACTIONS = [
  { key: 'shoutout', label: 'New Shoutout', to: '/shoutouts', Icon: Star, tint: 'text-gold-300' },
  { key: 'recovery', label: 'Guest Recovery', to: '/recovery', Icon: LifeBuoy, tint: 'text-emerald-300' },
  { key: 'scheduling', label: 'Scheduling', to: '/scheduling', Icon: Calendar, tint: 'text-purple-300' },
] as const

function SectionCard({
  title,
  icon,
  onSeeAll,
  seeAllLabel = 'See all',
  children,
}: {
  title: string
  icon?: ReactNode
  onSeeAll?: () => void
  seeAllLabel?: string
  children: ReactNode
}) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          {icon}
          {title}
        </h2>
        {onSeeAll && (
          <button onClick={onSeeAll} className="text-xs font-medium text-brand-200 hover:text-brand-100">
            {seeAllLabel}
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const locations = useDirectoryStore((s) => s.locations)
  const profilesById = useDirectoryStore((s) => s.profilesById)
  const channels = useChatStore((s) => s.channels)
  const conversations = useChatStore((s) => s.conversations)
  const unreadByChannel = useChatStore((s) => s.unreadByChannel)
  const unreadByConversation = useChatStore((s) => s.unreadByConversation)

  const [alerts, setAlerts] = useState<UrgentAlertRow[]>([])
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([])
  const [shoutouts, setShoutouts] = useState<ShoutoutRow[]>([])
  const [loading, setLoading] = useState(true)

  const firstName = useMemo(() => displayName(profile).split(/\s+/)[0], [profile])
  const greeting = useMemo(() => {
    const h = new Date().getHours()
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  }, [])
  const locationName = useMemo(
    () => locations.find((l) => l.id === profile?.location_id)?.name ?? null,
    [locations, profile?.location_id],
  )

  useEffect(() => {
    let active = true
    async function load() {
      const nowIso = new Date().toISOString()
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

      const alertsQ = supabase
        .from('urgent_alerts')
        .select('*')
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order('created_at', { ascending: false })
        .limit(5)

      const announcementsQ = supabase
        .from('announcements')
        .select('*')
        .or(`is_pinned.eq.true,created_at.gte.${threeDaysAgo}`)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5)

      const shoutoutsQ = supabase
        .from('shoutouts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5)

      const [alertsRes, annRes, shoutRes] = await Promise.all([alertsQ, announcementsQ, shoutoutsQ])

      if (!active) return
      setAlerts((alertsRes.data as UrgentAlertRow[]) ?? [])
      setAnnouncements((annRes.data as AnnouncementRow[]) ?? [])
      setShoutouts((shoutRes.data as ShoutoutRow[]) ?? [])
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [profile?.location_id])

  const unreadChannels = useMemo(
    () => channels.filter((c) => (unreadByChannel[c.id] ?? 0) > 0 && !c.is_muted),
    [channels, unreadByChannel],
  )
  const unreadConversations = useMemo(
    () => conversations.filter((c) => (unreadByConversation[c.id] ?? 0) > 0 && !c.is_muted),
    [conversations, unreadByConversation],
  )
  const totalUnreadDMs = useMemo(
    () => unreadConversations.reduce((sum, c) => sum + (unreadByConversation[c.id] ?? 0), 0),
    [unreadConversations, unreadByConversation],
  )
  const totalUnreadChannels = useMemo(
    () => unreadChannels.reduce((sum, c) => sum + (unreadByChannel[c.id] ?? 0), 0),
    [unreadChannels, unreadByChannel],
  )
  const hasUnread = totalUnreadDMs + totalUnreadChannels > 0

  if (loading) return <FullPageLoader label="Loading your day…" />

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Home" />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {/* Greeting */}
          <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-5 shadow-lg ring-1 ring-white/10">
            <div className="flex items-center gap-3">
              {profile && <Avatar profile={profile} size="lg" />}
              <div className="min-w-0">
                <p className="text-lg font-bold text-white">
                  {greeting}, {firstName}
                </p>
                <p className="mt-0.5 text-xs text-brand-100/80">
                  {locationName ? `${locationName} · ` : ''}
                  {new Date().toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* Urgent alerts */}
          {alerts.length > 0 && (
            <SectionCard
              title="Urgent alerts"
              icon={<AlertTriangle className="h-4 w-4 text-red-400" />}
              onSeeAll={() => navigate('/alerts')}
            >
              <div className="space-y-2">
                {alerts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => navigate('/alerts')}
                    className="flex w-full items-start gap-3 rounded-xl border border-red-500/50 bg-red-950/40 p-3 text-left transition hover:bg-red-900/40"
                  >
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">{a.title}</p>
                        {a.severity === 'critical' && <Tag tone="red">Critical</Tag>}
                      </div>
                      {a.body && <p className="mt-0.5 line-clamp-2 text-xs text-red-100/80">{a.body}</p>}
                      <p className="mt-1 text-[11px] text-red-200/60">{timeAgo(a.created_at)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Salon quick actions */}
          <SectionCard title="Salon actions">
            <div className="grid grid-cols-3 gap-2">
              {QUICK_ACTIONS.map(({ key, label, to, Icon, tint }) => (
                <button
                  key={key}
                  onClick={() => navigate(to)}
                  className="flex flex-col items-center gap-1.5 rounded-xl bg-white/5 p-3 text-center transition hover:bg-white/10"
                >
                  <Icon className={cn('h-6 w-6', tint)} />
                  <span className="text-[11px] font-medium leading-tight text-slate-200">{label}</span>
                </button>
              ))}
            </div>
          </SectionCard>

          {/* Announcements */}
          {announcements.length > 0 && (
            <SectionCard
              title="Announcements"
              icon={<Megaphone className="h-4 w-4 text-brand-200" />}
              onSeeAll={() => navigate('/announcements')}
            >
              <div className="space-y-2">
                {announcements.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => navigate('/announcements')}
                    className="flex w-full items-start gap-3 rounded-xl bg-white/5 p-3 text-left transition hover:bg-white/10"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">{a.title}</p>
                        {a.is_pinned && <Tag tone="gold">Pinned</Tag>}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{a.body}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{timeAgo(a.created_at)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Unread */}
          {hasUnread && (
            <SectionCard title="Unread" icon={<MessageSquare className="h-4 w-4 text-brand-200" />}>
              <div className="space-y-1">
                {unreadChannels.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/channel/${c.id}`)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/5"
                  >
                    <Hash className="h-4 w-4 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{c.name}</span>
                    <UnreadBadge count={unreadByChannel[c.id]} />
                  </button>
                ))}
                {unreadConversations.map((c) => {
                  const others = (c.members ?? []).filter((m) => m.id !== profile?.id)
                  const name = c.title || others.map((m) => displayName(m)).join(', ') || 'Direct message'
                  return (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/dm/${c.id}`)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/5"
                    >
                      {others[0] ? (
                        <Avatar profile={others[0]} size="xs" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-slate-400" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{name}</span>
                      <UnreadBadge count={unreadByConversation[c.id]} />
                    </button>
                  )
                })}
              </div>
            </SectionCard>
          )}

          {/* Recent shoutouts */}
          {shoutouts.length > 0 && (
            <SectionCard
              title="Recent shoutouts"
              icon={<Star className="h-4 w-4 text-gold-300" />}
              onSeeAll={() => navigate('/shoutouts')}
            >
              <div className="space-y-2">
                {shoutouts.map((s) => {
                  const recipient = profilesById[s.recipient_id]
                  const author = profilesById[s.author_id]
                  return (
                    <button
                      key={s.id}
                      onClick={() => navigate('/shoutouts')}
                      className="flex w-full items-start gap-3 rounded-xl bg-white/5 p-3 text-left transition hover:bg-white/10"
                    >
                      <span className="text-xl leading-none">{CATEGORY_EMOJI[s.category] ?? '🎉'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white">
                          <span className="font-semibold">{displayName(recipient)}</span>
                          <span className="text-slate-400"> · from {displayName(author)}</span>
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-300">{s.message}</p>
                        <p className="mt-1 text-[11px] text-slate-500">{timeAgo(s.created_at)}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </SectionCard>
          )}

          <button
            onClick={() => navigate('/dms')}
            className="flex items-center justify-center gap-1 py-2 text-xs text-slate-500 hover:text-slate-300"
          >
            <ChevronLeft className="h-3 w-3 rotate-180" />
            Go to messages
          </button>
        </div>
      </div>
    </div>
  )
}
