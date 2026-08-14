-- Rate limiting + lockout for phone + PIN login.
--
-- A 4-digit PIN is only 10,000 possibilities, so the whole scheme's safety rests on throttling guesses.
-- This adds a small attempts log and two SECURITY DEFINER RPCs the pin-auth edge function calls:
--   pin_rate_check  — is this phone / IP currently allowed to try? (returns 'ok' | 'locked_phone' | 'locked_ip')
--   pin_rate_record — record the outcome of an attempt (and clear a phone's failures on success)
-- Plus pin_store_code now throttles reset-code texts so the endpoint can't be used to spam someone's phone.

create table if not exists public.pin_attempts (
  id bigint generated always as identity primary key,
  phone text not null,              -- normalized (last 10 digits)
  ip text not null default '',
  ok boolean not null,              -- did the credential verify?
  created_at timestamptz not null default now()
);
create index if not exists pin_attempts_phone on public.pin_attempts (phone, created_at desc);
create index if not exists pin_attempts_ip on public.pin_attempts (ip, created_at desc);
alter table public.pin_attempts enable row level security;

-- Thresholds (15-minute rolling window):
--   6+ failed PIN tries for one phone  -> that phone is locked (protects the individual account)
--   30+ failed tries from one IP       -> that IP is locked (protects against a spray across many phones)
create or replace function public.pin_rate_check(p_phone text, p_ip text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_phone_fails int; v_ip_fails int; v_ph text := norm_phone(p_phone);
begin
  select count(*) into v_phone_fails from public.pin_attempts
   where phone = v_ph and not ok and created_at > now() - interval '15 minutes';
  if v_phone_fails >= 6 then return 'locked_phone'; end if;
  if coalesce(p_ip,'') <> '' then
    select count(*) into v_ip_fails from public.pin_attempts
     where ip = p_ip and not ok and created_at > now() - interval '15 minutes';
    if v_ip_fails >= 30 then return 'locked_ip'; end if;
  end if;
  return 'ok';
end $$;

create or replace function public.pin_rate_record(p_phone text, p_ip text, p_ok boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_ph text := norm_phone(p_phone);
begin
  insert into public.pin_attempts (phone, ip, ok) values (v_ph, coalesce(p_ip,''), p_ok);
  -- A correct PIN clears the recent failure streak so a fumble-then-success doesn't leave you locked.
  if p_ok then
    delete from public.pin_attempts where phone = v_ph and not ok and created_at > now() - interval '15 minutes';
  end if;
end $$;

-- Replace pin_store_code with a throttled version: at most 3 reset codes per profile per 15 minutes.
-- Returns true only if a code was actually stored (the edge function only texts when true).
-- (Return type changes void -> boolean, so the old one must be dropped first.)
drop function if exists public.pin_store_code(uuid, text);
create or replace function public.pin_store_code(p_profile uuid, p_hash text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if (select count(*) from public.pin_reset_codes
        where profile_id = p_profile and created_at > now() - interval '15 minutes') >= 3 then
    return false;
  end if;
  insert into public.pin_reset_codes (profile_id, code_hash, expires_at)
  values (p_profile, p_hash, now() + interval '15 minutes');
  return true;
end $$;

revoke all on function public.pin_rate_check(text, text) from public, anon, authenticated;
revoke all on function public.pin_rate_record(text, text, boolean) from public, anon, authenticated;
revoke all on function public.pin_store_code(uuid, text) from public, anon, authenticated;
grant execute on function public.pin_rate_check(text, text) to service_role;
grant execute on function public.pin_rate_record(text, text, boolean) to service_role;
grant execute on function public.pin_store_code(uuid, text) to service_role;
