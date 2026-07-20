# ROP Chat → ROP Command Center — turn a channel message into a task/project

**Goal (what Rob asked for):** In ROP Chat, Rob (or anyone) types a message in the **#command-center**
channel → that message shows up **inside ROP Command Center as a new task / project item**, and
Command Center replies back in the channel to confirm.

**Audience:** the ROP Command Center app (`rop-command-center.netlify.app`).
**Authorized by** Rob DiLella, owner of both systems. Machine-to-machine over HTTPS — no email.

There are two halves, and **ROP Chat's half is already done**. You only need to build the receive
endpoint described in §3 and the reply in §4.

```
  You type in #command-center  ──►  ROP Chat forwards it (webhook POST)  ──►  Command Center
        (ROP Chat)                    already set up ✅                       creates a TASK  ◄─ build this
                                                                                    │
   confirmation shows in  ◄──  Command Center replies via gateway API  ◄────────────┘
      #command-center            (post_message)  §4
```

---

## 1. What's ALREADY set up on the ROP Chat side ✅ (nothing for you to do here)

| Thing | Value |
| --- | --- |
| Your command channel | **#command-center** (private, in the "AI Command Consoles" group) |
| Channel id | `e884c7cf-0de6-4c74-8d0c-14a816926d0c` |
| Forwarder | **Active.** Every *human* message in that channel is POSTed to your webhook in real time. |
| Where ROP Chat sends it | `POST https://rop-command-center.netlify.app/api/rop-chat-webhook` |
| Auth ROP Chat sends | `Authorization: Bearer <the shared secret you registered with>` |
| Events | `message.created` |
| Loop-safety | ROP Chat never forwards its own bot's posts, so replies won't retrigger you. |

> If you ever change the webhook URL or rotate the secret, just call `register_webhook` again with the
> same `project_name: "Command Center"` (see §6) — no human hand-off needed.

**So the message is already being delivered to `…/api/rop-chat-webhook`.** Today that endpoint probably
doesn't exist yet (nothing has been received). Build it as below and the loop closes.

---

## 2. The exact payload ROP Chat sends you

Every time someone posts in **#command-center**, ROP Chat POSTs this JSON to your webhook:

```json
{
  "source": "rop-chat",
  "event": "message.created",
  "id": "b1c2d3e4-....",                      // unique per event — use to dedupe
  "occurred_at": "2026-07-20T19:45:00Z",       // UTC
  "data": {
    "channel_id": "e884c7cf-0de6-4c74-8d0c-14a816926d0c",
    "message_id": "a9f8...",                   // the ROP Chat message — good external_ref
    "text": "Project: remodel Bayfront break room. Get 3 contractor quotes by Aug 1.",
    "author_id": "6cd61125-...",
    "author": "Rob"
  }
}
```

- The header will be `Authorization: Bearer <secret>` — **verify it** before trusting the body.
- `data.text` is the instruction — **this is the thing you turn into a task/project.**
- Reply fast with **HTTP 2xx** (do the heavy work after acking, or inline if quick).

---

## 3. Build the receive endpoint (Direction B) — the one missing piece

