-- 0031_mention_by_name_notifies.sql
-- Make @tagging notify for real, everywhere.
--
-- A channel message now notifies anyone whose name is @mentioned in the body text, in ADDITION to
-- the app's explicit metadata.mentions. This means:
--   • Integrations / bots (which post via the gateway and can't set metadata.mentions) that write
--     "@Marina …" now actually notify Marina.
--   • A person typing "@Name" by hand (without picking from the autocomplete) now notifies them too.
--
-- Matching is on display_name (falling back to full_name) with word boundaries, so "@Rob" never
-- catches "Robert", and an email like rob@rop2020.com matches nobody. Author is excluded, ids are
-- deduped against metadata.mentions, and the "all messages" fanout skips anyone already mentioned
-- so there are no double notifications. Only runs when the body actually contains "@".
create or replace function public.handle_new_message()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  mentioned uuid;
  parent_author uuid;
  actor_name text;
  ch_name text;
  conv_title text;
  target uuid;
  mention_ids uuid[] := '{}';
begin
  select coalesce(display_name, full_name) into actor_name from public.profiles where id = new.user_id;

  if new.parent_message_id is not null then
    update public.messages set reply_count = reply_count + 1, last_reply_at = new.created_at
      where id = new.parent_message_id returning user_id into parent_author;
    if parent_author is not null and parent_author <> new.user_id then
      insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, channel_id, link)
      values (parent_author, 'thread_reply', coalesce(actor_name,'Someone') || ' replied in a thread',
              left(new.body, 140), new.user_id, 'message', new.id, new.channel_id,
              case when new.channel_id is not null then '/channel/' || new.channel_id else '/dm/' || new.conversation_id end);
    end if;
  end if;

  if new.channel_id is not null then
    select name into ch_name from public.channels where id = new.channel_id;

    select coalesce(array_agg(distinct uid), '{}') into mention_ids from (
      select (jsonb_array_elements_text(new.metadata->'mentions'))::uuid as uid where new.metadata ? 'mentions'
      union
      select p.id
      from public.profiles p
      where p.is_active
        and position('@' in coalesce(new.body,'')) > 0
        and coalesce(new.body,'') ~* (
          '(^|[^[:alnum:]])@' ||
          regexp_replace(btrim(coalesce(nullif(p.display_name,''), p.full_name)), '([.^$*+?(){}\[\]|\\-])', '\\\1', 'g') ||
          '([^[:alnum:]]|$)'
        )
    ) s
    where uid is not null and uid <> new.user_id;

    foreach mentioned in array mention_ids loop
      insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, channel_id, link)
      values (mentioned, 'mention', coalesce(actor_name,'Someone') || ' mentioned you in #' || coalesce(ch_name,'a channel'),
              left(new.body, 140), new.user_id, 'message', new.id, new.channel_id, '/channel/' || new.channel_id || '?m=' || new.id);
    end loop;

    for target in
      select cm.user_id from public.channel_members cm
      where cm.channel_id = new.channel_id and cm.notify_level = 'all' and cm.user_id <> new.user_id
        and not (cm.user_id = any(mention_ids))
    loop
      insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, channel_id, link)
      values (target, 'channel', 'New message in #' || coalesce(ch_name,'a channel'),
              left(new.body,140), new.user_id, 'message', new.id, new.channel_id, '/channel/' || new.channel_id || '?m=' || new.id);
    end loop;
  end if;

  if new.conversation_id is not null then
    update public.direct_conversations set last_message_at = new.created_at where id = new.conversation_id returning title into conv_title;
    for target in
      select user_id from public.direct_conversation_members where conversation_id = new.conversation_id and user_id <> new.user_id
    loop
      insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, link)
      values (target, 'dm', 'New message from ' || coalesce(actor_name,'someone'),
              left(new.body, 140), new.user_id, 'message', new.id, '/dm/' || new.conversation_id || '?m=' || new.id);
    end loop;
  end if;

  return new;
end $function$;
