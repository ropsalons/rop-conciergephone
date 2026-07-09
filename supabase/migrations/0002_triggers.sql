-- ROP Connect — Triggers & automation

-- Generic updated_at maintenance ------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','channels','announcements','daily_huddles',
    'guest_recovery_items','education_updates','scheduling_posts'
  ] loop
    execute format(
      'drop trigger if exists trg_%1$s_updated on public.%1$s;
       create trigger trg_%1$s_updated before update on public.%1$s
       for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- Provision a profile row whenever a new auth user is created -------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_location uuid;
  v_department uuid;
  v_role text;
begin
  select id into v_location from public.locations
    where slug = coalesce(new.raw_user_meta_data->>'location_slug', '') limit 1;
  select id into v_department from public.departments
    where slug = coalesce(new.raw_user_meta_data->>'department_slug', '') limit 1;

  -- The very first user to sign up becomes the owner/admin so the app is usable.
  if not exists (select 1 from public.profiles) then
    v_role := 'owner';
  else
    v_role := coalesce(new.raw_user_meta_data->>'role', 'associate');
    if not exists (select 1 from public.roles where key = v_role) then
      v_role := 'associate';
    end if;
  end if;

  insert into public.profiles (id, email, full_name, display_name, role, location_id, department_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'display_name',
    v_role,
    v_location,
    v_department
  )
  on conflict (id) do nothing;

  -- Auto-join every default channel, plus the channels for this member's
  -- location and department so their sidebar is useful on first login.
  insert into public.channel_members (channel_id, user_id)
  select c.id, new.id from public.channels c
  where c.is_default
     or (c.type = 'location' and c.location_id is not distinct from v_location and v_location is not null)
     or (c.type = 'department' and c.department_id is not distinct from v_department and v_department is not null)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep role privilege from being self-escalated --------------------------------
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_priv boolean;
begin
  select role in ('owner','admin') into is_priv from public.profiles where id = auth.uid();
  if coalesce(is_priv, false) then
    return new;   -- admins may change anything
  end if;
  -- Non-admins cannot change their own role or activation status.
  if new.role is distinct from old.role then
    new.role := old.role;
  end if;
  if new.is_active is distinct from old.is_active then
    new.is_active := old.is_active;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- Message side effects: reply counts, DM ordering, mention/reply notifications --
create or replace function public.handle_new_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mentioned uuid;
  parent_author uuid;
  actor_name text;
  ch_name text;
  conv_title text;
  target uuid;
begin
  select coalesce(display_name, full_name) into actor_name from public.profiles where id = new.user_id;

  -- Thread reply bookkeeping + notify the parent author.
  if new.parent_message_id is not null then
    update public.messages
      set reply_count = reply_count + 1, last_reply_at = new.created_at
      where id = new.parent_message_id
      returning user_id into parent_author;
    if parent_author is not null and parent_author <> new.user_id then
      insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, channel_id, link)
      values (parent_author, 'thread_reply', coalesce(actor_name,'Someone') || ' replied in a thread',
              left(new.body, 140), new.user_id, 'message', new.id, new.channel_id,
              case when new.channel_id is not null then '/channel/' || new.channel_id
                   else '/dm/' || new.conversation_id end);
    end if;
  end if;

  -- Channel bookkeeping.
  if new.channel_id is not null then
    select name into ch_name from public.channels where id = new.channel_id;
    -- @mentions carried in metadata.mentions (array of profile ids resolved client-side)
    if new.metadata ? 'mentions' then
      for mentioned in select (jsonb_array_elements_text(new.metadata->'mentions'))::uuid loop
        if mentioned <> new.user_id then
          insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, channel_id, link)
          values (mentioned, 'mention', coalesce(actor_name,'Someone') || ' mentioned you in #' || coalesce(ch_name,'a channel'),
                  left(new.body, 140), new.user_id, 'message', new.id, new.channel_id, '/channel/' || new.channel_id);
        end if;
      end loop;
    end if;
  end if;

  -- DM bookkeeping: bump conversation, notify the other members.
  if new.conversation_id is not null then
    update public.direct_conversations set last_message_at = new.created_at where id = new.conversation_id
      returning title into conv_title;
    for target in
      select user_id from public.direct_conversation_members
      where conversation_id = new.conversation_id and user_id <> new.user_id
    loop
      insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, link)
      values (target, 'dm', 'New message from ' || coalesce(actor_name,'someone'),
              left(new.body, 140), new.user_id, 'message', new.id, '/dm/' || new.conversation_id);
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_handle_new_message on public.messages;
create trigger trg_handle_new_message after insert on public.messages
  for each row execute function public.handle_new_message();

-- Notify message author when someone reacts ------------------------------------
create or replace function public.handle_new_reaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  author uuid;
  actor_name text;
  ch uuid;
  conv uuid;
begin
  select user_id, channel_id, conversation_id into author, ch, conv
    from public.messages where id = new.message_id;
  if author is null or author = new.user_id then
    return new;
  end if;
  select coalesce(display_name, full_name) into actor_name from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, channel_id, link)
  values (author, 'reaction', coalesce(actor_name,'Someone') || ' reacted ' || new.emoji, null,
          new.user_id, 'message', new.message_id, ch,
          case when ch is not null then '/channel/' || ch else '/dm/' || conv end);
  return new;
end;
$$;

drop trigger if exists trg_handle_new_reaction on public.message_reactions;
create trigger trg_handle_new_reaction after insert on public.message_reactions
  for each row execute function public.handle_new_reaction();

-- Notify recipient of a shoutout -----------------------------------------------
create or replace function public.handle_new_shoutout()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
  select coalesce(display_name, full_name) into actor_name from public.profiles where id = new.author_id;
  if new.recipient_id <> new.author_id then
    insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, link)
    values (new.recipient_id, 'system', coalesce(actor_name,'Someone') || ' gave you a shoutout! 🎉',
            left(new.message, 140), new.author_id, 'shoutout', new.id, '/dashboard');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_handle_new_shoutout on public.shoutouts;
create trigger trg_handle_new_shoutout after insert on public.shoutouts
  for each row execute function public.handle_new_shoutout();