Create the route **`/api/rop-chat-webhook`** on Command Center. Since Command Center is on Netlify,
this is a Netlify Function (or your framework's API route). Pseudocode → real handler:

1. **Verify the secret.** Reject if `Authorization` != `Bearer $ROP_CHAT_WEBHOOK_SECRET`.
2. **Dedupe.** If you've already processed `body.id`, return 200 and stop.
3. **Only act on humans.** ROP Chat already strips its own bot, but if `data.author_id` is your own
   Command Center identity, ignore it (belt-and-suspenders against loops).
4. **Create the task/project** from `data.text` (see §5 for parsing "project" vs "task").
   Store `data.message_id` as the task's `external_ref` so ROP Chat and Command Center line up.
5. **Return 2xx immediately.** Then post a confirmation back (§4).

### Example — Netlify Function (`netlify/functions/rop-chat-webhook.js`)

```js
export default async (req) => {
  // 1. verify shared secret
  const auth = req.headers.get('authorization') || ''
  if (auth !== `Bearer ${process.env.ROP_CHAT_WEBHOOK_SECRET}`) {
    return new Response('unauthorized', { status: 401 })
  }

  const evt = await req.json()
  if (evt?.event !== 'message.created') return new Response('ignored', { status: 200 })

  const { id, data } = evt
  // 2. dedupe on event id (store seen ids in your DB / KV)
  if (await alreadyProcessed(id)) return new Response('dup', { status: 200 })

  const text = (data?.text || '').trim()
  if (!text) return new Response('empty', { status: 200 })

  // 4. create the Command Center task/project
  const task = await createCommandCenterTask({
    title: text.split('\n')[0].slice(0, 120),   // first line = title
    body: text,                                  // full instruction
    source: 'ROP Chat #command-center',
    requested_by: data.author,                   // "Rob"
    external_ref: data.message_id,               // ties back to ROP Chat
    status: 'open',
  })
  await markProcessed(id)

  // 5. ack fast; reply happens next (can be awaited or fire-and-forget)
  await replyToRopChat(data.channel_id, task)
  return new Response(JSON.stringify({ ok: true, task_id: task.id }), { status: 200 })
}
```

Store the secret as a server-side env var (`ROP_CHAT_WEBHOOK_SECRET`) — **never** in client code or a
public repo. Prefer Supabase or Netlify function secrets; if you use Netlify env vars, confirm the
function actually reads them at runtime (they've been flaky on other projects).

---

## 4. Reply back into ROP Chat (Direction A) — so Rob sees confirmation

After you create the task, post a confirmation **into the same channel** using ROP Chat's gateway.
Store these as server-side secrets (Command Center already has the token):

```
ROP_CHAT_GATEWAY_URL = https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ai-gateway
ROP_CHAT_TOKEN       = <your ROP Chat gateway token>   // already provisioned for Command Center
```

```js
async function replyToRopChat(channelId, task) {
  const say = (text) => fetch(process.env.ROP_CHAT_GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.ROP_CHAT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'post_message',
      channel: channelId,               // reply in #command-center
      author_name: 'Command Center',    // shows a 🤖 AI · Command Center badge
      text,
    }),
  })

  // 1) confirm in the command channel
  await say(`✅ Got it — created task “${task.title}” (#${task.id}). Status: open.`)

  // 2) STANDING RULE: also post a one-line summary to #ai-updates
  await fetch(process.env.ROP_CHAT_GATEWAY_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.ROP_CHAT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'post_message', channel: 'ai-updates', author_name: 'Command Center',
      text: `📥 New task from ROP Chat #command-center: “${task.title}” (#${task.id}).`,
    }),
  })
}
```

Optional but recommended — **mirror the task back into ROP Chat's own task list** so it's tracked on
both sides, linked by `external_ref`:

```js
await fetch(process.env.ROP_CHAT_GATEWAY_URL, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${process.env.ROP_CHAT_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'create_task',
    title: task.title,
    body: task.body,
    channel: 'command-center',
    external_ref: String(task.id),           // Command Center id ↔ ROP Chat task
  }),
})
```

When the Command Center task later changes status, call `update_task` (with the ROP Chat `task_id`
you got back) or just `post_message` a status line to #command-center.

---

## 5. Turn the message into the RIGHT thing (task vs project vs assignment)

Simple, robust parsing rules for `data.text` (tune to taste):

| If the message… | Do this |
| --- | --- |
| starts with **`project:`** | create a **project** in Command Center; title = text after `project:` |
| starts with **`task:`** or is a plain instruction | create a **task** (default) |
| contains **`assign @Name`** / **`for @Name`** | set the assignee; resolve the name via ROP Chat `list_users` (match by name → get their id/email) |
| contains a date (**"by Aug 1", "Friday"**) | parse as the due date — **times are US Eastern (ET)** |
| starts with **`?`** or "status" | treat as a **query**, not a task — reply with status instead of creating anything |

To resolve a name to a real person, call the gateway:
`{ "action": "list_users", "query": "alexi" }` → use the returned `id` / `email`. Don't rely on an
external system's email; match on the ROP Chat directory.

If a message is ambiguous or risky (money, deletions, anything irreversible), **reply asking Rob to
confirm** rather than guessing — post a question back to #command-center and wait for his next message.

---

## 6. If you need to (re)register or change the webhook

You never have to email a URL to anyone. Call the gateway once:

```bash
curl -X POST "$ROP_CHAT_GATEWAY_URL" \
  -H "Authorization: Bearer $ROP_CHAT_TOKEN" -H "Content-Type: application/json" \
  -d '{ "action":"register_webhook",
        "project_name":"Command Center",
        "url":"https://rop-command-center.netlify.app/api/rop-chat-webhook",
        "secret":"<the shared secret your endpoint checks>",
        "events":["message.created"] }'
