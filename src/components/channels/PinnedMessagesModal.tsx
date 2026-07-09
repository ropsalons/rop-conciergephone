import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useDirectoryStore } from '@/stores/directoryStore'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { RichText } from '@/components/messages/RichText'
import { EmptyState } from '@/components/ui/Feedback'
import { Pin } from '@/components/ui/Icons'
import { displayName, messageTime } from '@/lib/utils'
import type { MessageRow, Profile } from '@/types'

export function PinnedMessagesModal({
  open,
  onClose,
  channelId,
  onOpenThread,
}: {
  open: boolean
  onClose: () => void
  channelId: string
  onOpenThread: (id: string) => void
}) {
  const [pinned, setPinned] = useState<MessageRow[]>([])
  const profilesById = useDirectoryStore((s) => s.profilesById)

  useEffect(() => {
    if (!open) return
    supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channelId)
      .eq('is_pinned', true)
      .eq('is_deleted', false)
      .order('pinned_at', { ascending: false })
      .then(({ data }) => setPinned((data as MessageRow[]) ?? []))
  }, [open, channelId])

  return (
    <Modal open={open} onClose={onClose} title="Pinned messages">
      {pinned.length === 0 ? (
        <EmptyState icon={<Pin className="h-8 w-8" />} title="No pinned messages" body="Pin important messages so the team can find them fast." />
      ) : (
        <div className="space-y-2">
          {pinned.map((m) => {
            const author = profilesById[m.user_id] as Profile | undefined
            return (
              <button
                key={m.id}
                onClick={() => onOpenThread(m.id)}
                className="flex w-full gap-3 rounded-lg border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10"
              >
                <Avatar profile={author} size="sm" />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-white">{displayName(author)}</span>
                    <span className="text-[11px] text-slate-500">{messageTime(m.created_at)}</span>
                  </div>
                  <div className="line-clamp-3 text-sm text-slate-300">
                    <RichText text={m.body} />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
