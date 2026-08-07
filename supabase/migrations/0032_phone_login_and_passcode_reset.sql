-- Phone-number login + self-service passcode reset + one-identity cross-dashboard sign-in.
--
-- Decisions (Rob, 2026-08):
--   * People log in with their PHONE NUMBER (everyone has one; it's unique). Email still works too.
--   * Everyone keeps their OWN unique passcode (default: last-6-of-phone) — no shared/universal code.
--   * That same identity + passcode can authenticate other ROP dashboards (single identity, own passcode).
--
-- Supabase auth is email/password under the hood, so the login box resolves a phone number to that
-- person's auth email first, then signs in normally. Resets and cross-dashboard checks run as
-- SECURITY DEFINER RPCs so the browser never touches auth.users or the raw passcode.

-- Last-10-digits of any phone-ish string, for tolerant matching ("(239) 307-7719" == "2393077719").
create or replace function public.norm_phone(p text)
returns text
language sql
immutable
as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10)
$$;

-- Throttle table: one row per reset request, so we can rate-limit texts per person.
create table if not exists public.passcode_reset_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists passcode_reset_log_profile_time on public.passcode_reset_log (profile_id, created_at desc);
-- Never readable by clients — only SECURITY DEFINER functions / service role touch it.
alter table public.passcode_reset_log enable row level security;

-- ---------------------------------------------------------------------------
-- resolve_login_email(identifier): phone OR email -> the auth email to sign in with.
-- Safe to expose to anon: it only maps a login handle to the email the app then authenticates against
-- (still needs the passcode). Returns null when nothing matches so the client shows a generic error.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_login_email(p_identifier text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   text := btrim(coalesce(p_identifier, ''));
  v_mail text;
begin
  if v_id = '' then
    return null;
  end if;
  -- Looks like an email → use as-is (lowercased).
  if position('@' in v_id) > 0 then
    return lower(v_id);
  end if;
  -- Otherwise treat it as a phone number and find the matching active person.
  select lower(email) into v_mail
  from public.profiles
  where is_active
    and norm_phone(phone) = norm_phone(v_id)
    and norm_phone(v_id) <> ''
    and email is not null
  order by created_at asc
  limit 1;
  return v_mail;
end;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- request_passcode_reset(identifier): mint a fresh 6-digit code, set it as the person's password,
-- and hand back the phone + code so the edge function can TEXT it. Returns null when there's nothing
-- to do (unknown handle / no phone / throttled) — the edge function always replies neutrally either
-- way, so this never reveals whether an account exists. service_role only (it returns the code!).
-- ---------------------------------------------------------------------------
create or replace function public.request_passcode_reset(p_identifier text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_prof  public.profiles%rowtype;
  v_id    text := btrim(coalesce(p_identifier, ''));
  v_code  text;
  v_recent int;
begin
  if v_id = '' then
    return null;
  end if;

  if position('@' in v_id) > 0 then
    select * into v_prof from public.profiles
     where is_active and lower(email) = lower(v_id) limit 1;
  else
    select * into v_prof from public.profiles
     where is_active and norm_phone(phone) = norm_phone(v_id) and norm_phone(v_id) <> '' limit 1;
  end if;

  if v_prof.id is null or coalesce(norm_phone(v_prof.phone), '') = '' then
    return null; -- unknown, or no phone on file to text
  end if;

  -- Rate-limit: at most one reset text per person per 45 seconds.
  select count(*) into v_recent
  from public.passcode_reset_log
  where profile_id = v_prof.id and created_at > now() - interval '45 seconds';
  if v_recent > 0 then
    return null;
  end if;

  -- Fresh random 6-digit code — NOT derivable from the phone number, so it only helps whoever
  -- actually receives the text.
  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  update auth.users
     set encrypted_password = extensions.crypt(v_code, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_prof.id;

  insert into public.passcode_reset_log (profile_id) values (v_prof.id);

  return jsonb_build_object(
    'phone', norm_phone(v_prof.phone),
    'code',  v_code,
    'name',  coalesce(v_prof.full_name, '')
  );
end;
$$;

revoke all on function public.request_passcode_reset(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- verify_login_credential(identifier, passcode): one place any ROP dashboard can check a phone/email +
-- passcode against the SAME identity store, so a person's own passcode signs them in everywhere.
-- Returns a small identity object on success (no secrets), {ok:false} otherwise. service_role only.
-- ---------------------------------------------------------------------------
create or replace function public.verify_login_credential(p_identifier text, p_passcode text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_prof public.profiles%rowtype;
  v_id   text := btrim(coalesce(p_identifier, ''));
  v_ok   boolean := false;
begin
  if v_id = '' or coalesce(p_passcode, '') = '' then
    return jsonb_build_object('ok', false);
  end if;

  if position('@' in v_id) > 0 then
    select * into v_prof from public.profiles
     where is_active and lower(email) = lower(v_id) limit 1;
  else
    select * into v_prof from public.profiles
     where is_active and norm_phone(phone) = norm_phone(v_id) and norm_phone(v_id) <> '' limit 1;
  end if;

  if v_prof.id is null then
    return jsonb_build_object('ok', false);
  end if;

  select (encrypted_password = extensions.crypt(p_passcode, encrypted_password))
    into v_ok
  from auth.users where id = v_prof.id;

  if not coalesce(v_ok, false) then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object(
      'id', v_prof.id,
      'email', v_prof.email,
      'phone', norm_phone(v_prof.phone),
      'full_name', v_prof.full_name,
      'role', v_prof.role,
      'access_level', v_prof.access_level
    )
  );
end;
$$;

revoke all on function public.verify_login_credential(text, text) from public, anon, authenticated;
