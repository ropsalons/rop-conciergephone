import type { ConversationWithMeta, Profile } from '@/types'
import { displayName } from './utils'

export function otherMembers(conv: ConversationWithMeta, meId?: string): Profile[] {
  return (conv.members ?? []).filter((m) => m.id !== meId)
}

export function conversationName(conv: ConversationWithMeta, meId?: string): string {
  if (conv.title) return conv.title
  const others = otherMembers(conv, meId)
  if (others.length === 0) return 'Just you'
  if (others.length === 1) return displayName(others[0])
  return others.map((p) => displayName(p).split(' ')[0]).join(', ')
}
