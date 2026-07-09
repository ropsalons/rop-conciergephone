import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { Search, Check } from '@/components/ui/Icons'
import { displayName } from '@/lib/utils'

export function NewDMModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useAuthStore((s) => s.user?.id)
  const profiles = useDirectoryStore((s) => s.profiles)
  const toast = useUIStore((s) => s.toast)
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const candidates = useMemo(
    () =>
      profiles
        .filter((p) => p.id !== me && p.is_active)
        .filter((p) => displayName(p).toLowerCase().includes(q.toLowerCase())),
    [profiles, me, q],
  )

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function start() {
    if (selected.length === 0) return
    setBusy(true)
    try {
      let convId: string | null = null
      if (selected.length === 1) {
        const { data, error } = await supabase.rpc('get_or_create_dm', { other_user: selected[0] })
        if (error) throw error
        convId = data as string
      } else {
        const { data, error } = await supabase.rpc('create_group_dm', { member_ids: selected, group_title: null })
        if (error) throw error
        convId = data as string
      }
      await useChatStore.getState().loadSidebar()
      onClose()
      setSelected([])
      setQ('')
      if (convId) navigate(`/dm/${convId}`)
    } catch (err: any) {
      toast({ kind: 'error', title: 'Could not start conversation', body: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New message"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || selected.length === 0} onClick={start}>
            {selected.length > 1 ? `Start group (${selected.length})` : 'Start chat'}
          </button>
        </>
      }
    >
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/10 bg-brand-900 px-3">
        <Search className="h-4 w-4 text-slate-400" />
        <input className="flex-1 bg-transparent py-2 text-sm focus:outline-none" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {candidates.map((p) => {
          const on = selected.includes(p.id)
          return (
            <button key={p.id} onClick={() => toggle(p.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/5">
              <Avatar profile={p} size="sm" showPresence />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{displayName(p)}</p>
                <p className="truncate text-[11px] capitalize text-slate-400">{p.role}</p>
              </div>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${on ? 'border-brand-400 bg-brand-500' : 'border-white/20'}`}>
                {on && <Check className="h-3 w-3 text-white" />}
              </span>
            </button>
          )
        })}
        {candidates.length === 0 && <p className="px-2 py-4 text-center text-sm text-slate-500">No people found.</p>}
      </div>
    </Modal>
  )
}
