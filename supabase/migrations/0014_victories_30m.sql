-- Snowflake cost: halve the Victories Snowflake polling on COMPUTE_WH.
-- rop-victories fired every 15 min (7am-6pm ET gate) -> ~48 runs/day. victories-feed re-scans the
-- WHOLE day (ANALYTICS.MARTS.VICTORIES_TODAY) each run and dedups by external_key, so a slower cadence
-- cannot drop events. Change to every 30 min (same business-hours gate) -> ~24 runs/day.
-- Only the schedule changes; the command (business-hours gate + net.http_post) is left intact.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'rop-victories'),
  schedule := '*/30 * * * *'
);
