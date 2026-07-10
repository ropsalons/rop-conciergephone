import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { Avatar } from '@/components/ui/Avatar'
import { UnreadBadge } from '@/components/ui/Badge'
import {
  Hash, Lock, Megaphone, Home, MessageSquare, Users, Search, Bell, Plus,
  Star, LifeBuoy, GraduationCap, Calendar, ClipboardList, AlertTriangle, Shield, Settings,
} from '@/components/ui/Icons'
import { conversationName, otherMembers } from '@/lib/dm'
import { cn } from '@/lib/utils'
import { APP_NAME, isAdmin } from '@/lib/constants'
import { APP_VERSION } from '@/lib/version'
import { CreateChannelModal } from '@/components/channels/CreateChannelModal'
import { BrowseChannelsModal } from '@/components/channels/BrowseChannelsModal'
import { NewDMModal } from '@/components/dms/NewDMModal'

function ChannelIcon({ type, className }: { type: string; className?: string }) {
  if (type === 'private' || type === 'admin') return <Lock className={className} />
  if (type === 'announcement') return <Megaphone className={className} />
  return <Hash className={className} />
}

const NAV_LINK = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition'
const active = 'bg-brand-500/25 text-white'
const idle = 'text-slate-300 hover:bg-white/5 hover:text-white'

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, signOut } = useAuthStore()
  const me = profile?.id
  const { channels, conversations, unreadByChannel, unreadByConversation, notificationsCount } =
    useChatStore()
  const setSearchOpen = useUIStore((s) => s.setSearchOpen)
  const setHelpOpen = useUIStore((s) => s.setHelpOpen)
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [showBrowse, setShowBrowse] = useState(false)
  const [showNewDM, setShowNewDM] = useState(false)

  const go = () => onNavigate?.()

  const salonLinks = [
    { to: '/announcements', label: 'Announcements', icon: Megaphone },
    { to: '/alerts', label: 'Urgent Alerts', icon: AlertTriangle },
    { to: '/huddle', label: 'Daily Huddle', icon: ClipboardList },
    { to: '/shoutouts', label: 'Shoutouts', icon: Star },
    { to: '/recovery', label: 'Guest Recovery', icon: LifeBuoy },
    { to: '/education', label: 'Education', icon: GraduationCap },
    { to: '/scheduling', label: 'Scheduling', icon: Calendar },
  ]

  return (
    <div className="flex h-full flex-col bg-brand-900/95">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-800 text-lg font-black text-gold-400">
          R
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{APP_NAME}</p>
          <p className="truncate text-[11px] text-slate-400">Robert of Philadelphia</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 pb-4">
        {/* Primary */}
        <div className="space-y-0.5">
          <NavLink to="/" end onClick={go} className={({ isActive }) => cn(NAV_LINK, isActive ? active : idle)}>
            <Home className="h-4 w-4" /> Home
          </NavLink>
          <button onClick={() => { setSearchOpen(true); go() }} className={cn(NAV_LINK, idle, 'w-full')}>
            <Search className="h-4 w-4" /> Search
          </button>
          <NavLink to="/notifications" onClick={go} className={({ isActive }) => cn(NAV_LINK, isActive ? active : idle)}>
            <Bell className="h-4 w-4" /> <span className="flex-1">Notifications</span>
            <UnreadBadge count={notificationsCount} />
          </NavLink>
          <NavLink to="/people" onClick={go} className={({ isActive }) => cn(NAV_LINK, isActive ? active : idle)}>
            <Users className="h-4 w-4" /> People
          </NavLink>
          <button onClick={() => { setHelpOpen(true); go() }} className={cn(NAV_LINK, idle, 'w-full')}>
            <LifeBuoy className="h-4 w-4" /> Help &amp; Guide
          </button>
        </div>

        {/* Salon */}
        <div>
          <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Salon</p>
          <div className="space-y-0.5">
            {salonLinks.map((l) => (
              <NavLink key={l.to} to={l.to} onClick={go} className={({ isActive }) => cn(NAV_LINK, isActive ? active : idle)}>
                <l.icon className="h-4 w-4" /> {l.label}
              </NavLink>
            ))}
          </div>
        </div>

        {/* Channels */}
        <div>
          <div className="flex items-center justify-between px-3 pb-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Channels</p>
            <div className="flex gap-1">
              <button title="Browse channels" onClick={() => setShowBrowse(true)} className="text-slate-400 hover:text-white">
                <Search className="h-3.5 w-3.5" />
              </button>
              <button title="Create channel" onClick={() => setShowCreate(true)} className="text-slate-400 hover:text-white">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="space-y-0.5">
            {channels.map((c) => {
              const unread = unreadByChannel[c.id] ?? 0
              return (
                <NavLink
                  key={c.id}
                  to={`/channel/${c.id}`}
                  onClick={go}
                  className={({ isActive }) => cn(NAV_LINK, 'py-1.5', isActive ? active : idle)}
                >
                  <ChannelIcon type={c.type} className="h-4 w-4 shrink-0 opacity-70" />
                  <span className={cn('flex-1 truncate', !!unread && 'font-semibold text-white')}>{c.name}</span>
                  <UnreadBadge count={c.is_muted ? 0 : unread} />
                </NavLink>
              )
            })}
            {channels.length === 0 && <p className="px-3 py-1 text-xs text-slate-500">No channels yet.</p>}
          </div>
        </div>

        {/* Direct messages */}
        <div>
          <div className="flex items-center justify-between px-3 pb-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Direct Messages</p>
            <button title="New message" onClick={() => setShowNewDM(true)} className="text-slate-400 hover:text-white">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-0.5">
            {conversations.slice(0, 15).map((c) => {
              const unread = unreadByConversation[c.id] ?? 0
              const others = otherMembers(c, me)
              return (
                <NavLink
                  key={c.id}
                  to={`/dm/${c.id}`}
                  onClick={go}
                  className={({ isActive }) => cn(NAV_LINK, 'py-1.5', isActive ? active : idle)}
                >
                  {others[0] ? (
                    <Avatar profile={others[0]} size="xs" showPresence={!c.is_group} />
                  ) : (
                    <MessageSquare className="h-4 w-4" />
                  )}
                  <span className={cn('flex-1 truncate', !!unread && 'font-semibold text-white')}>
                    {conversationName(c, me)}
                  </span>
                  <UnreadBadge count={c.is_muted ? 0 : unread} />
                </NavLink>
              )
            })}
            {conversations.length === 0 && (
              <p className="px-3 py-1 text-xs text-slate-500">Start a conversation.</p>
            )}
          </div>
        </div>

        {isAdmin(profile?.role) && (
          <NavLink to="/admin" onClick={go} className={({ isActive }) => cn(NAV_LINK, isActive ? active : idle)}>
            <Shield className="h-4 w-4" /> Admin Panel
          </NavLink>
        )}

        <button
          onClick={() => { setHelpOpen(true); go() }}
          className="w-full px-3 pt-2 text-left text-[11px] text-slate-500 hover:text-slate-300"
          title="View version history"
        >
          {APP_NAME} v{APP_VERSION} · What&apos;s new
        </button>
      </nav>

      {/* User footer */}
      <div className="flex items-center gap-2 border-t border-white/10 p-3">
        <button onClick={() => { navigate('/profile'); go() }} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1 hover:bg-white/5">
          <Avatar profile={profile} size="sm" showPresence />
          <div className="min-w-0 text-left">
            <p className="truncate text-sm font-semibold text-white">{profile?.display_name || profile?.full_name}</p>
            <p className="truncate text-[11px] capitalize text-slate-400">{profile?.role}</p>
          </div>
        </button>
        <button title="Profile & settings" onClick={() => { navigate('/profile'); go() }} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white">
          <Settings className="h-4 w-4" />
        </button>
        <button title="Sign out" onClick={signOut} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
        </button>
      </div>

      <CreateChannelModal open={showCreate} onClose={() => setShowCreate(false)} />
      <BrowseChannelsModal open={showBrowse} onClose={() => setShowBrowse(false)} />
      <NewDMModal open={showNewDM} onClose={() => setShowNewDM(false)} />
    </div>
  )
}
