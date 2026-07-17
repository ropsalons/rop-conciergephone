import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FullPageLoader, EmptyState } from '@/components/ui/Feedback'
import { Link as LinkIcon, Plus, Edit, Trash } from '@/components/ui/Icons'
import { RESOURCE_CATEGORIES, canManage } from '@/lib/constants'
import type { ResourceRow, ResourceCategory } from '@/types'

export function ResourcesPage() {
  const me = useAuthStore((s) => s.user?.id)
  const role = useAuthStore((s) => s.profile?.role)
  const toast = useUIStore((s) => s.toast)
  const manage = canManage(role)

  const [items, setItems] = useState<ResourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<ResourceRow | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [confirmDel, setConfirmDel] = useState<ResourceRow | null>(null)

  async function load() {
    const { data } = await supabase.from('resources').select('*').order('sort', { ascending: true }).order('created_at', { ascending: true })
    setItems((data as ResourceRow[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const byCategory = useMemo(() => {
    const m: Record<string, ResourceRow[]> = {}
    for (const r of items) (m[r.category] ??= []).push(r)
    return m
  }, [items])

  async function remove(r: ResourceRow) {
    const { error } = await supabase.from('resources').delete().eq('id', r.id)
    if (error) return toast({ kind: 'error', title: 'Could not delete', body: error.message })
    setItems((prev) => prev.filter((x) => x.id !== r.id))
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        backTo="/"
        backAlways
        icon={<LinkIcon className="h-5 w-5" />}
        title="Resources"
        subtitle="Dashboards, guides, links & forms"
        actions={manage ? <button onClick={() => setShowNew(true)} className="btn-primary px-3 py-1.5 text-sm"><Plus className="h-4 w-4" /> Add resource</button> : undefined}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl">
          {loading ? (
            <FullPageLoader label="Loading resources…" />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<LinkIcon className="h-8 w-8" />}
              title="No resources yet"
              body={manage ? 'Add your dashboards, guides and key links so the team has one place to find them.' : 'Your team’s dashboards and links will show here.'}
              action={manage ? <button onClick={() => setShowNew(true)} className="btn-primary mt-2">Add resource</button> : undefined}
            />
          ) : (
            <div className="space-y-6">
              {RESOURCE_CATEGORIES.map((cat) => {
                const list = byCategory[cat.key] ?? []
                if (list.length === 0) return null
                return (
                  <section key={cat.key}>
                    <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                      <span>{cat.emoji}</span> {cat.label}
                    </h2>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {list.map((r) => (
                        <div key={r.id} className="card flex items-start gap-3 p-3">
                          <span className="text-xl leading-none">{r.emoji || cat.emoji}</span>
                          <div className="min-w-0 flex-1">
                            {r.url ? (
                              <a href={r.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold text-brand-200 hover:underline">{r.title}</a>
                            ) : (
                              <p className="truncate text-sm font-semibold text-white">{r.title}</p>
                            )}
                            {r.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{r.description}</p>}
                          </div>
                          {manage && (
                            <div className="flex shrink-0 items-center gap-0.5">
                              <button onClick={() => setEditing(r)} className="rounded p-1.5 text-slate-500 hover:bg-white/10 hover:text-white"><Edit className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setConfirmDel(r)} className="rounded p-1.5 text-slate-500 hover:bg-red-500/20 hover:text-red-300"><Trash className="h-3.5 w-3.5" /></button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {(showNew || editing) && me && (
        <ResourceFormModal
          me={me}
          existing={editing}
          onClose={() => { setShowNew(false); setEditing(null) }}
          onSaved={(row) => {
            setShowNew(false); setEditing(null)
            setItems((prev) => {
              const others = prev.filter((x) => x.id !== row.id)
              return [...others, row].sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at))
            })
          }}
          onError={() => toast({ kind: 'error', title: 'Could not save resource' })}
        />
      )}
      <ConfirmDialog open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={() => confirmDel && remove(confirmDel)}
        title="Remove this resource?" body={confirmDel?.title} confirmLabel="Remove" danger />
    </div>
  )
}

function ResourceFormModal({
  me, existing, onClose, onSaved, onError,
}: {
  me: string
  existing: ResourceRow | null
  onClose: () => void
  onSaved: (row: ResourceRow) => void
  onError: () => void
}) {
  const [title, setTitle] = useState(existing?.title ?? '')
  const [url, setUrl] = useState(existing?.url ?? '')
  const [category, setCategory] = useState<ResourceCategory>(existing?.category ?? 'dashboard')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [emoji, setEmoji] = useState(existing?.emoji ?? '')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!title.trim() || saving) return
    setSaving(true)
    const normUrl = url.trim() ? (/^https?:\/\//.test(url.trim()) ? url.trim() : 'https://' + url.trim()) : null
    const payload = { title: title.trim(), url: normUrl, category, description: description.trim() || null, emoji: emoji.trim() || null }
    let row: ResourceRow | null = null
    if (existing) {
      const { data, error } = await supabase.from('resources').update(payload).eq('id', existing.id).select('*').single()
      if (error || !data) { setSaving(false); return onError() }
      row = data as ResourceRow
    } else {
      const { data, error } = await supabase.from('resources').insert({ ...payload, created_by: me }).select('*').single()
      if (error || !data) { setSaving(false); return onError() }
      row = data as ResourceRow
    }
    setSaving(false)
    onSaved(row)
  }

  return (
    <Modal open onClose={onClose} title={existing ? 'Edit resource' : 'Add resource'}
      footer={<>
        <button onClick={onClose} className="btn-ghost px-4 py-1.5 text-sm">Cancel</button>
        <button onClick={submit} disabled={!title.trim() || saving} className="btn-primary px-4 py-1.5 text-sm">{saving ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="space-y-4">
        <div>
          <label className="label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Daily Sales Dashboard" autoFocus />
        </div>
        <div>
          <label className="label">Link <span className="text-slate-500">(optional)</span></label>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste the URL" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Category</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value as ResourceCategory)}>
              {RESOURCE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Icon <span className="text-slate-500">(optional)</span></label>
            <input className="input" value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="📊" maxLength={4} />
          </div>
        </div>
        <div>
          <label className="label">Description <span className="text-slate-500">(optional)</span></label>
          <textarea className="input min-h-[70px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this for?" />
        </div>
      </div>
    </Modal>
  )
}
