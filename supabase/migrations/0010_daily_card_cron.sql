-- ROP Connect — automatic "Daily Numbers" card.
-- A self-contained scheduled job (no external server, no Claude): pg_cron invokes the
-- `daily-card` Edge Function each morning, which pulls yesterday's numbers from the
-- Boulevard Admin API (guests, appointments, first-visit guests, retail-per-guest, and a
-- rebooking proxy, by location) and posts a rendered HTML card into #daily-numbers via the
-- `ingest` webhook. Function source: supabase/functions/daily-card/index.ts

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 13:00 UTC ≈ 9am America/New_York. The function targets "yesterday" in salon-local time.
select cron.schedule(
  'rop-daily-card',
  '0 13 * * *',
  $$ select net.http_post(
       url := 'https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/daily-card',
       headers := jsonb_build_object('x-cron-secret','rop-daily-3f9ac21b','Content-Type','application/json'),
       body := '{}'::jsonb,
       timeout_milliseconds := 150000
     ); $$
);
