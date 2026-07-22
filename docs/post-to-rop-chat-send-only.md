# Post to ROP Chat — Send-Only (the simple one)

**Use this when your thing only needs to SEND messages into ROP Chat** — push a notification, an alert,
a status update — and does **not** need to receive anything back. Home Assistant, a script, a cron job,
a device, a simple automation. It's **one outbound HTTPS request**. Nothing stays running. No webhook,
no listening, no commands, no reporting.

> Need **two-way** (post *and* have people type commands back to your app)? That's a different, bigger
> setup — see **[connect-any-project-to-rop-chat.md](./connect-any-project-to-rop-chat.md)**. Both use
> the same gateway; having this send-only guide does not disable the two-way path.

---

## The whole integration

Make this one request whenever you want to post:

```
POST https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ai-gateway
Headers:
  Authorization: Bearer <YOUR_TOKEN>
  Content-Type: application/json
Body:
  {"action":"post_message",
   "channel":"<channel name or slug>",
   "author_name":"<your name>",
   "text":"<your message>"}
```

A `200` response with `"ok": true` and a `message_id` means it posted. Reuse the same request any time.
That's the entire integration.

- **Token:** each sender gets its own (so posts are attributed to it and it can be revoked on its own).
  Ask Rob / the ROP Chat side for yours. Keep it private — it's a password.
- **channel:** the channel's name or slug (e.g. `Home Assistant`, `ai-updates`, `announcements`).
- **author_name:** how the post is labeled in chat (e.g. `Home Assistant`).

---

## Example: `curl` (any terminal / server / script)

```bash
curl -X POST https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ai-gateway \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"action":"post_message","channel":"ai-updates","author_name":"My Script","text":"Nightly job finished ✅"}'
```

---

## Example: Home Assistant (`rest_command`)

**`secrets.yaml`:**
```yaml
rop_chat_auth: "Bearer <YOUR_HOME_ASSISTANT_TOKEN>"
```

**`configuration.yaml`** (nest under an existing `rest_command:` if you already have one):
```yaml
rest_command:
  rop_chat_post:
    url: "https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ai-gateway"
    method: POST
    headers:
      Authorization: !secret rop_chat_auth
    content_type: "application/json"
    payload: >-
      {"action":"post_message","channel":"Home Assistant","author_name":"Home Assistant","text":{{ message | to_json }}}
```

Reload **Developer Tools → YAML → RESTful Command** (or restart HA), then call the service
**`rest_command.rop_chat_post`** with `message: "..."` from any automation or script.

---

## Notes
- **Send-only is one-directional by nature.** This sender can't read channels or receive replies — it
  just posts. That's the point; it keeps it dead simple and safe.
- **Times** shown in ROP Chat are US Eastern.
- If a post ever fails, check: correct token (all lowercase, starts with `rop_ai_`), the channel name
  exists, and the body is valid JSON.
