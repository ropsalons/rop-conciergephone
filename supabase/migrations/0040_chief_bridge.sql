-- 0040_chief_bridge.sql
-- "Chief" — Robert DiLella's chief-of-staff bridge to Grok Bot.
--
-- Chief is a real ROP Chat user (its own profile) so people can @Chief, DM it, and add it to group
-- DMs, and its posts render natively as Chief. It is ALSO an AI agent (token) whose gateway calls post
-- AS the Chief profile (post_as_user_id), so Grok Bot replies show as Chief — never "Grok" or a
-- generic system account.
--
-- Event-driven (NOT polling): an AFTER INSERT trigger on messages fires an outbound webhook the instant
-- a message targets Chief — an @Chief mention (in a public channel or a private one Chief is in), a 1:1
-- DM, a group DM including Chief, or a thread reply on a message Chief posted or was @mentioned in.
-- Nothing else wakes Chief. Delivery is idempotent per message_id and retried with backoff.

-- ── Identity constants ───────────────────────────────────────────────────────
--   Chief profile/user id : 00000000-0000-4000-8000-0000000c41ef
--   Integrations bot id   : 00000000-0000-4000-8000-00000000b010 (unused here; Chief has its own id)

-- 1. A distinct role for Chief (satisfies profiles.role → roles.key; not a salon/concierge role).
insert into public.roles (key, rank, label, description)
values ('chief', 15, 'Chief of Staff', 'Robert''s chief-of-staff bridge (AI). Not a salon, concierge, or monitor bot.')
on conflict (key) do nothing;

-- 2. Chief's auth user (profiles.id → auth.users.id). handle_new_user() will auto-create the profile
--    from raw_user_meta_data and join the default channels.
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-0000000c41ef',
  'authenticated', 'authenticated', 'chief@ropsalons.com',
  '{"provider":"system","providers":["system"]}'::jsonb,
  jsonb_build_object('full_name','Chief','display_name','Chief','role','chief'),
  now(), now(), now()
)
on conflict (id) do nothing;

-- 3. Make sure the Chief profile is active + correctly labeled (whether the trigger made it or not).
insert into public.profiles (id, email, full_name, display_name, role, access_level, is_active, is_external, is_external_guest, bio)
values ('00000000-0000-4000-8000-0000000c41ef', 'chief@ropsalons.com', 'Chief', 'Chief', 'chief', 'member', true, false, false,
        'Robert''s chief-of-staff bridge (AI). @Chief, DM, or reply and Chief responds.')
on conflict (id) do update
  set full_name = 'Chief', display_name = 'Chief', role = 'chief', is_active = true,
      is_external = false, is_external_guest = false,
      bio = 'Robert''s chief-of-staff bridge (AI). @Chief, DM, or reply and Chief responds.';

-- 4. Let an agent post AS a specific user (Chief) instead of the shared Integrations bot.
alter table public.ai_agents add column if not exists post_as_user_id uuid references public.profiles(id);

-- 5. The Chief agent (token) — Grok Bot authenticates with this to talk back as Chief.
--    token_hash = sha256hex('rop_ai_chief_742a86a0b38537a1865fe5dde68a34b03873c513') (plaintext handed to Robert out-of-band).
insert into public.ai_agents
  (name, slug, provider, agent_type, owner_id, is_active, token_prefix, token_hash,
   channel_scope, allow_dms, allowed_actions, require_approval_for, rate_per_min, post_as_user_id, created_by)
values (
  'Chief', 'chief', 'grok', 'chief', '6cd61125-689a-4889-82ab-fb5835acf59c', true,
  'rop_ai_chief_742', '29b27fb8e174f242f3b6e9b4a7bfb7a645119e88b6fb73e6227d48610186cc59',
  'all', true,
  array['list_channels','list_users','read_channel_messages','read_thread','search_messages',
        'read_dm','read_direct_messages','post_message','reply_thread','send_dm','send_group_dm'],
  '{}', 600, '00000000-0000-4000-8000-0000000c41ef', '6cd61125-689a-4889-82ab-fb5835acf59c'
)
on conflict (slug) do update
  set post_as_user_id = excluded.post_as_user_id, is_active = true, channel_scope = 'all',
      allow_dms = true, allowed_actions = excluded.allowed_actions, rate_per_min = 600,
      token_prefix = excluded.token_prefix, token_hash = excluded.token_hash, provider = 'grok';

