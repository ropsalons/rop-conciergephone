-- Urgent-takeover channels.
--
-- A channel can be flagged `urgent_popup`. When any message is posted to it, EVERY member (except the
-- author) gets an 'urgent' notification — regardless of their per-channel notify level — so the app
-- shows a full takeover popup and mobiles get an urgent push. Use for waitlist / immediate-attention
-- channels. Admins toggle it per channel in the channel's Edit panel.

alter table public.channels add column if not exists urgent_popup boolean not null default false;

create or replace function public.handle_new_message()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  mentioned uuid;
  parent_author uuid;
  actor_name text;
  ch_name text;
  ch_urgent boolean;
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
    select name, urgent_popup into ch_name, ch_urgent from public.channels where id = new.channel_id;

    if coalesce(ch_urgent, false) then
      -- Urgent-takeover channel: notify every member (except the author) as 'urgent' so the app pops a
      -- takeover and phones get an urgent push. Skip the normal mention / all-subscriber logic.
      for target in
        select cm.user_id from public.channel_members cm
        where cm.channel_id = new.channel_id and cm.user_id <> new.user_id
      loop
        insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, channel_id, link)
        values (target, 'urgent', '🚨 ' || coalesce(ch_name,'Urgent') || ' — ' || coalesce(actor_name,'Someone'),
                left(new.body,140), new.user_id, 'message', new.id, new.channel_id, '/channel/' || new.channel_id || '?m=' || new.id);
      end loop;
    else
      -- Everyone tagged on this message: the app's explicit metadata.mentions UNION anyone @named in
      -- the body text. Excludes the author; deduped.
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

      -- "All messages" subscribers: notify on every post, skipping the author and anyone already mentioned.
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
