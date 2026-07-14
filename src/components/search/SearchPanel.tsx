import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useDirectoryStore } from '@/stores/directoryStore'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Feedback'
import { RichText } from '@/components/messages/RichText'
import { Search, Hash, MessageSquare, Paperclip, Users, Link as LinkIcon } from '@/components/ui/Icons'
import { displayName, messageTime, formatBytes, debounce } from '@/lib/utils'
import type { MessageRow, ChannelRow, FileRow, Profile } from '@/types'

type Tab = 'messages' | 'links' | 'files' | 'channels' | 'people'

interface Results {
  messages: MessageRow[]
  links: MessageRow[]
  channels: ChannelRow[]
  files: FileRow[]
  people: Profile[]
}

const EMPTY: Results = { messages: [], links: [], channels: [], files: [], people: [] }
const URL_RE = /(https?:\/\/[^\s<>"')]+)/i
const firstUrl = (body?: string | null) => (body ?? '').match(URL_RE)?.[1] ?? null

export function SearchPanel({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const { profilesById, locations, departments } = useDirectoryStore()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>('messages')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Results>(EMPTY)
  const [senderId, setSenderId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [dateFrom, setDateFrom] = useState('')

  const runRef = useRef(
    debounce(async (term: string, filters: { senderId: string; dateFrom: string }) => {
      const tokens = term.trim().split(/\s+/).filter(Boolean)
      const hasQuery = tokens.length > 0

      // Links: any message containing a URL — browsable even with no search term. Every token
      // must appear (multi-word AND), plus the sender/date filters.
      let lq = supabase
        .from('messages')
        .select('*')
        .eq('is_deleted', false)
        .ilike('body', '%http%')
        .order('created_at', { ascending: false })
        .limit(40)
      for (const t of tokens) lq = lq.ilike('body', `%${t}%`)
      if (filters.senderId) lq = lq.eq('user_id', filters.senderId)
      if (filters.dateFrom) lq = lq.gte('created_at', filters.dateFrom)

      if (!hasQuery) {
        const l = await lq
        setResults({ ...EMPTY, links: (l.data as MessageRow[]) ?? [] })
        setLoading(false)
        return
      }

      // Messages: every token must appear in the body (AND), newest first.
      let mq = supabase
        .from('messages')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(50)
      for (const t of tokens) mq = mq.ilike('body', `%${t}%`)
      if (filters.senderId) mq = mq.eq('user_id', filters.senderId)
      if (filters.dateFrom) mq = mq.gte('created_at', filters.dateFrom)

      const like = `%${tokens[0]}%` // names are short — match the first token
      const [m, c, f, p, l] = await Promise.all([
        mq,
        supabase.from('channels').select('*').or(`name.ilike.${like},description.ilike.${like}`).limit(20),
        supabase.from('files').select('*').ilike('name', like).order('created_at', { ascending: false }).limit(20),
        supabase.from('profiles').select('*').or(`full_name.ilike.${like},display_name.ilike.${like},title.ilike.${like}`).limit(20),
        lq,
      ])
      setResults({
        messages: (m.data as MessageRow[]) ?? [],
        links: (l.data as MessageRow[]) ?? [],
        channels: (c.data as ChannelRow[]) ?? [],
        files: (f.data as FileRow[]) ?? [],
        people: (p.data as Profile[]) ?? [],
      })
      setLoading(false)
    }, 300),
  )

  useEffect(() => {
    setLoading(true)
    runRef.current(q, { senderId, dateFrom })
  }, [q, senderId, dateFrom])

  const people = useMemo(() => {
    let list = results.people
    if (locationId) list = list.filter((p) => p.location_id === locationId)
    if (departmentId) list = list.filter((p) => p.department_id === departmentId)
    return list
  }, [results.people, locationId, departmentId])

  const go = (path: string) => {
    onNavigate?.()
    navigate(path)
  }
  const locate = (m: MessageRow | FileRow) =>
    go(m.channel_id ? `/channel/${m.channel_id}` : `/dm/${m.conversation_id}`)

  const counts: Record<Tab, number> = {
    messages: results.messages.length,
    links: results.links.length,
    files: results.files.length,
    channels: results.channels.length,
    people: people.length,
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-brand-900 px-3">
        <Search className="h-5 w-5 text-slate-400" />
        <input
          className="flex-1 bg-transparent py-3 text-sm focus:outline-none"
          placeholder="Search messages, links, files, channels, people…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        {loading && <Spinner className="h-4 w-4" />}
      </div>

      {/* Filters */}
      <div className="mt-2 flex flex-wrap gap-2">
        <select className="input max-w-[150px] py-1 text-xs" value={senderId} onChange={(e) => setSenderId(e.target.value)}>
          <option value="">Any sender</option>
          {Object.values(profilesById).map((p) => (
            <option key={p.id} value={p.id}>{displayName(p)}</option>
          ))}
        </select>
        <input type="date" className="input max-w-[150px] py-1 text-xs" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <select className="input max-w-[150px] py-1 text-xs" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">Any location</option>
          {locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
        </select>
        <select className="input max-w-[150px] py-1 text-xs" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">Any department</option>
          {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
        </select>
      </div>

      {/* Tabs */}
      <div className="mt-3 flex gap-1 overflow-x-auto border-b border-white/10">
        {(['messages', 'links', 'files', 'channels', 'people'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative shrink-0 px-3 py-2 text-sm font-medium capitalize ${tab === t ? 'text-white' : 'text-slate-400 hover:text-white'}`}
          >
            {t} <span className="text-xs text-slate-500">{counts[t]}</span>
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold-400" />}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {!q.trim() && tab !== 'links' && (
          <p className="px-2 py-8 text-center text-sm text-slate-500">Type to search across ROP Chat — or open “Links” to browse everything shared.</p>
        )}

        {tab === 'messages' &&
          results.messages.map((m) => {
            const author = profilesById[m.user_id]
            return (
              <button key={m.id} onClick={() => locate(m)} className="flex w-full gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/5">
                <Avatar profile={author} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-white">{displayName(author)}</span>
                    <span className="text-[11px] text-slate-500">{messageTime(m.created_at)}</span>
                  </div>
                  <div className="line-clamp-2 text-sm text-slate-300"><RichText text={m.body} /></div>
                </div>
              </button>
            )
          })}

        {tab === 'links' &&
          results.links.map((m) => {
            const author = profilesById[m.user_id]
            const url = firstUrl(m.body)
            return (
              <div key={m.id} className="rounded-lg px-2 py-2 hover:bg-white/5">
                <div className="flex items-start gap-3">
                  <LinkIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
                  <div className="min-w-0 flex-1">
                    {url && (
                      <a href={url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-brand-300 underline hover:text-brand-200">
                        {url}
                      </a>
                    )}
                    <button onClick={() => locate(m)} className="mt-0.5 block w-full text-left">
                      <span className="text-[11px] text-slate-400">{displayName(author)}</span>
                      <span className="ml-2 text-[11px] text-slate-500">{messageTime(m.created_at)}</span>
                      <p className="line-clamp-1 text-[12px] text-slate-400">{m.body}</p>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

        {tab === 'channels' &&
          results.channels.map((c) => (
            <button key={c.id} onClick={() => go(`/channel/${c.id}`)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/5">
              <Hash className="h-4 w-4 text-slate-400" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{c.name}</p>
                {c.description && <p className="truncate text-[11px] text-slate-400">{c.description}</p>}
              </div>
            </button>
          ))}

        {tab === 'files' &&
          results.files.map((f) => (
            <button key={f.id} onClick={() => locate(f)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/5">
              <Paperclip className="h-4 w-4 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{f.name}</p>
                <p className="text-[11px] text-slate-400">{formatBytes(f.size_bytes)} · {messageTime(f.created_at)}</p>
              </div>
            </button>
          ))}

        {tab === 'people' &&
          people.map((p) => (
            <button key={p.id} onClick={async () => { const { data } = await supabase.rpc('get_or_create_dm', { other_user: p.id }); if (data) go(`/dm/${data}`) }} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/5">
              <Avatar profile={p} size="sm" showPresence />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{displayName(p)}</p>
                <p className="truncate text-[11px] capitalize text-slate-400">{p.title || p.role}</p>
              </div>
              <MessageSquare className="h-4 w-4 text-slate-500" />
            </button>
          ))}

        {((q.trim() && !loading && counts[tab] === 0) || (tab === 'links' && !loading && counts.links === 0)) && (
          <div className="flex flex-col items-center gap-2 py-10 text-slate-500">
            <Users className="h-6 w-6" />
            <p className="text-sm">{q.trim() ? `No ${tab} match “${q}”.` : 'No links shared yet.'}</p>
          </div>
        )}
      </div>
    </div>
  )
}
