import { useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { Avatar } from '@/components/ui/Avatar'
import { UnreadBadge } from '@/components/ui/Badge'
import {
  Hash, Lock, Megaphone, Home, MessageSquare, Users, Search, Bell, Plus,
  Star, LifeBuoy, Shield, Settings, Calendar, Link as LinkIcon,
  Eye, EyeOff, ArrowUpDown, GripVertical,
} from '@/components/ui/Icons'
import { conversationName, otherMembers } from '@/lib/dm'
import { cn } from '@/lib/utils'
import { APP_NAME, isAdmin } from '@/lib/constants'
import { APP_VERSION } from '@/lib/version'
import { CreateChannelModal } from '@/components/channels/CreateChannelModal'
import { BrowseChannelsModal } from '@/components/channels/BrowseChannelsModal'
import { NewDMModal } from '@/components/dms/NewDMModal'
import type { ChannelWithMeta } from '@/types'

function ChannelIcon({ type, className }: { type: string; className?: string }) {
  if (type === 'private' || type === 'admin') return <Lock className={className} />
  if (type === 'announcement') return <Megaphone className={className} />
  return <Hash className={className} />
}

// One channel row. In manual mode it exposes a drag handle (dnd-kit); otherwise it renders
// exactly like a normal nav row. Tapping the row always navigates; only the ⣿ handle drags.
function ChannelRow({
  c, unread, manual, onNavigate, onToggleFav,
}: {
  c: ChannelWithMeta
  unread: number
  manual: boolean
  onNavigate: () => void
  onToggleFav: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: c.id,
    disabled: !manual,
  })
  const fav = !!c.is_favorite
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group relative flex items-center', isDragging && 'z-10 opacity-80')}
    >
      {manual && (
        <button
          {...attributes}
          {...listeners}
          title="Drag to reorder"
          aria-label="Drag to reorder"
          className="cursor-grab touch-none rounded p-1 text-slate-500 hover:text-slate-300 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <NavLink
        to={`/channel/${c.id}`}
        onClick={onNavigate}
        className={({ isActive }) => cn(NAV_LINK, 'flex-1 py-1.5 pr-8', manual ? 'gap-2 pl-1' : undefined, isActive ? active : idle)}
      >
        <ChannelIcon type={c.type} className="h-4 w-4 shrink-0 opacity-70" />
        <span className={cn('flex-1 truncate', !!unread && 'font-semibold text-white')}>{c.name}</span>
        <UnreadBadge count={c.is_muted ? 0 : unread} />
      </NavLink>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFav() }}
        title={fav ? 'Remove from favorites' : 'Favorite — pin to top'}
        aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
        className={cn(
          'absolute right-1 rounded p-1.5 transition',
          fav
            ? 'text-gold-400 hover:text-gold-300'
            : 'text-slate-500 opacity-60 hover:text-gold-300 focus:opacity-100 lg:opacity-0 lg:group-hover:opacity-100',
        )}
      >
        <Star className="h-4 w-4" {...(fav ? { fill: 'currentColor' } : {})} />
      </button>
    </div>
  )
}

