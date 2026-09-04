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
  | 'reminder'
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
  quiet_enabled?: boolean       // Do Not Disturb during set hours
  quiet_start?: string          // "22:00" (Eastern)
  quiet_end?: string            // "07:00" (Eastern)
  paused_until?: string | null  // pause ALL notifications until this ISO time (vacation); null = not paused
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
  secondary_role: string | null
  access_level: string
  location_id: string | null
  secondary_location_id: string | null
  department_id: string | null
  is_external: boolean
  is_external_guest: boolean
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
  category: string | null
  min_access_rank: number
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
export type ContactRow = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  kind: string
  access_level: string
  title: string | null
  note: string | null
  channels: string[]
  status: string
  invited_at: string | null
  invite_method: string | null
  linked_profile_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}
export type MessageReminderRow = {
  id: string
  user_id: string
  message_id: string
  remind_at: string | null
  fired_at: string | null
  note: string | null
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

export type EventAudience = 'all' | 'location' | 'department' | 'users'
export type EventFormat = 'in_person' | 'virtual'
export type EventCategory = 'team_meeting' | 'workshop' | 'community' | 'training' | 'social' | 'class' | 'other'
export type RsvpResponse = 'going' | 'interested' | 'cant_go'
export type EventRow = {
  id: string
  title: string
  description: string | null
  category: EventCategory
  format: EventFormat
  location: string | null
  location_url: string | null
  starts_at: string
  ends_at: string | null
  timezone: string
  organizer: string | null
  price: string | null
  cover_url: string | null
  capacity: number | null
  registration_open: boolean
  registration_count: number
  channel_id: string | null
  root_message_id: string | null
  audience: EventAudience
  location_id: string | null
  department_id: string | null
  target_user_ids: string[] | null
  created_by: string | null
  is_cancelled: boolean
  reminder_sent_at: string | null
  credit_hours: number | null
  credit_type: string | null
  created_at: string
  updated_at: string
}
export type EventRsvpRow = {
  event_id: string
  user_id: string
  response: RsvpResponse
  created_at: string
  updated_at: string
}
export type AttendanceStatus = 'attended' | 'no_show' | 'excused'
export type EventAttendanceRow = {
  event_id: string
  user_id: string
  status: AttendanceStatus
  hours: number
  marked_by: string | null
  marked_at: string
}
export type CohortRow = { id: string; name: string; description: string | null; created_at: string }
export type CohortMemberRow = { cohort_id: string; user_id: string; added_at: string }
export type EventViewRow = { event_id: string; user_id: string; viewed_at: string }
export type EventSubscriptionRow = { event_id: string; user_id: string; created_at: string }

export type ResourceCategory = 'dashboard' | 'guide' | 'link' | 'social' | 'form' | 'other'
export type ResourceRow = {
  id: string
  title: string
  url: string | null
  description: string | null
  category: ResourceCategory
  emoji: string | null
  sort: number
  created_by: string | null
  created_at: string
  updated_at: string
}

// ── Schedule feature ────────────────────────────────────────────────────────
export type ScheduleRole = 'desk' | 'phones' | 'offsite'
export type ScheduleDefaultShiftRow = {
  id: string
  user_id: string
  weekday: number // 0=Sun .. 6=Sat
  role: ScheduleRole
  location_id: string | null
  start_time: string // 'HH:MM:SS'
  end_time: string
  also_phones: boolean
  note: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
export type ScheduleQualificationRow = {
  id: string
  user_id: string
  role: 'desk' | 'phones'
  location_id: string | null
  created_at: string
}
export type TimeOffStatus = 'pending' | 'approved' | 'denied'
export type TimeOffRequestRow = {
  id: string
  user_id: string
  start_date: string
  end_date: string
  reason: string | null
  status: TimeOffStatus
  needs_coverage: boolean
  cover_user_id: string | null
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  created_at: string
}
export type CoverageStatus = 'open' | 'claimed' | 'assigned' | 'confirmed' | 'cancelled'
export type ScheduleCoverageRow = {
  id: string
  work_date: string
  covered_user_id: string | null
  covering_user_id: string | null
  role: 'desk' | 'phones'
  location_id: string | null
  start_time: string | null
  end_time: string | null
  note: string | null
  status: CoverageStatus
  time_off_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}
export type ScheduleOverrideRow = {
  id: string
  user_id: string
  work_date: string
  is_off: boolean
  role: ScheduleRole | null
  location_id: string | null
  start_time: string | null
  end_time: string | null
  also_phones: boolean
  note: string | null
  created_by: string | null
  created_at: string
}
export type ScheduleTargetRow = {
  id: string
  weekday: number | null
  scope: 'desk' | 'phones'
  location_id: string | null
  start_time: string | null
  end_time: string | null
  min_count: number
  note: string | null
  created_at: string
}
export type ScheduleDepartmentRow = {
  department_id: string
  enabled: boolean
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
      events: TableFor<EventRow>
      event_rsvps: TableFor<EventRsvpRow>
      event_attendance: TableFor<EventAttendanceRow>
      cohorts: TableFor<CohortRow>
      cohort_members: TableFor<CohortMemberRow>
      event_views: TableFor<EventViewRow>
      event_subscriptions: TableFor<EventSubscriptionRow>
      resources: TableFor<ResourceRow>
      audit_logs: TableFor<AuditLogRow>
      schedule_departments: TableFor<ScheduleDepartmentRow>
      schedule_qualifications: TableFor<ScheduleQualificationRow>
      schedule_default_shifts: TableFor<ScheduleDefaultShiftRow>
      time_off_requests: TableFor<TimeOffRequestRow>
      schedule_coverage: TableFor<ScheduleCoverageRow>
      schedule_overrides: TableFor<ScheduleOverrideRow>
      schedule_targets: TableFor<ScheduleTargetRow>
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
      set_event_rsvp: { Args: { p_event_id: string; p_response: string }; Returns: undefined }
      clear_event_rsvp: { Args: { p_event_id: string }; Returns: undefined }
      mark_event_viewed: { Args: { p_event_id: string }; Returns: undefined }
      set_event_subscription: { Args: { p_event_id: string; p_on: boolean }; Returns: undefined }
      notify_event: { Args: { p_event_id: string; p_kind?: string }; Returns: number }
      sched_request_time_off: {
        Args: { p_start: string; p_end: string; p_reason?: string | null; p_cover_user?: string | null; p_needs_coverage?: boolean }
        Returns: string
      }
      sched_decide_time_off: { Args: { p_id: string; p_approve: boolean; p_note?: string | null }; Returns: undefined }
      sched_claim_coverage: { Args: { p_id: string }; Returns: undefined }
      sched_assign_coverage: { Args: { p_id: string; p_user: string }; Returns: undefined }
      sched_actual_hours: {
        Args: { p_start: string; p_end: string }
        Returns: { user_id: string; work_date: string; location: string | null; department: string | null; hours: number }[]
      }
      sched_blvd_hours: {
        Args: { p_start: string; p_end: string }
        Returns: { user_id: string; work_date: string; location: string | null; role_name: string | null; scheduled_hours: number | null; booked_hours: number | null }[]
      }
      sched_assoc_sched: {
        Args: Record<string, never>
        Returns: { user_id: string; weekday: number; hours: number | null; location: string | null }[]
      }
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
