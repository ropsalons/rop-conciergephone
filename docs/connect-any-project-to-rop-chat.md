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
| `list_users` | `query?` (name/email filter), `include_inactive?`, `limit?` — the staff directory: `id`, `display_name`, `full_name`, `email`, `phone`, `role`, `access_level`, `location`, `department`. **Match people by NAME here and use their ROP Chat `id` to route** — don't depend on an external system's email. |
| `read_channel_messages` | `channel` (slug/name/id), `limit?` (≤100), `before?` (ISO) |
| `read_thread` | `message_id` |
| `search_messages` | `query`, `channel?`, `limit?` (≤50) |

**Writes**

| Action | Params |
| --- | --- |
| `post_message` | `channel`, `text` **or** `html`, `title?`, `author_name?`, `attachments?` |
| `reply_thread` | `message_id`, `text`, `attachments?` |
| `send_dm` | `to_user_id` **or** `to_email`, `text`, `author_name?`, `attachments?` — DM one person (prefer `to_user_id` from `list_users`) |
| `send_group_dm` | `to_user_ids` **or** `to_emails`, `text`, `title?`, `author_name?`, `attachments?` — DM a group |
| `create_task` | `title`, `body?`, `channel?`, `assignee_email?`, `external_ref?` |
| `update_task` | `task_id`, `status?` (`open`/`in_progress`/`done`/`cancelled`), `title?`, `body?` |
| `register_webhook` | `project_name`, `url`, `secret?`, `events?` — self-register your return-path webhook (see §4) |
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

## 4. Return path — SELF-REGISTER your webhook (no human copy-paste)

To have ROP Chat push events to you, **register your webhook yourself** through the gateway — the
`register_webhook` action. No one has to hand a URL/secret back and forth.

1. Stand up your webhook endpoint and generate a shared secret (store it server-side; ROP Chat sends
   it back as `Authorization: Bearer <secret>` on every event).
2. Call the gateway **once**:
   ```bash
   curl -X POST "$ROP_CHAT_GATEWAY_URL" \
     -H "Authorization: Bearer $ROP_CHAT_TOKEN" -H "Content-Type: application/json" \
     -d '{ "action":"register_webhook",
           "project_name":"<Your Project Name>",
           "url":"https://<your-host>/api/rop-chat/webhook",
           "secret":"<the shared secret you generated>",
           "events":["message.created"] }'
   ```
   The response returns your **`command_channel`** slug — ROP Chat auto-creates a private, leader-level
   command channel for you (in the "AI Command Consoles" sidebar group) and routes it to your webhook.
3. Your webhook receives ROP Chat's default envelope; reply with a fast `2xx`:
   ```json
   { "source":"rop-chat", "event":"message.created", "id":"<uuid>",
     "occurred_at":"2026-07-19T00:15:00Z",
     "data":{ "channel_id":"…", "message_id":"…", "text":"…", "author":"Rob", "author_id":"…" } }
   ```

That's it — no reply-with-your-URL step. To change or disable it later, call `register_webhook` again
(same `project_name`) or ask an admin. Each `id` is unique for dedupe.

---

## 4b. Command channel — take instructions from ROP Chat

Each project gets a dedicated **command channel** in ROP Chat (e.g. `#command-center`). Anything a
team member types there is delivered to your webhook as a `message.created` event — **treat that text
as a direct instruction/command to you.**

- **Do what it asks** (using your own capabilities + the gateway actions).
- **Reply in that same channel** — `post_message` to the `channel` from the event payload,
  `author_name` = your project name — with the result.
- **Also post your one-line summary to `#ai-updates`** when done (the standing rule in §0).
- **Only act on human messages.** Ignore any event whose author is you or another bot, so you never
  loop. If a command is unclear or risky, reply asking for confirmation instead of guessing. If a task
  will take a while, acknowledge quickly (“On it…”) and follow up with the result.

ROP Chat only routes **your** command channel's messages to you, so you don't need to know the channel
name in advance — just handle incoming `message.created` events and reply to the channel they name.

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
> **7. Set up the return path yourself — no copy-paste.** Stand up a webhook endpoint, generate a
> shared secret (store it server-side, Supabase-first), then **call the gateway** to register it:
> `{ "action":"register_webhook", "project_name":"<your chosen name>", "url":"https://<your-host>/api/rop-chat/webhook", "secret":"<your secret>", "events":["message.created"] }`.
> The response returns your **`command_channel`** — ROP Chat auto-creates a private command channel for
> you and routes its messages to your webhook. When a `message.created` event arrives, treat the text as
> a command (see §4b), do it, and reply in that channel.
>
> **Report back:** the name you chose, that the test worked, that you'll summarize every finished job to
> `#ai-updates`, and your `command_channel` slug from `register_webhook`.
