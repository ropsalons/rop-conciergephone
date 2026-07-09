export * from './database.types'
import type {
  ProfileRow,
  MessageRow,
  ChannelRow,
  MessageReactionRow,
  FileRow,
  DirectConversationRow,
} from './database.types'

// Enriched shapes the UI passes around (row + joined relations).
export type Profile = ProfileRow

export interface MessageWithAuthor extends MessageRow {
  author?: Profile | null
  reactions?: MessageReactionRow[]
  files?: FileRow[]
}

export interface ChannelWithMeta extends ChannelRow {
  unread?: number
  is_muted?: boolean
  is_member?: boolean
}

export interface ConversationWithMeta extends DirectConversationRow {
  members?: Profile[]
  unread?: number
  is_muted?: boolean
}
