# ROP Connect

Private, Slack-style internal communication app for **Robert of Philadelphia Salons** —
built to replace paid Slack with a salon-specific dashboard for ~60 team members across
three locations (Bayfront, Village on Venetian Bay, Promenade).

Channels · DMs · threads · reactions · files · search · announcements · urgent alerts with
acknowledgements · daily huddles · shoutouts · guest recovery · education · scheduling · an
admin panel — all realtime, mobile-first, and installable as a PWA.

> Legally distinct and ROP-branded. Inspired by modern team-messaging patterns
> (Mattermost-style channels, Supabase Realtime chat, Rocket.Chat/Zulip thread & notification
> concepts) — no Slack branding, assets, or proprietary UI.

---

## Tech stack

| Layer      | Choice                                                        |
| ---------- | ------------------------------------------------------------- |
| Frontend   | React 18 + TypeScript + Vite                                  |
| Styling    | Tailwind CSS (ROP navy/gold theme, dark)                      |
| State      | Zustand                                                       |
| Backend    | Supabase — Postgres, Auth, Realtime, Storage, Row Level Security |
| Realtime   | Supabase `postgres_changes` (messages, reactions, notifications, presence) |
| PWA        | `vite-plugin-pwa` (installable, offline app shell)            |
| Hosting    | Netlify (SPA + `netlify.toml`)                                |

---

## Architecture at a glance

- **Single workspace** (one company, three locations) — a Mattermost/Slack team→channel→message
  hierarchy collapsed to channel→message since there is one team.
- **Messages are polymorphic**: each row belongs to exactly one of a channel or a direct
  conversation (`CHECK` constraint enforces it).
- **Unread state** is tracked with `last_read_at` on membership rows and computed in one indexed
  RPC (`get_unread_summary`) — the same pattern Supabase Realtime chat examples use.
- **RLS everywhere.** All membership/role checks are `SECURITY DEFINER` helper functions so
  policies never recurse (the classic channels↔channel_members recursion is avoided).
- **Fan-out via triggers**: mentions, thread replies, reactions, announcements and urgent alerts
  all create `notifications` rows server-side, which stream to each user over Realtime.

```
src/
  components/   ui kit, layout shell, messages, channels, dms, files, search
  hooks/        useMessages (realtime engine), useChannel, useAppBootstrap
  pages/        Dashboard, Channel, DM, workflows, Admin, Profile, …
  stores/       auth, directory, chat, ui (Zustand)
  lib/          supabase client, constants, utils, files, dm helpers
  types/        hand-authored database.types.ts (mirrors migrations)
supabase/
  migrations/   0001 schema · 0002 triggers · 0003 RLS · 0004 functions · 0005 storage+realtime · 0006 seed
```

---

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the database schema. Either:
   - **CLI (recommended):**
     ```bash
     supabase link --project-ref <your-project-ref>
     supabase db push
     ```
   - **Dashboard:** open the SQL Editor and run each file in `supabase/migrations/` in order
     (`0001` → `0006`).
3. The migrations automatically:
   - create every table, index, trigger, RLS policy and RPC;
   - create the `avatars` (public) and `attachments` (private, 25MB) storage buckets with policies;
   - add the realtime publication tables;
   - seed roles, the three locations, departments, and the default channels.
4. **Auth settings** (Authentication → Providers → Email): for a fast internal rollout you can
   turn **off** "Confirm email" so staff can sign in right after signing up. Leave it on if you
   prefer confirmations.
5. Grab your **Project URL** and **anon/publishable key** (Project Settings → API).

> The **first person to sign up automatically becomes the Owner/Admin** (see the
> `handle_new_user` trigger). Everyone after that gets the role they pick at sign-up and is
> auto-joined to the default channels plus their location/department channels.

---

## 2. Environment variables

Copy `.env.example` → `.env` and fill in:

| Variable                  | Description                                             |
| ------------------------- | ------------------------------------------------------ |
| `VITE_SUPABASE_URL`       | Your Supabase project URL                              |
| `VITE_SUPABASE_ANON_KEY`  | Supabase anon / publishable key (safe for the browser — RLS enforces access) |
| `VITE_APP_ENV`            | Optional label (`production` / `staging`)              |

**No secrets ship to the client.** Only the anon key is used in the browser; every access rule is
enforced by Postgres RLS. Never put the `service_role` key in this app.

---

## 3. Local development

```bash
npm install
npm run dev        # http://localhost:5173
```

Quality gate:

```bash
npm run lint
npm run typecheck
npm run build
```

App icons are generated (committed) but you can regenerate them with `node scripts/gen-icons.mjs`.

