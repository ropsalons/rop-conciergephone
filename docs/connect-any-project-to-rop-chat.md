# Connect Any Internal Project to ROP Chat — Standard Integration

**Audience:** any internal app / dashboard / AI agent owned by Rob DiLella that should talk to
**ROP Chat** directly (machine-to-machine over HTTPS — no email bridge).
**Authorized by** the owner of all systems involved. This is an internal, owner-authorized
integration across a small set of privately-owned projects.

This is the **reusable standard**. Every project uses the same endpoint and the same shared
"Internal Projects" token, and identifies itself per-message with `author_name`. Drop the prompt in
`§7` into any project and it's connected.

---

## ⭐ Standing rule — always report to `#ai-updates`

**Every connected project must post a short summary to the `ai-updates` channel whenever it finishes
a task, function, or request** — so the owner has one live feed in ROP Chat of everything all the
bots are doing. This is a standing order, in effect until explicitly told otherwise.

- **When:** at the end of each completed request/task (one summary per finished job — not per tiny
  internal step, so it doesn't spam).
- **How:** a `post_message` to channel `ai-updates`, with `author_name` set to the project's name.
- **What to include:** what was asked, what you did, and the result — one to three lines.

```bash
curl -X POST "$ROP_CHAT_GATEWAY_URL" \
  -H "Authorization: Bearer $ROP_CHAT_TOKEN" -H "Content-Type: application/json" \
  -d '{ "action":"post_message", "channel":"ai-updates",
        "author_name":"<Your Project Name>",
        "text":"✅ Finished: reordered 12 low-stock retail items. Trigger: nightly inventory job. All POs created." }'
```

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
| `send_dm` | `to_email`, `text`, `author_name?`, `attachments?` — DM one person |
| `send_group_dm` | `to_emails` (array or comma list), `text`, `title?`, `author_name?`, `attachments?` — DM a group |
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
  -d '{ "action":"post_message", "channel":"ai-updates",
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
- Channels: **all channels of any type** — public, announcements, every location, every department,
  and private channels — except any flagged sensitive (currently `Leadership` and `payables`).
- **DMs:** enabled — one person (`send_dm`) or a group (`send_group_dm`). **All 12 actions** enabled.
  **No approval gate.** Rate limit: 300/min (shared).
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

> You now have a direct, machine-to-machine connection to **ROP Chat**. Set it up, keep it running, and confirm it works.
>
> **1. Read the standard** (full API reference): `https://raw.githubusercontent.com/ropsalons/rop-conciergephone/claude/rop-connect-messaging-app-texv5n/docs/connect-any-project-to-rop-chat.md`
>
> **2. Store these as server-side secrets** (never in code or a repo):
> ```
> ROP_CHAT_GATEWAY_URL = https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ai-gateway
> ROP_CHAT_TOKEN       = <paste the ROP Chat token>
> ```
> Prefer **Supabase** for storage (a private config/secrets table your function reads, or Supabase
> function secrets) — Netlify env vars were unreliable at runtime on another project. Only use Netlify
> env vars if you confirm your functions actually see them.
>
> **3. Name yourself — don't ask the user.** Figure out your own project name from your context (your
> repo name, app/site name, or working folder), pick a short human-recognizable label, and send it as
> `author_name` on **every** post and DM so staff see who's speaking. Use the same name every time, and
> state the name you chose in your first `ai-updates` post (step 6).
>
> **4. ⭐ STANDING RULE — always report to `#ai-updates`.** Every time you finish a task, function, or
> request, post a short summary to the `ai-updates` channel in ROP Chat: a `post_message` with
> `channel: "ai-updates"`, `author_name` = your chosen name, and `text` covering what was asked,
> what you did, and the result (1–3 lines). Do this after every completed job, until explicitly told to
> stop. Example: `{ "action":"post_message", "channel":"ai-updates", "author_name":"<your chosen name>", "text":"✅ Finished: <what you did>. Trigger: <what was asked>. Result: <outcome>." }`
>
> **5. How to talk to ROP Chat.** POST `{ "action":"...", ...params }` to `ROP_CHAT_GATEWAY_URL` with
> header `Authorization: Bearer <ROP_CHAT_TOKEN>`. Actions: `list_channels`, `read_channel_messages`,
> `read_thread`, `search_messages`, `post_message`, `reply_thread`, `send_dm` (`to_email`),
> `send_group_dm` (`to_emails` array), `create_task`, `update_task`, `request_approval`,
> `list_approvals`. You can post to **any channel** and DM anyone or any group. Put your record id in
> `external_ref` on tasks; include a UUID `idempotency_key` on writes. All times US Eastern. Use
> `ai-updates` for status, `announcements` to reach everyone. (Don't use `announcements-rop` — dead/archived.)
>
> **6. Test now:** send `{ "action":"list_channels" }`, then `post_message` to `ai-updates`
> saying "`<YOUR PROJECT NAME>` is connected." Confirm you get `ok: true` and a `message_id`.
>
> **7. Set up the return path** so ROP Chat can push events back to you. Expose a webhook, generate a
> shared secret (store it server-side, Supabase-first), then reply with: (a) webhook URL, (b) the shared
> secret value, (c) events wanted (`message.mention`, `dm.received`, `approval.requested`, `task.updated`),
> (d) confirm you accept ROP Chat's default JSON envelope, (e) your timezone (America/New_York).
>
> **Report back:** confirm the test worked, confirm you'll summarize every finished job to `#ai-updates`, and give me items (a)–(e).
