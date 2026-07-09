import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useUIStore } from '@/stores/uiStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { FullPageLoader, EmptyState } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { Star, Sparkles, Plus, Trash, Search } from '@/components/ui/Icons'
import { SHOUTOUT_CATEGORIES, isAdmin } from '@/lib/constants'
import { displayName, timeAgo, cn } from '@/lib/utils'
import type { ShoutoutRow, Profile } from '@/types'

const CATEGORY_BY_KEY = Object.fromEntries(SHOUTOUT_CATEGORIES.map((c) => [c.key, c]))

export function ShoutoutsPage() {
  const me = useAuthStore((s) => s.user?.id)
  const profile = useAuthStore((s) => s.profile)
  const { profiles, profilesById, locations, load, loaded } = useDirectoryStore()
  const toast = useUIStore((s) => s.toast)

  const admin = isAdmin(profile?.role)

  const [shoutouts, setShoutouts] = useState<ShoutoutRow[]>([])
  const [loading, setLoading] = useState(true)
  const [catFilter, setCatFilter] = useState<string>('all')
  const [locFilter, setLocFilter] = useState<string>('all')

  const [giveOpen, setGiveOpen] = useState(false)
  const [recipientId, setRecipientId] = useState('')
  const [category, setCategory] = useState<string>(SHOUTOUT_CATEGORIES[0].key)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const [pendingDelete, setPendingDelete] = useState<ShoutoutRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  useEffect(() => {
    setLoading(true)
    supabase
      .from('shoutouts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setShoutouts((data as ShoutoutRow[]) ?? [])
        setLoading(false)
      })
  }, [])

  const recipients = useMemo(
    () =>
      profiles
        .filter((p) => p.id !== me && p.is_active)
        .filter((p) => displayName(p).toLowerCase().includes(search.trim().toLowerCase())),
    [profiles, me, search],
  )

  const filtered = shoutouts.filter(
    (s) =>
      (catFilter === 'all' || s.category === catFilter) &&
      (locFilter === 'all' || s.location_id === locFilter),
  )

  function resetForm() {
    setRecipientId('')
    setCategory(SHOUTOUT_CATEGORIES[0].key)
    setMessage('')
    setSearch('')
  }

  async function give() {
    if (!me || !recipientId || !message.trim()) return
    setSaving(true)
    const recipient: Profile | undefined = profilesById[recipientId]
    const { data, error } = await supabase
      .from('shoutouts')
      .insert({
        author_id: me,
        recipient_id: recipientId,
        category,
        message: message.trim(),
        location_id: recipient?.location_id ?? profile?.location_id ?? null,
      })
      .select('*')
      .single()
    setSaving(false)
    if (error) {
      toast({ kind: 'error', title: 'Could not send shoutout', body: error.message })
      return
    }
    setShoutouts((prev) => [data as ShoutoutRow, ...prev])
    setGiveOpen(false)
    resetForm()
    toast({ kind: 'success', title: 'Shoutout sent! 🎉', body: `${displayName(recipient)} will be notified.` })
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    const { error } = await supabase.from('shoutouts').delete().eq('id', pendingDelete.id)
    setDeleting(false)
    if (error) {
      toast({ kind: 'error', title: 'Could not delete', body: error.message })
      return
    }
    setShoutouts((prev) => prev.filter((s) => s.id !== pendingDelete.id))
    setPendingDelete(null)
    toast({ kind: 'success', title: 'Shoutout removed' })
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Star className="h-5 w-5 text-gold-300" />}
        title="Shoutouts"
        subtitle="Celebrate the team"
        actions={
          <button onClick={() => setGiveOpen(true)} className="btn-gold px-3 py-1.5 text-sm">
            <Plus className="h-4 w-4" /> Give
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* Filters */}
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCatFilter('all')}
              className={cn('chip', catFilter === 'all' ? 'bg-gold-400/20 text-gold-200' : 'bg-white/10 text-slate-300')}
            >
              All
            </button>
            {SHOUTOUT_CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCatFilter(c.key)}
                className={cn('chip', catFilter === c.key ? 'bg-gold-400/20 text-gold-200' : 'bg-white/10 text-slate-300')}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          {locations.length > 0 && (
            <select className="input max-w-xs" value={locFilter} onChange={(e) => setLocFilter(e.target.value)}>
              <option value="all">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <FullPageLoader label="Loading shoutouts…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-8 w-8 text-gold-300" />}
            title="No shoutouts yet"
            body="Be the first to recognize a teammate who went above and beyond."
            action={
              <button onClick={() => setGiveOpen(true)} className="btn-gold mt-2 px-4 py-2 text-sm">
                <Plus className="h-4 w-4" /> Give a shoutout
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((s) => {
              const cat = CATEGORY_BY_KEY[s.category]
              const author = profilesById[s.author_id]
              const recipient = profilesById[s.recipient_id]
              const canDelete = admin || s.author_id === me
              return (
                <div
                  key={s.id}
                  className="rounded-2xl border border-gold-400/20 bg-gradient-to-br from-gold-400/5 to-transparent p-4"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="chip bg-gold-400/20 text-gold-200">
                      {cat ? `${cat.emoji} ${cat.label}` : s.category}
                    </span>
                    <span className="ml-auto text-[11px] text-slate-500">{timeAgo(s.created_at)}</span>
                    {canDelete && (
                      <button
                        onClick={() => setPendingDelete(s)}
                        className="rounded-lg p-1 text-slate-500 hover:bg-white/10 hover:text-red-300"
                        title="Delete shoutout"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="mb-2 flex items-center gap-2 text-sm">
                    <Avatar profile={author} size="xs" />
                    <span className="font-medium text-slate-200">{displayName(author)}</span>
                    <span className="text-gold-300">→</span>
                    <Avatar profile={recipient} size="xs" />
                    <span className="font-semibold text-white">{displayName(recipient)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-100">{s.message}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Give a shoutout */}
      <Modal
        open={giveOpen}
        onClose={() => setGiveOpen(false)}
        title="Give a shoutout"
        footer={
          <>
            <button onClick={() => setGiveOpen(false)} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
            <button
              onClick={give}
              disabled={saving || !recipientId || !message.trim()}
              className="btn-gold px-4 py-2 text-sm"
            >
              {saving ? 'Sending…' : 'Send'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Recipient</label>
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-black/30 px-3 py-2">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teammates…"
              />
            </div>
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {recipients.length === 0 ? (
                <p className="px-2 py-2 text-sm text-slate-500">No one found.</p>
              ) : (
                recipients.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setRecipientId(p.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/5',
                      recipientId === p.id && 'bg-gold-400/10 ring-1 ring-gold-400/40',
                    )}
                  >
                    <Avatar profile={p} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{displayName(p)}</p>
                      <p className="truncate text-[11px] capitalize text-slate-400">{p.title || p.role}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div>
            <label className="label">Category</label>
            <div className="flex flex-wrap gap-2">
              {SHOUTOUT_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={cn('chip', category === c.key ? 'bg-gold-400/20 text-gold-200' : 'bg-white/10 text-slate-300')}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Message</label>
            <textarea
              className="input min-h-[90px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What did they do that deserves recognition?"
            />
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete shoutout?"
        size="sm"
        footer={
          <>
            <button onClick={() => setPendingDelete(null)} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
            <button onClick={confirmDelete} disabled={deleting} className="btn-danger px-4 py-2 text-sm">
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-300">This shoutout will be permanently removed. This can't be undone.</p>
      </Modal>
    </div>
  )
}
