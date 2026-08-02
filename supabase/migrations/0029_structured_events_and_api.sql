-- 0029_structured_events_and_api.sql
-- Structured event layer + external read/write API support. NON-DESTRUCTIVE: every new column is
-- nullable or defaulted; nothing is dropped or rewritten. Existing free-text fields are preserved.
-- (cost = existing `price`; cover_image = existing `cover_url`.)

alter table public.events add column if not exists capacity integer;
alter table public.events add column if not exists registration_open boolean not null default true;
alter table public.events add column if not exists registration_count integer not null default 0;
alter table public.events add column if not exists channel_id uuid references public.channels(id) on delete set null;
alter table public.events add column if not exists root_message_id uuid references public.messages(id) on delete set null;

-- Tie chat messages to an event (its thread root + RSVP replies) for thread images + "who's coming".
alter table public.messages add column if not exists event_id uuid references public.events(id) on delete set null;
create index if not exists idx_messages_event on public.messages (event_id) where event_id is not null;

-- Registrations the consuming app writes back. Idempotent by (event_id,user_id). RLS on with no
-- policies → only the service-role edge function can touch it (ROP Chat's own UI uses event_rsvps).
create table if not exists public.event_registrations (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'registered' check (status in ('registered','cancelled')),
  source     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_registrations enable row level security;
create index if not exists idx_event_regs_event on public.event_registrations (event_id);

-- Configurable change-notification webhooks (start time / location / cancellation).
create table if not exists public.event_webhooks (
  id         uuid primary key default gen_random_uuid(),
  url        text not null,
  secret     text,
  is_active  boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.event_webhooks enable row level security;

create or replace function public.events_fire_change_webhooks()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  changed text[] := '{}';
  hook record;
begin
  if new.starts_at is distinct from old.starts_at then changed := array_append(changed, 'start'); end if;
  if (new.location is distinct from old.location) or (new.location_id is distinct from old.location_id)
    then changed := array_append(changed, 'location'); end if;
  if new.is_cancelled is distinct from old.is_cancelled then changed := array_append(changed, 'cancelled'); end if;
  if array_length(changed, 1) is null then return new; end if;

  for hook in select url, secret from public.event_webhooks where is_active loop
    perform net.http_post(
      url := hook.url,
      headers := jsonb_strip_nulls(jsonb_build_object('Content-Type','application/json','X-ROP-Webhook-Secret', hook.secret)),
      body := jsonb_build_object(
        'type', 'event.changed',
        'event_id', new.id,
        'changed', changed,
        'event', jsonb_build_object(
          'id', new.id, 'title', new.title, 'start', new.starts_at, 'end', new.ends_at,
          'location', new.location, 'is_cancelled', new.is_cancelled, 'updated_at', new.updated_at
        )
      )
    );
  end loop;
  return new;
end $$;

drop trigger if exists trg_events_change_webhooks on public.events;
create trigger trg_events_change_webhooks after update on public.events
  for each row execute function public.events_fire_change_webhooks();

-- A public "Events" channel to host each event's chat thread (created if missing).
insert into public.channels (slug, name, description, type, is_default, created_by)
select 'events', 'Events', 'Company events — RSVPs and who''s coming.', 'public', false, null
where not exists (select 1 from public.channels where slug = 'events');
