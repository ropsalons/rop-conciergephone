import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { useMessages } from '@/hooks/useMessages'
import { MessageList } from '@/components/messages/MessageList'
import { MessageComposer } from '@/components/messages/MessageComposer'
import { TextReminderModal } from '@/components/messages/TextReminderModal'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { FullPageLoader } from '@/components/ui/Feedback'
import { MessageSquare, Bell, BellOff } from '@/components/ui/Icons'
import { isAdmin } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { conversationName, otherMembers } from '@/lib/dm'
import type { DirectConversationRow, Profile } from '@/types'
import type { ConversationWithMeta } from '@/types'

export function DMPage() {
  const { conversationId } = useParams()
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('m') ?? undefined
  const me = useAuthStore((s) => s.user?.id)
  const myAccess = useAuthStore((s) => s.profile?.access_level)
  const markConversationRead = useChatStore((s) => s.markConversationRead)
  const openThread = useUIStore((s) => s.openThread)
  const toast = useUIStore((s) => s.toast)
  const [conv, setConv] = useState<ConversationWithMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [reminderOpen, setReminderOpen] = useState(false)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    if (!conversationId) return
    setLoading(true)
    Promise.all([
      supabase.from('direct_conversations').select('*').eq('id', conversationId).maybeSingle(),
      supabase.from('direct_conversation_members').select('user_id, is_muted, profiles(*)').eq('conversation_id', conversationId),
    ]).then(([c, m]) => {
      const base = c.data as DirectConversationRow | null
      const rows = (m.data as any[]) ?? []
      if (base) {
        setConv({ ...base, members: rows.map((r) => r.profiles as Profile) })
      }
      setMuted(!!rows.find((r) => r.user_id === me)?.is_muted)
      setLoading(false)
    })
  }, [conversationId, me])

  // Mute this conversation: you still see new messages (unread bubble stays), your phone just
  // won't buzz on every reply. Great for busy group DMs.
  async function toggleMute() {
    if (!conversationId || !me) return
    const next = !muted
    setMuted(next)
    const { error } = await supabase
      .from('direct_conversation_members')
      .update({ is_muted: next } as never)
      .eq('conversation_id', conversationId)
      .eq('user_id', me)
    if (error) {
      setMuted(!next)
      return toast({ kind: 'error', title: 'Could not change mute', body: error.message })
    }
    toast({
      kind: 'success',
      title: next ? 'Conversation muted' : 'Conversation unmuted',
      body: next
        ? 'New messages still show here as unread — your phone just won’t buzz.'
        : 'Notifications are back on for this conversation.',
    })
  }

  const { messages, loading: msgLoading, hasMore, loadMore, send, edit, remove, toggleReaction } = useMessages(
    conversationId ? { conversationId } : {},
    { focusId: highlightId },
  )

  useEffect(() => {
    if (conversationId) markConversationRead(conversationId)
  }, [conversationId, messages.length, markConversationRead])

  if (loading || !conv) return <FullPageLoader />

  const others = otherMembers(conv, me)
  const lead = others[0]

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        backTo="/"
        icon={lead ? <Avatar profile={lead} size="sm" showPresence={!conv.is_group} /> : undefined}
        title={conversationName(conv, me)}
        subtitle={
          conv.is_group
            ? `${conv.members?.length ?? 0} people`
            : lead?.presence === 'online'
              ? 'Active now'
              : lead?.title || lead?.role
        }
        actions={
          <div className="flex items-center gap-1">
            {/* Mute: keep the unread bubble, stop the phone buzzing. Everyone, any DM or group DM. */}
            <button
              onClick={toggleMute}
              title={muted ? 'Muted — unmute to get notifications again' : 'Mute notifications (you’ll still see new messages here)'}
              aria-label={muted ? 'Unmute conversation' : 'Mute conversation'}
              className={cn(
                'flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 hover:bg-white/10 hover:text-white',
                muted ? 'text-amber-300' : 'text-slate-300',
              )}
            >
              {muted ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
              <span className="hidden text-xs font-semibold sm:inline">{muted ? 'Muted' : 'Mute'}</span>
            </button>
            {/* Admins can nudge a 1:1 recipient by text ("you have a message waiting in ROP Chat"). */}
            {!conv.is_group && lead && isAdmin(myAccess) && (
              <button
                onClick={() => setReminderOpen(true)}
                title={`Text ${conversationName(conv, me)} a reminder`}
                className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <MessageSquare className="h-5 w-5" />
                <span className="hidden text-xs font-semibold sm:inline">Text reminder</span>
              </button>
            )}
          </div>
        }
      />
      <MessageList
        key={conversationId}
        messages={messages}
        loading={msgLoading}
        hasMore={hasMore}
        loadMore={loadMore}
        onReact={toggleReaction}
        onOpenThread={openThread}
        onEdit={edit}
        onDelete={remove}
        highlightId={highlightId}
      />
      <MessageComposer
        placeholder={`Message ${conversationName(conv, me)}`}
        onSend={({ body, mentions, files, html }) => send({ body, mentions, files, html })}
      />
      <TextReminderModal open={reminderOpen} onClose={() => setReminderOpen(false)} recipient={lead ?? null} />
    </div>
  )
}
