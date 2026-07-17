import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useUIStore } from '@/stores/uiStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { FullPageLoader, EmptyState } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { Tag } from '@/components/ui/Badge'
import { ClipboardList, Check, CheckCheck, Edit, Plus, Users, Calendar } from '@/components/ui/Icons'
import { canManage } from '@/lib/constants'
import { displayName, timeAgo } from '@/lib/utils'
import type { DailyHuddleRow, DailyHuddleAckRow, Profile } from '@/types'

const FIELDS = [
  { key: 'focus', label: "Today's Focus" },
  { key: 'service_sales_goal', label: 'Service & Sales Goal' },
  { key: 'prebook_focus', label: 'Prebook Focus' },
  { key: 'retail_focus', label: 'Retail Focus' },
  { key: 'guest_experience', label: 'Guest Experience' },
  { key: 'staffing_notes', label: 'Staffing Notes' },
  { key: 'shoutouts', label: 'Shoutouts' },
] as const

type FieldKey = (typeof FIELDS)[number]['key']
type FormState = Record<FieldKey, string> & { requires_ack: boolean }

function todayStr(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

function emptyForm(): FormState {
  return {
    focus: '',
    service_sales_goal: '',
    prebook_focus: '',
    retail_focus: '',
    guest_experience: '',
    staffing_notes: '',
    shoutouts: '',
    requires_ack: true,
  }
}

export function HuddlePage() {
  const me = useAuthStore((s) => s.user?.id)
  const profile = useAuthStore((s) => s.profile)
  const { locations, profiles, profilesById, load, loaded } = useDirectoryStore()
  const toast = useUIStore((s) => s.toast)

  const manager = canManage(profile?.role)

  const [locationId, setLocationId] = useState('')
  const [date, setDate] = useState(todayStr())
  const [loading, setLoading] = useState(true)
  const [huddle, setHuddle] = useState<DailyHuddleRow | null>(null)
  const [acks, setAcks] = useState<DailyHuddleAckRow[]>([])
  const [history, setHistory] = useState<DailyHuddleRow[]>([])
  const [acking, setAcking] = useState(false)

  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  // Default the location to the user's own once the directory is available.
  useEffect(() => {
    if (locationId || locations.length === 0) return
    const own = profile?.location_id
    setLocationId(own && locations.some((l) => l.id === own) ? own : locations[0].id)
  }, [locations, profile, locationId])

  async function loadHuddle(locId: string, day: string) {
    setLoading(true)
    const { data: row } = await supabase
      .from('daily_huddles')
      .select('*')
      .eq('location_id', locId)
      .eq('huddle_date', day)
      .maybeSingle()
    const found = (row as DailyHuddleRow) ?? null
    setHuddle(found)

    if (found) {
      const { data: ackRows } = await supabase
        .from('daily_huddle_acknowledgements')
        .select('*')
        .eq('huddle_id', found.id)
      setAcks((ackRows as DailyHuddleAckRow[]) ?? [])
    } else {
      setAcks([])
    }

    const { data: hist } = await supabase
      .from('daily_huddles')
      .select('*')
      .eq('location_id', locId)
      .order('huddle_date', { ascending: false })
      .limit(7)
    setHistory((hist as DailyHuddleRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (!locationId) return
    void loadHuddle(locationId, date)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, date])

  async function refetchAcks(huddleId: string) {
    const { data } = await supabase
      .from('daily_huddle_acknowledgements')
      .select('*')
      .eq('huddle_id', huddleId)
    setAcks((data as DailyHuddleAckRow[]) ?? [])
  }

  async function acknowledge() {
    if (!huddle || !me) return
    setAcking(true)
    const { error } = await supabase
      .from('daily_huddle_acknowledgements')
      .insert({ huddle_id: huddle.id, user_id: me })
    setAcking(false)
    if (error) {
      toast({ kind: 'error', title: 'Could not acknowledge', body: error.message })
      return
    }
    await refetchAcks(huddle.id)
    toast({ kind: 'success', title: 'Thanks — huddle acknowledged' })
  }

  function openEditor() {
    if (huddle) {
      setForm({
        focus: huddle.focus ?? '',
        service_sales_goal: huddle.service_sales_goal ?? '',
        prebook_focus: huddle.prebook_focus ?? '',
        retail_focus: huddle.retail_focus ?? '',
        guest_experience: huddle.guest_experience ?? '',
        staffing_notes: huddle.staffing_notes ?? '',
        shoutouts: huddle.shoutouts ?? '',
        requires_ack: huddle.requires_ack,
      })
    } else {
      setForm(emptyForm())
    }
    setEditorOpen(true)
  }

  async function saveHuddle() {
    if (!locationId || !me) return
    setSaving(true)
    const payload = {
      location_id: locationId,
      huddle_date: date,
      author_id: me,
      requires_ack: form.requires_ack,
      focus: form.focus.trim() || null,
      service_sales_goal: form.service_sales_goal.trim() || null,
      prebook_focus: form.prebook_focus.trim() || null,
      retail_focus: form.retail_focus.trim() || null,
      guest_experience: form.guest_experience.trim() || null,
      staffing_notes: form.staffing_notes.trim() || null,
      shoutouts: form.shoutouts.trim() || null,
    }

    // Upsert by (location_id, huddle_date): update if a row already exists, else insert.
    const { data: existing } = await supabase
      .from('daily_huddles')
      .select('id')
      .eq('location_id', locationId)
      .eq('huddle_date', date)
      .maybeSingle()

    const res = existing
      ? await supabase.from('daily_huddles').update(payload).eq('id', existing.id).select('*').single()
      : await supabase.from('daily_huddles').insert(payload).select('*').single()

    setSaving(false)
    if (res.error) {
      toast({ kind: 'error', title: 'Could not save huddle', body: res.error.message })
      return
    }
    setEditorOpen(false)
    toast({ kind: 'success', title: existing ? 'Huddle updated' : 'Huddle posted' })
    await loadHuddle(locationId, date)
  }

  const author: Profile | undefined = huddle?.author_id ? profilesById[huddle.author_id] : undefined
  const filledFields = huddle ? FIELDS.filter((f) => huddle[f.key]) : []

  // Ack report data (managers only).
  const locationStaff = huddle
    ? profiles.filter((p) => p.location_id === huddle.location_id && p.is_active)
    : []
  const ackedIds = new Set(acks.map((a) => a.user_id))
  const notAcked = locationStaff.filter((p) => !ackedIds.has(p.id))
  const iAcked = me ? ackedIds.has(me) : false

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        backTo="/"
        backAlways
        icon={<ClipboardList className="h-5 w-5" />}
        title="Daily Huddle"
        subtitle="Start the day aligned"
        actions={
          manager ? (
            <button onClick={openEditor} className="btn-gold px-3 py-1.5 text-sm">
              <Edit className="h-4 w-4" /> {huddle ? 'Edit' : 'Create'}
            </button>
          ) : undefined
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* Location + date pickers */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Location</label>
            <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <FullPageLoader label="Loading huddle…" />
        ) : !huddle ? (
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" />}
            title="No huddle for this day"
            body={manager ? 'Post a huddle to align your team for the day.' : 'Check back once your manager posts it.'}
            action={
              manager ? (
                <button onClick={openEditor} className="btn-gold mt-2 px-4 py-2 text-sm">
                  <Plus className="h-4 w-4" /> Create huddle
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="card p-4">
              <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
                <Calendar className="h-4 w-4" />
                <span>{prettyDate(huddle.huddle_date)}</span>
                {huddle.requires_ack && <Tag tone="gold">Acknowledgement required</Tag>}
              </div>

              {filledFields.length === 0 ? (
                <p className="text-sm text-slate-400">This huddle has no details yet.</p>
              ) : (
                <div className="space-y-3">
                  {filledFields.map((f) => (
                    <div key={f.key}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gold-300">{f.label}</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-100">{huddle[f.key]}</p>
                    </div>
                  ))}
                </div>
              )}

              {author && (
                <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3">
                  <Avatar profile={author} size="xs" />
                  <p className="text-xs text-slate-400">
                    Posted by <span className="text-slate-200">{displayName(author)}</span> · {timeAgo(huddle.created_at)}
                  </p>
                </div>
              )}
            </div>

            {/* Acknowledgement */}
            {huddle.requires_ack && (
              <div className="card p-4">
                {iAcked ? (
                  <p className="flex items-center gap-2 text-sm text-emerald-300">
                    <CheckCheck className="h-5 w-5" /> You acknowledged this huddle.
                  </p>
                ) : (
                  <button onClick={acknowledge} disabled={acking} className="btn-primary px-4 py-2 text-sm">
                    <Check className="h-4 w-4" /> {acking ? 'Saving…' : 'I read the huddle'}
                  </button>
                )}
              </div>
            )}

            {/* Manager ack report */}
            {manager && (
              <div className="card p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <Users className="h-4 w-4 text-slate-400" />
                  Acknowledgements
                  <span className="ml-auto text-xs font-normal text-slate-400">
                    {acks.length} of {locationStaff.length} staff
                  </span>
                </div>
                {notAcked.length === 0 ? (
                  <p className="text-sm text-emerald-300">Everyone has acknowledged. 🎉</p>
                ) : (
                  <>
                    <p className="mb-2 text-xs text-slate-400">Not yet acknowledged</p>
                    <div className="space-y-1">
                      {notAcked.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 rounded-lg px-1 py-1">
                          <Avatar profile={p} size="xs" />
                          <span className="text-sm text-slate-200">{displayName(p)}</span>
                          <span className="ml-auto text-[11px] capitalize text-slate-500">{p.role}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Recent history */}
        {history.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent huddles</p>
            <div className="space-y-1">
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => setDate(h.huddle_date)}
                  className={
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5 ' +
                    (h.huddle_date === date ? 'bg-white/5 text-white' : 'text-slate-300')
                  }
                >
                  <Calendar className="h-4 w-4 text-slate-500" />
                  <span>{prettyDate(h.huddle_date)}</span>
                  {h.focus && <span className="ml-auto truncate text-xs text-slate-500">{h.focus}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Editor */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={huddle ? 'Edit huddle' : 'Create huddle'}
        size="lg"
        footer={
          <>
            <button onClick={() => setEditorOpen(false)} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
            <button onClick={saveHuddle} disabled={saving} className="btn-gold px-4 py-2 text-sm">
              {saving ? 'Saving…' : 'Save huddle'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            {locations.find((l) => l.id === locationId)?.name} · {prettyDate(date)}
          </p>
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="label">{f.label}</label>
              <textarea
                className="input min-h-[64px]"
                value={form[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                placeholder={`Add ${f.label.toLowerCase()}…`}
              />
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={form.requires_ack}
              onChange={(e) => setForm((s) => ({ ...s, requires_ack: e.target.checked }))}
            />
            Require staff to acknowledge this huddle
          </label>
        </div>
      </Modal>
    </div>
  )
}
