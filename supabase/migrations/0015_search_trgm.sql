-- ROP Chat — fast, full search across history.
-- Trigram GIN indexes make case-insensitive substring search (ILIKE '%term%') fast even
-- across the full imported message archive, so the in-app Search (messages, links, files,
-- channels) stays instant as the history grows. RLS still limits results to what each user
-- is allowed to see; these indexes only affect speed, not visibility.

create extension if not exists pg_trgm;

create index if not exists idx_messages_body_trgm on public.messages using gin (body gin_trgm_ops);
create index if not exists idx_files_name_trgm on public.files using gin (name gin_trgm_ops);
create index if not exists idx_channels_name_trgm on public.channels using gin (name gin_trgm_ops);
