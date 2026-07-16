-- AI auto-responder: tracks which human messages have already been answered (idempotency), so the
-- scheduled ai-responder function never replies to the same message twice. (Applied live; committed
-- here for version control.) The #ask-ai channel + the every-minute pg_cron schedule are data/ops
-- set up on the live project (see docs/ai-integration.md).
create table if not exists public.ai_responder_seen (
  message_id uuid primary key,
  answered_at timestamptz not null default now()
);
alter table public.ai_responder_seen enable row level security;  -- service-role only
