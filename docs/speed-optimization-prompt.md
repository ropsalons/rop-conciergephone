# App Speed Fix — Reusable Prompt

A ready-to-paste prompt that tells an AI coding agent (Claude Code, etc.) how to **diagnose and
fix slow page/data loading** in any app — using the same evidence-first process that fixed the
ROP Chat slowness (proved the database was fast, ruled out the connection, found the real cause on
the client, and fixed it with instant-render-from-cache + background refresh).

**How to use it:** open the slow app's project in your coding agent and paste everything in the
box below (from `GOAL:` to the end). Works for most stacks; it's tuned for React + a Postgres/
Supabase-style backend, but the method applies broadly.

---

```
GOAL: My app is slow to load pages / lists / detail views (channels, records, screens).
Diagnose the REAL cause with evidence, then fix it. Do not guess, and do not tell me
"it's probably fine" — profile it, prove where the time goes, and make it fast.

Work autonomously through these phases. Prefer safe, reversible changes. After each fix,
re-measure and report before/after.

=== PHASE 1: MEASURE FIRST (never guess) ===
1. Identify the exact slow interaction (e.g. "open a channel," "open a record").
2. Separate SERVER time from CLIENT time:
   - Time the underlying database queries directly. On Postgres/Supabase, run
     EXPLAIN ANALYZE on the query the screen makes. Confirm it uses an index (not a Seq
     Scan) and executes in single-digit milliseconds. If it's slow, that's the problem —
     add the missing index on the columns you filter + sort by.
   - Check the database/region vs. the users' location. High base latency to a far region
     multiplies every round-trip. (You usually can't move it, but note it.)
   - If the DB uses row-level security (RLS): make sure the RLS helper functions are marked
     STABLE, do only indexed lookups, and wrap auth calls once — e.g. use
     (select auth.uid()) instead of bare auth.uid() so it's evaluated once, not per row.
3. Count the CLIENT round-trips for ONE navigation. Open the network tab (or log every
   request). Most "slow to load" bugs are here: the app makes several sequential requests
   and blanks the screen until they all finish.

=== PHASE 2: THE USUAL ROOT CAUSES (check each) ===
- Blocking, sequential loads: the screen shows a full-page spinner while it loads A, THEN
  B, THEN C before rendering anything.
- No caching: every visit re-fetches from scratch, even for a screen you just viewed.
- N+1 / redundant queries: a query per row, or extra queries that almost always return
  nothing (e.g. fetching "reactions" and "attachments" separately when there usually are
  none).
- Refetching data you already have loaded elsewhere (e.g. list metadata already in a store
  or a parent component).
- Oversized payloads: selecting * / huge columns / no pagination limit.
- Waterfalls: request B waits on request A's result when they could run in parallel.

=== PHASE 3: THE FIXES (apply what's relevant) ===
1. Render instantly from what you already have. If the item's basic info is already loaded
   (in a store, cache, or the parent list), seed the screen from it immediately and refresh
   in the BACKGROUND. Only show a full-screen loader when you truly have nothing to show
   (e.g. a deep link to something never loaded).
2. Add a stale-while-revalidate cache, keyed by the view (channel id, record id, etc.):
   - On open, show cached data instantly.
   - Kick off a background refresh; swap in fresh data when it arrives.
   - Reset cleanly when the key changes so the previous screen never flashes.
   - Keep the cache fresh on live updates/edits; exclude optimistic/temporary items.
3. Collapse round-trips: fetch related data in ONE request (a join, a view, or a single
   RPC that returns the record + its children together) instead of 3-4 sequential calls.
   Drop queries that almost always come back empty, or make them lazy.
4. Parallelize anything independent (Promise.all) instead of awaiting in sequence.
5. Don't block the whole screen: render the shell (header, layout) immediately and let the
   content stream in.
6. Paginate and select only the columns you render.
7. Server side: add indexes on (filter_column, sort_column); keep RLS helpers STABLE +
   indexed; consider a purpose-built RPC for hot paths.

=== PHASE 4: VERIFY ===
- Re-run the same measurement. Report the before/after (round-trip count + wall-clock).
- Confirm you did NOT break correctness: live updates still arrive, optimistic actions
  (sending/saving) still work, navigating between items shows the right data (no stale
  flash), and the first-ever load of an uncached item still works.
- Ship it, and give me a plain-English summary of what was slow, what it was NOT (rule out
  the server/connection if that's the case), and exactly what you changed.

CONSTRAINTS: Keep changes safe and reversible. Measure, don't assume. If the database and
region are already fast, say so clearly and focus on the client — that's where most of this
kind of slowness lives.
```

---

## What this fixed in ROP Chat (a worked example)

- **Measured:** the database query for a channel ran in ~0.1 ms using an index; the server is in
  us-east-1 (~20-40 ms from Florida). So the backend and connection were **not** the problem.
- **Found:** opening a channel blanked the screen through **two sequential blocking loads**
  (channel details + members, then messages) and **cached nothing**, so every revisit re-fetched
  from scratch.
- **Fixed:** render the channel instantly from already-loaded sidebar data + a stale-while-
  revalidate message cache (instant on revisit, refreshes in the background), with a clean reset so
  the previous conversation never flashes.
- **Result:** channels/DMs open near-instantly; revisits are immediate.
