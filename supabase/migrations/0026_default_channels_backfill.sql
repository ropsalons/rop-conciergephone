-- 0026_default_channels_backfill.sql
-- Everyone-lives-here default channels + one-time backfill.
--
-- New staff already auto-join every is_default channel and their location channel via the
-- handle_new_user trigger (0002). This adds the two salon-wide channels that were missing from
-- the default set (Featured Products, Resources Hub) and backfills existing staff so their
-- sidebars match the intended defaults: their salon location + Announcements, Education,
-- Resources Hub, ROP Calendar, Featured Products.
--
-- Owner decision (2026-07): ROP-on-the-clock stays PRIVATE and is intentionally NOT a default.

update public.channels set is_default = true
where slug in ('featured-products','rop-docs-hub') and not is_default;

-- Backfill existing staff into the company-wide default channels. Idempotent; no messages touched.
with defaults as (
  select id from public.channels
  where slug in ('announcements','education','rop-docs-hub','rop-calendar','featured-products')
)
insert into public.channel_members (channel_id, user_id)
select d.id, p.id from defaults d cross join public.profiles p
where p.is_active
on conflict do nothing;

-- Backfill each person into their salon location channel (primary or secondary location).
insert into public.channel_members (channel_id, user_id)
select c.id, p.id
from public.profiles p
join public.channels c
  on c.type = 'location'
 and c.location_id in (p.location_id, p.secondary_location_id)
where p.is_active
on conflict do nothing;
