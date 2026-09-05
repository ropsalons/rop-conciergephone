# Chief — ROP Chat ⇆ Grok Bot bridge

**Chief** is a real ROP Chat user (its own profile, `@Chief`) that bridges to Grok Bot, Robert's
chief-of-staff brain. ROP Chat pushes an event webhook the instant a message targets Chief; Grok Bot
replies back through the ROP Chat gateway **as Chief**.

## What wakes Chief (event-driven — never polled)

An `AFTER INSERT` trigger on `messages` (`dispatch_to_chief`) fires a webhook immediately when:

| Event          | Fires when                                                                              |
|----------------|------------------------------------------------------------------------------------------|
| `mention`      | `@Chief` / `@chief` in a channel Chief can see (public, or a private channel it's in)     |
| `dm`           | any message in a 1:1 DM with Chief                                                        |
| `group_dm`     | any message in a group DM that includes Chief                                             |
| `thread_reply` | a reply on a message Chief posted or was `@mentioned` in                                  |

Chief's own posts never fire (loop-safe). Plain channel chatter with no `@Chief` never fires.
Owners can silence Chief in a channel via `chief_channel_mutes`.

## Outbound webhook (ROP Chat → Grok Bot)

`POST` to the configured URL, headers:

- `Content-Type: application/json`
- `Authorization: Bearer <shared secret>` (the sender key — this is what Cursor/Grok validates)
- `X-ROP-Webhook-Secret: <shared secret>` (same value, for receivers that prefer a custom header)
- `X-ROP-Event: mention | dm | group_dm | thread_reply`
- `X-ROP-Bot: Chief`

Body:

```json
{
  "event": "mention",
  "occurred_at": "2026-09-05T14:03:11Z",
  "message_id": "…",
  "thread_id": "… or null",
  "conversation_id": "… or null",
  "channel": { "id": "…", "slug": "…", "name": "…" },
  "is_dm": false,
  "sender": { "id": "…", "display_name": "…", "email": "…" },
  "text": "full message body",
  "mentioned_chief": true,
  "permalink": "https://chat.ropsalons.com/#/channel/<id>?m=<message_id>"
}
```

Delivery is **idempotent** per `message_id` (`chief_deliveries` PK) and **retried with backoff**
(`chief_retry_deliveries()`, run every minute by pg_cron `chief-retry-deliveries`, up to 6 attempts).

### Configure the webhook

Chief only fires once a webhook is stored (no backlog builds up before then). Set it with:

```sql
insert into public.chief_webhooks (url, secret, is_active)
values ('<grok routine webhook url>', '<shared secret from the routine panel>', true);
```

To rotate, insert a new active row (the most recently updated active row wins) or update the existing
one. `is_active = false` disables Chief globally.

## Reply back (Grok Bot → ROP Chat, as Chief)

Grok authenticates to the gateway with the **Chief agent token** and posts into the same
conversation/thread the webhook came from. Because the Chief agent has `post_as_user_id = Chief`, its
messages render as **Chief**, not "Grok".

`POST https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ai-gateway`
`Authorization: Bearer <CHIEF_TOKEN>`

- Reply in a channel thread: `{ "action": "reply_thread", "message_id": "<message_id>", "text": "…" }`
- Reply in a DM/group DM: `{ "action": "reply_thread", "message_id": "<message_id>", "text": "…" }`
  (or `send_dm` with `to_user_id` = the sender id to continue the 1:1)
- Post to a channel: `{ "action": "post_message", "channel": "<slug|id>", "text": "…" }`

Multi-turn keeps working automatically: when a human replies again in that thread, the trigger
webhooks again, so the conversation continues.
