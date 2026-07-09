-- ROP Connect — RPC functions used by the client

-- Find or create a 1:1 DM between the caller and another user. -----------------
create or replace function public.get_or_create_dm(other_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  key text;
  conv uuid;
begin
  if me is null or other_user is null or me = other_user then
    raise exception 'invalid DM target';
  end if;
  -- deterministic key for the unordered pair
  key := (select string_agg(x::text, ':' order by x) from unnest(array[me, other_user]) as x);
  select id into conv from public.direct_conversations
    where is_group = false and member_key = key limit 1;
  if conv is not null then
    return conv;
  end if;
  insert into public.direct_conversations (is_group, member_key, created_by)
    values (false, key, me) returning id into conv;
  insert into public.direct_conversation_members (conversation_id, user_id)
    values (conv, me), (conv, other_user);
  return conv;
end;
$$;

-- Create a group DM with an explicit member list. ------------------------------
create or replace function public.create_group_dm(member_ids uuid[], group_title text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  conv uuid;
  members uuid[];
  m uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  members := (select array_agg(distinct x) from unnest(member_ids || array[me]) as x);
  insert into public.direct_conversations (is_group, title, created_by)
    values (true, group_title, me) returning id into conv;
  foreach m in array members loop
    insert into public.direct_conversation_members (conversation_id, user_id)
      values (conv, m) on conflict do nothing;
  end loop;
  return conv;
end;
$$;

-- Mark read helpers ------------------------------------------------------------
create or replace function public.mark_channel_read(cid uuid)
returns void language sql security definer set search_path = public as $$
  update public.channel_members set last_read_at = now()
   where channel_id = cid and user_id = auth.uid();
$$;

create or replace function public.mark_conversation_read(convid uuid)
returns void language sql security definer set search_path = public as $$
  update public.direct_conversation_members set last_read_at = now()
   where conversation_id = convid and user_id = auth.uid();
$$;

-- Unread summary used to drive sidebar badges. ---------------------------------
create or replace function public.get_unread_summary()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  result jsonb;
begin
  select jsonb_build_object(
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object('channel_id', cm.channel_id, 'unread', u.cnt))
      from public.channel_members cm
      join lateral (
        select count(*) as cnt from public.messages m
        where m.channel_id = cm.channel_id
          and m.created_at > cm.last_read_at
          and m.user_id <> me
          and m.is_deleted = false
          and m.parent_message_id is null
      ) u on true
      where cm.user_id = me and u.cnt > 0
    ), '[]'::jsonb),
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object('conversation_id', dm.conversation_id, 'unread', u.cnt))
      from public.direct_conversation_members dm
      join lateral (
        select count(*) as cnt from public.messages m
        where m.conversation_id = dm.conversation_id
          and m.created_at > dm.last_read_at
          and m.user_id <> me
          and m.is_deleted = false
      ) u on true
      where dm.user_id = me and u.cnt > 0
    ), '[]'::jsonb),
    'notifications', coalesce((
      select count(*) from public.notifications where user_id = me and is_read = false
    ), 0),
    'mentions', coalesce((
      select count(*) from public.notifications
      where user_id = me and is_read = false and type = 'mention'
    ), 0)
  ) into result;
  return result;
end;
$$;

-- Fan out notifications when an announcement is posted. ------------------------
create or replace function public.notify_announcement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, link)
  select p.id, 'announcement', new.title, left(new.body, 160), new.author_id, 'announcement', new.id, '/dashboard'
  from public.profiles p
  where p.is_active
    and p.id <> coalesce(new.author_id, '00000000-0000-0000-0000-000000000000')
    and (
      new.audience = 'all'
      or (new.audience = 'location' and p.location_id = new.location_id)
      or (new.audience = 'department' and p.department_id = new.department_id)
    );
  return new;
end;
$$;
drop trigger if exists trg_notify_announcement on public.announcements;
create trigger trg_notify_announcement after insert on public.announcements
  for each row execute function public.notify_announcement();

-- Fan out notifications when an urgent alert is posted. ------------------------
create or replace function public.notify_urgent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, link)
  select p.id, 'urgent', new.title, left(new.body, 160), new.author_id, 'urgent_alert', new.id, '/dashboard'
  from public.profiles p
  where p.is_active
    and (
      new.audience = 'all'
      or (new.audience = 'location' and p.location_id = new.location_id)
      or (new.audience = 'department' and p.department_id = new.department_id)
      or (new.audience = 'users' and p.id = any(new.target_user_ids))
    );
  return new;
end;
$$;
drop trigger if exists trg_notify_urgent on public.urgent_alerts;
create trigger trg_notify_urgent after insert on public.urgent_alerts
  for each row execute function public.notify_urgent();

-- Convenience: full-text-ish message search scoped to the caller's visibility. --
create or replace function public.search_messages(q text, max_rows int default 40)
returns setof public.messages language sql stable security definer set search_path = public as $$
  select m.* from public.messages m
  where m.is_deleted = false
    and m.body ilike '%' || q || '%'
    and (
      (m.channel_id is not null and public.can_view_channel(m.channel_id)) or
      (m.conversation_id is not null and public.is_conversation_member(m.conversation_id))
    )
  order by m.created_at desc
  limit greatest(1, least(max_rows, 100));
$$;

-- Mark all notifications read. -------------------------------------------------
create or replace function public.mark_all_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.notifications set is_read = true where user_id = auth.uid() and is_read = false;
$$;

grant execute on function public.get_or_create_dm(uuid) to authenticated;
grant execute on function public.create_group_dm(uuid[], text) to authenticated;
grant execute on function public.mark_channel_read(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.get_unread_summary() to authenticated;
grant execute on function public.search_messages(text, int) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
