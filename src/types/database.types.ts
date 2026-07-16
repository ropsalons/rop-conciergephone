// Hand-authored types mirroring supabase/migrations. If you provision a project you can
// regenerate a stricter version with:  supabase gen types typescript --project-id <id>
// Insert/Update are modeled as Partial<Row> for ergonomic client writes; the database and
// RLS remain the source of truth for required columns and permissions.

export type Presence = 'online' | 'away' | 'offline'
export type ChannelType = 'public' | 'private' | 'announcement' | 'admin' | 'location' | 'department'
export type GuestRecoveryStatus = 'new' | 'in_progress' | 'waiting' | 'resolved'
export type Urgency = 'low' | 'medium' | 'high'
export type AlertAudience = 'all' | 'location' | 'department' | 'users'
export type AnnouncementAudience = 'all' | 'location' | 'department'
export type SchedulingType = 'open_shift' | 'coverage_request' | 'staffing_need'
export type NotificationType =
  | 'mention'
  | 'dm'
  | 'reaction'
  | 'thread_reply'
  | 'announcement'
  | 'urgent'
  | 'channel'
  | 'channel_invite'
  | 'system'

export type NotificationPrefs = {
  dm: boolean
  mentions: boolean
  announcements: boolean
  urgent: boolean
  channels: boolean
  browser_push: boolean
  mobile_push: boolean // master switch for background push to this user's devices
  sound: boolean
}

export type RoleRow = {
  key: string
  label: string
  rank: number
  description: string | null
}
export type LocationRow = {
  id: string
  slug: string
  name: string
  address: string | null
  sort_order: number
  created_at: string
}
export type DepartmentRow = {
  id: string
  slug: string
  name: string
  created_at: string
}
export type ProfileRow = {
  id: string
  email: string | null
  full_name: string
  display_name: string | null
  avatar_url: string | null
  role: string
  location_id: string | null
  department_id: string | null
  title: string | null
  phone: string | null
  bio: string | null
  presence: Presence
  custom_status: string | null
  notification_prefs: NotificationPrefs
  is_active: boolean
  last_seen_at: string | null
  created_at: string
  updated_at: string
}
export type ChannelRow = {
  id: string
  slug: string
  name: string
  description: string | null
  topic: string | null
  type: ChannelType
  location_id: string | null
  department_id: string | null
  is_default: boolean
  is_archived: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}
export type ChannelMemberRow = {
  channel_id: string
  user_id: string
  role: 'member' | 'admin'
  is_muted: boolean
  notify_level: 'all' | 'mentions' | 'mute'
  is_favorite: boolean
  last_read_at: string
  joined_at: string
}
export type DirectConversationRow = {
  id: string
  is_group: boolean
  title: string | null
  member_key: string | null
  created_by: string | null
  last_message_at: string
  created_at: string
}
export type DirectConversationMemberRow = {
  conversation_id: string
  user_id: string
  last_read_at: string
  is_muted: boolean
  joined_at: string
}
export type MessageRow = {
  id: string
  channel_id: string | null
  conversation_id: string | null
  user_id: string
  parent_message_id: string | null
  body: string
  message_type: 'user' | 'system'
  metadata: Record<string, unknown> & { mentions?: string[] }
  reply_count: number
  last_reply_at: string | null
  is_edited: boolean
  edited_at: string | null
  is_deleted: boolean
  deleted_at: string | null
  is_pinned: boolean
  pinned_by: string | null
  pinned_at: string | null
  created_at: string
}
export type MessageReactionRow = {
  id: string
  message_id: string
  user_id: string
  emoji: string
  created_at: string
}
export type MessageReadRow = {
  message_id: string
  user_id: string
  read_at: string
}
export type FileRow = {
  id: string
  message_id: string | null
  channel_id: string | null
  conversation_id: string | null
  uploader_id: string
  bucket: string
  path: string
  name: string
  mime_type: string | null
  size_bytes: number
  width: number | null
  height: number | null
  created_at: string
}
export type NotificationRow = {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  actor_id: string | null
  link: string | null
  entity_type: string | null
  entity_id: string | null
  channel_id: string | null
  is_read: boolean
  created_at: string
}
export type AnnouncementRow = {
  id: string
  title: string
  body: string
  author_id: string | null
  audience: AnnouncementAudience
  location_id: string | null
  department_id: string | null
  is_pinned: boolean
  requires_ack: boolean
  expires_at: string | null
  created_at: string
  updated_at: string
}
export type AnnouncementAckRow = {
  announcement_id: string
  user_id: string
  acknowledged_at: string
}
export type UrgentAlertRow = {
  id: string
  title: string
  body: string
  author_id: string | null
  severity: 'urgent' | 'critical'
  audience: AlertAudience
  location_id: string | null
  department_id: string | null
  target_user_ids: string[] | null
  requires_ack: boolean
  expires_at: string | null
  created_at: string
}
export type UrgentAlertAckRow = {
  alert_id: string
  user_id: string
  acknowledged_at: string
}
export type DailyHuddleRow = {
  id: string
  location_id: string
  huddle_date: string
  author_id: string | null
  focus: string | null
  service_sales_goal: string | null
  prebook_focus: string | null
  retail_focus: string | null
  guest_experience: string | null
  staffing_notes: string | null
  shoutouts: string | null
  requires_ack: boolean
  created_at: string
  updated_at: string
}
export type DailyHuddleAckRow = {
  huddle_id: string
  user_id: string
  acknowledged_at: string
}
export type ShoutoutRow = {
  id: string
  author_id: string
  recipient_id: string
  category: string
  message: string
  location_id: string | null
  created_at: string
}
export type GuestRecoveryRow = {
  id: string
  guest_name: string
  location_id: string | null
  involved_user_ids: string[] | null
  issue_summary: string
  urgency: Urgency
  owner_id: string | null
  status: GuestRecoveryStatus
  notes: string | null
  resolution: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
}
export type EducationUpdateRow = {
  id: string
  title: string
  body: string
  category: string
  author_id: string | null
  required_reading: boolean
  requires_ack: boolean
  location_id: string | null
  created_at: string
  updated_at: string
}
export type EducationAckRow = {
  education_id: string
  user_id: string
  acknowledged_at: string
}
export type SchedulingPostRow = {
  id: string
  type: SchedulingType
  location_id: string | null
  title: string
  details: string | null
  shift_date: string | null
  status: 'open' | 'filled' | 'cancelled'
  author_id: string | null
  claimed_by: string | null
  created_at: string
  updated_at: string
}
export type AuditLogRow = {
  id: string
  actor_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

type TableFor<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] }

