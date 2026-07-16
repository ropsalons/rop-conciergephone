# ROP Chat — Supabase Performance Audit

**Date:** 2026-07-16
**Trigger:** High CPU (~91% on Nano) + Disk IO warnings; `pg_stat_statements` showing hundreds of
thousands of calls to `channel_members`, `channels`, `profiles`, `direct_conversation_members`, and
several RPCs.

---

## 1. Evidence (measured, not assumed)

Top statements by call count from `extensions.pg_stat_statements` **before** any change:

| calls | mean ms | total ms | statement (trimmed) |
| ----: | ------: | -------: | ------------------- |
| 7,008,670 | 0.03 | 215,352 | PostgREST per-request `set_config(...)` (≈ total HTTP requests) |
| 1,769,656 | 1.02 | 1,801,467 | Realtime `pg_publication_tables` subscription setup |
| 619,485 | 11.19 | 6,933,307 | Realtime WAL poll (`SELECT wal->>...`) |
| 590,529 | 0.09 | 50,778 | `profiles WHERE id = $1` (single profile) |
| 590,389 | 0.06 | 37,861 | `roles ORDER BY rank` (reference data) |
| 590,389 | 0.05 | 30,862 | `locations ORDER BY sort_order` (reference data) |
| 590,330 | 0.07 | 40,349 | `departments ORDER BY name` (reference data) |
| 590,009 | 6.72 | **3,963,459** | `profiles ORDER BY full_name` (ALL profiles) |
| 589,753 | 0.58 | 341,062 | `touch_last_seen(p_presence)` RPC (presence heartbeat) |
| 589,068 | **46.06** | **27,130,136** | `channel_activity()` RPC (sidebar activity) |
| 588,393 | 1.26 | 741,801 | `direct_conversation_members (is_muted + conversations)` |
| 587,292 | 1.13 | 665,726 | `get_unread_summary()` RPC |
| 586,542 | 4.48 | 2,625,026 | `direct_conversation_members (conversation_id + profiles)` |
| 516,875 | 0.35 | 179,555 | `INSERT/UPSERT push_subscriptions` |
| 385,267 | **189.22** | **72,901,115** | `channel_members (is_muted, is_favorite, channels(*))` |
| 204,921 | **150.55** | 30,851,574 | `channel_members (...)` (same shape, 2nd param arity) |

**The tell:** the counts for `roles`, `locations`, `departments`, all-`profiles`, `profile-by-id`,
`touch_last_seen`, `channel_activity()`, both `direct_conversation_members` selects,
`get_unread_summary()`, and `channel_members` are **all ≈ 586k–590k — nearly identical.** Queries
that come from unrelated user actions never line up that precisely. They line up because **one code
path fires all of them together, over and over.**

**The two CPU sinks by total DB time:**
- `channel_members … channels(*)` — **~103 million ms** combined (189ms + 150ms mean). This is the
  sidebar's "channels I belong to" query; the `channels(*)` embed is re-checked by RLS
  (`can_view_channel`) per channel row, which is why it's slow.
- `channel_activity()` — **~27 million ms** (46ms mean).

Multiplying an expensive query by a runaway loop is what pinned CPU at 91%.

---

## 2. Root cause (primary)

**`src/hooks/useAppBootstrap.ts` re-runs its entire effect in an unthrottled loop.**

- The effect's dependency array is `[userId, prefs]`, where
  `prefs = useAuthStore(s => s.profile?.notification_prefs)`.
- Inside the same effect, presence setup calls `useAuthStore.getState().refreshProfile()`
  (line 77). `refreshProfile()` runs `select('*') from profiles` and does `set({ profile })` with a
  **freshly-parsed object** — so `notification_prefs` is a **new object reference every time**.
- A new `prefs` reference makes React consider the dependency changed → the effect **cleans up and
  re-runs** → which calls `refreshProfile()` again → new `prefs` → re-run … a loop bounded only by
  network round-trip time.

Every loop iteration:
- `useDirectoryStore.load()` → `profiles` (all), `roles`, `locations`, `departments` (4 queries)
- `useChatStore.loadSidebar()` → `channel_members(channels(*))`, `channel_activity()`,
  `direct_conversation_members` ×2, then `get_unread_summary()` (≈6 queries, incl. the 189ms one)
- `syncExistingSubscription()` → `push_subscriptions` upsert
- `setPresence('online')` + `refreshProfile()` → `touch_last_seen` + `profiles WHERE id`
- **tears down and recreates the two realtime channels** (`notifications:*`, `membership:*`)

≈ 12 statements per iteration × ~590k ÷ 12 ≈ **~49,000 full bootstraps per client** accumulated. The
`onAuthStateChange` handler in `authStore` compounds it: it reloads the profile on **every** auth
event including periodic `TOKEN_REFRESHED`, replacing the profile object and nudging the same loop.

