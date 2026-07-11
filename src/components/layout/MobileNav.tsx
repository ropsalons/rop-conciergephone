import { NavLink, useLocation } from 'react-router-dom'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { Home, Hash, MessageSquare, Bell, Menu } from '@/components/ui/Icons'
import { UnreadBadge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

export function MobileNav() {
  const { pathname } = useLocation()
  const { toggleMobileSidebar } = useUIStore()
  const { channels, conversations, unreadByChannel, unreadByConversation, notificationsCount } = useChatStore()

  const dmUnread = conversations.reduce((n, c) => n + (c.is_muted ? 0 : unreadByConversation[c.id] ?? 0), 0)
  const channelUnread = channels.reduce((n, c) => n + (c.is_muted ? 0 : unreadByChannel[c.id] ?? 0), 0)

  // Full-screen conversation views hide the bottom bar (Slack-style) — the header's back arrow returns.
  const inConversation = /^\/(channel|dm)\//.test(pathname)
  if (inConversation) return null

  const item = 'relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium active:bg-white/5'
  const on = 'text-gold-400 shadow-[inset_0_2px_0_0_#facc15]'
  const off = 'text-slate-400'

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-white/10 bg-brand-900/95 backdrop-blur safe-bottom lg:hidden">
      <NavLink to="/" end className={({ isActive }) => cn(item, isActive ? on : off)}>
        <Home className="h-5 w-5" /> Home
      </NavLink>
      <NavLink to="/channels" className={({ isActive }) => cn(item, isActive ? on : off)}>
        <Hash className="h-5 w-5" />
        {channelUnread > 0 && <UnreadBadge count={channelUnread} className="absolute right-4 top-1" />}
        Channels
      </NavLink>
      <NavLink to="/dms" className={({ isActive }) => cn(item, isActive ? on : off)}>
        <MessageSquare className="h-5 w-5" />
        {dmUnread > 0 && <UnreadBadge count={dmUnread} className="absolute right-5 top-1" />}
        DMs
      </NavLink>
      <NavLink to="/notifications" className={({ isActive }) => cn(item, isActive ? on : off)}>
        <Bell className="h-5 w-5" />
        {notificationsCount > 0 && <UnreadBadge count={notificationsCount} className="absolute right-4 top-1" />}
        Activity
      </NavLink>
      <button onClick={toggleMobileSidebar} className={cn(item, off)}>
        <Menu className="h-5 w-5" /> Menu
      </button>
    </nav>
  )
}
