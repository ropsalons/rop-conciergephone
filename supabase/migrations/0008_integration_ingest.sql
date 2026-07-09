-- ROP Connect — Inbound integration API (incoming-webhook style ingestion)
-- Other ROP systems (dashboards, phone/booking systems, other APIs) POST messages into
-- channels/DMs via the `ingest` Edge Function (supabase/functions/ingest), authenticated
-- with a revocable API key stored here (sha-256 hashed).

create table if not exists public.integration_tokens (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  token_prefix text not null,
  token_hash   text not null unique,
  scopes       text[] not null default array['post'],
  is_active    boolean not null default true,
  created_by   uuid references public.profiles (id) on delete set null,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.integration_tokens enable row level security;

create policy integration_tokens_admin on public.integration_tokens for all
  using (public.is_admin()) with check (public.is_admin());

-- Mint a new API key. Returns the PLAINTEXT token exactly once (only the hash is stored).
create or replace function public.create_integration_token(p_name text)
returns table(id uuid, name text, token text)
language plpgsql security definer set search_path = public as $$
declare
  v_token text;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only admins can create integration tokens';
  end if;
  v_token := 'rop_live_' || encode(gen_random_bytes(24), 'hex');
  insert into public.integration_tokens (name, token_prefix, token_hash, created_by)
  values (p_name, left(v_token, 16), encode(digest(v_token, 'sha256'), 'hex'), auth.uid())
  returning integration_tokens.id into v_id;
  return query select v_id, p_name, v_token;
end;
$$;
grant execute on function public.create_integration_token(text) to authenticated;

-- NOTE: the inactive "Integrations" author profile (id 00000000-0000-4000-8000-00000000b010)
-- and the "Slack Archive" author (…a5c8) are seeded as auth users at deploy time (see README).
