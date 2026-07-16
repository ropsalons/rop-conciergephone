# ROP Chat — AI Integration

A secure, auditable, **two-way** connection that lets approved AI systems (Claude Code, Claude
Cowork, an ops agent, an email automation, …) read and write ROP Chat under least-privilege
permissions. This document is the reference for how it works, how to operate it, and how to roll back.

## 1. Architecture

ROP Chat is a Vite + React + TypeScript PWA on Netlify, backed by Supabase (Postgres + RLS + Edge
Functions). Messages, channels, DMs, threads, files, notifications and audit logs live in Postgres.
Existing integration surface reused: the `ingest` function (one-way API posting) and `inbound-email`
(email → channel/DM), both authenticated against `integration_tokens` (sha-256 hashed keys).

The AI integration adds **one authenticated gateway** plus an agent/permission/audit model:

```
Claude Code / Cowork / API client
        │  (MCP tools  ·  or direct HTTPS)
        ▼
  ai-gateway  (Supabase Edge Function, service role)
        │  authenticate agent → kill-switch → rate-limit → permission check → idempotency → audit
        ▼
  Postgres: messages / channels / direct_conversations / ai_* tables
```

The gateway uses the service role but **enforces each agent's scope in code** — content an agent is
not allowed to see is never returned; disallowed actions are rejected.

## 2. AI agent identity model

Every AI system is a row in `ai_agents` with its own hashed bearer token and explicit scope:

| Field | Meaning |
| --- | --- |
| `name`, `slug`, `provider`, `agent_type` | Identity shown in the UI + audit log |
| `owner_id` | The human who owns/authorized the agent |
| `is_active` | Per-agent on/off |
| `token_prefix`, `token_hash` | `rop_ai_…`; only the sha-256 hash is stored |
| `channel_scope` | `all_public` (all public non-protected channels) or `listed` (an explicit allow-list) |
| `allow_dms` | Whether it can send direct messages |
| `allowed_actions[]` | Which gateway actions it may call |
| `require_approval_for[]` | Actions that must be human-approved before executing |
| `rate_per_min` | Per-agent rate limit |
| `last_used_at` | Last successful call |

`ai_agent_channels` holds the per-channel allow-list (used when `channel_scope='listed'`).
Channels flagged `channels.ai_excluded = true` are **never** available to `all_public` agents
(payables, leadership, education-leadership are excluded by default).

AI messages are authored by the inactive **Integrations** account and carry `metadata.ai_agent`
`{slug,name,provider}` — the UI renders a **🤖 AI** badge with the agent name, so AI activity is
never mistaken for a hand-typed employee message.

## 3. Permission & approval model

- **Server-side enforcement only** — the frontend never gates AI access.
- **Least privilege** — a new agent gets read + post to public channels; DMs and sensitive channels
  are off unless explicitly granted.
- **Sensitive actions** can be queued to `ai_action_approvals` (pending → approved/rejected/executed).
  Add an action to an agent's `require_approval_for` to force human sign-off; admins approve in
  **Admin → AI Integrations → Pending approvals**, which executes the action via the service role.
- **Kill-switch** — `ai_settings.ai_enabled = false` blocks every agent instantly (employee messaging
  is unaffected). The big red **DISABLE ALL AI ACCESS** button flips it.

## 4. Gateway API

`POST https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ai-gateway`
Headers: `Authorization: Bearer rop_ai_…`, `Content-Type: application/json`
Body: `{ "action": "<action>", ...params, "idempotency_key"?: "<uuid>" }`

| Action | Params | Notes |
| --- | --- | --- |
| `list_channels` | — | Channels the agent may see |
| `read_channel_messages` | `channel`, `limit?`, `before?` | Recent messages (permission-filtered) |
| `read_thread` | `message_id` | Root + replies |
| `search_messages` | `query`, `channel?`, `limit?` | Searches only allowed channels |
| `post_message` | `channel`, `text` \| `html`, `title?`, `attachments?` | Posts as the agent identity |
| `reply_thread` | `message_id`, `text`, `attachments?` | Reply in a thread |
| `send_dm` | `to_email`, `text`, `attachments?` | Requires `allow_dms` |
| `create_task` | `title`, `body?`, `channel?`, `assignee_email?` | Structured action item |
| `update_task` | `task_id`, `status?`, `title?`, `body?` | `open`/`in_progress`/`done`/`cancelled` |
| `request_approval` | `request_action`, `preview`, `payload?` | Queue a sensitive action |
| `list_approvals` | — | This agent's pending approvals |

