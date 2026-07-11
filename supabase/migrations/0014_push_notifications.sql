-- ROP Connect — mobile Web Push (background notifications).
-- Stores each device's push subscription and fans a push out whenever a notification
-- row is inserted, honoring the user's notification_prefs and per-channel mute.
-- The actual encryption/send happens in the `push-send` Edge Function (VAPID); this
-- trigger only decides *whether* to send and hands the subscription + payload to it.

-- 1) Per-device push subscriptions (one row per browser/PWA install) ------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists idx_push_subs_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push subs select own" on public.push_subscriptions;
create policy "push subs select own" on public.push_subscriptions
  for select using (user_id = auth.uid());
drop policy if exists "push subs insert own" on public.push_subscriptions;
create policy "push subs insert own" on public.push_subscriptions
  for insert with check (user_id = auth.uid());
drop policy if exists "push subs update own" on public.push_subscriptions;
create policy "push subs update own" on public.push_subscriptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "push subs delete own" on public.push_subscriptions;
create policy "push subs delete own" on public.push_subscriptions
  for delete using (user_id = auth.uid());

-- 2) Async HTTP from Postgres ---------------------------------------------------
create extension if not exists pg_net with schema extensions;

-- 3) Fan a push out for every notification, respecting prefs + channel mute ------
--    Default scope (a fresh profile only pushes for these once mobile_push is on):
--      dm, mention, thread_reply -> gated by prefs.dm / prefs.mentions
--      announcement, urgent       -> gated by prefs.announcements / prefs.urgent
--    reaction / channel_invite / system are intentionally silent on mobile.
--    A channel the user has muted (channel_members.is_muted) never pushes.
create or replace function public.push_on_notification()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  pref jsonb;
  allow boolean;
  muted boolean;
  sub record;
  fn_url text := 'https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/push-send';
begin
  select notification_prefs into pref from public.profiles where id = new.user_id;

  -- Master switch: nothing goes to a phone unless the user turned on mobile push.
  if coalesce((pref->>'mobile_push')::boolean, false) = false then
    return new;
  end if;

  allow := case new.type
    when 'dm'           then coalesce((pref->>'dm')::boolean, true)
    when 'mention'      then coalesce((pref->>'mentions')::boolean, true)
    when 'thread_reply' then coalesce((pref->>'mentions')::boolean, true)
    when 'announcement' then coalesce((pref->>'announcements')::boolean, true)
    when 'urgent'       then coalesce((pref->>'urgent')::boolean, true)
    else false
  end;
  if not allow then return new; end if;

  -- Per-channel mute wins over everything.
  if new.channel_id is not null then
    select is_muted into muted from public.channel_members
      where channel_id = new.channel_id and user_id = new.user_id;
    if coalesce(muted, false) then return new; end if;
  end if;

  for sub in
    select endpoint, p256dh, auth from public.push_subscriptions where user_id = new.user_id
  loop
    perform net.http_post(
      url := fn_url,
      -- The shared x-cron-secret is injected when this migration is applied to the live
      -- project (kept out of the committed copy); it matches the value baked into push-send.
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'REDACTED_SEE_DEPLOYED_DB'),
      body := jsonb_build_object(
        'subscription', jsonb_build_object(
          'endpoint', sub.endpoint,
          'keys', jsonb_build_object('p256dh', sub.p256dh, 'auth', sub.auth)
        ),
        'payload', jsonb_build_object(
          'title', new.title,
          'body', new.body,
          'url', coalesce(new.link, '/'),
          'tag', new.id::text
        )
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_push_on_notification on public.notifications;
create trigger trg_push_on_notification after insert on public.notifications
  for each row execute function public.push_on_notification();
