import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useDirectoryStore } from '@/stores/directoryStore'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Feedback'
import { RichText } from '@/components/messages/RichText'
import { Search, Hash, MessageSquare, Paperclip, Users } from '@/components/ui/Icons'
import { displayName, messageTime, formatBytes, debounce } from '@/lib/utils'
import type { MessageRow, ChannelRow, FileRow, Profile } from '@/types'

type Tab = 'messages' | 'channels' | 'files' | 'people'

interface Results {
  messages: MessageRow[]
  channels: ChannelRow[]
  files: FileRow[]
  people: Profile[]
}

export function SearchPanel({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const { profilesById, locations, departments } = useDirectoryStore()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>('messages')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Results>({ messages: [], channels: [], files: [], people: [] })
  const [senderId, setSenderId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [dateFrom, setDateFrom] = useState('')

  const runRef = useRef(
    debounce(async (term: string, filters: { senderId: string; dateFrom: string }) => {
      if (!term.trim()) {
        setResults({ messages: [], channels: [], files: [], people: [] })
        setLoading(false)
        return
      }
      const like = `%${term}%`
      let mq = supabase.from('messages').select('*').ilike('body', like).eq('is_deleted', false).order('created_at', { ascending: false }).limit(40)
      if (filters.senderId) mq = mq.eq('user_id', filters.senderId)
      if (filters.dateFrom) mq = mq.gte('created_at', filters.dateFrom)
      const [m, c, f, p] = await Promise.all([
        mq,
        supabase.from('channels').select('*').ilike('name', like).limit(20),
        supabase.from('files').select('*').ilike('name', like).order('created_at', { ascending: false }).limit(20),
        supabase.from('profiles').select('*').or(`full_name.ilike.${like},display_name.ilike.${like},title.ilike.${like}`).limit(20),
      ])
      setResults({
        messages: (m.data as MessageRow[]) ?? [],
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

  const counts: Record<Tab, number> = {
    messages: results.messages.length,
    channels: results.channels.length,
    files: results.files.length,
    people: people.length,
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-brand-900 px-3">
        <Search className="h-5 w-5 text-slate-400" />
        <input
          className="flex-1 bg-transparent py-3 text-sm focus:outline-none"
          placeholder="Search messages, channels, files and people…"
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
      <div className="mt-3 flex gap-1 border-b border-white/10">
        {(['messages', 'channels', 'files', 'people'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-3 py-2 text-sm font-medium capitalize ${tab === t ? 'text-white' : 'text-slate-400 hover:text-white'}`}
          >
            {t} <span className="text-xs text-slate-500">{counts[t]}</span>
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold-400" />}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {!q.trim() && <p className="px-2 py-8 text-center text-sm text-slate-500">Type to search across ROP Connect.</p>}

        {tab === 'messages' &&
          results.messages.map((m) => {
            const author = profilesById[m.user_id]
            return (
              <button key={m.id} onClick={() => go(m.channel_id ? `/channel/${m.channel_id}` : `/dm/${m.conversation_id}`)} className="flex w-full gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/5">
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
            <button key={f.id} onClick={() => go(f.channel_id ? `/channel/${f.channel_id}` : `/dm/${f.conversation_id}`)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/5">
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

        {q.trim() && !loading && counts[tab] === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-slate-500">
            <Users className="h-6 w-6" />
            <p className="text-sm">No {tab} match “{q}”.</p>
          </div>
        )}
      </div>
    </div>
  )
}
