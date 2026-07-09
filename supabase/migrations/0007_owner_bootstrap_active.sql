-- ROP Connect — make the "first user becomes owner" bootstrap ignore INACTIVE accounts
-- (e.g. the "Slack Archive" author used for imported history), so the first real human
-- signup still becomes the workspace owner.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_location uuid;
  v_department uuid;
  v_role text;
begin
  select id into v_location from public.locations
    where slug = coalesce(new.raw_user_meta_data->>'location_slug', '') limit 1;
  select id into v_department from public.departments
    where slug = coalesce(new.raw_user_meta_data->>'department_slug', '') limit 1;

  if not exists (select 1 from public.profiles where is_active) then
    v_role := 'owner';
  else
    v_role := coalesce(new.raw_user_meta_data->>'role', 'associate');
    if not exists (select 1 from public.roles where key = v_role) then
      v_role := 'associate';
    end if;
  end if;

  insert into public.profiles (id, email, full_name, display_name, role, location_id, department_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'display_name',
    v_role,
    v_location,
    v_department
  )
  on conflict (id) do nothing;

  insert into public.channel_members (channel_id, user_id)
  select c.id, new.id from public.channels c
  where c.is_default
     or (c.type = 'location' and c.location_id is not distinct from v_location and v_location is not null)
     or (c.type = 'department' and c.department_id is not distinct from v_department and v_department is not null)
  on conflict do nothing;

  return new;
end;
$$;
