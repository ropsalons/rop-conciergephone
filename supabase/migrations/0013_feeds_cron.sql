-- ROP Connect — scheduled feeds (pg_cron -> Edge Functions), all self-contained (no Claude).
--   rop-appt-feed     every 10 min  -> appt-feed      (new Boulevard bookings -> #dc-coordinators)
--   rop-calendar-feed every 3 hours -> calendar-feed  (public Google iCal -> #rop-calendar card)
-- (rop-scorecard, the nightly Snowflake ROP Scorecard, is scheduled in 0011_scorecard_cron.sql.)

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'rop-appt-feed',
  '*/10 * * * *',
  $$ select net.http_post(
       url := 'https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/appt-feed',
       headers := jsonb_build_object('x-cron-secret','rop-daily-3f9ac21b','Content-Type','application/json'),
       body := '{}'::jsonb,
       timeout_milliseconds := 120000
     ); $$
);

select cron.schedule(
  'rop-calendar-feed',
  '5 */3 * * *',
  $$ select net.http_post(
       url := 'https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/calendar-feed',
       headers := jsonb_build_object('x-cron-secret','rop-daily-3f9ac21b','Content-Type','application/json'),
       body := '{}'::jsonb,
       timeout_milliseconds := 120000
     ); $$
);
