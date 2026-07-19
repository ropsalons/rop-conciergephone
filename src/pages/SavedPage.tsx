import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { useSavedStore, type SavedPreview } from '@/stores/savedStore'
import { useChatStore } from '@/stores/chatStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/Feedback'
import { RemindModal, whenLabel } from '@/components/messages/RemindModal'
import { Bookmark, Clock, Trash, Hash, MessageSquare } from '@/components/ui/Icons'
import { displayName, cn } from '@/lib/utils'
import type { MessageReminderRow, Profile } from '@/types'

function previewText(msg: SavedPreview | undefined): { author: string; snippet: string } {
  if (!msg) return { author: 'Someone', snippet: '(message unavailable)' }
  const meta = (msg.metadata as Record<string, any>) ?? {}
  const byId = useDirectoryStore.getState().profilesById as Record<string, Profile | undefined>
  const author =
    (typeof meta.slack_author === 'string' && meta.slack_author) ||
    (typeof meta.author_name === 'string' && meta.author_name) ||
    displayName(byId[msg.user_id]) ||
    'Someone'
  if (msg.is_deleted) return { author, snippet: '(message deleted)' }
  const raw = meta?.format === 'html' && typeof meta.html === 'string' ? meta.html.replace(/<[^>]+>/g, ' ') : msg.body
  return { author, snippet: raw.replace(/\s+/g, ' ').trim().slice(0, 160) || '(no text)' }
}

export function SavedPage() {
  const navigate = useNavigate()
  const loaded = useSavedStore((s) => s.loaded)
  const load = useSavedStore((s) => s.load)
  const reminders = useSavedStore((s) => s.reminders)
  const messagesById = useSavedStore((s) => s.messagesById)
  const remove = useSavedStore((s) => s.remove)
  const channels = useChatStore((s) => s.channels)
  const [rescheduleId, setRescheduleId] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  const channelName = useMemo(() => Object.fromEntries(channels.map((c) => [c.id, c.name])), [channels])

  function openMessage(msg: SavedPreview | undefined) {
    if (!msg) return
    if (msg.channel_id) navigate(`/channel/${msg.channel_id}?m=${msg.id}`)
    else if (msg.conversation_id) navigate(`/dm/${msg.conversation_id}?m=${msg.id}`)
  }

  function statusLine(r: MessageReminderRow): { icon: 'clock' | 'bookmark'; text: string; tone: string } {
    if (r.remind_at) {
      const d = new Date(r.remind_at)
      if (r.fired_at) return { icon: 'clock', text: `Reminded ${whenLabel(d)}`, tone: 'text-slate-400' }
      if (d.getTime() <= Date.now()) return { icon: 'clock', text: 'Reminder due', tone: 'text-gold-300' }
      return { icon: 'clock', text: `Reminder ${whenLabel(d)}`, tone: 'text-brand-200' }
    }
    return { icon: 'bookmark', text: 'Saved', tone: 'text-gold-300' }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        backTo="/"
        backAlways
        icon={<Bookmark className="h-5 w-5" />}
        title="Saved & Reminders"
        subtitle="Messages you’ve saved or set a reminder on"
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loaded && reminders.length === 0 ? (
          <EmptyState
            icon={<Bookmark className="h-8 w-8" />}
            title="Nothing saved yet"
            body="On any message, tap the ⏰ to be reminded later, or the 🔖 to save it here."
          />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            {reminders.map((r) => {
              const msg = messagesById[r.message_id]
              const { author, snippet } = previewText(msg)
              const st = statusLine(r)
              const where = msg?.channel_id
                ? `#${channelName[msg.channel_id] ?? 'channel'}`
                : msg?.conversation_id
                  ? 'Direct message'
                  : ''
              return (
                <div key={r.id} className="card p-3">
                  <div className="mb-1.5 flex items-center gap-2 text-xs">
                    <span className={cn('flex items-center gap-1 font-medium', st.tone)}>
                      {st.icon === 'clock' ? <Clock className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5 fill-current" />}
                      {st.text}
                    </span>
                    {where && (
                      <span className="flex items-center gap-1 text-slate-500">
                        {msg?.channel_id ? <Hash className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                        {where.replace(/^#/, '')}
                      </span>
                    )}
                    <span className="ml-auto text-slate-600">{format(new Date(r.created_at), 'MMM d')}</span>
                  </div>
                  <button onClick={() => openMessage(msg)} className="block w-full text-left">
                    <p className="text-sm text-slate-200">
                      <span className="font-semibold text-white">{author}: </span>
                      {snippet}
                    </p>
                  </button>
                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={() => openMessage(msg)} className="btn-ghost px-2.5 py-1 text-xs">Open</button>
                    <button onClick={() => setRescheduleId(r.message_id)} className="btn-ghost px-2.5 py-1 text-xs">
                      <Clock className="h-3.5 w-3.5" /> {r.remind_at && !r.fired_at ? 'Reschedule' : 'Remind me'}
                    </button>
                    <button
                      onClick={() => remove(r.message_id)}
                      className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-300"
                      title="Remove"
                    >
                      <Trash className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {rescheduleId && <RemindModal messageId={rescheduleId} existing onClose={() => setRescheduleId(null)} />}
    </div>
  )
}
