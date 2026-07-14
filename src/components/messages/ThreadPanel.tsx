import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUIStore } from '@/stores/uiStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useMessages, type Target } from '@/hooks/useMessages'
import { MessageItem } from './MessageItem'
import { MessageComposer } from './MessageComposer'
import { RichText } from './RichText'
import { RichCard } from './RichCard'
import { Avatar } from '@/components/ui/Avatar'
import { FullPageLoader } from '@/components/ui/Feedback'
import { X } from '@/components/ui/Icons'
import { displayName, messageTime } from '@/lib/utils'
import type { MessageRow, Profile } from '@/types'

export function ThreadPanel({ rootId }: { rootId: string }) {
  const closeThread = () => useUIStore.getState().openThread(null)
  const [root, setRoot] = useState<MessageRow | null>(null)
  const [rootAuthor, setRootAuthor] = useState<Profile | null>(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('messages')
      .select('*')
      .eq('id', rootId)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!alive || !data) return
        const row = data as MessageRow
        setRoot(row)
        const dir = useDirectoryStore.getState()
        let author = dir.profilesById[row.user_id]
        if (!author) {
          const { data: p } = await supabase.from('profiles').select('*').eq('id', row.user_id).maybeSingle()
          if (p) {
            author = p as Profile
            dir.upsertProfile(author)
          }
        }
        if (alive) setRootAuthor(author ?? null)
      })
    return () => {
      alive = false
    }
  }, [rootId])

  const target: Target | null = useMemo(() => {
    if (!root) return null
    return root.channel_id ? { channelId: root.channel_id } : { conversationId: root.conversation_id! }
  }, [root])

  return (
    <div className="flex h-full flex-col bg-brand-950">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 safe-top">
        <h2 className="text-sm font-bold text-white">Thread</h2>
        <button onClick={closeThread} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </header>

      {!root || !target ? (
        <FullPageLoader label="Loading thread…" />
      ) : (
        <ThreadBody rootId={rootId} root={root} rootAuthor={rootAuthor} target={target} />
      )}
    </div>
  )
}

function ThreadBody({
  rootId,
  root,
  rootAuthor,
  target,
}: {
  rootId: string
  root: MessageRow
  rootAuthor: Profile | null
  target: Target
}) {
  const { messages, loading, hasMore, loadMore, send, edit, remove, toggleReaction } = useMessages(target, {
    parentId: rootId,
  })
  const mentionNames = useMemo(() => {
    const set = new Set<string>()
    useDirectoryStore.getState().profiles.forEach((p) => set.add(displayName(p).toLowerCase()))
    return set
  }, [])

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Root message */}
        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex gap-3">
            <Avatar profile={rootAuthor} size="md" />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-white">{displayName(rootAuthor)}</span>
                <span className="text-[11px] text-slate-500">{messageTime(root.created_at)}</span>
              </div>
              {(() => {
                const meta = (root.metadata ?? {}) as Record<string, any>
                if (meta.format === 'html' && typeof meta.html === 'string') {
                  return <RichCard html={meta.html} title={typeof meta.card_title === 'string' ? meta.card_title : undefined} />
                }
                return (
                  <div className="text-sm text-slate-200">
                    <RichText text={root.body} mentionNames={mentionNames} />
                  </div>
                )
              })()}
            </div>
          </div>
        </div>

        {hasMore && (
          <div className="py-2 text-center">
            <button onClick={loadMore} className="btn-ghost px-3 py-1 text-xs">Load earlier replies</button>
          </div>
        )}
        {loading ? (
          <FullPageLoader label="Loading replies…" />
        ) : messages.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No replies yet.</p>
        ) : (
          <div className="py-2">
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                showThread={false}
                onReact={(e) => toggleReaction(m.id, e)}
                onEdit={(body) => edit(m.id, body)}
                onDelete={() => remove(m.id)}
              />
            ))}
          </div>
        )}
      </div>

      <MessageComposer
        placeholder="Reply…"
        onSend={({ body, mentions, files, html }) => send({ body, mentions, files, html, parentId: rootId })}
      />
    </>
  )
}
