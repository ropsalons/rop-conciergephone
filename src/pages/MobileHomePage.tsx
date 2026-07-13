import { useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { Avatar } from '@/components/ui/Avatar'
import { UnreadBadge } from '@/components/ui/Badge'
import { Hash, Lock, Megaphone, Star, Search, Settings, Sparkles, MessageSquare } from '@/components/ui/Icons'
import { conversationName, otherMembers } from '@/lib/dm'
import { cn } from '@/lib/utils'
import type { ChannelWithMeta } from '@/types'

function TypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = type === 'private' || type === 'admin' ? Lock : type === 'announcement' ? Megaphone : Hash
  return <Icon className={className} />
}

// Slack-style mobile Home: workspace header (with Settings), then Starred, Channels and DMs
// stacked in one scroll — mirroring the Slack app's Home tab.
export function MobileHomePage() {
  const navigate = useNavigate()
  const me = useAuthStore((s) => s.user?.id)
  const profile = useAuthStore((s) => s.profile)
  const channels = useChatStore((s) => s.channels)
  const conversations = useChatStore((s) => s.conversations)
  const unreadByChannel = useChatStore((s) => s.unreadByChannel)
  const unreadByConversation = useChatStore((s) => s.unreadByConversation)

  const favorites = useMemo(() => channels.filter((c) => c.is_favorite), [channels])
  const rest = useMemo(() => channels.filter((c) => !c.is_favorite), [channels])
  const unreadDMs = useMemo(
    () => conversations.filter((c) => !c.is_muted && (unreadByConversation[c.id] ?? 0) > 0),
    [conversations, unreadByConversation],
  )

  const ChannelRow = (c: ChannelWithMeta) => {
    const unread = c.is_muted ? 0 : unreadByChannel[c.id] ?? 0
    return (
      <NavLink
        key={c.id}
        to={`/channel/${c.id}`}
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 active:bg-white/10"
      >
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
      <NavLink
        key={c.id}
        to={`/dm/${c.id}`}
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 active:bg-white/10"
      >
        {others[0] ? <Avatar profile={others[0]} size="sm" showPresence={!c.is_group} /> : <MessageSquare className="h-5 w-5 text-slate-400" />}
        <span className={cn('min-w-0 flex-1 truncate text-[15px]', unread ? 'font-semibold text-white' : 'text-slate-200')}>
          {conversationName(c, me)}
        </span>
        <UnreadBadge count={unread} />
      </NavLink>
    )
  }

  const SectionLabel = ({ children }: { children: string }) => (
    <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">{children}</p>
  )

  return (
    <div className="flex h-full flex-col">
      {/* Workspace header — matches Slack: brand left, Settings + avatar right. */}
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
        {/* Quick tiles — puts the salon Dashboard and Settings one tap away. */}
        <div className="grid grid-cols-2 gap-2 px-1 pt-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-brand-900 px-3 py-3 text-left active:bg-white/5"
          >
            <Sparkles className="h-5 w-5 text-gold-400" />
            <span className="text-sm font-semibold text-white">Salon Dashboard</span>
          </button>
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-brand-900 px-3 py-3 text-left active:bg-white/5"
          >
            <Settings className="h-5 w-5 text-gold-400" />
            <span className="text-sm font-semibold text-white">Settings</span>
          </button>
        </div>

        {unreadDMs.length > 0 && (
          <>
            <SectionLabel>Unread DMs</SectionLabel>
            <div>{unreadDMs.map(DMRow)}</div>
          </>
        )}

        {favorites.length > 0 && (
          <>
            <SectionLabel>Starred</SectionLabel>
            <div>{favorites.map(ChannelRow)}</div>
          </>
        )}

        <SectionLabel>Channels</SectionLabel>
        {rest.length > 0 ? <div>{rest.map(ChannelRow)}</div> : <p className="px-3 py-1 text-sm text-slate-500">No channels yet.</p>}

        <SectionLabel>Direct Messages</SectionLabel>
        {conversations.length > 0 ? (
          <div>{conversations.slice(0, 20).map(DMRow)}</div>
        ) : (
          <NavLink to="/dms" className="block px-3 py-2 text-sm text-brand-300">Start a conversation →</NavLink>
        )}
      </div>
    </div>
  )
}
