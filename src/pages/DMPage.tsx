import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { useMessages } from '@/hooks/useMessages'
import { MessageList } from '@/components/messages/MessageList'
import { MessageComposer } from '@/components/messages/MessageComposer'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { FullPageLoader } from '@/components/ui/Feedback'
import { conversationName, otherMembers } from '@/lib/dm'
import type { DirectConversationRow, Profile } from '@/types'
import type { ConversationWithMeta } from '@/types'

export function DMPage() {
  const { conversationId } = useParams()
  const me = useAuthStore((s) => s.user?.id)
  const markConversationRead = useChatStore((s) => s.markConversationRead)
  const openThread = useUIStore((s) => s.openThread)
  const [conv, setConv] = useState<ConversationWithMeta | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!conversationId) return
    setLoading(true)
    Promise.all([
      supabase.from('direct_conversations').select('*').eq('id', conversationId).maybeSingle(),
      supabase.from('direct_conversation_members').select('profiles(*)').eq('conversation_id', conversationId),
    ]).then(([c, m]) => {
      const base = c.data as DirectConversationRow | null
      if (base) {
        setConv({ ...base, members: ((m.data as any[]) ?? []).map((r) => r.profiles as Profile) })
      }
      setLoading(false)
    })
  }, [conversationId])

  const { messages, loading: msgLoading, hasMore, loadMore, send, edit, remove, toggleReaction } = useMessages(
    conversationId ? { conversationId } : {},
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
        icon={lead ? <Avatar profile={lead} size="sm" showPresence={!conv.is_group} /> : undefined}
        title={conversationName(conv, me)}
        subtitle={
          conv.is_group
            ? `${conv.members?.length ?? 0} people`
            : lead?.presence === 'online'
              ? 'Active now'
              : lead?.title || lead?.role
        }
      />
      <MessageList
        messages={messages}
        loading={msgLoading}
        hasMore={hasMore}
        loadMore={loadMore}
        onReact={toggleReaction}
        onOpenThread={openThread}
        onEdit={edit}
        onDelete={remove}
      />
      <MessageComposer
        placeholder={`Message ${conversationName(conv, me)}`}
        onSend={({ body, mentions, files }) => send({ body, mentions, files })}
      />
    </div>
  )
}