const NAV_LINK = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition'
const active = 'bg-brand-500/25 text-white'
const idle = 'text-slate-300 hover:bg-white/5 hover:text-white'

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, signOut } = useAuthStore()
  const me = profile?.id
  const { channels, conversations, unreadByChannel, unreadByConversation, notificationsCount, toggleFavorite } =
    useChatStore()
  const setSearchOpen = useUIStore((s) => s.setSearchOpen)
  const setHelpOpen = useUIStore((s) => s.setHelpOpen)
  const channelSort = useUIStore((s) => s.channelSort)
  const setChannelSort = useUIStore((s) => s.setChannelSort)
  const hideInactive = useUIStore((s) => s.hideInactive)
  const setHideInactive = useUIStore((s) => s.setHideInactive)
  const channelOrder = useUIStore((s) => s.channelOrder)
  const setChannelOrder = useUIStore((s) => s.setChannelOrder)
  const navigate = useNavigate()

  const manual = channelSort === 'manual'
  // Touch = press-and-hold to drag (so normal scrolling still works); mouse = small move to drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [showCreate, setShowCreate] = useState(false)
  const [showBrowse, setShowBrowse] = useState(false)
  const [showNewDM, setShowNewDM] = useState(false)

  const go = () => onNavigate?.()

  // A channel is "active" if it has any messages, any unread, or is favorited (so favorites
  // and channels you're currently catching up on are never hidden).
  const isActiveChannel = (c: (typeof channels)[number]) =>
    !!c.is_favorite || (unreadByChannel[c.id] ?? 0) > 0 || (c.message_count ?? 0) > 0

  // The full manual ordering of EVERY channel (incl. hidden ones), by the user's saved
  // drag order; channels never dragged fall to the end alphabetically. Used for drag math
  // so hidden channels keep their place when reordering the visible ones.
  const manualOrderIds = useMemo(() => {
    const pos = new Map(channelOrder.map((id, i) => [id, i]))
    return channels
      .slice()
      .sort((a, b) => {
        const pa = pos.has(a.id) ? (pos.get(a.id) as number) : Infinity
        const pb = pos.has(b.id) ? (pos.get(b.id) as number) : Infinity
        if (pa !== pb) return pa - pb
        return (a.name ?? '').localeCompare(b.name ?? '')
      })
      .map((c) => c.id)
  }, [channels, channelOrder])

  // Display list: optional hide-quiet filter, then sort. In manual mode we honor the user's
  // drag order exactly (no favorite-floating). Otherwise favorites float to the top and
  // `channelSort` orders within each group (A–Z, most-recent activity, or most-unread first).
  const visibleChannels = useMemo(() => {
    const list = hideInactive ? channels.filter(isActiveChannel) : channels.slice()
    if (channelSort === 'manual') {
      const pos = new Map(manualOrderIds.map((id, i) => [id, i]))
      list.sort((a, b) => (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity))
      return list
    }
    list.sort((a, b) => {
      if (!!a.is_favorite !== !!b.is_favorite) return a.is_favorite ? -1 : 1
      if (channelSort === 'unread') {
        const ua = unreadByChannel[a.id] ?? 0
        const ub = unreadByChannel[b.id] ?? 0
        if (ua !== ub) return ub - ua
        return (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')
      }
      if (channelSort === 'activity') {
        const cmp = (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')
        if (cmp !== 0) return cmp
      }
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, hideInactive, channelSort, unreadByChannel, manualOrderIds])

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = manualOrderIds.indexOf(String(active.id))
    const to = manualOrderIds.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    setChannelOrder(arrayMove(manualOrderIds, from, to))
  }

  const hiddenCount = channels.length - visibleChannels.length
  const SORT_LABEL: Record<typeof channelSort, string> = {
    name: 'A–Z',
    activity: 'Recent activity',
    unread: 'Unread first',
    manual: 'My order',
  }
  const nextSort = () =>
    setChannelSort(
      channelSort === 'name' ? 'activity'
        : channelSort === 'activity' ? 'unread'
        : channelSort === 'unread' ? 'manual'
        : 'name',
    )

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
          <NavLink to="/dms" onClick={go} className={({ isActive }) => cn(NAV_LINK, isActive ? active : idle)}>
            <MessageSquare className="h-4 w-4" /> <span className="flex-1">Messages</span>
            <UnreadBadge count={Object.values(unreadByConversation).reduce((a, b) => a + b, 0)} />
          </NavLink>
          <NavLink to="/people" onClick={go} className={({ isActive }) => cn(NAV_LINK, isActive ? active : idle)}>
            <Users className="h-4 w-4" /> People
          </NavLink>
          <NavLink to="/events" onClick={go} className={({ isActive }) => cn(NAV_LINK, isActive ? active : idle)}>
            <Calendar className="h-4 w-4" /> Events
          </NavLink>
          <NavLink to="/resources" onClick={go} className={({ isActive }) => cn(NAV_LINK, isActive ? active : idle)}>
            <LinkIcon className="h-4 w-4" /> Resources
          </NavLink>
          <button onClick={() => { setHelpOpen(true); go() }} className={cn(NAV_LINK, idle, 'w-full')}>
            <LifeBuoy className="h-4 w-4" /> Help &amp; Guide
          </button>
        </div>

        {/* Channels */}
        <div>
          <div className="flex items-center justify-between px-3 pb-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Channels</p>
            <div className="flex items-center gap-0.5">
              <button
                title={`Sort: ${SORT_LABEL[channelSort]} — tap to change`}
                onClick={nextSort}
                className="flex items-center gap-1 rounded p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
              >
                <ArrowUpDown className="h-4 w-4" />
                <span className="text-[10px] font-semibold uppercase tracking-wide">{SORT_LABEL[channelSort]}</span>
              </button>
              <button
                title={hideInactive ? 'Showing active channels only — tap to show all' : 'Hide quiet/empty channels'}
                aria-pressed={hideInactive}
                onClick={() => setHideInactive(!hideInactive)}
                className={cn('rounded p-1.5 hover:bg-white/5 hover:text-white', hideInactive ? 'text-gold-400' : 'text-slate-400')}
              >
                {hideInactive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button title="Browse channels" onClick={() => setShowBrowse(true)} className="rounded p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
                <Search className="h-4 w-4" />
              </button>
              <button title="Create channel" onClick={() => setShowCreate(true)} className="rounded p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          {manual && (
            <p className="px-3 pb-1 text-[10px] text-slate-500">Drag the ⣿ handle to reorder. Tap the sort button to switch back.</p>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={visibleChannels.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0.5">
                {visibleChannels.map((c) => (
                  <ChannelRow
                    key={c.id}
                    c={c}
                    unread={unreadByChannel[c.id] ?? 0}
                    manual={manual}
                    onNavigate={go}
                    onToggleFav={() => void toggleFavorite(c.id, !c.is_favorite)}
                  />
                ))}
                {channels.length === 0 && <p className="px-3 py-1 text-xs text-slate-500">No channels yet.</p>}
                {channels.length > 0 && visibleChannels.length === 0 && (
                  <p className="px-3 py-1 text-xs text-slate-500">All channels are quiet right now.</p>
                )}
                {hideInactive && hiddenCount > 0 && (
                  <button
                    onClick={() => setHideInactive(false)}
                    className="w-full px-3 py-1 text-left text-[11px] text-slate-500 hover:text-slate-300"
                  >
                    + Show {hiddenCount} quiet channel{hiddenCount === 1 ? '' : 's'}
                  </button>
                )}
              </div>
            </SortableContext>
          </DndContext>
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