**Contributing factor:** the effect also re-subscribed/removed the two Realtime channels on every
iteration — explaining the ~1.77M Realtime subscription-setup calls and ~619k WAL polls.

---

## 3. Audit table

| File | Function / component | Table / endpoint | Query type | Frequency | Cleanup | Duplicate risk | Severity | Correction |
| ---- | -------------------- | ---------------- | ---------- | --------- | ------- | -------------- | -------- | ---------- |
| `src/hooks/useAppBootstrap.ts` | `useAppBootstrap` effect | (drives all below) | effect | **looping (deps include `prefs`, which the effect mutates)** | yes | n/a | **CRITICAL** | Depend on `[userId]` only; read `prefs` from a ref |
| `src/hooks/useAppBootstrap.ts` | notifications subscription | Realtime `notifications` | `postgres_changes` | recreated each loop | yes (removeChannel) | high (re-subscribes) | **CRITICAL** | Fixed by loop fix (subscribe once per login) |
| `src/hooks/useAppBootstrap.ts` | membership subscription | Realtime `channel_members`,`direct_conversation_members` | `postgres_changes` | recreated each loop | yes | high | **CRITICAL** | Fixed by loop fix |
| `src/stores/chatStore.ts` | `loadSidebar` | `channel_members` + `channels(*)` | select (RLS embed) | per bootstrap | n/a | n/a via loop | **CRITICAL** (189ms×385k) | Called once/login after fix; index review below |
| `src/stores/chatStore.ts` | `loadSidebar` | `channel_activity()` | rpc | per bootstrap | n/a | n/a | **HIGH** (46ms×589k) | Called once/login after fix |
| `src/stores/chatStore.ts` | `loadSidebar` | `direct_conversation_members` ×2 | select | per bootstrap | n/a | n/a | HIGH | Once/login after fix |
| `src/stores/chatStore.ts` | `refreshUnread` | `get_unread_summary()` | rpc | per bootstrap + per notification INSERT | n/a | n/a | MEDIUM | Once/login + on real events (fine) |
| `src/stores/directoryStore.ts` | `load` | `profiles`,`roles`,`locations`,`departments` | select | per bootstrap | n/a | n/a | HIGH | Once/login after fix; already guarded elsewhere |
| `src/stores/authStore.ts` | `init → onAuthStateChange` | `profiles` | select | **every auth event incl. TOKEN_REFRESHED** | n/a | medium | HIGH | Only reload profile when the user id actually changes |
| `src/stores/authStore.ts` | `refreshProfile` | `profiles` | select | called by the loop | n/a | n/a | (root) | Loop fix removes repeated calls |
| `src/lib/push.ts` | `syncExistingSubscription` | `push_subscriptions` | upsert (onConflict endpoint) | per bootstrap | n/a | none (upsert) | MEDIUM | Once/login after fix (no row bloat — upsert) |
| `src/hooks/useAppBootstrap.ts` | presence heartbeat | `touch_last_seen()` | rpc | `setInterval` 60s | yes (clearInterval) | none | LOW (acceptable) | Keep 60s; pause when tab hidden already sends `away` |
| `src/hooks/useMessages.ts` | realtime messages | Realtime `messages`,`message_reactions` | `postgres_changes` | per open conversation | yes (removeChannel, unique topic) | low | LOW | OK — one per open view, cleaned up |
| `src/hooks/useChannel.ts` | `useChannel` effect | `channels`,`channel_members(profiles(*))` | select | per channel open (stable deps) | n/a | none | LOW | OK — not a loop |
| `src/main.tsx` | SW update poll | (no DB) | `setInterval` 30s | 30s | n/a | none | NONE | Not a database call |

No React Query / `refetchInterval` / `refetchOnWindowFocus` exists in the app. No other `setInterval`
touches the database except the 60s presence heartbeat.

---

## 4–13. Final report

**4. Root cause.** A single React effect (`useAppBootstrap`) listed `notification_prefs` in its
dependency array while also calling `refreshProfile()`, which replaces the profile with a
freshly-parsed object every time. New object reference → dependency "changed" → effect re-ran →
called `refreshProfile()` again → loop. Each iteration re-ran the entire data bootstrap (directory,
sidebar, unread, push upsert, presence) and re-subscribed both Realtime channels. `authStore`'s
`onAuthStateChange` compounded it by re-fetching the profile on every token refresh.

**5. Exact files changed.**
- `src/hooks/useAppBootstrap.ts` — effect now depends on `[userId]` only; `notification_prefs` read
  from a ref (`prefsRef`) inside the notification handler. Bootstrap + subscriptions happen once per
  login.
