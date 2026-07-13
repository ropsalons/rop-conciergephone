import { useMemo, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { Avatar } from '@/components/ui/Avatar'
import { UnreadBadge } from '@/components/ui/Badge'
import { Hash, Lock, Megaphone, Star, Search, Settings, Sparkles, MessageSquare, ChevronDown } from '@/components/ui/Icons'
import { conversationName, otherMembers } from '@/lib/dm'
import { cn } from '@/lib/utils'
import type { ChannelWithMeta } from '@/types'

function TypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = type === 'private' || type === 'admin' ? Lock : type === 'announcement' ? Megaphone : Hash
  return <Icon className={className} />
}

// Which Home sections the user has collapsed (persisted so it sticks between visits).
const COLLAPSE_KEY = 'rop.homeCollapsed'
function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}')
  } catch {
    return {}
  }
}
function saveCollapsed(next: Record<string, boolean>) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

// A collapsible section header (tap the row to expand/collapse), like Slack's Home.
function Section({
  id,
  title,
  count,
  unread,
  children,
}: {
  id: string
  title: string
  count?: number
  unread?: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(() => !loadCollapsed()[id])
  const toggle = () => {
    setOpen((prev) => {
      const next = !prev
      const c = loadCollapsed()
      c[id] = !next // store "collapsed" = true when closing
      saveCollapsed(c)
      return next
    })
  }
  return (
    <div className="mb-1">
      <button onClick={toggle} className="flex w-full items-center gap-1.5 px-2 pb-1 pt-3 active:opacity-70">
        <ChevronDown className={cn('h-3.5 w-3.5 text-slate-500 transition-transform', !open && '-rotate-90')} />
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</span>
        {count != null && <span className="text-[11px] font-medium text-slate-600">{count}</span>}
        {!open && unread ? <UnreadBadge count={unread} className="ml-1" /> : null}
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

// Slack-style mobile Home: collapsible Direct Messages (up top), Starred and Channels,
// with channels ordered by most-recent activity.
export function MobileHomePage() {
  const navigate = useNavigate()
  const me = useAuthStore((s) => s.user?.id)
  const profile = useAuthStore((s) => s.profile)
  const channels = useChatStore((s) => s.channels)
  const conversations = useChatStore((s) => s.conversations)
  const unreadByChannel = useChatStore((s) => s.unreadByChannel)
  const unreadByConversation = useChatStore((s) => s.unreadByConversation)

  const favorites = useMemo(
    () =>
      channels
        .filter((c) => c.is_favorite)
        .sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')),
    [channels],
  )
  const restChannels = useMemo(
    () =>
      channels
        .filter((c) => !c.is_favorite)
        .sort((a, b) => {
          const cmp = (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')
          return cmp !== 0 ? cmp : (a.name ?? '').localeCompare(b.name ?? '')
        }),
    [channels],
  )
  const dms = useMemo(
    () =>
      [...conversations].sort((a, b) => {
        const ua = a.is_muted ? 0 : unreadByConversation[a.id] ?? 0
        const ub = b.is_muted ? 0 : unreadByConversation[b.id] ?? 0
        if (!!ua !== !!ub) return ub - ua // unread conversations first
        return (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')
      }),
    [conversations, unreadByConversation],
  )

  const channelUnreadTotal = restChannels.reduce((n, c) => n + (c.is_muted ? 0 : unreadByChannel[c.id] ?? 0), 0)
  const dmUnreadTotal = dms.reduce((n, c) => n + (c.is_muted ? 0 : unreadByConversation[c.id] ?? 0), 0)

  const ChannelRow = (c: ChannelWithMeta) => {
    const unread = c.is_muted ? 0 : unreadByChannel[c.id] ?? 0
    return (
      <NavLink key={c.id} to={`/channel/${c.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 active:bg-white/10">
        <TypeIcon type={c.type} className="h-5 w-5 shrink-0 text-slate-400" />
        <span className={cn('min-w-0 flex-1 truncate text-[15px]', unread ? 'font-semibold text-white' : 'text-slate-200')}>
          {c.name}
        </span>
        {c.is_favorite && <Star className="h-3.5 w-3.5 shrink-0 text-gold-400" fill="currentColor" />}
        <UnreadBadge count={unread} />
      </NavLink>
    )
  }

  const DMRow = (c: (typeof conversations)[number]) => {
    const unread = c.is_muted ? 0 : unreadByConversation[c.id] ?? 0
    const others = otherMembers(c, me)
    return (
      <NavLink key={c.id} to={`/dm/${c.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 active:bg-white/10">
        {others[0] ? <Avatar profile={others[0]} size="sm" showPresence={!c.is_group} /> : <MessageSquare className="h-5 w-5 text-slate-400" />}
        <span className={cn('min-w-0 flex-1 truncate text-[15px]', unread ? 'font-semibold text-white' : 'text-slate-200')}>
          {conversationName(c, me)}
        </span>
        <UnreadBadge count={unread} />
      </NavLink>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Workspace header — brand left, Settings + avatar right (Slack-style). */}
      <header className="safe-top flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-800 text-base font-black text-gold-400">R</div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-bold text-white">ROP Chat</p>
            <p className="truncate text-[11px] text-slate-400">Robert of Philadelphia</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => navigate('/search')} title="Search" className="rounded-lg p-2 text-slate-300 hover:bg-white/10">
            <Search className="h-5 w-5" />
          </button>
          <button onClick={() => navigate('/profile')} title="Settings & notifications" className="rounded-lg p-2 text-slate-300 hover:bg-white/10">
            <Settings className="h-5 w-5" />
          </button>
          <button onClick={() => navigate('/profile')} title="Your profile" aria-label="Your profile" className="ml-0.5">
            <Avatar profile={profile} size="sm" showPresence />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {/* Quick tiles — Dashboard + Settings one tap away. */}
        <div className="grid grid-cols-2 gap-2 px-1 pt-3">
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 rounded-xl border border-white/10 bg-brand-900 px-3 py-3 text-left active:bg-white/5">
            <Sparkles className="h-5 w-5 text-gold-400" />
            <span className="text-sm font-semibold text-white">Salon Dashboard</span>
          </button>
          <button onClick={() => navigate('/profile')} className="flex items-center gap-2 rounded-xl border border-white/10 bg-brand-900 px-3 py-3 text-left active:bg-white/5">
            <Settings className="h-5 w-5 text-gold-400" />
            <span className="text-sm font-semibold text-white">Settings</span>
          </button>
        </div>

        {/* Direct Messages — up top, per request. */}
        <Section id="dms" title="Direct Messages" count={dms.length} unread={dmUnreadTotal}>
          {dms.length > 0 ? (
            dms.map(DMRow)
          ) : (
            <NavLink to="/dms" className="block px-3 py-2 text-sm text-brand-300">Start a conversation →</NavLink>
          )}
        </Section>

        {favorites.length > 0 && (
          <Section id="starred" title="Starred" count={favorites.length}>
            {favorites.map(ChannelRow)}
          </Section>
        )}

        <Section id="channels" title="Channels" count={restChannels.length} unread={channelUnreadTotal}>
          {restChannels.length > 0 ? restChannels.map(ChannelRow) : <p className="px-3 py-1 text-sm text-slate-500">No channels yet.</p>}
        </Section>
      </div>
    </div>
  )
}
