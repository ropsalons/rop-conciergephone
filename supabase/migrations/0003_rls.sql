-- ROP Connect — Row Level Security
-- All membership/role checks are SECURITY DEFINER functions so they bypass RLS on the
-- tables they read. This is the standard Supabase pattern that prevents the infinite
-- recursion you otherwise get when a channels policy reads channel_members and the
-- channel_members policy reads channels.

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.my_role_rank()
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select r.rank from public.profiles p join public.roles r on r.key = p.role
                   where p.id = auth.uid()), 0);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role_rank() >= 90;
$$;

create or replace function public.can_moderate()   -- leadership and up (announcements, urgent alerts)
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role_rank() >= 40;
$$;

create or replace function public.can_manage()      -- manager and up (huddles, scheduling, recovery)
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role_rank() >= 30;
$$;

create or replace function public.can_post_education()
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage()
    or coalesce((select role from public.profiles where id = auth.uid()) = 'education', false);
$$;

create or replace function public.my_location()
returns uuid language sql stable security definer set search_path = public as $$
  select location_id from public.profiles where id = auth.uid();
$$;

create or replace function public.my_department()
returns uuid language sql stable security definer set search_path = public as $$
  select department_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_channel_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.channel_members
                 where channel_id = cid and user_id = auth.uid());
$$;