- `src/stores/authStore.ts` — `onAuthStateChange` only re-fetches the profile when the signed-in user
  actually changes; token refreshes (same user) update the session only.
- `src/lib/devMetrics.ts` — NEW, dev-only request/subscription counters (no-op in production).
- `src/main.tsx` — calls `initDevMetrics(supabase)` (dev-only).
- Reports: `SUPABASE_PERFORMANCE_AUDIT.md`, `supabase-performance-index-review.sql`.

**6. Previous polling intervals.** No timed polling drove this. The "polling" was an unbounded
effect-driven loop (iteration time ≈ one set of network round-trips, i.e. tens–hundreds of ms). The
only real timers are: presence heartbeat `60s` (kept) and the service-worker update poll `30s`
(no DB). No `refetchInterval` / React Query anywhere.

**7. New polling intervals.** Unchanged and appropriate: presence heartbeat stays `60s` (already
sends `away` when the tab is hidden). Bootstrap now runs **once per login** instead of in a loop.
Realtime handles live updates (messages, notifications, membership) — no data polling added.

**8. Duplicate subscriptions removed.** The two Realtime channels (`notifications:<uid>`,
`membership:<uid>`) were being torn down and recreated on every loop iteration (≈1.77M Realtime
subscription-setup calls, ≈619k WAL polls in the stats window). They are now created **once per
login** and cleaned up on logout/unmount. Per-conversation message subscriptions
(`src/hooks/useMessages.ts`) were already correct (unique topic, `removeChannel` cleanup).

**9. Data now cached / batched.** Directory (all profiles + roles + locations + departments),
sidebar (channels + memberships + DM members), and unread counts are fetched **once per login** and
held in Zustand stores instead of being re-fetched in a loop. DM members were already batched via a
single `IN` query. Notification prefs are reused from store state via a ref.

**10. Query invalidations reduced.** There was no query-invalidation library; the "invalidation" was
the effect re-running. Removing the loop eliminates the repeated `loadSidebar()` / `directory.load()`
/ `refreshProfile()` / push upsert. `refreshUnread()` still runs on a real incoming-notification
Realtime event only (correct, event-driven).

**11. Recommended indexes.** None. See `supabase-performance-index-review.sql`: every hot filter/
join/ordering is already indexed. The two high-mean statements were inflated by CPU saturation, not
missing indexes — re-measure after the fix before any schema change.

**12. Tests performed.** `npm run typecheck` ✓ and `npm run build` ✓ (both clean). Code-path review
of each workflow the change touches: login, channel-list load, open/switch channel, send message,
receive realtime message, DMs, profile display, membership change (still triggers `loadSidebar` via
the membership subscription — created once), notifications, tab hidden/restored (heartbeat sends
`away`/`online`; no re-bootstrap), reconnect (Realtime reconnects; no bootstrap loop), multiple tabs
(each tab bootstraps once, not in a loop), logout/login (effect cleans up on `userId` change and
re-runs once). The dev-only `devMetrics` logs active-subscription count and requests/min so a
continuously-growing subscription count is immediately visible in development.

