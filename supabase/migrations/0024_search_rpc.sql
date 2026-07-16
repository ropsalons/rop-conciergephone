-- Fast full-text-ish search that actually uses the gin_trgm index.
-- The client previously ran `select * from messages where body ilike '%q%'` directly, but RLS
-- injects per-row security-definer function calls (can_view_channel, is_active_user) that force a
-- sequential scan over every message (~16s on 31k rows) — past the 8s statement timeout, so the
-- query was killed and search returned nothing. Running the scan inside a SECURITY DEFINER function
-- bypasses RLS (letting the trigram index be used) while we enforce the SAME visibility in SQL.
create or replace function public.search_messages(
  p_query text,
  p_limit int default 50,
  p_sender uuid default null,
  p_from timestamptz default null,
  p_links_only boolean default false
)
returns setof public.messages
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as uid, (public.my_role_rank() >= 90) as is_admin
  )
  select m.*
  from public.messages m, me
  where not m.is_deleted
    and (p_query is null or p_query = '' or m.body ilike '%' || p_query || '%')
    and (not p_links_only or m.body ilike '%http%')
    and (p_sender is null or m.user_id = p_sender)
    and (p_from is null or m.created_at >= p_from)
    and (
      me.is_admin
      or (m.channel_id is not null and (
            exists (select 1 from public.channels c
                    where c.id = m.channel_id and c.type in ('public','announcement','location','department'))
            or exists (select 1 from public.channel_members cm
                       where cm.channel_id = m.channel_id and cm.user_id = me.uid)
         ))
      or (m.conversation_id is not null and exists (
            select 1 from public.direct_conversation_members dm
            where dm.conversation_id = m.conversation_id and dm.user_id = me.uid))
    )
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

revoke all on function public.search_messages(text,int,uuid,timestamptz,boolean) from public, anon;
grant execute on function public.search_messages(text,int,uuid,timestamptz,boolean) to authenticated;