```

Same `project_name` updates the existing registration in place (URL, secret, events). The response
returns your `command_channel` slug (`command-center`).

---

## 7. Idempotency, loop-safety, security (read once)

- **Dedupe on `evt.id`** — ROP Chat may retry on a non-2xx. Never create two tasks for one event.
- **Idempotency on writes to ROP Chat:** include a UUID `idempotency_key` on `post_message`/`create_task`
  so a retry doesn't double-post.
- **No loops:** ROP Chat does not forward its own bot's messages; additionally ignore any event whose
  `author_id` is Command Center's own identity.
- **Secrets server-side only.** Verify the inbound `Authorization` header on every webhook call. Keep
  `ROP_CHAT_TOKEN` and `ROP_CHAT_WEBHOOK_SECRET` out of client code and public repos.
- Everything is **audited** in ROP Chat with a `correlation_id`; the token is revocable/rotatable in
  ROP Chat → **Admin → AI Integrations**, and a global kill-switch can stop all agents instantly.

---

## 8. Drop-in prompt (paste into ROP Command Center)

> You are **ROP Command Center**. You have a two-way connection to **ROP Chat**. Rob wants: when he
> types in ROP Chat's **#command-center** channel, it becomes a **task/project in you**, and you
> confirm back in that channel.
>
> **Read the full spec:**
> `https://raw.githubusercontent.com/ropsalons/rop-conciergephone/claude/rop-connect-messaging-app-texv5n/docs/command-center-message-to-task.md`
>
> **1. Build the receive endpoint** at `POST /api/rop-chat-webhook` (ROP Chat already forwards messages
> there). Verify header `Authorization: Bearer $ROP_CHAT_WEBHOOK_SECRET`, dedupe on the event `id`, then
> turn `data.text` into a new task (or project — see the "project:" rule). Store `data.message_id` as the
> task's `external_ref`. Return HTTP 200 fast.
>
> **2. Reply via the gateway.** POST to `https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ai-gateway`
> with header `Authorization: Bearer $ROP_CHAT_TOKEN`:
> `{ "action":"post_message", "channel": <data.channel_id>, "author_name":"Command Center", "text":"✅ Created task …" }`.
> Also `post_message` a one-line summary to channel `ai-updates` (standing rule). Optionally mirror the
> task with `create_task` (`external_ref` = your task id) so it's tracked both ways.
>
> **3. Secrets** as server-side env vars only: `ROP_CHAT_WEBHOOK_SECRET` (the one your endpoint checks)
> and `ROP_CHAT_TOKEN` (already provisioned for Command Center). All times are US **Eastern**.
>
> **4. Test:** have Rob type "task: test from ROP Chat" in #command-center; confirm a task is created and
> you replied in the channel. Report back that it works.
