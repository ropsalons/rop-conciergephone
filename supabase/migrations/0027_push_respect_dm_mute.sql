-- 0027_push_respect_dm_mute.sql
-- Per-DM mute in the push fan-out.
--
-- Muting a direct conversation (direct_conversation_members.is_muted) now suppresses the PHONE
-- push, but the notification row is still written — so the unread bubble/count stays visible and
-- you can catch up when you want. This mirrors how channel mute already works, and is the fix for
-- busy group DMs where every one-line reply was buzzing everyone.
--
-- NOTE: the deployed copy of this function carries the real x-cron-secret used to call push-send;
-- it is REDACTED here (committed copies never hold live secrets). The live function was updated via
-- apply_migration with the real value intact.
create or replace function public.push_on_notification()
returns trigger language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare
  pref jsonb; allow boolean; lvl text; sub record;
  tz text; local_t time; qs time; qe time; in_quiet boolean;
  fn_url text := 'https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/push-send';
begin
  select notification_prefs into pref from public.profiles where id = new.user_id;
  if coalesce((pref->>'mobile_push')::boolean, false) = false then return new; end if;
  allow := case new.type
    when 'dm' then coalesce((pref->>'dm')::boolean, true)
    when 'mention' then coalesce((pref->>'mentions')::boolean, true)
    when 'thread_reply' then coalesce((pref->>'mentions')::boolean, true)
    when 'announcement' then coalesce((pref->>'announcements')::boolean, true)
    when 'urgent' then coalesce((pref->>'urgent')::boolean, true)
    when 'channel' then coalesce((pref->>'channels')::boolean, true)
    when 'reminder' then true
    else false end;
  if not allow then return new; end if;

  -- Quiet hours + vacation pause never silence an URGENT alert.
  if new.type <> 'urgent' then
    if (pref->>'paused_until') is not null and (pref->>'paused_until')::timestamptz > now() then
      return new;
    end if;
    if coalesce((pref->>'quiet_enabled')::boolean, false) then
      tz := coalesce(nullif(pref->>'quiet_timezone',''), 'America/New_York');
      local_t := (now() at time zone tz)::time;
      qs := coalesce(nullif(pref->>'quiet_start',''), '22:00')::time;
      qe := coalesce(nullif(pref->>'quiet_end',''), '07:00')::time;
      if qs <= qe then
        in_quiet := local_t >= qs and local_t < qe;
      else
        in_quiet := local_t >= qs or local_t < qe;
      end if;
      if in_quiet then return new; end if;
    end if;
  end if;

  -- Per-channel mute wins over everything.
  if new.channel_id is not null then
    select notify_level into lvl from public.channel_members where channel_id = new.channel_id and user_id = new.user_id;
    if coalesce(lvl,'mentions') = 'mute' then return new; end if;
  end if;

  -- Per-DM mute: a muted direct conversation still records the notification (unread stays) but
  -- doesn't buzz the phone. Applies to any message-linked notification not tied to a channel.
  if new.channel_id is null and new.entity_type = 'message' and new.entity_id is not null then
    if exists (
      select 1 from public.messages m
      join public.direct_conversation_members dcm
        on dcm.conversation_id = m.conversation_id and dcm.user_id = new.user_id
      where m.id = new.entity_id and coalesce(dcm.is_muted, false)
    ) then
      return new;
    end if;
  end if;

  for sub in select endpoint, p256dh, auth from public.push_subscriptions where user_id = new.user_id loop
    perform net.http_post(
      url := fn_url,
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','REDACTED_SEE_DEPLOYED_DB'),
      body := jsonb_build_object(
        'subscription', jsonb_build_object('endpoint', sub.endpoint, 'keys', jsonb_build_object('p256dh', sub.p256dh, 'auth', sub.auth)),
        'payload', jsonb_build_object('title', new.title, 'body', new.body, 'url', coalesce(new.link,'/'), 'tag', new.id::text)));
  end loop;
  return new;
end $function$;
