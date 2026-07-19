import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useChannel } from '@/hooks/useChannel'
import { useMessages } from '@/hooks/useMessages'
import { useChatStore } from '@/stores/chatStore'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { MessageList } from '@/components/messages/MessageList'
import { MessageComposer } from '@/components/messages/MessageComposer'
import { PageHeader } from '@/components/layout/PageHeader'
import { FullPageLoader, EmptyState } from '@/components/ui/Feedback'
import { Avatar } from '@/components/ui/Avatar'
import { AccessBadge } from '@/components/ui/Badge'
import { Hash, Lock, Megaphone, Users, Pin, Plus, X, LogOut, Search, Star, Bell, BellOff, Check } from '@/components/ui/Icons'
import { Modal } from '@/components/ui/Modal'
import { PinnedMessagesModal } from '@/components/channels/PinnedMessagesModal'
import { displayName, cn } from '@/lib/utils'
import { canManage, titleLabel } from '@/lib/constants'

export function ChannelPage() {
  const { channelId } = useParams()
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('m') ?? undefined
  const { channel, members, isMember, loading, join, leave, loadMembers, setNotifyLevel } = useChannel(channelId)
  const me = useAuthStore((s) => s.user?.id)
  const myAccess = useAuthStore((s) => s.profile?.access_level)
  const markChannelRead = useChatStore((s) => s.markChannelRead)
  const toggleFavorite = useChatStore((s) => s.toggleFavorite)
  const isFavorite = useChatStore((s) => s.channels.find((c) => c.id === channelId)?.is_favorite ?? false)
  const openThread = useUIStore((s) => s.openThread)
  const toast = useUIStore((s) => s.toast)
  const directory = useDirectoryStore((s) => s.profiles)
  const loadDirectory = useDirectoryStore((s) => s.load)
  const directoryLoaded = useDirectoryStore((s) => s.loaded)
  const [showMembers, setShowMembers] = useState(false)
  const [showPinned, setShowPinned] = useState(false)
  const [showAddPeople, setShowAddPeople] = useState(false)
  const [peopleQuery, setPeopleQuery] = useState('')
  const [busyUser, setBusyUser] = useState<string | null>(null)
  const [notifyOpen, setNotifyOpen] = useState(false)

  const myMembership = members.find((m) => m.user_id === me)
  const level: 'all' | 'mentions' | 'mute' = (myMembership as any)?.notify_level ?? 'mentions'

  async function chooseLevel(next: 'all' | 'mentions' | 'mute') {
    setNotifyOpen(false)
    if (next === level) return
    await setNotifyLevel(next)
    toast({
      kind: 'success',
      title: `#${channel?.name} notifications`,
      body: next === 'all' ? 'You’ll be notified on every message.' : next === 'mute' ? 'Muted — nothing from this channel.' : 'Only @mentions & replies.',
    })
  }

  const iCanManageMembers = canManage(myAccess)

  const memberIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members])
  const addable = useMemo(() => {
    const q = peopleQuery.trim().toLowerCase()
    return directory
      .filter((p) => p.is_active && !memberIds.has(p.id))
      .filter((p) => !q || `${p.full_name} ${p.display_name ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q))
      .slice(0, 40)
  }, [directory, memberIds, peopleQuery])

  useEffect(() => {
    if (showAddPeople && !directoryLoaded) void loadDirectory()
  }, [showAddPeople, directoryLoaded, loadDirectory])

  async function addPerson(userId: string) {
    if (!channelId) return
    setBusyUser(userId)
    const { error } = await supabase.from('channel_members').insert({ channel_id: channelId, user_id: userId } as never)
    setBusyUser(null)
    if (error) return toast({ kind: 'error', title: 'Could not add', body: error.message })
    await loadMembers()
  }

  async function removePerson(userId: string) {
    if (!channelId) return
    setBusyUser(userId)
    const { error } = await supabase.from('channel_members').delete().eq('channel_id', channelId).eq('user_id', userId)
    setBusyUser(null)
    if (error) return toast({ kind: 'error', title: 'Could not remove', body: error.message })
    await loadMembers()
  }

  async function leaveChannel() {
    if (!confirm(`Leave #${channel?.name}? You can re-join anytime from Browse channels.`)) return
    await leave()
    setShowMembers(false)
    toast({ kind: 'success', title: 'You left the channel' })
  }

  const { messages, loading: msgLoading, hasMore, loadMore, send, edit, remove, toggleReaction, togglePin } =
    useMessages(channelId ? { channelId } : {})

  // Mark read whenever the visible message set changes.
  useEffect(() => {
    if (channelId && isMember) markChannelRead(channelId)
  }, [channelId, isMember, messages.length, markChannelRead])

  if (loading) return <FullPageLoader />
  if (!channel)
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Channel" />
        <EmptyState title="Channel not found" body="It may have been archived or you don't have access." />
      </div>
    )

  const Icon = channel.type === 'private' || channel.type === 'admin' ? Lock : channel.type === 'announcement' ? Megaphone : Hash
  const canPost = isMember && !channel.is_archived
  const pinnedCount = messages.filter((m) => m.is_pinned).length

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        backTo="/channels"
        icon={<Icon className="h-5 w-5" />}
        title={channel.name}
        subtitle={channel.topic || channel.description || `${members.length} members`}
        actions={
          <>
            {isMember && (
              <button
                onClick={() => toggleFavorite(channel.id, !isFavorite)}
                className={cn('rounded-lg p-2 hover:bg-white/10', isFavorite ? 'text-gold-400' : 'text-slate-300')}
                title={isFavorite ? 'Remove from favorites' : 'Favorite — pin to top of sidebar'}
              >
                <Star className="h-5 w-5" {...(isFavorite ? { fill: 'currentColor' } : {})} />
              </button>
            )}
            {isMember && (
              <div className="relative">
                <button
                  onClick={() => setNotifyOpen((v) => !v)}
                  className={cn('rounded-lg p-2 hover:bg-white/10', level === 'mute' ? 'text-amber-300' : level === 'all' ? 'text-gold-400' : 'text-slate-300')}
                  title={`Notifications: ${level === 'all' ? 'All messages' : level === 'mute' ? 'Muted' : 'Mentions & DMs'} — tap to change`}
                >
                  {level === 'mute' ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                </button>
                {notifyOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setNotifyOpen(false)} />
                    <div className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-xl border border-white/10 bg-brand-800 shadow-2xl">
                      <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Notify me about…</p>
                      {([
                        ['all', 'All messages', 'Every post in this channel'],
                        ['mentions', 'Mentions & DMs only', 'The default'],
                        ['mute', 'Nothing (mute)', 'No notifications'],
                      ] as const).map(([val, label, desc]) => (
                        <button
                          key={val}
                          onClick={() => chooseLevel(val)}
                          className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-white/10"
                        >
                          <Check className={cn('mt-0.5 h-4 w-4 shrink-0', level === val ? 'text-gold-400' : 'text-transparent')} />
                          <span className="min-w-0">
                            <span className="block text-sm text-white">{label}</span>
                            <span className="block text-[11px] text-slate-400">{desc}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button onClick={() => setShowPinned(true)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10" title="Pinned">
              <Pin className="h-5 w-5" />
              {pinnedCount > 0 && <span className="ml-0.5 text-xs">{pinnedCount}</span>}
            </button>
            <button onClick={() => setShowMembers(true)} className="flex items-center gap-1 rounded-lg p-2 text-slate-300 hover:bg-white/10" title="Members">
              <Users className="h-5 w-5" />
              <span className="text-xs">{members.length}</span>
            </button>
          </>
        }
      />

      {channel.is_archived && (
        <div className="bg-amber-900/30 px-4 py-1.5 text-center text-xs text-amber-200">
          This channel is archived — it's read-only.
        </div>
      )}

      {msgLoading && messages.length === 0 ? (
        <FullPageLoader label="Loading messages…" />
      ) : (
        <MessageList
          messages={messages}
          loading={msgLoading}
          hasMore={hasMore}
          loadMore={loadMore}
          onReact={toggleReaction}
          onOpenThread={openThread}
          onEdit={edit}
          onDelete={remove}
          onTogglePin={togglePin}
          highlightId={highlightId}
        />
      )}

      {canPost ? (
        <MessageComposer
          placeholder={`Message #${channel.name}`}
          onSend={({ body, mentions, files, html }) => send({ body, mentions, files, html })}
        />
      ) : !isMember && !channel.is_archived ? (
        <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-brand-900/40 p-3">
          <p className="text-sm text-slate-300">You're previewing this channel.</p>
          <button onClick={join} className="btn-primary px-4 py-1.5 text-sm">Join channel</button>
        </div>
      ) : null}

      <Modal
        open={showMembers}
        onClose={() => { setShowMembers(false); setShowAddPeople(false) }}
        title={`Members · ${members.length}`}
        footer={
          <div className="flex items-center justify-between gap-2">
            {iCanManageMembers ? (
              <button
                onClick={() => setShowAddPeople((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/10"
              >
                <Plus className="h-4 w-4" /> Add people
              </button>
            ) : (
              <span />
            )}
            {isMember && (
              <button
                onClick={leaveChannel}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10"
              >
                <LogOut className="h-4 w-4" /> Leave channel
              </button>
            )}
          </div>
        }
      >
        {showAddPeople && iCanManageMembers && (
          <div className="mb-3 rounded-xl border border-white/10 bg-brand-950/50 p-2">
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/10 bg-brand-900 px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                className="flex-1 bg-transparent py-2 text-sm focus:outline-none"
                placeholder="Search staff to add…"
                value={peopleQuery}
                onChange={(e) => setPeopleQuery(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {addable.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/5">
                  <Avatar profile={p} size="xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{displayName(p)}</p>
                    <p className="truncate text-[11px] capitalize text-slate-400">{p.role}</p>
                  </div>
                  <button
                    disabled={busyUser === p.id}
                    onClick={() => addPerson(p.id)}
                    className="btn-primary px-3 py-1 text-xs disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              ))}
              {addable.length === 0 && (
                <p className="px-2 py-3 text-center text-xs text-slate-500">
                  {directoryLoaded ? 'Everyone matching is already in this channel.' : 'Loading staff…'}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="space-y-1">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
              <Avatar profile={m.profile} size="sm" showPresence />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-sm font-medium text-white">
                  <span className="truncate">{displayName(m.profile)}</span>
                  <AccessBadge access={m.profile?.access_level} />
                  {m.user_id === me && <span className="text-slate-500">(you)</span>}
                </p>
                <p className="truncate text-[11px] text-slate-400">{titleLabel(m.profile?.role, m.profile?.secondary_role)}</p>
              </div>
              {m.role === 'admin' && <span className="chip bg-gold-400/20 text-gold-200">Owner</span>}
              {iCanManageMembers && m.user_id !== me && (
                <button
                  disabled={busyUser === m.user_id}
                  onClick={() => removePerson(m.user_id)}
                  title="Remove from channel"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </Modal>

      <PinnedMessagesModal
        open={showPinned}
        onClose={() => setShowPinned(false)}
        channelId={channel.id}
        onOpenThread={(id) => { setShowPinned(false); openThread(id) }}
      />
    </div>
  )
}