create or replace function public.is_channel_admin(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.channel_members
                 where channel_id = cid and user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.can_view_channel(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or public.is_channel_member(cid)
    or exists (select 1 from public.channels c
               where c.id = cid and c.type in ('public','announcement','location','department'));
$$;

create or replace function public.can_post_channel(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channels c
    where c.id = cid and not c.is_archived and (
      -- announcement & admin channels are post-restricted to moderators/admins
      case
        when c.type = 'announcement' then public.can_moderate()
        when c.type = 'admin' then public.is_admin() or public.is_channel_admin(cid)
        else public.is_channel_member(cid) or public.can_view_channel(cid)
      end
    )
  );
$$;

create or replace function public.is_conversation_member(convid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.direct_conversation_members
                 where conversation_id = convid and user_id = auth.uid());
$$;

create or replace function public.can_view_message(mid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.messages m where m.id = mid and (
      (m.channel_id is not null and public.can_view_channel(m.channel_id)) or
      (m.conversation_id is not null and public.is_conversation_member(m.conversation_id))
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'roles','locations','departments','profiles','channels','channel_members',
    'direct_conversations','direct_conversation_members','messages','message_reactions',
    'message_reads','files','notifications','announcements','announcement_acknowledgements',
    'urgent_alerts','urgent_alert_acknowledgements','daily_huddles','daily_huddle_acknowledgements',
    'shoutouts','guest_recovery_items','education_updates','education_acknowledgements',
    'scheduling_posts','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Lookup tables — everyone reads, admins write
-- ---------------------------------------------------------------------------
-- Lookup lists are non-sensitive and are needed on the sign-up screen (pre-auth),
-- so reads are public; writes remain admin-only.
create policy roles_read on public.roles for select using (true);
create policy roles_admin on public.roles for all using (public.is_admin()) with check (public.is_admin());

create policy locations_read on public.locations for select using (true);
create policy locations_admin on public.locations for all using (public.is_admin()) with check (public.is_admin());

create policy departments_read on public.departments for select using (true);
create policy departments_admin on public.departments for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select
  using (auth.uid() = id or public.is_active_user());
create policy profiles_insert on public.profiles for insert
  with check (auth.uid() = id);
create policy profiles_update_self on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);
create policy profiles_update_admin on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Channels
-- ---------------------------------------------------------------------------
create policy channels_select on public.channels for select
  using (public.can_view_channel(id) and public.is_active_user());
create policy channels_insert on public.channels for insert
  with check (
    public.is_active_user() and created_by = auth.uid() and (
      type in ('public','private') or public.can_manage()
    )
  );
create policy channels_update on public.channels for update
  using (public.is_channel_admin(id) or public.can_manage())
  with check (public.is_channel_admin(id) or public.can_manage());
create policy channels_delete on public.channels for delete using (public.is_admin());

-- Channel members
create policy channel_members_select on public.channel_members for select
  using (public.can_view_channel(channel_id) or public.is_admin());
create policy channel_members_insert on public.channel_members for insert
  with check (
    public.is_admin() or public.is_channel_admin(channel_id) or public.can_manage() or (
      user_id = auth.uid() and exists (
        select 1 from public.channels c
        where c.id = channel_id and c.type in ('public','announcement','location','department')
      )
    )
  );
create policy channel_members_update on public.channel_members for update
  using (user_id = auth.uid() or public.is_channel_admin(channel_id) or public.is_admin())
  with check (user_id = auth.uid() or public.is_channel_admin(channel_id) or public.is_admin());
create policy channel_members_delete on public.channel_members for delete
  using (user_id = auth.uid() or public.is_channel_admin(channel_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Direct conversations
-- ---------------------------------------------------------------------------
create policy dc_select on public.direct_conversations for select
  using (public.is_conversation_member(id));
create policy dc_insert on public.direct_conversations for insert
  with check (created_by = auth.uid() and public.is_active_user());
create policy dc_update on public.direct_conversations for update
  using (public.is_conversation_member(id)) with check (public.is_conversation_member(id));

create policy dcm_select on public.direct_conversation_members for select
  using (public.is_conversation_member(conversation_id));
create policy dcm_insert on public.direct_conversation_members for insert
  with check (
    user_id = auth.uid()
    or public.is_conversation_member(conversation_id)
    or exists (select 1 from public.direct_conversations dc
               where dc.id = conversation_id and dc.created_by = auth.uid())
  );
create policy dcm_update on public.direct_conversation_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy dcm_delete on public.direct_conversation_members for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create policy messages_select on public.messages for select
  using (
    public.is_active_user() and (
      (channel_id is not null and public.can_view_channel(channel_id)) or
      (conversation_id is not null and public.is_conversation_member(conversation_id))
    )
  );
create policy messages_insert on public.messages for insert
  with check (
    user_id = auth.uid() and public.is_active_user() and (
      (channel_id is not null and public.can_post_channel(channel_id)) or
      (conversation_id is not null and public.is_conversation_member(conversation_id))
    )
  );
create policy messages_update on public.messages for update
  using (user_id = auth.uid() or public.is_channel_admin(channel_id) or public.is_admin())
  with check (user_id = auth.uid() or public.is_channel_admin(channel_id) or public.is_admin());
create policy messages_delete on public.messages for delete
  using (user_id = auth.uid() or public.is_channel_admin(channel_id) or public.is_admin());

-- Reactions
create policy reactions_select on public.message_reactions for select
  using (public.can_view_message(message_id));
create policy reactions_insert on public.message_reactions for insert
  with check (user_id = auth.uid() and public.can_view_message(message_id));
create policy reactions_delete on public.message_reactions for delete
  using (user_id = auth.uid());

-- Read receipts
create policy reads_select on public.message_reads for select
  using (user_id = auth.uid() or public.can_view_message(message_id));
create policy reads_upsert on public.message_reads for insert
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Files
-- ---------------------------------------------------------------------------
create policy files_select on public.files for select
  using (
    uploader_id = auth.uid()
    or (channel_id is not null and public.can_view_channel(channel_id))
    or (conversation_id is not null and public.is_conversation_member(conversation_id))
  );
create policy files_insert on public.files for insert
  with check (uploader_id = auth.uid() and public.is_active_user());
create policy files_delete on public.files for delete
  using (uploader_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Notifications (owner-only; created by SECURITY DEFINER triggers/RPCs)
-- ---------------------------------------------------------------------------
create policy notifications_select on public.notifications for select using (user_id = auth.uid());
create policy notifications_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
create policy announcements_select on public.announcements for select
  using (
    public.is_active_user() and (
      public.can_moderate()
      or audience = 'all'
      or (audience = 'location' and location_id = public.my_location())
      or (audience = 'department' and department_id = public.my_department())
    )
  );
create policy announcements_write on public.announcements for all
  using (public.can_moderate()) with check (public.can_moderate());

create policy ann_ack_select on public.announcement_acknowledgements for select
  using (user_id = auth.uid() or public.can_moderate());
create policy ann_ack_insert on public.announcement_acknowledgements for insert
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Urgent alerts
-- ---------------------------------------------------------------------------
create policy urgent_select on public.urgent_alerts for select
  using (
    public.is_active_user() and (
      public.can_moderate()
      or audience = 'all'
      or (audience = 'location' and location_id = public.my_location())
      or (audience = 'department' and department_id = public.my_department())
      or (audience = 'users' and auth.uid() = any(target_user_ids))
    )
  );
create policy urgent_write on public.urgent_alerts for all
  using (public.can_moderate()) with check (public.can_moderate());

create policy urgent_ack_select on public.urgent_alert_acknowledgements for select
  using (user_id = auth.uid() or public.can_moderate());
create policy urgent_ack_insert on public.urgent_alert_acknowledgements for insert
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Daily huddles
-- ---------------------------------------------------------------------------
create policy huddles_select on public.daily_huddles for select using (public.is_active_user());
create policy huddles_write on public.daily_huddles for all
  using (public.can_manage()) with check (public.can_manage());

create policy huddle_ack_select on public.daily_huddle_acknowledgements for select
  using (user_id = auth.uid() or public.can_manage());
create policy huddle_ack_insert on public.daily_huddle_acknowledgements for insert
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Shoutouts
-- ---------------------------------------------------------------------------
create policy shoutouts_select on public.shoutouts for select using (public.is_active_user());
create policy shoutouts_insert on public.shoutouts for insert
  with check (author_id = auth.uid() and public.is_active_user());
create policy shoutouts_delete on public.shoutouts for delete
  using (author_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Guest recovery (sensitive — restricted)
-- ---------------------------------------------------------------------------
create policy recovery_select on public.guest_recovery_items for select
  using (
    public.can_manage()
    or created_by = auth.uid()
    or owner_id = auth.uid()
    or auth.uid() = any(involved_user_ids)
  );
create policy recovery_insert on public.guest_recovery_items for insert
  with check (created_by = auth.uid() and public.is_active_user());
create policy recovery_update on public.guest_recovery_items for update
  using (public.can_manage() or owner_id = auth.uid() or created_by = auth.uid())
  with check (public.can_manage() or owner_id = auth.uid() or created_by = auth.uid());
create policy recovery_delete on public.guest_recovery_items for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Education
-- ---------------------------------------------------------------------------
create policy education_select on public.education_updates for select using (public.is_active_user());
create policy education_write on public.education_updates for all
  using (public.can_post_education()) with check (public.can_post_education());

create policy edu_ack_select on public.education_acknowledgements for select
  using (user_id = auth.uid() or public.can_post_education());
create policy edu_ack_insert on public.education_acknowledgements for insert
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Scheduling
-- ---------------------------------------------------------------------------
create policy scheduling_select on public.scheduling_posts for select using (public.is_active_user());
create policy scheduling_insert on public.scheduling_posts for insert
  with check (author_id = auth.uid() and public.is_active_user());
create policy scheduling_update on public.scheduling_posts for update
  using (author_id = auth.uid() or claimed_by = auth.uid() or public.can_manage())
  with check (author_id = auth.uid() or claimed_by = auth.uid() or public.can_manage());
create policy scheduling_delete on public.scheduling_posts for delete
  using (author_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Audit logs (admin reads; anyone may append their own action)
-- ---------------------------------------------------------------------------
create policy audit_select on public.audit_logs for select using (public.is_admin());
create policy audit_insert on public.audit_logs for insert
  with check (actor_id = auth.uid() or public.is_admin());
