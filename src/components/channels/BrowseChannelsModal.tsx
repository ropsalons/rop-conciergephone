import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { Modal } from '@/components/ui/Modal'
import { Hash, Lock, Megaphone, Search } from '@/components/ui/Icons'
import type { ChannelRow } from '@/types'

export function BrowseChannelsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useAuthStore((s) => s.user?.id)
  const navigate = useNavigate()
  const joined = useChatStore((s) => s.channels)
  const [all, setAll] = useState<ChannelRow[]>([])
  const [q, setQ] = useState('')
  const joinedIds = useMemo(() => new Set(joined.map((c) => c.id)), [joined])

  useEffect(() => {
    if (!open) return
    supabase
      .from('channels')
      .select('*')
      .eq('is_archived', false)
      .order('name')
      .then(({ data }) => setAll((data as ChannelRow[]) ?? []))
  }, [open])

  const filtered = all.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))

  async function join(c: ChannelRow) {
    if (!me) return
    await supabase.from('channel_members').insert({ channel_id: c.id, user_id: me } as any)
    await useChatStore.getState().loadSidebar()
    onClose()
    navigate(`/channel/${c.id}`)
  }

  return (
    <Modal open={open} onClose={onClose} title="Browse channels">
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/10 bg-brand-900 px-3">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          className="flex-1 bg-transparent py-2 text-sm focus:outline-none"
          placeholder="Search channels"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>
      <div className="space-y-1">
        {filtered.map((c) => {
          const Icon = c.type === 'private' || c.type === 'admin' ? Lock : c.type === 'announcement' ? Megaphone : Hash
          const isJoined = joinedIds.has(c.id)
          return (
            <div key={c.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
              <Icon className="h-4 w-4 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{c.name}</p>
                {c.description && <p className="truncate text-[11px] text-slate-400">{c.description}</p>}
              </div>
              {isJoined ? (
                <button onClick={() => { onClose(); navigate(`/channel/${c.id}`) }} className="btn-ghost px-3 py-1 text-xs">
                  Open
                </button>
              ) : (
                <button onClick={() => join(c)} className="btn-primary px-3 py-1 text-xs">Join</button>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && <p className="px-2 py-4 text-center text-sm text-slate-500">No channels found.</p>}
      </div>
    </Modal>
  )
}
