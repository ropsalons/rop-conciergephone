-- Locked secret storage for edge functions (moves the PIN pepper + cron secret out of function source).
--
-- The pin-auth function used to carry the pepper as a hardcoded fallback in its deployed source. That's
-- poor hygiene: anyone who can read the deployed function could read the secret. Instead we keep secrets
-- in a `private` schema table that PostgREST does not expose, readable only through a SECURITY DEFINER
-- RPC granted to the service role. pin-auth loads them on first request (env still wins if set).
--
-- The actual secret VALUES are inserted out-of-band (never committed here). This migration only creates
-- the structure.

create schema if not exists private;

create table if not exists private.secrets (
  name text primary key,
  value text not null
);

-- Only the service role, via this function, can read a secret. Never exposed to anon/authenticated.
create or replace function public.get_secret(p_name text)
returns text language sql security definer set search_path to 'private' as $$
  select value from private.secrets where name = p_name
$$;
revoke all on function public.get_secret(text) from public, anon, authenticated;
grant execute on function public.get_secret(text) to service_role;
