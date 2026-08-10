-- Stop an integration/bot from posting under a real employee's name.
--
-- AI posts are authored by the shared "Integrations" bot account, and the caller sets a friendly
-- metadata.author_name (usually the project/persona). Nothing stopped a token from setting that to a
-- real person's name — which is how a bot showed up in #payroll as "Rob DiLella". This BEFORE-INSERT
-- guard catches any bot message whose author_name looks like a real employee and swaps it for the
-- agent's own name, so a bot can never impersonate a person. Covers every write path (gateway, direct
-- inserts, future integrations) in one place.
--
-- "Looks like a person" = exact match on someone's display OR full name, OR a nickname+surname match
-- (e.g. "Rob DiLella" → Robert DiLella / "Rob"): same surname as an employee AND a first token that is
-- their display name or a prefix of their first name. Project labels like "ROP Payroll Assistant"
-- don't share an employee surname, so they're never touched.

create or replace function public.guard_bot_author_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author text;
  v_agent  text;
begin
  if new.user_id = '00000000-0000-4000-8000-00000000b010'::uuid
     and new.metadata ? 'author_name' then
    v_author := btrim(coalesce(new.metadata->>'author_name', ''));
    if v_author <> '' and exists (
      select 1 from public.profiles p
      where p.is_active and (
        lower(coalesce(p.display_name, '')) = lower(v_author)
        or lower(coalesce(p.full_name, '')) = lower(v_author)
        or (
          -- nickname + surname (author has a surname token that matches an employee's surname,
          -- and its first token is that employee's display name or a prefix of their first name)
          lower(split_part(v_author, ' ', -1)) <> lower(split_part(v_author, ' ', 1))
          and split_part(coalesce(p.full_name, ''), ' ', -1) <> ''
          and lower(split_part(coalesce(p.full_name, ''), ' ', -1)) = lower(split_part(v_author, ' ', -1))
          and (
            lower(coalesce(p.display_name, '')) = lower(split_part(v_author, ' ', 1))
            or left(lower(split_part(coalesce(p.full_name, ''), ' ', 1)), length(split_part(v_author, ' ', 1)))
               = lower(split_part(v_author, ' ', 1))
          )
        )
      )
    ) then
      -- Impersonating a real person → use the agent's own name (or a neutral fallback).
      v_agent := coalesce(nullif(new.metadata->'ai_agent'->>'name', ''), 'ROP Integration');
      new.metadata := jsonb_set(new.metadata, '{author_name}', to_jsonb(v_agent), true);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_bot_author_name_biu on public.messages;
create trigger guard_bot_author_name_biu
  before insert on public.messages
  for each row execute function public.guard_bot_author_name();
