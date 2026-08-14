-- Phone + 4-digit PIN login (matches time.ropsalons.com).
--
-- Staff sign in with their mobile number + a 4-digit PIN. The PIN is NEVER stored: an edge function
-- turns (phone + PIN) into a strong 64-char secret via HMAC with a server-side pepper, and that secret
-- is what Supabase auth stores (bcrypt-hashed, as always). This just adds the two bits of state the
-- flow needs: a marker for "has this person set a PIN yet" and a short-lived reset-code table, plus a
-- handful of SECURITY DEFINER RPCs the edge function calls with the service role.

-- Marks when a person first set their PIN. Null = never set → the one-time "set up your PIN" path is
-- allowed; non-null = must use the text-a-code reset to change it.
alter table public.profiles add column if not exists pin_set_at timestamptz;

-- Text-a-code reset: a 6-digit code, hashed, single-use, 15-minute expiry.
create table if not exists public.pin_reset_codes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pin_reset_codes_profile on public.pin_reset_codes (profile_id, created_at desc);
-- Only the SECURITY DEFINER edge path (service role) ever touches this — never clients.
alter table public.pin_reset_codes enable row level security;

-- Phone digits normalized to the last 10 (used to match numbers regardless of formatting/country code).
create or replace function public.norm_phone(p text)
returns text language sql immutable as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10)
$$;

-- Look up a person by mobile number. Returns their id/email, whether a PIN is set, and the stored phone.
-- Matches on normalized digits so "(555) 999-0000", "555-999-0000", "+15559990000" all resolve the same.
create or replace function public.pin_lookup(p_phone text)
returns table(id uuid, email text, pin_set boolean, phone text)
language sql security definer set search_path to 'public' as $$
  select p.id, p.email, (p.pin_set_at is not null), p.phone
  from public.profiles p
  where p.is_active and norm_phone(p.phone) = norm_phone(p_phone) and norm_phone(p_phone) <> ''
  order by p.created_at asc limit 1
$$;

-- Store the PIN-derived secret AS the Supabase auth password (bcrypt), and stamp pin_set_at.
create or replace function public.pin_set(p_profile uuid, p_secret text)
returns void language plpgsql security definer set search_path to 'public', 'auth', 'extensions' as $$
begin
  update auth.users set encrypted_password = extensions.crypt(p_secret, extensions.gen_salt('bf')), updated_at = now()
   where id = p_profile;
  update public.profiles set pin_set_at = now() where id = p_profile;
end $$;

-- Save a hashed, 15-minute, single-use reset code.
create or replace function public.pin_store_code(p_profile uuid, p_hash text)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.pin_reset_codes (profile_id, code_hash, expires_at)
  values (p_profile, p_hash, now() + interval '15 minutes')
$$;

-- Verify + consume a reset code. True only if a matching, unused, unexpired code exists (then marks it used).
create or replace function public.pin_use_code(p_profile uuid, p_hash text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  select id into v_id from public.pin_reset_codes
   where profile_id = p_profile and code_hash = p_hash and used_at is null and expires_at > now()
   order by created_at desc limit 1;
  if v_id is null then return false; end if;
  update public.pin_reset_codes set used_at = now() where id = v_id;
  return true;
end $$;

-- These touch auth.users and reset codes — only the edge function (service role) may call them.
revoke all on function public.pin_lookup(text) from public, anon, authenticated;
revoke all on function public.pin_set(uuid, text) from public, anon, authenticated;
revoke all on function public.pin_store_code(uuid, text) from public, anon, authenticated;
revoke all on function public.pin_use_code(uuid, text) from public, anon, authenticated;
grant execute on function public.pin_lookup(text) to service_role;
grant execute on function public.pin_set(uuid, text) to service_role;
grant execute on function public.pin_store_code(uuid, text) to service_role;
grant execute on function public.pin_use_code(uuid, text) to service_role;