Every response includes a `correlation_id` that also appears in the audit log. Write actions accept
an `idempotency_key` (or `X-Idempotency-Key` header) — a repeated key returns the original result.
Rate limit → HTTP 429. Kill-switch on → HTTP 503. Denied permission → HTTP 403.

**Attachments.** `post_message`, `reply_thread` and `send_dm` accept an `attachments` array — each
item is `{ url }` or `{ name, mime_type, base64 }` (base64 may be a `data:` URL). Files are stored
in the private `attachments` bucket and rendered in ROP Chat exactly like a staff upload (images
inline, others as a download chip). Up to 20 files, 25 MB each; the response reports
`attachments: { saved, skipped }`. You can attach with no text (it's labeled "📎 Attachment").
The one-way `ingest` webhook takes the same `attachments` field; inbound **email** and **SMS/MMS**
also carry attachments in automatically.

## 5. MCP (Claude Code / Cowork)

`mcp-server/` is a Node stdio MCP server that exposes the gateway as scoped tools
(`list_channels`, `read_channel_messages`, `search_messages`, `read_thread`, `post_channel_message`,
`reply_to_thread`, `send_direct_message`, `create_task`, `update_task`, `list_pending_approvals`,
`request_sensitive_action`). It holds no DB credentials and runs no SQL. See `mcp-server/README.md`
for the exact Claude Code / Claude Desktop / Cowork config. It needs two env vars: `ROP_AI_TOKEN`
and `ROP_GATEWAY_URL`.

## 6. Anthropic Messages API path

Any server-side automation can also call the gateway directly over HTTPS with a `rop_ai_…` token —
e.g. a Claude tool-use loop where the tool definitions map 1:1 to the gateway actions. No MCP
required. Keep the token in a server-side secret (Netlify env / Supabase secret), never in browser code.

## 7. Email → ROP Chat (preserved)

The existing `inbound-email` route (`channel-<name>@chat.rop2020.com`, `dm-<name>@chat.rop2020.com`)
is unchanged and still works. For AI-authored inbound, route through an approved `email` provider
agent and the gateway so it lands with an AI identity + audit trail.

## 8. Environment variables

Gateway (`ai-gateway`) uses only Supabase's auto-injected `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` — no new secrets. MCP server uses `ROP_AI_TOKEN` + `ROP_GATEWAY_URL`
(configured on the client machine, not committed).

## 9. Deploy & rollback

- **Edge function:** deployed via Supabase (`ai-gateway`). Rollback = redeploy the previous version
  or disable via the kill-switch.
- **Frontend:** ships through the normal Netlify CI on push to the working branch.
- **Database:** migrations `0021_ai_integration`, `0022_ai_admin_rpcs`. Rollback = drop the `ai_*`
  tables + functions and the `channels.ai_excluded` column (they are additive; existing behavior is
  untouched). The nightly `dashboard_backups` job captures a 14-day rolling backup.
- **Instant off:** Admin → AI Integrations → **DISABLE ALL AI ACCESS**, or
  `select ai_set_kill_switch(false);` / `update ai_settings set ai_enabled=false;`.

## 10. Credential management

Tokens are generated server-side, shown **once**, stored only as a sha-256 hash. Rotate or disable
any agent in the admin panel (`ai_rotate_token`, `ai_set_agent_active`). Never commit a token.

## 11. Troubleshooting

- **401 invalid token** — token wrong/rotated/agent disabled.
- **403 denied** — action not in `allowed_actions`, or channel not permitted / protected.
- **503** — global kill-switch is off; re-enable in Admin.
- **429** — rate limit; lower call rate or raise `rate_per_min`.
- Every request is in `ai_audit_logs` (filter by `correlation_id`).

## 12. Known limitations

- Realtime push of ROP Chat events to external AI (webhooks/subscriptions) is not yet built — agents
  currently **pull** (read/search) rather than being pushed to. A `agent_subscriptions` + outbound
  webhook layer is the documented next step.
- Approval auto-execution currently covers `post_message` / `reply_thread`; other sensitive actions
  are queued for manual handling.
- Semantic/vector search is not used; search is permission-filtered keyword search.
