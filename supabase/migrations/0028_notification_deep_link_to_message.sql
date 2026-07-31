-- 0028_notification_deep_link_to_message.sql
-- Deep-link message notifications straight to the EXACT message.
--
-- Previously a channel/DM notification linked to '/channel/<id>' or '/dm/<id>' — the right place,
-- but the top of it. Now we append '?m=<message id>' so tapping a notification scrolls to and
-- highlights the specific message, exactly like a shared message link. (thread_reply keeps linking
-- to the conversation, since a reply lives in the thread panel, not the main flow.)
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
    if new.metadata ? 'mentions' then
      for mentioned in select (jsonb_array_elements_text(new.metadata->'mentions'))::uuid loop
        if mentioned <> new.user_id then
          insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, channel_id, link)
          values (mentioned, 'mention', coalesce(actor_name,'Someone') || ' mentioned you in #' || coalesce(ch_name,'a channel'),
                  left(new.body, 140), new.user_id, 'message', new.id, new.channel_id, '/channel/' || new.channel_id || '?m=' || new.id);
        end if;
      end loop;
    end if;
    -- "All messages" subscribers: notify on every post (skip the author and anyone already @mentioned).
    for mentioned in
      select cm.user_id from public.channel_members cm
      where cm.channel_id = new.channel_id and cm.notify_level = 'all' and cm.user_id <> new.user_id
    loop
      if not ((new.metadata ? 'mentions') and (new.metadata->'mentions') ? mentioned::text) then
        insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, channel_id, link)
        values (mentioned, 'channel', 'New message in #' || coalesce(ch_name,'a channel'),
                left(new.body,140), new.user_id, 'message', new.id, new.channel_id, '/channel/' || new.channel_id || '?m=' || new.id);
      end if;
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
