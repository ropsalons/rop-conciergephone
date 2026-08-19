-- ROP Chat AI gateway: give agents the ability to DELETE messages.
--
-- Deletion is a SOFT delete in the gateway (messages.is_deleted = true, original text kept), so an
-- admin can always restore it — same as a staff member deleting a message in the app.
--
-- Policy (per Rob): any agent granted ROP Chat API access should be able to delete messages by default.
-- So we (1) add 'delete_message' to the default action set for NEW agents, and (2) grant it to every
-- existing agent that can already post.

-- 1. Default for newly-provisioned agents (table default).
alter table public.ai_agents
  alter column allowed_actions set default array[
    'list_channels','read_channel_messages','read_thread','search_messages',
    'post_message','reply_thread','delete_message'
  ];

-- 2. The admin RPC that mints agents uses its own inline default — keep it in step.
create or replace function public.ai_create_agent(
  p_name text, p_provider text default 'anthropic'::text, p_agent_type text default 'assistant'::text,
  p_owner uuid default null::uuid, p_channel_scope text default 'listed'::text, p_allow_dms boolean default false,
  p_allowed_actions text[] default null::text[], p_channel_ids uuid[] default '{}'::uuid[]
)
returns table(id uuid, token text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_token text; v_hash text; v_slug text; v_id uuid;
begin
  if not public.am_i_admin() then raise exception 'forbidden'; end if;
  v_token := 'rop_ai_' || encode(extensions.gen_random_bytes(24), 'hex');
  v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_slug  := regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g');
  if v_slug = '' or v_slug is null then v_slug := 'agent'; end if;
  if exists (select 1 from ai_agents where slug = v_slug) then v_slug := v_slug || '-' || left(v_hash, 4); end if;
  insert into ai_agents(name, slug, provider, agent_type, owner_id, token_prefix, token_hash,
                        channel_scope, allow_dms, allowed_actions, created_by)
  values (p_name, v_slug, p_provider, p_agent_type, coalesce(p_owner, auth.uid()), left(v_token, 14), v_hash,
          p_channel_scope, p_allow_dms,
          coalesce(p_allowed_actions, array['list_channels','read_channel_messages','read_thread','search_messages','post_message','reply_thread','delete_message']),
          auth.uid())
  returning ai_agents.id into v_id;
  if array_length(p_channel_ids, 1) is not null then
    insert into ai_agent_channels(agent_id, channel_id) select v_id, unnest(p_channel_ids) on conflict do nothing;
  end if;
  insert into audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'ai_agent_created', 'ai_agent', v_id, jsonb_build_object('name', p_name, 'provider', p_provider));
  return query select v_id, v_token;
end $function$;

-- 3. Grant delete to every existing agent that can already post (skips non-chat agents like the
--    events-only ROP Team App). Idempotent — the guard prevents duplicate entries.
update public.ai_agents
set allowed_actions = allowed_actions || array['delete_message']
where 'post_message' = any(allowed_actions)
  and not ('delete_message' = any(allowed_actions));
