import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useChatStore } from '@/stores/chatStore'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { UnreadBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/Feedback'
import { Plus, MessageSquare } from '@/components/ui/Icons'
import { NewDMModal } from '@/components/dms/NewDMModal'
import { conversationName, otherMembers } from '@/lib/dm'
import { timeAgo } from '@/lib/utils'

export function DMListPage() {
  const me = useAuthStore((s) => s.user?.id)
  const { conversations, unreadByConversation } = useChatStore()
  const navigate = useNavigate()
  const [showNew, setShowNew] = useState(false)

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Direct Messages"
        actions={
          <button onClick={() => setShowNew(true)} className="btn-primary px-3 py-1.5 text-sm">
            <Plus className="h-4 w-4" /> New
          </button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-8 w-8" />}
            title="No conversations yet"
            body="Start a direct message with a teammate."
            action={<button onClick={() => setShowNew(true)} className="btn-primary mt-2">New message</button>}
          />
        ) : (
          <div className="divide-y divide-white/5">
            {conversations.map((c) => {
              const unread = unreadByConversation[c.id] ?? 0
              const others = otherMembers(c, me)
              return (
                <button
                  key={c.id}
                  onClick={() => navigate(`/dm/${c.id}`)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5"
                >
                  {others[0] ? <Avatar profile={others[0]} size="md" showPresence={!c.is_group} /> : <MessageSquare className="h-6 w-6" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{conversationName(c, me)}</p>
                    <p className="truncate text-xs text-slate-400">Updated {timeAgo(c.last_message_at)}</p>
                  </div>
                  <UnreadBadge count={c.is_muted ? 0 : unread} />
                </button>
              )
            })}
          </div>
        )}
      </div>
      <NewDMModal open={showNew} onClose={() => setShowNew(false)} />
    </div>
  )
}
