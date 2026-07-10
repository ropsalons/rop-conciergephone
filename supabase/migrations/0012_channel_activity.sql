-- ROP Connect — per-channel activity summary for the sidebar.
-- Powers "sort by recent activity" and "hide quiet/empty channels": returns the last message
-- time and (non-deleted) message count for every channel the calling user belongs to.
-- SECURITY DEFINER + membership join so a caller only ever sees their own channels' activity.

create or replace function public.channel_activity()
returns table(channel_id uuid, last_message_at timestamptz, message_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select m.channel_id, max(m.created_at) as last_message_at, count(*) as message_count
  from public.messages m
  join public.channel_members cm
    on cm.channel_id = m.channel_id and cm.user_id = auth.uid()
  where m.channel_id is not null
    and m.is_deleted = false
  group by m.channel_id
$$;

grant execute on function public.channel_activity() to authenticated;
