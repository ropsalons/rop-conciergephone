# Receiving Attachments into ROP Chat

ROP Chat can now **receive files** — photos, PDFs, docs, etc. — from every inbound channel, not just
from staff uploading in the app. A received file is stored in the private `attachments` bucket and
rendered in the message exactly like a staff upload: **images show inline, other files as a download
chip.** Limits: **25 MB per file, up to 20 files per message.** A file can arrive **with or without
text** (an attachment-only message is labeled "📎 Attachment").

There are four ways in:

## 1. Email (`inbound-email`)
Attach files to an email sent to `channel-<slug>@chat.rop2020.com` or `dm-<name>@chat.rop2020.com`.
Whatever's attached comes through automatically. Also works for a JSON email-forwarder that posts
`attachments: [{ filename, type, content(base64) | url }]`. See `email-bridge.md`.

## 2. API / dashboards (`ingest`)
`POST …/functions/v1/ingest` with header `x-api-key: rop_live_…` and body field **`attachments`**:

```json
{ "channel": "marketing", "text": "New promo art",
  "attachments": [ { "url": "https://example.com/promo.png" },
                   { "name": "flyer.pdf", "mime_type": "application/pdf", "base64": "JVBERi0x…" } ] }
```
Each item is `{ url }` or `{ name, mime_type, base64 }` (base64 may be a `data:` URL). Works to a
channel or a DM (`to_email`). Response includes `attachments: { saved, skipped }`.

## 3. AI agents (`ai-gateway`)
The `post_message`, `reply_thread` and `send_dm` actions accept the same **`attachments`** array, so
an approved AI agent (Claude Code, Cowork, an automation) can send a file under its permissioned,
audited identity. See `ai-integration.md`.

## 4. Text message / MMS (`inbound-sms`)
Texted photos (MMS) post in too. Point a **Twilio** number's *"A message comes in"* webhook (HTTP
**POST**) at:

```
https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/inbound-sms?key=<INBOUND_SMS_SECRET>
```

Optional routing via query params on that URL:
- `?channel=<slug>` — post texts into that channel (e.g. `?channel=front-desk`)
- `?to_email=<email>` — DM that person
- default falls back to `INBOUND_SMS_CHANNEL`, then the **owner's DM**, so nothing is ever lost.

The function fetches each MMS media item using the Twilio account credentials (already provisioned
for outbound SMS) and stores it like any other attachment. This path goes live the moment the Twilio
webhook is set; the other three paths are live now.

---

### How it works (for maintainers)
All four functions share the same small helper: decode/fetch the file bytes → upload to the private
`attachments` bucket at `inbound/<uuid>.<ext>` (the edge function uses the service role, which
bypasses the per-user path RLS) → insert a `files` row linked to the just-posted message. The client
`FileChip` renders it with a short-lived signed URL — no client changes were needed. Per-file failures
are best-effort (skipped, never failing the message); the response reports `{ saved, skipped }`.
