import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Feedback'
import { useUIStore } from '@/stores/uiStore'
import { useChatStore } from '@/stores/chatStore'
import { cn } from '@/lib/utils'
import type { ChannelRow } from '@/types'

// Edit a channel's details (name, topic, description, public/private) right from the channel —
// no trip to the Admin portal. Admin/owner only. The slug is intentionally left unchanged so
// existing deep links and integrations that post by slug keep working after a rename.
export function EditChannelModal({
  channel,
  onClose,
  onSaved,
}: {
  channel: ChannelRow
  onClose: () => void
  onSaved?: () => void | Promise<void>
}) {
  const toast = useUIStore((s) => s.toast)
  const [name, setName] = useState(channel.name)
  const [topic, setTopic] = useState(channel.topic ?? '')
  const [description, setDescription] = useState(channel.description ?? '')
  const canToggleVisibility = channel.type === 'public' || channel.type === 'private'
  const [type, setType] = useState<string>(channel.type)
  const [saving, setSaving] = useState(false)

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) return toast({ kind: 'error', title: 'Name required' })
    setSaving(true)
    const { error } = await supabase
      .from('channels')
      .update({
        name: trimmed,
        topic: topic.trim() || null,
        description: description.trim() || null,
        ...(canToggleVisibility ? { type } : {}),
      } as never)
      .eq('id', channel.id)
    setSaving(false)
    if (error) return toast({ kind: 'error', title: 'Save failed', body: error.message })
    toast({ kind: 'success', title: 'Channel updated', body: `#${trimmed}` })
    await useChatStore.getState().loadSidebar()
    await onSaved?.()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit #${channel.name}`}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost px-3 py-1.5 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 px-3 py-1.5 text-sm">
            {saving && <Spinner className="h-4 w-4" />} Save
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-200">Channel name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-200">
            Topic <span className="font-normal text-slate-500">(short line shown under the name)</span>
          </span>
          <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Payroll reports — full labeled sets" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-200">Description</span>
          <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this channel is for" />
        </label>
        {canToggleVisibility && (
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-200">Visibility</span>
            <div className="flex gap-2">
              {(['public', 'private'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setType(v)}
                  className={cn(
                    'flex-1 rounded-xl border px-3 py-2 text-sm transition',
                    type === v ? 'border-brand-400 bg-brand-400/10 text-white' : 'border-white/15 text-slate-300 hover:bg-white/5',
                  )}
                >
                  {v === 'public' ? 'Public' : 'Private'}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {type === 'private'
                ? 'Only members can find and read this channel.'
                : 'Anyone in the workspace can find and join this channel.'}
            </p>
          </div>
        )}
        <p className="text-[11px] text-slate-500">
          The channel’s address (#{channel.slug}) stays the same after a rename, so existing links and integrations keep working.
        </p>
      </div>
    </Modal>
  )
}
