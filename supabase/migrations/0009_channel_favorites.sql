-- ROP Connect — per-user channel favorites.
-- Each member can "star" a channel so it sorts to the top of their sidebar.
-- Stored per membership row so it is private to each user.

alter table public.channel_members
  add column if not exists is_favorite boolean not null default false;
