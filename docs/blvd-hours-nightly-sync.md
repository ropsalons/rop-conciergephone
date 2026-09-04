# Nightly Boulevard → ROP Chat hours sync (for Grokbot)

Runs once a night. Refreshes `public.blvd_hours` in the ROP Chat Supabase
project from Boulevard's Snowflake share, so the Schedule tab's Stylists
"Scheduled" view and the booked-hours fallback stay current.

The bot needs its own access to:
- **Snowflake** — the `BLVD_SHARE.BOULEVARD` share (read-only).
- **Supabase** — project **`qrigzwactbwbpuufehxo`**, able to run SQL on it
  (Supabase MCP `execute_sql`, or a Postgres connection as the service role —
  the table has RLS, and the service role / `postgres` role bypasses it).

Paste everything in the block below as the nightly task prompt.

---

```
You are refreshing the Boulevard staff-hours snapshot used by ROP Chat's Schedule tab.
Do this once now. Work carefully; it is safe to re-run (all writes are upserts).

SYSTEMS
- Snowflake: read Boulevard's share BLVD_SHARE.BOULEVARD (tables STAFF_SCHEDULES, STAFF).
- Supabase: project id qrigzwactbwbpuufehxo, table public.blvd_hours
  (columns: staff_email text, work_date date, role_name text, location_name text,
   scheduled_hours numeric, booked_hours numeric, synced_at timestamptz;
   primary key (staff_email, work_date)).

STEP 1 — Pull from Snowflake in date chunks.
Run the query below FOUR times, once per chunk, changing only the two <FROM>/<TO>
day offsets: chunk A = (-7, 10), chunk B = (11, 21), chunk C = (22, 31), chunk D = (32, 42).
Each run returns ONE row with a single text column `VALS` = a comma-joined list of SQL
value tuples. (It rounds hours and de-duplicates to one row per staff per day.)

  select listagg('(' ||
    '''' || replace(email,'''','''''') || '''' || ',' ||
    '''' || to_char(d,'YYYY-MM-DD') || '''' || ',' ||
    coalesce('''' || replace(role_name,'''','''''') || '''','null') || ',' ||
    coalesce('''' || replace(loc,'''','''''') || '''','null') || ',' ||
    coalesce(to_char(sched),'null') || ',' || coalesce(to_char(booked),'null') || ')', ',') as vals
  from (
    select lower(st.email) as email, s.schedule_date_loc as d,
      max(st.role_name) as role_name, max(s.location_name) as loc,
      round(sum(s.scheduled_hours),2) as sched, round(sum(s.booked_hours),2) as booked
    from BLVD_SHARE.BOULEVARD.STAFF_SCHEDULES s
    join BLVD_SHARE.BOULEVARD.STAFF st on st.id = s.staff_id
    where s.schedule_date_loc >= dateadd(day, <FROM>, current_date)
      and s.schedule_date_loc <= dateadd(day, <TO>, current_date)
      and st.email is not null and (s.scheduled_hours > 0 or s.booked_hours > 0)
    group by 1, 2
  );

STEP 2 — Upsert each chunk into Supabase.
For each chunk's VALS, run this on Supabase project qrigzwactbwbpuufehxo, pasting the
VALS text where <VALS> is. If a chunk's VALS came back empty/null, skip its insert.

  insert into public.blvd_hours
    (staff_email, work_date, role_name, location_name, scheduled_hours, booked_hours)
  values <VALS>
  on conflict (staff_email, work_date) do update set
    role_name = excluded.role_name,
    location_name = excluded.location_name,
    scheduled_hours = excluded.scheduled_hours,
    booked_hours = excluded.booked_hours,
    synced_at = now();

STEP 3 — Prune old rows (keep a small trailing window).
  delete from public.blvd_hours where work_date < current_date - 14;

STEP 4 — Verify and report.
  select count(*) as rows, min(work_date) as earliest, max(work_date) as latest,
         max(synced_at) as last_synced from public.blvd_hours;
Report: the row count, the date range, last_synced, and any chunk that errored or was empty.

RULES
- All writes are idempotent upserts — safe to retry a failed chunk.
- Do NOT change the table schema or touch any other table.
- On a Snowflake or Supabase error, retry that step up to 3 times with a short backoff;
  if it still fails, report which chunk/step failed and stop (leave prior chunks in place).
- Matching to people happens inside ROP Chat by email, so just load the rows as-is.
```

---

## Notes
- The window is a rolling **last 7 days → next 6 weeks**, so the Stylists "Scheduled"
  view always covers current + upcoming weeks.
- Rows are keyed by `(staff_email, work_date)`; the upsert overwrites each day's numbers,
  so no duplicates accumulate and the prune keeps history small.
- If you'd rather this be one big query instead of four chunks, that also works — the only
  reason for chunking is to keep each result under the agent's output-size limits.
