# Connect Any Internal Project to ROP Chat — Standard Integration

**Audience:** any internal app / dashboard / AI agent owned by Rob DiLella that should talk to
**ROP Chat** directly (machine-to-machine over HTTPS — no email bridge).
**Authorized by** the owner of all systems involved. This is an internal, owner-authorized
integration across a small set of privately-owned projects.

This is the **reusable standard**. Every project uses the same endpoint and the same shared
"Internal Projects" token, and identifies itself per-message with `author_name`. Drop the prompt in
`§7` into any project and it's connected.

---

## 1. The connection

- **Gateway (read + write):** `POST https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ai-gateway`
- **Auth header:** `Authorization: Bearer <ROP_CHAT_TOKEN>`
- **Body:** `{ "action": "<action>", ...params }`
- **Simple one-way post (optional):** `POST …/functions/v1/ingest` with `x-api-key: <ROP_CHAT_TOKEN>`
- **Timezone:** US **Eastern (ET)** everywhere.

Every project should send `"author_name": "<Your Project Name>"` on posts/DMs so ROP Chat shows a
**🤖 AI · <Your Project Name>** badge and staff can tell which project spoke.

---

## 2. Actions (the full API)

`POST` the gateway with `{ "action": "…", ...params }`. Responses include a `correlation_id`
(also in ROP Chat's audit log). Write actions accept an optional `idempotency_key` (UUID) — resending
the same key returns the original result instead of double-posting.

**Reads**

| Action | Params |
| --- | --- |
| `list_channels` | — |
| `read_channel_messages` | `channel` (slug/name/id), `limit?` (≤100), `before?` (ISO) |
| `read_thread` | `message_id` |
| `search_messages` | `query`, `channel?`, `limit?` (≤50) |

**Writes**

| Action | Params |
| --- | --- |
| `post_message` | `channel`, `text` **or** `html`, `title?`, `author_name?`, `attachments?` |
| `reply_thread` | `message_id`, `text`, `attachments?` |
| `send_dm` | `to_email`, `text`, `author_name?`, `attachments?` |
| `create_task` | `title`, `body?`, `channel?`, `assignee_email?`, `external_ref?` |
| `update_task` | `task_id`, `status?` (`open`/`in_progress`/`done`/`cancelled`), `title?`, `body?` |
| `request_approval` | `request_action`, `preview`, `payload?` |
| `list_approvals` | — |

**`external_ref`** = the correlation key. When a project creates a ROP Chat task from one of its own
records, put its **own record id** in `external_ref` so both sides can match.

**Attachments:** `post_message`/`reply_thread`/`send_dm` accept `attachments`: `[{ url }]` or
`[{ name, mime_type, base64 }]` (base64 may be a `data:` URL). Up to 20 files, 25 MB each.
**Rich cards:** send `html` instead of `text` for a formatted card (stats/tables).

**Errors:** `401` bad/disabled token · `403` action or channel not allowed · `404` not found ·
`429` rate limit · `503` global AI kill-switch on. Failures return `{ ok:false, error, correlation_id }`.

### Examples

```bash
# Post an update to a channel (identify your project via author_name)
curl -X POST "$ROP_CHAT_GATEWAY_URL" \
  -H "Authorization: Bearer $ROP_CHAT_TOKEN" -H "Content-Type: application/json" \
  -d '{ "action":"post_message", "channel":"announcements-rop",
        "text":"Inventory sync finished — 12 items reordered.",
        "author_name":"Inventory Bot" }'

# DM a staff member by email
curl -X POST "$ROP_CHAT_GATEWAY_URL" \
  -H "Authorization: Bearer $ROP_CHAT_TOKEN" -H "Content-Type: application/json" \
  -d '{ "action":"send_dm", "to_email":"alexi@ropsalons.com",
        "text":"Heads up: 3 POs need approval.", "author_name":"Inventory Bot" }'

# Create a ROP Chat task linked to your own record
curl -X POST "$ROP_CHAT_GATEWAY_URL" \
  -H "Authorization: Bearer $ROP_CHAT_TOKEN" -H "Content-Type: application/json" \
  -d '{ "action":"create_task", "title":"Reorder color line",
        "assignee_email":"alexi@ropsalons.com", "external_ref":"INV-9931" }'
```

---

## 3. Scope of the shared token

- Identity: `ROP Internal Projects` (agent), owner = Rob. Revocable/rotatable in ROP Chat →
  **Admin → AI Integrations**.
- Channels: **all public channels** (private/location/leadership excluded unless specifically added).
- **DMs:** enabled. **All 11 actions** enabled. **No approval gate.** Rate limit: 300/min (shared).
- Want a project *isolated* (its own key, its own revoke, its own audit line)? Ask ROP Chat to mint a
  dedicated token for it — same setup, separate identity.

---

## 4. Return path — let ROP Chat push events back to a project (optional)

If a project wants ROP Chat to **notify it** (instead of polling), it exposes a webhook and hands ROP
Chat five things:

1. **Webhook URL** (e.g. `https://<project-host>/api/rop-chat/webhook`)
2. **A shared secret** (bearer token or HMAC-SHA256 — the project's choice)
3. **Events wanted:** `message.created`, `message.mention`, `task.updated`, `approval.requested`, `dm.received`
4. **Expected JSON shape** — or accept ROP Chat's default envelope:
   ```json
   { "source":"rop-chat", "event":"task.updated", "id":"<uuid>",
     "occurred_at":"2026-07-18T23:15:00-04:00",
     "data":{ "task_id":"…", "external_ref":"INV-9931", "status":"done" } }
   ```
5. **Timezone** (ROP Chat is Eastern).

ROP Chat then wires a small forwarder (Postgres trigger → `pg_net` POST). Return a fast `2xx`; ROP
Chat retries with backoff and puts a unique `id` on each event for dedupe.

---

## 5. Correlation & idempotency

- Shared key both ways: ROP Chat task `external_ref` == the project's record id, and (if the project
  stores it) the project's `external_ref` == ROP Chat's `task_id`.
- Send an `idempotency_key` (UUID) on writes so retries never double-post.

---

## 6. Security (short version)

- Least-privilege, revocable token — not master keys. Rotate/disable in Admin → AI Integrations.
- Every call is audited with a `correlation_id`. A global **kill-switch** stops all agents instantly.
- Keep the token (and any return-path secret) in **server-side** env vars only.

---

## 7. Drop-in prompt (paste into any project)

> You now have a direct, machine-to-machine connection to **ROP Chat**. Set it up and confirm it works.
>
> **1. Read the standard:** `https://raw.githubusercontent.com/ropsalons/rop-conciergephone/claude/rop-connect-messaging-app-texv5n/docs/connect-any-project-to-rop-chat.md`
>
> **2. Store as server-side secrets:**
> ```
> ROP_CHAT_GATEWAY_URL = https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ai-gateway
> ROP_CHAT_TOKEN       = <paste the ROP Chat token>
> ```
>
> **3. Your project's name in ROP Chat is:** `<YOUR PROJECT NAME>` — send it as `author_name` on every
> post/DM so staff see who's speaking.
>
> **4. To do anything, POST** `{ "action":"...", ...params }` to `ROP_CHAT_GATEWAY_URL` with header
> `Authorization: Bearer <ROP_CHAT_TOKEN>`. Actions: `list_channels`, `read_channel_messages`,
> `read_thread`, `search_messages`, `post_message`, `reply_thread`, `send_dm`, `create_task`,
> `update_task`, `request_approval`, `list_approvals`. When you create a ROP Chat task from one of your
> records, put your record id in `external_ref`. Include a UUID `idempotency_key` on writes. All times
> are US Eastern.
>
> **5. Test now:** send `{ "action":"list_channels" }`, then `post_message` to `announcements-rop`
> saying "`<YOUR PROJECT NAME>` is connected." Confirm you get `ok: true` and a `message_id`.
>
> **6. Optional return path** — if you want ROP Chat to push events to you, expose a webhook and reply
> with: (a) webhook URL, (b) a shared secret, (c) events wanted, (d) your expected JSON shape (or accept
> the default), (e) your timezone. See §4 of the standard.
>
> **Report back:** confirm the test worked, and (if you want the return path) items a–e.
