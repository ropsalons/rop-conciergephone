-- ROP Connect — automatic rich "ROP Scorecard" (company multi-window + per-stylist),
-- sourced from Snowflake ANALYTICS.MARTS via a read-only programmatic access token.
-- pg_cron invokes the daily-scorecard Edge Function each morning; it posts an HTML card
-- into #daily-numbers via the ingest webhook. Replaces the simpler Boulevard daily card.
-- Function source: supabase/functions/daily-scorecard/index.ts
select cron.schedule('rop-scorecard','0 13 * * *',
  $$ select net.http_post(
       url:='https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/daily-scorecard',
       headers:=jsonb_build_object('x-cron-secret','rop-daily-3f9ac21b','Content-Type','application/json'),
       body:='{}'::jsonb, timeout_milliseconds:=150000); $$
);