**13. Remaining risks / not-optimizable-safely.**
- `channel_activity()` (46ms) is a full-history aggregate; if it's still warm after the fix, tune the
  function specifically — not addressed now (no evidence it's a problem once called once/login).
- Multiple open tabs each hold their own subscriptions + one bootstrap (expected, minor).
- The measured *result* depends on clients adopting the new build; the app now auto-updates, so this
  propagates within ~a minute of each client opening. Verify with the query below.

---

## Production verification (MEASURED post-deploy, 2026-07-16 21:13–21:18 UTC)

Confirmed: files committed (`f458045`); both CI deploys `success`; production serving `v1.13.2`.
`pg_stat_statements` was reset at 21:13:29 UTC and a clean **3.84-minute** window measured:

| Metric | Before (measured) | After (measured) | Change |
| --- | --- | --- | --- |
| All PostgREST data queries | **~2,645/min (44/sec)** (live delta 21:01–21:02) | **~66/min (1.1/sec)** (252 in 3.84 min) | **↓ ~97.5%** |
| `channel_activity()` | continuous (589k cum, 46 ms ea) | **0 calls** | ↓ ~100% |
| `profiles` (all, ORDER BY full_name) | continuous (590k cum) | **0 calls** | ↓ ~100% |
| `get_unread_summary()` | continuous (587k cum) | **0 calls** | ↓ ~100% |
| `channel_members (channels(*))` | continuous, **189 ms** mean | **9 calls (2.3/min), 58 ms** | ↓ ~95% + faster |
| `direct_conversation_members` | continuous (586–588k cum) | **6 calls (1.6/min)** | ↓ ~100% |
| Realtime subscription-setup calls | ~1.77M cumulative (constant churn) | **3 in the window** | ↓ ~100% (stable subs) |
| Top statement by calls (since reset) | (loop) | 180 (PostgREST `set_config`) — nothing climbing | no runaway |

- **CPU:** was ~91% (Nano). Not directly readable via SQL, but the two heaviest statements
  (`channel_members` 189 ms × continuous, `channel_activity()` 46 ms × continuous) are now ~zero and
  `channel_members` mean fell 189 ms → 58 ms as contention cleared — so CPU should fall to a small
  fraction. Confirm the downward trend in Supabase → Reports → Database → CPU over the next hour.
- **Request rate:** ~2,645/min → ~66/min (**≈97.5% reduction**).
- **Subscriptions:** were 2/client **recreated every loop iteration** (≈1.77M setup calls in the prior
  window) → 2/client **created once per login** (3 setup calls in the measured window).
- **Estimated cost savings:** eliminates the need to upsize compute (Nano → Small/Medium would be
  ~$15–75+/mo) and cuts Disk IO proportionally; the app now uses ~2–3% of its prior DB query volume.
- **Runaway check (rule 8):** none. No query exceeds expectations; the loop-signature queries are at
  zero while real clients are active. No further optimization required.

## How to verify the improvement in Supabase

Run this any time to see the top statements by call count (the bootstrap-cluster queries should stop
climbing and fall far down this list as clients update):

```sql
select calls, round(mean_exec_time::numeric,2) as mean_ms,
       left(regexp_replace(query,'\s+',' ','g'),90) as query
from extensions.pg_stat_statements order by calls desc limit 20;
```

For a clean before/after, reset the counters once the fix is live and clients have reopened
(~1 hour), then re-check after ~10 minutes:

```sql
select extensions.pg_stat_statements_reset();   -- safe: clears stats only, not data
-- …wait ~10 min…
select calls, round(mean_exec_time::numeric,2) as mean_ms,
       left(regexp_replace(query,'\s+',' ','g'),90) as query
from extensions.pg_stat_statements order by calls desc limit 20;
```

Also watch **Reports → Database → CPU / Disk IO** in the Supabase dashboard trend down over the hour.

---

## SUMMARY (copy to technical advisor)

- **Root cause:** `useAppBootstrap` effect depended on `notification_prefs` while itself calling
  `refreshProfile()`, which replaced the profile object each call → the effect re-ran endlessly,
  re-running the full bootstrap (directory, sidebar, unread, push upsert, presence) and
  re-subscribing both Realtime channels on every iteration. Not a missing index; not compute size.
- **Files changed:** `src/hooks/useAppBootstrap.ts`, `src/stores/authStore.ts`, `src/main.tsx`,
  `src/lib/devMetrics.ts` (dev-only), plus audit docs. No schema/RLS/trigger/policy changes.
- **Before request frequency:** the bootstrap-cluster queries (`channel_members(channels(*))`,
  `channel_activity()`, all-`profiles`, `roles`, `locations`, `departments`, `get_unread_summary()`,
  `direct_conversation_members`×2, `touch_last_seen`, `push_subscriptions`) each ≈ **586k–590k calls**
  with matching counts — i.e. looping continuously per active client; `channel_members` alone burned
  ~103M ms of DB time.
- **Before request frequency (measured live, 2026-07-16 21:01–21:02 UTC):** a 70-second delta on
  `pg_stat_statements` showed **3,075 PostgREST data queries in 69.8s ≈ 44 requests/second
  (~2,645/min)** — versus the 46-day average of ~105/min, i.e. the loop was actively saturating the
  instance at the time of the fix.
- **After request frequency:** those same queries run **once per login** (a few times/user/day). The
  60s presence heartbeat is the only recurring per-client DB call. Expected steady-state is a small
  fraction of the 44/sec above (dominated by real user activity + heartbeats), not a continuous loop.
- **Subscriptions before/after:** 2 per client **recreated every loop** (≈1.77M setup calls in the
  window) → **2 per client, created once per login** and cleaned up.
- **Estimated reduction:** **>95% (likely >99%)** of ROP Chat's Supabase call volume — the entire
  looped bootstrap cluster is eliminated. CPU/Disk IO should fall correspondingly.
- **SQL to run manually:** none required. Optional: `select extensions.pg_stat_statements_reset();`
  to get a clean post-fix baseline (stats only — does not touch data). No index changes.
- **Unresolved / to watch:** re-measure `channel_activity()` after the fix; if still warm, tune that
  function specifically. Result is confirmed by the verification queries above once clients update
  (the app auto-updates, so within ~an hour).

