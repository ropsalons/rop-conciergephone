-- ROP Connect — Core schema
-- Architecture notes:
--   * Single-workspace model (one company, three salon locations) inspired by Mattermost/Slack
--     team→channel→message hierarchy, collapsed to channel→message since there is one team.
--   * Messages are polymorphic: exactly one of channel_id / conversation_id is set.
--   * Unread state is tracked with last_read_at on membership rows (channel_members /
--     direct_conversation_members) — the same approach Supabase Realtime chat examples use —
--     which keeps unread math to a single indexed COUNT rather than per-message read rows.
--   * Mentions, thread replies and reactions fan out into `notifications` via triggers.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Lookup tables
-- ---------------------------------------------------------------------------
create table if not exists public.roles (
  key         text primary key,
  label       text not null,
  rank        int  not null default 0,   -- higher = more privileged
  description text
);

create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text not null,
  address    text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.departments (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text,
  full_name          text not null default '',
  display_name       text,
  avatar_url         text,
  role               text not null default 'associate' references public.roles (key),
  location_id        uuid references public.locations (id) on delete set null,
  department_id      uuid references public.departments (id) on delete set null,
  title              text,
  phone              text,
  bio                text,
  presence           text not null default 'offline',    -- online | away | offline
  custom_status      text,
  notification_prefs jsonb not null default jsonb_build_object(
    'dm', true, 'mentions', true, 'announcements', true, 'urgent', true,
    'channels', true, 'browser_push', true, 'sound', true
  ),
  is_active          boolean not null default true,
  last_seen_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_profiles_location on public.profiles (location_id);
create index if not exists idx_profiles_department on public.profiles (department_id);
create index if not exists idx_profiles_role on public.profiles (role);
create index if not exists idx_profiles_name_trgm on public.profiles using gin (full_name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Channels
-- ---------------------------------------------------------------------------
create table if not exists public.channels (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  description   text,
  topic         text,
  type          text not null default 'public'
                  check (type in ('public','private','announcement','admin','location','department')),
  location_id   uuid references public.locations (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  is_default    boolean not null default false,   -- auto-join for everyone
  is_archived   boolean not null default false,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_channels_type on public.channels (type);
create index if not exists idx_channels_location on public.channels (location_id);
create index if not exists idx_channels_department on public.channels (department_id);
create index if not exists idx_channels_archived on public.channels (is_archived);

create table if not exists public.channel_members (
  channel_id   uuid not null references public.channels (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         text not null default 'member' check (role in ('member','admin')),
  is_muted     boolean not null default false,
  last_read_at timestamptz not null default now(),
  joined_at    timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index if not exists idx_channel_members_user on public.channel_members (user_id);

-- ---------------------------------------------------------------------------
-- Direct conversations (1:1 and group DMs)
-- ---------------------------------------------------------------------------
create table if not exists public.direct_conversations (
  id              uuid primary key default gen_random_uuid(),
  is_group        boolean not null default false,
  title           text,
  member_key      text unique,   -- sorted member id list for 1:1 dedupe
  created_by      uuid references public.profiles (id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table if not exists public.direct_conversation_members (
  conversation_id uuid not null references public.direct_conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  is_muted        boolean not null default false,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists idx_dm_members_user on public.direct_conversation_members (user_id);

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id                uuid primary key default gen_random_uuid(),
  channel_id        uuid references public.channels (id) on delete cascade,
  conversation_id   uuid references public.direct_conversations (id) on delete cascade,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  parent_message_id uuid references public.messages (id) on delete cascade,
  body              text not null default '',
  message_type      text not null default 'user' check (message_type in ('user','system')),
  metadata          jsonb not null default '{}'::jsonb,   -- { mentions: [uuid], ... }
  reply_count       int not null default 0,
  last_reply_at     timestamptz,
  is_edited         boolean not null default false,
  edited_at         timestamptz,
  is_deleted        boolean not null default false,
  deleted_at        timestamptz,
  is_pinned         boolean not null default false,
  pinned_by         uuid references public.profiles (id) on delete set null,
  pinned_at         timestamptz,
  created_at        timestamptz not null default now(),
  constraint msg_target_exactly_one
    check ((channel_id is not null)::int + (conversation_id is not null)::int = 1)
);
create index if not exists idx_messages_channel_created on public.messages (channel_id, created_at desc);
create index if not exists idx_messages_conversation_created on public.messages (conversation_id, created_at desc);
create index if not exists idx_messages_parent on public.messages (parent_message_id);
create index if not exists idx_messages_user on public.messages (user_id);
create index if not exists idx_messages_pinned on public.messages (channel_id) where is_pinned;
create index if not exists idx_messages_body_trgm on public.messages using gin (body gin_trgm_ops);

create table if not exists public.message_reactions (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index if not exists idx_reactions_message on public.message_reactions (message_id);

-- Reserved for explicit per-message read receipts (DM "seen" indicators).
create table if not exists public.message_reads (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Files (Supabase Storage metadata)
-- ---------------------------------------------------------------------------
create table if not exists public.files (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid references public.messages (id) on delete cascade,
  channel_id      uuid references public.channels (id) on delete cascade,
  conversation_id uuid references public.direct_conversations (id) on delete cascade,
  uploader_id     uuid not null references public.profiles (id) on delete cascade,
  bucket          text not null default 'attachments',
  path            text not null,
  name            text not null,
  mime_type       text,
  size_bytes      bigint not null default 0,
  width           int,
  height          int,
  created_at      timestamptz not null default now()
);
create index if not exists idx_files_channel on public.files (channel_id);
create index if not exists idx_files_conversation on public.files (conversation_id);
create index if not exists idx_files_uploader on public.files (uploader_id);
create index if not exists idx_files_name_trgm on public.files using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null,   -- mention | dm | reaction | thread_reply | announcement | urgent | channel_invite | system
  title       text not null,
  body        text,
  actor_id    uuid references public.profiles (id) on delete set null,
  link        text,
  entity_type text,
  entity_id   uuid,
  channel_id  uuid references public.channels (id) on delete cascade,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notifications_user_unread on public.notifications (user_id, is_read, created_at desc);

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null default '',
  author_id     uuid references public.profiles (id) on delete set null,
  audience      text not null default 'all' check (audience in ('all','location','department')),
  location_id   uuid references public.locations (id) on delete cascade,
  department_id uuid references public.departments (id) on delete cascade,
  is_pinned     boolean not null default false,
  requires_ack  boolean not null default false,
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_announcements_created on public.announcements (created_at desc);

create table if not exists public.announcement_acknowledgements (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Urgent alerts
-- ---------------------------------------------------------------------------
create table if not exists public.urgent_alerts (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  body            text not null default '',
  author_id       uuid references public.profiles (id) on delete set null,
  severity        text not null default 'urgent' check (severity in ('urgent','critical')),
  audience        text not null default 'all' check (audience in ('all','location','department','users')),
  location_id     uuid references public.locations (id) on delete cascade,
  department_id   uuid references public.departments (id) on delete cascade,
  target_user_ids uuid[],
  requires_ack    boolean not null default true,
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_urgent_created on public.urgent_alerts (created_at desc);

create table if not exists public.urgent_alert_acknowledgements (
  alert_id        uuid not null references public.urgent_alerts (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (alert_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Salon workflows
-- ---------------------------------------------------------------------------
create table if not exists public.daily_huddles (
  id                 uuid primary key default gen_random_uuid(),
  location_id        uuid not null references public.locations (id) on delete cascade,
  huddle_date        date not null default current_date,
  author_id          uuid references public.profiles (id) on delete set null,
  focus              text,
  service_sales_goal text,
  prebook_focus      text,
  retail_focus       text,
  guest_experience   text,
  staffing_notes     text,
  shoutouts          text,
  requires_ack       boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (location_id, huddle_date)
);
create index if not exists idx_huddles_location_date on public.daily_huddles (location_id, huddle_date desc);

create table if not exists public.daily_huddle_acknowledgements (
  huddle_id       uuid not null references public.daily_huddles (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (huddle_id, user_id)
);

create table if not exists public.shoutouts (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  category     text not null default 'above_and_beyond',
  message      text not null,
  location_id  uuid references public.locations (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_shoutouts_recipient on public.shoutouts (recipient_id);
create index if not exists idx_shoutouts_created on public.shoutouts (created_at desc);

create table if not exists public.guest_recovery_items (
  id               uuid primary key default gen_random_uuid(),
  guest_name       text not null,
  location_id      uuid references public.locations (id) on delete set null,
  involved_user_ids uuid[],
  issue_summary    text not null,
  urgency          text not null default 'medium' check (urgency in ('low','medium','high')),
  owner_id         uuid references public.profiles (id) on delete set null,
  status           text not null default 'new' check (status in ('new','in_progress','waiting','resolved')),
  notes            text,
  resolution       text,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  resolved_at      timestamptz
);
create index if not exists idx_guest_recovery_status on public.guest_recovery_items (status);
create index if not exists idx_guest_recovery_location on public.guest_recovery_items (location_id);

create table if not exists public.education_updates (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  body             text not null default '',
  category         text not null default 'general',   -- class | formula | product_tip | general
  author_id        uuid references public.profiles (id) on delete set null,
  required_reading boolean not null default false,
  requires_ack     boolean not null default false,
  location_id      uuid references public.locations (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_education_created on public.education_updates (created_at desc);

create table if not exists public.education_acknowledgements (
  education_id    uuid not null references public.education_updates (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (education_id, user_id)
);

create table if not exists public.scheduling_posts (
  id          uuid primary key default gen_random_uuid(),
  type        text not null default 'open_shift'
                check (type in ('open_shift','coverage_request','staffing_need')),
  location_id uuid references public.locations (id) on delete set null,
  title       text not null,
  details     text,
  shift_date  date,
  status      text not null default 'open' check (status in ('open','filled','cancelled')),
  author_id   uuid references public.profiles (id) on delete set null,
  claimed_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_scheduling_location on public.scheduling_posts (location_id);
create index if not exists idx_scheduling_status on public.scheduling_posts (status);

-- ---------------------------------------------------------------------------
-- Audit logs
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_created on public.audit_logs (created_at desc);
create index if not exists idx_audit_actor on public.audit_logs (actor_id);
