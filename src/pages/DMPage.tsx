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
import { MessageSquare } from '@/components/ui/Icons'
import { isAdmin } from '@/lib/constants'
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
  const [conv, setConv] = useState<ConversationWithMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [reminderOpen, setReminderOpen] = useState(false)

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
        backTo="/dms"
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
          // Admins can nudge a 1:1 recipient by text ("you have a message waiting in ROP Chat").
          !conv.is_group && lead && isAdmin(myAccess) ? (
            <button
              onClick={() => setReminderOpen(true)}
              title={`Text ${conversationName(conv, me)} a reminder`}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <MessageSquare className="h-5 w-5" />
              <span className="hidden text-xs font-semibold sm:inline">Text reminder</span>
            </button>
          ) : undefined
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
