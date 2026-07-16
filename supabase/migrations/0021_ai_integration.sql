-- AI integration data model: agent identities, per-channel permissions, audit log, approval queue,
-- tasks, and a global kill-switch. Additive & reversible — existing chat behavior is untouched.
-- (Applied to the live project via Supabase migrations; committed here for version control.)

create extension if not exists pgcrypto with schema extensions;

alter table public.channels add column if not exists ai_excluded boolean not null default false;

create table if not exists public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  provider text not null default 'anthropic',
  agent_type text not null default 'assistant',
  owner_id uuid references public.profiles(id),
  is_active boolean not null default true,
  token_prefix text not null,
  token_hash text not null unique,
  channel_scope text not null default 'listed' check (channel_scope in ('listed','all_public')),
  allow_dms boolean not null default false,
  allowed_actions text[] not null default array[
    'list_channels','read_channel_messages','read_thread','search_messages','post_message','reply_thread'
  ],
  require_approval_for text[] not null default array[]::text[],
  rate_per_min int not null default 60,
  last_used_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_agent_channels (
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  can_read boolean not null default true,
  can_post boolean not null default true,
  primary key (agent_id, channel_id)
);

create table if not exists public.ai_audit_logs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.ai_agents(id) on delete set null,
  action text not null,
  target_type text,
  channel_id uuid,
  target_id uuid,
  allowed boolean not null default false,
  status text not null default 'ok',
  error text,
  correlation_id text,
  idempotency_key text,
  source_ip text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_audit_agent_time on public.ai_audit_logs (agent_id, created_at desc);
create index if not exists ai_audit_time on public.ai_audit_logs (created_at desc);
create unique index if not exists ai_audit_idem on public.ai_audit_logs (agent_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.ai_action_approvals (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.ai_agents(id) on delete cascade,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  preview text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','executed')),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  note text,
  result jsonb,
  expires_at timestamptz not null default now() + interval '7 days'
);
create index if not exists ai_approvals_status on public.ai_action_approvals (status, requested_at desc);

create table if not exists public.ai_tasks (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.ai_agents(id) on delete set null,
  title text not null,
  body text,
  status text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  channel_id uuid references public.channels(id) on delete set null,
  assignee_id uuid references public.profiles(id) on delete set null,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_tasks_status on public.ai_tasks (status, created_at desc);

create table if not exists public.ai_settings (
  only_row boolean primary key default true check (only_row),
  ai_enabled boolean not null default true,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.ai_settings (only_row, ai_enabled) values (true, true) on conflict (only_row) do nothing;

-- Lock to service-role + admin RPCs only (no direct client access; token hashes never reach clients).
alter table public.ai_agents enable row level security;
alter table public.ai_agent_channels enable row level security;
alter table public.ai_audit_logs enable row level security;
alter table public.ai_action_approvals enable row level security;
alter table public.ai_tasks enable row level security;
alter table public.ai_settings enable row level security;
