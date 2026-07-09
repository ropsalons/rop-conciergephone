import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useChannel } from '@/hooks/useChannel'
import { useMessages } from '@/hooks/useMessages'
import { useChatStore } from '@/stores/chatStore'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { MessageList } from '@/components/messages/MessageList'
import { MessageComposer } from '@/components/messages/MessageComposer'
import { PageHeader } from '@/components/layout/PageHeader'
import { FullPageLoader, EmptyState } from '@/components/ui/Feedback'
import { Avatar } from '@/components/ui/Avatar'
import { Hash, Lock, Megaphone, Users, Pin } from '@/components/ui/Icons'
import { Modal } from '@/components/ui/Modal'
import { PinnedMessagesModal } from '@/components/channels/PinnedMessagesModal'
import { displayName } from '@/lib/utils'
import { canModerate as canModRole } from '@/lib/constants'

export function ChannelPage() {
  const { channelId } = useParams()
  const { channel, members, isMember, loading, join } = useChannel(channelId)
  const me = useAuthStore((s) => s.user?.id)
  const myRole = useAuthStore((s) => s.profile?.role)
  const markChannelRead = useChatStore((s) => s.markChannelRead)
  const openThread = useUIStore((s) => s.openThread)
  const [showMembers, setShowMembers] = useState(false)
  const [showPinned, setShowPinned] = useState(false)

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
  const postingLocked = channel.type === 'announcement' && !canModRole(myRole)
  const canPost = isMember && !channel.is_archived && !postingLocked
  const pinnedCount = messages.filter((m) => m.is_pinned).length

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Icon className="h-5 w-5" />}
        title={channel.name}
        subtitle={channel.topic || channel.description || `${members.length} members`}
        actions={
          <>
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
        />
      )}

      {canPost ? (
        <MessageComposer
          placeholder={`Message #${channel.name}`}
          onSend={({ body, mentions, files }) => send({ body, mentions, files })}
        />
      ) : postingLocked && isMember ? (
        <div className="border-t border-white/10 bg-brand-900/40 p-3 text-center text-xs text-slate-400">
          Only leadership can post in this announcement channel.
        </div>
      ) : !isMember && !channel.is_archived ? (
        <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-brand-900/40 p-3">
          <p className="text-sm text-slate-300">You're previewing this channel.</p>
          <button onClick={join} className="btn-primary px-4 py-1.5 text-sm">Join channel</button>
        </div>
      ) : null}

      <Modal open={showMembers} onClose={() => setShowMembers(false)} title={`Members · ${members.length}`}>
        <div className="space-y-1">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
              <Avatar profile={m.profile} size="sm" showPresence />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {displayName(m.profile)} {m.user_id === me && <span className="text-slate-500">(you)</span>}
                </p>
                <p className="truncate text-[11px] capitalize text-slate-400">{m.profile?.role}</p>
              </div>
              {m.role === 'admin' && <span className="chip bg-gold-400/20 text-gold-200">Owner</span>}
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
