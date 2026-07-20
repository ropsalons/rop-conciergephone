import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Feedback'
import { ClipboardList } from '@/components/ui/Icons'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/lib/utils'

interface ForwardProject {
  project_id: string
  project_name: string
  channel_id: string
  channel_slug: string
  channel_name: string
}

// Admin action: forward ANY message to a connected project's command channel, which the
// existing forwarder delivers to that project (Command Center, etc.) as a task/project item.
export function ForwardModal({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const toast = useUIStore((s) => s.toast)
  const [projects, setProjects] = useState<ForwardProject[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = (fn: string, args: any = {}) => (supabase.rpc as any)(fn, args)

  useEffect(() => {
    rpc('list_forward_projects').then(({ data }: { data: ForwardProject[] | null }) => {
      const list = data || []
      setProjects(list)
      // Default to Command Center if present, else the first project.
      const cc = list.find((p) => /command center/i.test(p.project_name))
      setSelected(cc?.project_id ?? list[0]?.project_id ?? null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function send() {
    if (!selected || sending) return
    setSending(true)
    const { data, error } = await rpc('admin_forward_message_to_project', {
      p_message_id: messageId,
      p_project_id: selected,
      p_note: note.trim() || null,
    })
    setSending(false)
    if (error) return toast({ kind: 'error', title: 'Could not forward', body: error.message })
    const row = Array.isArray(data) ? data[0] : data
    toast({ kind: 'success', title: `Sent to ${row?.project_name ?? 'project'}`, body: 'It’ll show up in that project’s task list.' })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Send to a project">
      <p className="mb-3 text-sm text-slate-400">
        Forward this message to one of your connected projects. It lands in that project’s command channel and
        turns into a task/project item there.
      </p>

      {projects === null ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-400"><Spinner /> Loading projects…</div>
      ) : projects.length === 0 ? (
        <p className="py-4 text-sm text-slate-400">
          No connected projects yet. Connect one first (Admin → AI Integrations), then it’ll show up here.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            {projects.map((p) => (
              <button
                key={p.project_id}
                onClick={() => setSelected(p.project_id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition',
                  selected === p.project_id ? 'border-brand-400 bg-brand-400/10' : 'border-white/10 bg-brand-950/40 hover:bg-white/5',
                )}
              >
                <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', selected === p.project_id ? 'bg-brand-500 text-white' : 'bg-white/10 text-slate-300')}>
                  <ClipboardList className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{p.project_name}</span>
                  <span className="block truncate text-[11px] text-slate-500">#{p.channel_slug}</span>
                </span>
                <span className={cn('h-4 w-4 rounded-full border', selected === p.project_id ? 'border-brand-400 bg-brand-500' : 'border-white/20')} />
              </button>
            ))}
          </div>

          <label className="mt-4 block">
            <span className="label">Add a note <span className="text-slate-500">(optional)</span></span>
            <textarea
              className="input min-h-[70px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Please follow up with this guest, or turn this into a task for the team."
            />
          </label>

          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={send} disabled={!selected || sending} className="btn-primary px-4 py-1.5 text-sm">
              {sending ? 'Sending…' : 'Send to project'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
