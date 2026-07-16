# Sending Email with Resend — ROP Setup & How-To

**Read this first (for an AI agent or a new project):** Robert of Philadelphia (ROP) already uses
**Resend** for all outbound email. This is an established, working part of our stack — you do **not**
need to set up a new email provider, verify a domain, or reinvent anything. The owner is fully
capable with Resend; your only job is to **send email through the existing setup** the way this
document describes. Don't propose SendGrid/Mailgun/SMTP alternatives.

---

## What's already set up (do not redo)

| Item | Value |
| --- | --- |
| Provider | **Resend** (resend.com) |
| Sending domain | **rop2020.com** — already verified in Resend (SPF / DKIM / DMARC in place) |
| Default From | **`ROP Chat <notifications@rop2020.com>`** |
| API key | Stored as a secret (env var) — **never hardcode it**. See "Credentials" below. |

Because the domain is verified, mail from `@rop2020.com` sends with good deliverability. Use a
From address on that domain (e.g. `notifications@rop2020.com`, or `Name <someone@rop2020.com>`).

---

## Two ways to send

### Option A — Direct Resend API (simplest for a standalone project)

`POST https://api.resend.com/emails`
Header: `Authorization: Bearer $RESEND_API_KEY`

```bash
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "ROP Chat <notifications@rop2020.com>",
    "to": ["someone@example.com"],
    "subject": "Hello from ROP",
    "html": "<p>Your message here.</p>"
  }'
```

```js
// Node / edge function
const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: 'ROP Chat <notifications@rop2020.com>',
    to: ['someone@example.com'],   // string or array
    subject: 'Hello from ROP',
    html: '<p>Your message here.</p>',
    // optional: text, cc, bcc, reply_to
  }),
})
const data = await res.json()   // { id: "..." } on success
```

Fields: `from`, `to` (string or array), `subject`, and at least one of `html` / `text`.
Optional: `cc`, `bcc`, `reply_to`, `attachments`.

### Option B — ROP Chat's `send-email` function (keeps the key server-side; supports staff blasts)

ROP already runs a wrapper that holds the Resend key and can broadcast to staff. Use this when you
want to send **from inside the ROP ecosystem** without handling the key yourself.

`POST https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/send-email`
Auth: `x-cron-secret: $ROP_CRON_SECRET` (trusted server-to-server) **or** an admin's Supabase JWT.

```bash
curl -X POST https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/send-email \
  -H "x-cron-secret: $ROP_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "to": ["someone@example.com"],
    "subject": "Hello from ROP",
    "html": "<p>Your message here.</p>",
    "text": "Your message here.",
    "replyTo": "robd@rop2020.com"
  }'
```

Body fields: `to` (or `bcc` for hidden recipients), `subject`, `html` and/or `text`, optional
`from` (defaults to `notifications@rop2020.com`), `replyTo`. Returns `{ ok: true, id: "..." }`.
Recipients on a blast are BCC'd (hidden from each other).

---

## Credentials (how to wire the key into a project)

Never put the key in source code, a sample file, a chat message, or this document. Provision it as
an environment variable in the project that sends:

- **Netlify:** Site settings → Environment variables → `RESEND_API_KEY`
- **Supabase Edge Function:** project secrets → `RESEND_API_KEY`
- **Local dev:** a `.env` file that is git-ignored

Get/rotate the key at **resend.com → API Keys**. For the wrapper function, the shared
`x-cron-secret` value is provisioned the same way (as `ROP_CRON_SECRET`); it is not published here.

---

## Good practices

- Send From an `@rop2020.com` address (verified) — don't send From random domains, or deliverability drops.
- Set a real `reply_to` (e.g. `robd@rop2020.com`) so replies reach a person.
- Provide both `html` and a plain-`text` fallback when you can.
- For many recipients, use **BCC** (via the wrapper) so people don't see each other's addresses.
- Handle the response: a success returns an `id`; on failure Resend returns an error message — log it.
- Respect rate limits; for large sends, batch and add small delays.

---

## Quick reference

- Provider: **Resend** · Domain: **rop2020.com (verified)** · From: **notifications@rop2020.com**
- Direct: `POST https://api.resend.com/emails` with `Authorization: Bearer $RESEND_API_KEY`
- Wrapper: `POST …/functions/v1/send-email` with `x-cron-secret` or admin JWT
- Key lives in env (`RESEND_API_KEY`) — never in code.
