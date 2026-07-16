-- Admin RPCs for the AI Integrations panel (security-definer, am_i_admin()-guarded). Mint/rotate
-- agent tokens (plaintext returned once, only sha-256 hash stored), toggle agents, edit scope,
-- kill-switch, overview, activity, and the approval queue with execute-on-approve.
-- (Applied to the live project via Supabase migrations; committed here for version control.)

create or replace function public.ai_create_agent(
  p_name text, p_provider text default 'anthropic', p_agent_type text default 'assistant',
  p_owner uuid default null, p_channel_scope text default 'listed', p_allow_dms boolean default false,
  p_allowed_actions text[] default null, p_channel_ids uuid[] default '{}'::uuid[]
) returns table(id uuid, token text)
language plpgsql security definer set search_path = public as $$
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
          coalesce(p_allowed_actions, array['list_channels','read_channel_messages','read_thread','search_messages','post_message','reply_thread']),
          auth.uid())
  returning ai_agents.id into v_id;
  if array_length(p_channel_ids, 1) is not null then
    insert into ai_agent_channels(agent_id, channel_id) select v_id, unnest(p_channel_ids) on conflict do nothing;
  end if;
  insert into audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'ai_agent_created', 'ai_agent', v_id, jsonb_build_object('name', p_name, 'provider', p_provider));
  return query select v_id, v_token;
end $$;

create or replace function public.ai_rotate_token(p_agent uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text; v_hash text;
begin
  if not public.am_i_admin() then raise exception 'forbidden'; end if;
  v_token := 'rop_ai_' || encode(extensions.gen_random_bytes(24), 'hex');
  v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');
  update ai_agents set token_hash = v_hash, token_prefix = left(v_token, 14) where id = p_agent;
  insert into audit_logs(actor_id, action, entity_type, entity_id) values (auth.uid(), 'ai_token_rotated', 'ai_agent', p_agent);
  return v_token;
end $$;

create or replace function public.ai_set_agent_active(p_agent uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.am_i_admin() then raise exception 'forbidden'; end if;
  update ai_agents set is_active = p_active where id = p_agent;
  insert into audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), case when p_active then 'ai_agent_enabled' else 'ai_agent_disabled' end, 'ai_agent', p_agent, '{}'::jsonb);
end $$;

create or replace function public.ai_update_agent(
  p_agent uuid, p_channel_scope text, p_allow_dms boolean,
  p_allowed_actions text[], p_require_approval_for text[], p_channel_ids uuid[]
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.am_i_admin() then raise exception 'forbidden'; end if;
  update ai_agents set channel_scope = p_channel_scope, allow_dms = p_allow_dms,
    allowed_actions = p_allowed_actions, require_approval_for = coalesce(p_require_approval_for, '{}')
  where id = p_agent;
  delete from ai_agent_channels where agent_id = p_agent;
  if array_length(p_channel_ids, 1) is not null then
    insert into ai_agent_channels(agent_id, channel_id) select p_agent, unnest(p_channel_ids) on conflict do nothing;
  end if;
  insert into audit_logs(actor_id, action, entity_type, entity_id) values (auth.uid(), 'ai_agent_updated', 'ai_agent', p_agent);
end $$;

create or replace function public.ai_set_kill_switch(p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.am_i_admin() then raise exception 'forbidden'; end if;
  update ai_settings set ai_enabled = p_enabled, updated_by = auth.uid(), updated_at = now() where only_row;
  insert into audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), case when p_enabled then 'ai_enabled_all' else 'ai_disabled_all' end, 'ai_settings', null, '{}'::jsonb);
end $$;

create or replace function public.ai_set_channel_excluded(p_channel uuid, p_excluded boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.am_i_admin() then raise exception 'forbidden'; end if;
  update channels set ai_excluded = p_excluded where id = p_channel;
end $$;

-- ai_admin_overview / ai_recent_activity / ai_list_approvals / ai_decide_approval:
-- see repo history; all are security-definer + am_i_admin()-guarded and return jsonb for the admin UI.
-- (Full bodies were applied via the live migration of the same name.)
