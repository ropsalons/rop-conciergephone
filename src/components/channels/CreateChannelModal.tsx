import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Feedback'
import { canManage } from '@/lib/constants'

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

export function CreateChannelModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, profile } = useAuthStore()
  const toast = useUIStore((s) => s.toast)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'public' | 'private'>('public')
  const [saving, setSaving] = useState(false)

  async function create() {
    if (!name.trim() || !user) return
    setSaving(true)
    const slug = slugify(name) || `channel-${Date.now()}`
    const { data, error } = await supabase
      .from('channels')
      .insert({ slug, name: name.trim(), description: description.trim() || null, type, created_by: user.id } as any)
      .select('*')
      .single()
    if (error || !data) {
      toast({ kind: 'error', title: 'Could not create channel', body: error?.message })
      setSaving(false)
      return
    }
    // Creator becomes a channel admin/member.
    await supabase.from('channel_members').insert({ channel_id: data.id, user_id: user.id, role: 'admin' } as any)
    await useChatStore.getState().loadSidebar()
    setSaving(false)
    setName('')
    setDescription('')
    onClose()
    navigate(`/channel/${data.id}`)
    toast({ kind: 'success', title: `#${data.name} created` })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a channel"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={create} disabled={saving || !name.trim()}>
            {saving ? <Spinner className="h-4 w-4" /> : 'Create'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. summer-promotions" autoFocus />
          {name && <p className="mt-1 text-[11px] text-slate-500">Will be created as #{slugify(name)}</p>}
        </div>
        <div>
          <label className="label">Description (optional)</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this channel about?" />
        </div>
        <div>
          <label className="label">Visibility</label>
          <div className="flex gap-2">
            <button
              onClick={() => setType('public')}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm ${type === 'public' ? 'border-brand-400 bg-brand-500/20 text-white' : 'border-white/10 text-slate-300'}`}
            >
              Public
            </button>
            <button
              onClick={() => setType('private')}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm ${type === 'private' ? 'border-brand-400 bg-brand-500/20 text-white' : 'border-white/10 text-slate-300'}`}
            >
              Private
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {type === 'public' ? 'Anyone in the workspace can find and join.' : 'Only invited members can see this channel.'}
          </p>
        </div>
        {!canManage(profile?.access_level) && (
          <p className="text-[11px] text-slate-500">
            Location, department and announcement channels are managed by leadership in the Admin panel.
          </p>
        )}
      </div>
    </Modal>
  )
}
