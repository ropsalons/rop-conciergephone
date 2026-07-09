-- ROP Connect — Storage buckets, storage RLS, and Realtime publication

-- Buckets ----------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, null)
on conflict (id) do nothing;

-- Attachments are private; the app reads them with signed URLs. 25MB cap.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 26214400, null)
on conflict (id) do nothing;

-- Avatars: world-readable, owner writes to their own <uid>/ folder. ------------
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Attachments: any authenticated member of the workspace may read; owner writes.
-- Discovery is gated by the `files`/`messages` RLS above; object names are UUIDs.
drop policy if exists attachments_read on storage.objects;
create policy attachments_read on storage.objects for select
  using (bucket_id = 'attachments' and auth.role() = 'authenticated');

drop policy if exists attachments_write on storage.objects;
create policy attachments_write on storage.objects for insert
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists attachments_delete on storage.objects;
create policy attachments_delete on storage.objects for delete
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

-- Realtime: broadcast row changes for the live surfaces. -----------------------
do $$
declare t text;
begin
  foreach t in array array[
    'messages','message_reactions','notifications','channel_members',
    'direct_conversations','direct_conversation_members','channels',
    'urgent_alerts','announcements','shoutouts','guest_recovery_items','scheduling_posts'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
