import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useChatStore } from '@/stores/chatStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { UnreadBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/Feedback'
import { Hash, Lock, Megaphone, Search, Plus, Star } from '@/components/ui/Icons'
import { BrowseChannelsModal } from '@/components/channels/BrowseChannelsModal'
import { CreateChannelModal } from '@/components/channels/CreateChannelModal'
import { cn } from '@/lib/utils'
import type { ChannelWithMeta } from '@/types'

function TypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = type === 'private' || type === 'admin' ? Lock : type === 'announcement' ? Megaphone : Hash
  return <Icon className={className} />
}

// Slack-style "Channels" home for mobile: a full-screen list of the channels you're in.
export function ChannelsHomePage() {
  const channels = useChatStore((s) => s.channels)
  const unreadByChannel = useChatStore((s) => s.unreadByChannel)
  const [q, setQ] = useState('')
  const [browse, setBrowse] = useState(false)
  const [create, setCreate] = useState(false)

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return channels.filter((c) => !query || c.name?.toLowerCase().includes(query))
  }, [channels, q])

  const favorites = filtered.filter((c) => c.is_favorite)
  const rest = filtered.filter((c) => !c.is_favorite)

  const Row = (c: ChannelWithMeta) => {
    const unread = c.is_muted ? 0 : unreadByChannel[c.id] ?? 0
    return (
      <NavLink
        key={c.id}
        to={`/channel/${c.id}`}
        className={({ isActive }) =>
          cn('flex items-center gap-3 rounded-xl px-3 py-3 active:bg-white/10', isActive ? 'bg-white/10' : 'hover:bg-white/5')
        }
      >
        <TypeIcon type={c.type} className="h-5 w-5 shrink-0 text-slate-400" />
        <span className={cn('min-w-0 flex-1 truncate text-[15px]', unread ? 'font-semibold text-white' : 'text-slate-200')}>
          {c.name}
        </span>
        {c.is_favorite && <Star className="h-3.5 w-3.5 text-gold-400" fill="currentColor" />}
        <UnreadBadge count={unread} />
      </NavLink>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Channels"
        icon={<Hash className="h-5 w-5" />}
        actions={
          <>
            <button onClick={() => setBrowse(true)} title="Browse all channels" className="rounded-lg p-2 text-slate-300 hover:bg-white/10">
              <Search className="h-5 w-5" />
            </button>
            <button onClick={() => setCreate(true)} title="Create channel" className="rounded-lg p-2 text-slate-300 hover:bg-white/10">
              <Plus className="h-5 w-5" />
            </button>
          </>
        }
      />

      <div className="border-b border-white/10 p-2">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-brand-900 px-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            className="flex-1 bg-transparent py-2.5 text-sm focus:outline-none"
            placeholder="Filter channels…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {favorites.length > 0 && (
          <>
            <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Favorites</p>
            <div className="mb-2">{favorites.map(Row)}</div>
          </>
        )}
        {rest.length > 0 && (
          <>
            {favorites.length > 0 && (
              <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Channels</p>
            )}
            <div>{rest.map(Row)}</div>
          </>
        )}
        {filtered.length === 0 && (
          <EmptyState
            icon={<Hash className="h-8 w-8" />}
            title={q ? 'No channels match' : 'No channels yet'}
            body={q ? undefined : 'Tap the search icon above to browse and join channels.'}
          />
        )}
        <button
          onClick={() => setBrowse(true)}
          className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-slate-400 hover:bg-white/5"
        >
          <Search className="h-5 w-5" /> Browse all channels
        </button>
      </div>

      <BrowseChannelsModal open={browse} onClose={() => setBrowse(false)} />
      <CreateChannelModal open={create} onClose={() => setCreate(false)} />
    </div>
  )
}
