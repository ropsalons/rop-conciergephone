-- 0030_birthdays_anniversaries.sql
-- Daily birthday & work-anniversary shout-outs in #Announcements.
--
-- Adds date-of-birth + hire-date to profiles (populated from Gusto — the actual dates are loaded
-- as a one-time data operation and are NOT committed to the repo, since they're personal data), and
-- a small idempotency ledger so each person gets at most one birthday and one anniversary post per
-- year. The daily-celebrations edge function reads these and posts (pg_cron job rop-daily-celebrations,
-- 13:00 UTC = 9am ET). No age or birth year is ever shown — only month/day is used for birthdays.

alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists hire_date date;

create table if not exists public.celebration_posts (
  person_id  uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('birthday','anniversary')),
  year       int  not null,
  message_id uuid,
  posted_at  timestamptz not null default now(),
  primary key (person_id, kind, year)
);
alter table public.celebration_posts enable row level security;

-- Scheduled by (run once, outside this file, alongside the other cron jobs):
--   select cron.schedule('rop-daily-celebrations', '0 13 * * *', $$
--     select net.http_post(
--       url := '.../functions/v1/daily-celebrations',
--       headers := jsonb_build_object('x-cron-secret','<secret>','Content-Type','application/json'),
--       body := '{}'::jsonb, timeout_milliseconds := 120000);
--   $$);
