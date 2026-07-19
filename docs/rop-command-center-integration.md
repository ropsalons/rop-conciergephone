# ROP Chat ⇄ ROP Command Center — Two-Way API Integration

**Audience:** the ROP Command Center app (Rob's personal project-manager / delegation tool).
**Purpose:** let Command Center and ROP Chat talk **directly, machine-to-machine over HTTPS** — no
email bridge — so Command Center can read/post in ROP Chat and push task updates, and ROP Chat can
notify Command Center when things happen. Both apps are owned by the same person (Rob DiLella) and
this integration is explicitly authorized by the owner of both systems.

There are **two directions**, set up independently:

| Direction | Status | How |
| --- | --- | --- |
| **A. Command Center → ROP Chat** | ✅ **Live now** | Call ROP Chat's `ai-gateway` with the bearer token below |
| **B. ROP Chat → Command Center** | ⏳ Needs one thing from you | ROP Chat POSTs events to a webhook URL you give us (see §5) |

---

## 1. What ROP Chat is

Vite + React PWA on Netlify, backed by **Supabase** (Postgres + Edge Functions). It has a secure,
audited **two-way gateway** already built for exactly this — external systems authenticate with a
revocable bearer token and get least-privilege, logged access. Command Center gets its own dedicated
agent identity (`ROP Command Center`), so everything it does is attributed to it and is revocable in
one click without touching anything else.

- **Project base URL:** `https://qrigzwactbwbpuufehxo.supabase.co`
- **Gateway endpoint (read + write):** `POST https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ai-gateway`
- **Simple one-way post endpoint (optional):** `POST https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ingest`
- **Timezone:** everything is US **Eastern (ET)**.

---

## 2. Credentials Command Center needs (Direction A)

Command Center authenticates to ROP Chat with **one bearer token**. Store it as a server-side secret
(env var) — never in browser code, never in a public repo.

```
ROP_CHAT_GATEWAY_URL = https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ai-gateway
ROP_CHAT_TOKEN       = rop_ai_********************************   ← provided separately (see setup note)
```

Every request:

```
POST {ROP_CHAT_GATEWAY_URL}
Authorization: Bearer {ROP_CHAT_TOKEN}
Content-Type: application/json

{ "action": "<action>", ...params }
```

**This token's scope (already provisioned):**
- Identity: `ROP Command Center` (agent), owner = Rob. Posts show a **🤖 AI · ROP Command Center** badge.
- Channels: **all public channels** (private / location / leadership channels are excluded by default — say the word to add specific ones to its allow-list).
- **Direct messages:** enabled (can DM any staff member by email).
- **Actions:** all 11 (read, post, reply, DM, tasks, approvals) — see §3.
- **No approval gate:** actions execute immediately (not queued for human sign-off).
- Rate limit: 120 requests/minute.
- Revoke/rotate anytime in ROP Chat → **Admin → AI Integrations** (or ask ROP Chat to do it).

> The literal token value is delivered in the setup message (and is visible/rotatable in Admin →
> AI Integrations). It is intentionally **not** committed to this file.

---

## 3. Gateway actions (the full API)

All actions are `POST` to the gateway with `{ "action": "…", ...params }`. Every response includes a
`correlation_id` (also written to ROP Chat's audit log). Write actions accept an optional
`idempotency_key` (UUID) — resending the same key returns the original result instead of double-posting.

### Reads

| Action | Params | Returns |
| --- | --- | --- |
| `list_channels` | — | `{ channels: [{id, slug, name, type, description}] }` |
| `read_channel_messages` | `channel` (slug/name/id), `limit?` (≤100), `before?` (ISO) | `{ channel, messages: [{id, author, is_ai, body, created_at, parent_message_id, reply_count}] }` |
| `read_thread` | `message_id` | `{ root, replies: [...] }` |
| `search_messages` | `query`, `channel?`, `limit?` (≤50) | `{ results: [...] }` |

### Writes

| Action | Params | Returns |
| --- | --- | --- |
| `post_message` | `channel`, `text` **or** `html`, `title?`, `author_name?`, `attachments?` | `{ message_id, channel_id }` |
| `reply_thread` | `message_id`, `text`, `attachments?` | `{ message_id, parent_message_id }` |
| `send_dm` | `to_email`, `text`, `author_name?`, `attachments?` | `{ message_id, conversation_id }` |
| `create_task` | `title`, `body?`, `channel?`, `assignee_email?`, `external_ref?` | `{ task_id, status }` |
| `update_task` | `task_id`, `status?` (`open`/`in_progress`/`done`/`cancelled`), `title?`, `body?` | `{ task_id, status }` |
| `request_approval` | `request_action`, `preview`, `payload?` | `{ approval_id, status }` |
| `list_approvals` | — | `{ approvals: [...] }` |

**`external_ref` is the key to two-way task sync:** when Command Center creates a ROP Chat task, put
the **Command Center task ID** in `external_ref`. That's the correlation key so both sides can match
records (see §5/§6).

**Attachments:** `post_message` / `reply_thread` / `send_dm` accept `attachments`: an array of
`{ url }` or `{ name, mime_type, base64 }` (base64 may be a `data:` URL). Up to 20 files, 25 MB each.

**Rich cards:** send `html` instead of `text` to render a formatted card (stats, tables) in the
channel — great for a "project status" board. Send the same content with a stable message and it
reads like a normal post.

### Examples

Post a project update to a channel:
```bash
curl -X POST "$ROP_CHAT_GATEWAY_URL" \
  -H "Authorization: Bearer $ROP_CHAT_TOKEN" -H "Content-Type: application/json" \
  -d '{ "action": "post_message", "channel": "announcements-rop",
        "text": "Command Center: the Bayfront remodel task is now IN PROGRESS.",
        "author_name": "Command Center" }'
```

DM a staff member a delegated task:
```bash
curl -X POST "$ROP_CHAT_GATEWAY_URL" \
  -H "Authorization: Bearer $ROP_CHAT_TOKEN" -H "Content-Type: application/json" \
  -d '{ "action": "send_dm", "to_email": "alexi@ropsalons.com",
        "text": "New from Command Center: please confirm the Village retail order by Friday." }'
```

Create a ROP Chat task linked back to a Command Center item:
```bash
curl -X POST "$ROP_CHAT_GATEWAY_URL" \
  -H "Authorization: Bearer $ROP_CHAT_TOKEN" -H "Content-Type: application/json" \
  -d '{ "action": "create_task", "title": "Order Village retail",
        "body": "Confirm SKUs with vendor", "assignee_email": "alexi@ropsalons.com",
        "external_ref": "CC-TASK-4821" }'
```

Read the latest messages in a channel (so Command Center can react to what staff are saying):
```bash
curl -X POST "$ROP_CHAT_GATEWAY_URL" \
  -H "Authorization: Bearer $ROP_CHAT_TOKEN" -H "Content-Type: application/json" \
  -d '{ "action": "read_channel_messages", "channel": "concierge", "limit": 20 }'
```

### Errors & limits
- `401` invalid/disabled token · `403` action or channel not permitted · `404` target not found
- `429` rate limit (rolling 60s) · `503` global AI kill-switch is on
- Body always JSON: `{ "ok": false, "error": "…", "correlation_id": "…" }` on failure.

---

## 4. Simpler one-way option (`ingest`)

For fire-and-forget "just drop this into a channel/DM" (no reads, no tasks), Command Center can use the
lighter `ingest` webhook with the **same token** as `x-api-key`:

```bash
curl -X POST "https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ingest" \
  -H "x-api-key: $ROP_CHAT_TOKEN" -H "Content-Type: application/json" \
  -d '{ "channel": "announcements-rop", "author_name": "Command Center",
        "text": "Nightly project rollup is ready." }'
```
Supports `channel` + `text`/`html`/`title`, `to_email` for a DM, `external_key` for an auto-updating
card, and `attachments`. Prefer the **gateway** (§3) for anything two-way — it's audited and scoped.

---

## 5. What ROP Chat needs FROM Command Center (Direction B — the return path)

For ROP Chat to push things **into** Command Center (so you don't have to poll), Command Center must
expose a **receive webhook**. Give ROP Chat these five things and it will start delivering events:

1. **Webhook URL** — where ROP Chat POSTs events, e.g.
   `https://<command-center-host>/api/rop-chat/webhook`
2. **A shared secret** — ROP Chat will send it as `Authorization: Bearer <secret>` (or, if you
   prefer, an HMAC-SHA256 of the body in `X-ROP-Signature` — tell us which and give us the secret).
3. **Which events you want** (subscribe to any subset):
   - `message.created` — a new message in a channel Command Center cares about
   - `message.mention` — someone @-mentions a person/keyword you're watching
   - `task.updated` — a ROP Chat task's status changed (ties back via `external_ref`)
   - `approval.requested` — a sensitive AI action is awaiting sign-off
   - `dm.received` — a staff member DMs the Command Center identity
4. **The payload shape you expect** — by default ROP Chat sends the envelope below. Tell us if you
   need it reshaped, otherwise we'll send this:
   ```json
   {
     "source": "rop-chat",
     "event": "task.updated",
     "id": "<event uuid>",
     "occurred_at": "2026-07-18T23:15:00-04:00",
     "data": {
       "task_id": "…", "external_ref": "CC-TASK-4821",
       "status": "done", "title": "Order Village retail",
       "channel": "concierge", "actor": "Alexi"
     }
   }
   ```
   ROP Chat expects a fast `2xx` ack; on non-2xx it retries with backoff.
5. **Timezone confirmation** — ROP Chat stamps everything in **Eastern**; confirm Command Center does
   too (or tell us your offset).

Once you send items 1–2 (and pick 3–5), the ROP Chat side is a ~small forwarder (a Postgres trigger
that POSTs via `pg_net`, the same mechanism ROP Chat already uses for phone-push) — quick to wire up.

### Optional: full task sync (ROP Chat reads Command Center back)
If you also want ROP Chat to **read or update** Command Center tasks (not just receive events),
provide a small read/write API on Command Center's side:
- **Base URL + bearer token** for Command Center's API.
- Endpoints: `list tasks`, `get task`, `create task`, `update task`.
- **Task schema:** `id`, `title`, `status`, `assignee` (email preferred), `due_at`, `links[]`, and an
  `external_ref` field where Command Center can store the **ROP Chat** task id — the mirror of §3's
  `external_ref`, so records line up both ways.

---

## 6. Correlation & idempotency (so nothing double-fires or drifts)

- **One shared key both ways:** ROP Chat task `external_ref` == Command Center task id, and Command
  Center task `external_ref` == ROP Chat `task_id`. Either side can look up the other by this key.
- **Idempotency:** Command Center should send an `idempotency_key` (UUID) on writes so a retried
  request never double-posts. ROP Chat includes a unique `id` on every outbound event so Command
  Center can dedupe.

---

## 7. Security

- Least-privilege, revocable token — not master keys. Rotate/disable in **Admin → AI Integrations**.
- Every gateway call is written to ROP Chat's **audit log** with a `correlation_id`.
- A global **kill-switch** (`DISABLE ALL AI ACCESS` in Admin) stops all agent traffic instantly
  without affecting staff messaging.
- Private / location / leadership channels are **off** for this token unless explicitly added.
- Keep `ROP_CHAT_TOKEN` and the Command Center webhook secret in server-side env vars only.

---

## 8. TL;DR — what to tell the Command Center machine

> You can talk to **ROP Chat** directly over HTTPS.
> - **Endpoint:** `https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ai-gateway`
> - **Auth:** header `Authorization: Bearer <ROP_CHAT_TOKEN>` (stored as a secret; provided separately).
> - **To do anything, POST** `{ "action": "...", ...params }`. Actions: `list_channels`,
>   `read_channel_messages`, `read_thread`, `search_messages`, `post_message`, `reply_thread`,
>   `send_dm`, `create_task`, `update_task`, `request_approval`, `list_approvals`.
> - **Link tasks both ways** by putting your task id in `external_ref` when you `create_task`.
> - **Idempotency:** include a UUID `idempotency_key` on writes.
> - **All times are US Eastern.**
>
> And **for ROP Chat to push events back to you**, expose a webhook and hand ROP Chat: (1) the
> webhook URL, (2) a shared bearer secret, (3) which events you want (`message.created`,
> `message.mention`, `task.updated`, `approval.requested`, `dm.received`), (4) your expected JSON
> shape (or accept ROP Chat's default envelope), (5) your timezone. If you want ROP Chat to read your
> tasks too, also provide your API base URL + token + task schema.