export type Database = {
  public: {
    Tables: {
      roles: TableFor<RoleRow>
      locations: TableFor<LocationRow>
      departments: TableFor<DepartmentRow>
      profiles: TableFor<ProfileRow>
      channels: TableFor<ChannelRow>
      channel_members: TableFor<ChannelMemberRow>
      direct_conversations: TableFor<DirectConversationRow>
      direct_conversation_members: TableFor<DirectConversationMemberRow>
      messages: TableFor<MessageRow>
      message_reactions: TableFor<MessageReactionRow>
      message_reads: TableFor<MessageReadRow>
      files: TableFor<FileRow>
      notifications: TableFor<NotificationRow>
      announcements: TableFor<AnnouncementRow>
      announcement_acknowledgements: TableFor<AnnouncementAckRow>
      urgent_alerts: TableFor<UrgentAlertRow>
      urgent_alert_acknowledgements: TableFor<UrgentAlertAckRow>
      daily_huddles: TableFor<DailyHuddleRow>
      daily_huddle_acknowledgements: TableFor<DailyHuddleAckRow>
      shoutouts: TableFor<ShoutoutRow>
      guest_recovery_items: TableFor<GuestRecoveryRow>
      education_updates: TableFor<EducationUpdateRow>
      education_acknowledgements: TableFor<EducationAckRow>
      scheduling_posts: TableFor<SchedulingPostRow>
      audit_logs: TableFor<AuditLogRow>
    }
    Views: Record<string, never>
    Functions: {
      get_or_create_dm: { Args: { other_user: string }; Returns: string }
      create_group_dm: { Args: { member_ids: string[]; group_title?: string | null }; Returns: string }
      mark_channel_read: { Args: { cid: string }; Returns: undefined }
      mark_conversation_read: { Args: { convid: string }; Returns: undefined }
      get_unread_summary: { Args: Record<string, never>; Returns: UnreadSummary }
      search_messages: {
        Args: { p_query: string; p_limit?: number; p_sender?: string | null; p_from?: string | null; p_links_only?: boolean }
        Returns: MessageRow[]
      }
      mark_all_notifications_read: { Args: Record<string, never>; Returns: undefined }
      report_app_problem: { Args: { p_message: string; p_context?: string | null }; Returns: string }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type UnreadSummary = {
  channels: { channel_id: string; unread: number }[]
  conversations: { conversation_id: string; unread: number }[]
  notifications: number
  mentions: number
}