-- 6. Where Chief's events go: the Grok Bot routine webhook (URL + shared secret). Single active row.
create table if not exists public.chief_webhooks (
  id          uuid primary key default gen_random_uuid(),
  url         text not null,
  secret      text,
  is_active   boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 7. Owner mute: silence Chief in a given channel without disabling it everywhere.
create table if not exists public.chief_channel_mutes (
  channel_id  uuid primary key references public.channels(id) on delete cascade,
  muted_by    uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- 8. Delivery log — idempotency (one row per message_id) + retry/backoff bookkeeping.
create table if not exists public.chief_deliveries (
  message_id      uuid primary key,
  event           text not null,
  payload         jsonb not null,
  request_id      bigint,
  attempts        int not null default 0,
  delivered       boolean not null default false,
  last_status     int,
  error           text,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index if not exists chief_deliveries_pending on public.chief_deliveries (next_attempt_at)
  where not delivered;

alter table public.chief_webhooks       enable row level security;
alter table public.chief_channel_mutes  enable row level security;
alter table public.chief_deliveries      enable row level security;
-- chief_webhooks / chief_deliveries: no client policy → only the service role and SECURITY DEFINER
-- functions can read them (keeps the webhook secret out of client reach). Owners manage mutes:
drop policy if exists chief_mutes_admin on public.chief_channel_mutes;
create policy chief_mutes_admin on public.chief_channel_mutes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 9. Is this message aimed at Chief by @mention? (metadata.mentions OR "@Chief"/"@chief" in the body.)
create or replace function public.chief_is_mentioned(p_body text, p_metadata jsonb)
returns boolean language sql immutable as $$
  select
    coalesce(p_metadata ? 'mentions' and (p_metadata->'mentions') @> '"00000000-0000-4000-8000-0000000c41ef"'::jsonb, false)
    or (position('@' in coalesce(p_body,'')) > 0
        and coalesce(p_body,'') ~* '(^|[^[:alnum:]])@chief([^[:alnum:]]|$)');
$$;

-- 10. The dispatcher: fire the webhook the instant a message targets Chief.
create or replace function public.dispatch_to_chief()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  chief_id constant uuid := '00000000-0000-4000-8000-0000000c41ef';
  ev        text;
  is_dm     boolean := false;
  is_grp    boolean;
  targeted  boolean := false;
  hook      record;
  s_name    text;
  s_email   text;
  ch        record;
  parent    record;
  channel_json jsonb := null;
  permalink text;
  payload   jsonb;
  rc        int;
  req_id    bigint;
begin
  -- Loop-safe: Chief's own posts never wake Chief.
  if new.user_id = chief_id then
    return new;
  end if;

  -- Determine whether this message targets Chief, and which event it is.
  if new.conversation_id is not null then
    if exists (select 1 from public.direct_conversation_members m
               where m.conversation_id = new.conversation_id and m.user_id = chief_id) then
      select is_group into is_grp from public.direct_conversations where id = new.conversation_id;
      ev := case when coalesce(is_grp,false) then 'group_dm' else 'dm' end;
      is_dm := true;
      targeted := true;
    end if;
  elsif new.channel_id is not null then
    -- @Chief mention, but only in a channel Chief can see (public, or a private one Chief is in).
    if public.chief_is_mentioned(new.body, new.metadata)
       and (exists (select 1 from public.channels c where c.id = new.channel_id and c.type = 'public')
            or exists (select 1 from public.channel_members cm where cm.channel_id = new.channel_id and cm.user_id = chief_id)) then
      ev := 'mention';
      targeted := true;
    elsif new.parent_message_id is not null then
      select user_id, body, metadata into parent from public.messages where id = new.parent_message_id;
      if parent.user_id = chief_id or public.chief_is_mentioned(parent.body, parent.metadata) then
        ev := 'thread_reply';
        targeted := true;
      end if;
    end if;
  end if;

  if not targeted then
    return new;
  end if;

  -- Owner mute for this channel.
  if new.channel_id is not null
     and exists (select 1 from public.chief_channel_mutes where channel_id = new.channel_id) then
    return new;
  end if;

  -- Active webhook (skip entirely if none configured yet — no backlog builds up).
  select url, secret into hook from public.chief_webhooks
    where is_active and url ~ '^https://' order by updated_at desc limit 1;
  if hook.url is null then
    return new;
  end if;

  -- Build payload.
  select coalesce(nullif(display_name,''), full_name, 'Someone'), email into s_name, s_email
    from public.profiles where id = new.user_id;
  if new.channel_id is not null then
    select slug, name into ch from public.channels where id = new.channel_id;
    channel_json := jsonb_build_object('id', new.channel_id, 'slug', ch.slug, 'name', ch.name);
    permalink := 'https://chat.ropsalons.com/#/channel/' || new.channel_id || '?m=' || new.id;
  else
    permalink := 'https://chat.ropsalons.com/#/dm/' || new.conversation_id || '?m=' || new.id;
  end if;

  payload := jsonb_build_object(
    'event', ev,
    'occurred_at', to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'message_id', new.id,
    'thread_id', new.parent_message_id,
    'conversation_id', new.conversation_id,
    'channel', channel_json,
    'is_dm', is_dm,
    'sender', jsonb_build_object('id', new.user_id, 'display_name', s_name, 'email', s_email),
    'text', new.body,
    'mentioned_chief', true,
    'permalink', permalink
  );

  -- Idempotency: one row per message_id. If it already exists, this message already fired — stop.
  insert into public.chief_deliveries (message_id, event, payload, attempts, next_attempt_at)
  values (new.id, ev, payload, 0, now())
  on conflict (message_id) do nothing;
  get diagnostics rc = row_count;
  if rc = 0 then
    return new;
  end if;

  -- Fire immediately (async, non-blocking).
  req_id := net.http_post(
    url := hook.url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-ROP-Webhook-Secret', coalesce(hook.secret, ''),
      'X-ROP-Event', ev,
      'X-ROP-Bot', 'Chief'
    ),
    body := payload
  );

  update public.chief_deliveries
    set request_id = req_id, attempts = 1, last_attempt_at = now(), next_attempt_at = now() + interval '45 seconds'
    where message_id = new.id;

  return new;
end;
$$;

drop trigger if exists dispatch_to_chief_ai on public.messages;
create trigger dispatch_to_chief_ai
  after insert on public.messages
  for each row execute function public.dispatch_to_chief();

-- 11. Retry/backoff worker: check the async response for each pending delivery; on a non-2xx (or no
--     response within the window) re-post with exponential backoff, up to 6 attempts total.
create or replace function public.chief_retry_deliveries()
returns void
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  hook record;
  d    record;
  resp record;
  req_id bigint;
begin
  select url, secret into hook from public.chief_webhooks
    where is_active and url ~ '^https://' order by updated_at desc limit 1;
  if hook.url is null then
    return;
  end if;

  for d in
    select * from public.chief_deliveries
    where not delivered and attempts between 1 and 5 and next_attempt_at <= now()
    order by created_at limit 100
  loop
    select status_code, error_msg into resp from net._http_response where id = d.request_id;

    if resp.status_code between 200 and 299 then
      update public.chief_deliveries set delivered = true, last_status = resp.status_code
        where message_id = d.message_id;
    elsif resp.status_code is not null or resp.error_msg is not null
          or (now() - coalesce(d.last_attempt_at, d.created_at)) > interval '2 minutes' then
      -- Failed, or no response arrived in time → re-post with backoff.
      req_id := net.http_post(
        url := hook.url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-ROP-Webhook-Secret', coalesce(hook.secret, ''),
          'X-ROP-Event', d.event,
          'X-ROP-Bot', 'Chief'
        ),
        body := d.payload
      );
      update public.chief_deliveries
        set request_id = req_id, attempts = attempts + 1, last_attempt_at = now(),
            next_attempt_at = now() + (interval '30 seconds' * power(2, attempts)),
            last_status = resp.status_code, error = resp.error_msg
        where message_id = d.message_id;
    end if;
  end loop;
end;
$$;

-- Run the retry sweep once a minute.
select cron.unschedule('chief-retry-deliveries') where exists (select 1 from cron.job where jobname = 'chief-retry-deliveries');
select cron.schedule('chief-retry-deliveries', '* * * * *', $$select public.chief_retry_deliveries();$$);