---

## 4. Deploy to Netlify

1. Push this repo to GitHub.
2. In Netlify: **Add new site → Import from Git**, pick the repo.
3. Build settings are read from `netlify.toml` (build `npm run build`, publish `dist`, Node 22, SPA
   redirect so deep links survive a refresh).
4. Add the environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) under
   **Site settings → Environment variables**.
5. Deploy. The service worker + manifest make the site installable ("Add to Home Screen" on
   iOS/Android, install icon on desktop Chrome/Edge).

---

## 5. Test users & first run

1. Open the deployed site (or `localhost:5173`).
2. **Sign up** as yourself — you become **Owner/Admin**. Pick a location + department.
3. Create a few more accounts (or have staff self-serve) with different roles/locations to see:
   - location/department channels auto-join,
   - DMs and group DMs,
   - `@mentions` (type `@` in the composer),
   - reactions, threads, file uploads,
   - announcements & urgent alerts with the **"I saw this"** acknowledgement + escalation report
     (leadership),
   - the daily huddle, shoutouts, guest recovery, education and scheduling workflows,
   - the **Admin Panel** (owner/admin) for users, roles, channels, ack reports, audit log, storage
     usage, and message export.

Roles & privileges: `owner`/`admin` (everything) → `leadership` (announcements, urgent alerts) →
`manager` (huddles, scheduling, guest recovery, channel moderation) → `education` (education
posts) → everyone (chat, DMs, shoutouts, report guest issues, claim shifts).

---

## 5b. Inbound integration API (post messages from other systems)

ROP Connect exposes an **incoming-webhook–style endpoint** so dashboards, the phone/booking
system, or any other API can post messages into a channel or DM — the open, easy-to-integrate
path that replaces Slack incoming webhooks.

- **Endpoint:** `POST https://<project>.supabase.co/functions/v1/ingest`
- **Auth:** header `x-api-key: rop_live_…` (keys are minted per source and revocable; only a
  sha-256 hash is stored). Admins mint keys in-app or via
  `select * from create_integration_token('My Source');` (returns the plaintext once).
- **CORS** is open, so browser-based dashboards can call it directly.

Post to a channel (by slug):

```bash
curl -X POST "https://<project>.supabase.co/functions/v1/ingest" \
  -H "x-api-key: rop_live_xxx" -H "Content-Type: application/json" \
  -d '{"channel":"announcements-rop","text":"Nightly report is ready","author_name":"Reports Bot"}'
```

Direct-message a person (by email):

```bash
curl -X POST "https://<project>.supabase.co/functions/v1/ingest" \
  -H "x-api-key: rop_live_xxx" -H "Content-Type: application/json" \
  -d '{"to_email":"jordan@ropsalons.com","text":"Your 2pm cancelled","author_name":"Front Desk"}'
```

Fields: `text` (required), one of `channel`/`channel_slug`/`channel_id` **or** `to_email`,
optional `author_name`, `source`, and `metadata` (object). Messages are authored by the inactive
**Integrations** account and display the provided `author_name`. Returns
`{ ok: true, message_id, channel_id | conversation_id }`.

The function source is `supabase/functions/ingest/index.ts`; deploy with
`supabase functions deploy ingest --no-verify-jwt` (it does its own API-key auth).

## 6. Security notes

- RLS is enabled on every table; private/admin channels require membership, DMs are members-only,
  guest-recovery items are restricted to managers + involved staff.
- Deactivating a user in the Admin panel (`is_active = false`) blocks all data access via RLS and
  shows them a "deactivated" screen.
- Users cannot self-escalate their role (`guard_profile_privileges` trigger).
- Storage: avatars are public-read (owner-write); attachments are private and served via short-lived
  signed URLs.
- Admin actions write to `audit_logs`.

---

## 7. Known limitations & next improvements

- **Presence** is DB-heartbeat based (online/away/offline), not per-keystroke typing indicators.
- **Push notifications** use the browser Notification API when the tab/PWA is open; true background
  Web Push (VAPID) is a natural next step (add a Supabase Edge Function + service-worker `push`
  handler).
- Message **read receipts** table (`message_reads`) is provisioned but the UI uses membership
  `last_read_at` for unread counts; wire it up for DM "seen" ticks if desired.
- Full-text search uses `ILIKE`/trigram indexes; swap to Postgres `tsvector` for larger histories.
- Data retention/export is available in the Admin panel (CSV by channel + date); automated
  retention policies could be scheduled with `pg_cron`.
- Consider an Edge Function for server-validated file scanning and thumbnailing at scale.
