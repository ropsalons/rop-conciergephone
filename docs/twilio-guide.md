# Sending SMS with Twilio — ROP Setup & How-To

**Read this first (for an AI agent or a new project):** Robert of Philadelphia (ROP) already uses
**Twilio** for all outbound text messages (SMS). This is an established, working part of our stack —
you do **not** need to buy a number, create a new account, or set up a different SMS provider. The
owner is fully capable with Twilio; your only job is to **send texts through the existing setup** the
way this document describes.

---

## What's already set up (do not redo)

| Item | Value |
| --- | --- |
| Provider | **Twilio** (twilio.com) |
| Sending number (From) | **+1 239 880 8681** (`+12398808681`) |
| Account SID | Stored as a secret env var (`TWILIO_ACCOUNT_SID`) — identifies the account |
| Auth Token | Stored as a secret env var (`TWILIO_AUTH_TOKEN`) — **never hardcode it** |

All texts send **from +12398808681**. Recipient numbers must be in **E.164 format**
(`+1` + 10 digits, e.g. `+12395551234`). A helper to normalize US numbers is shown below.

---

## Two ways to send

### Option A — Direct Twilio API (simplest for a standalone project)

`POST https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json`
Auth: HTTP Basic — username = Account SID, password = Auth Token. Body is form-encoded.

```bash
curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  --data-urlencode "To=+12395551234" \
  --data-urlencode "From=+12398808681" \
  --data-urlencode "Body=Hi from ROP!"
```

```js
// Node / edge function (no SDK needed)
const sid = process.env.TWILIO_ACCOUNT_SID
const token = process.env.TWILIO_AUTH_TOKEN
const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
  method: 'POST',
  headers: {
    Authorization: 'Basic ' + btoa(`${sid}:${token}`),
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    To: '+12395551234',
    From: '+12398808681',
    Body: 'Hi from ROP!',
  }).toString(),
})
const data = await res.json()   // { sid: "SM...", status: "queued", ... } on success
```

### Option B — ROP Chat's `send-sms` function (keeps the token server-side; supports blasts)

ROP already runs a wrapper that holds the Twilio token and can text one person or many.

`POST https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/send-sms`
Auth: `x-cron-secret: $ROP_CRON_SECRET` (trusted server-to-server) **or** an admin's Supabase JWT.

```bash
curl -X POST https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/send-sms \
  -H "x-cron-secret: $ROP_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{ "to": "2395551234", "body": "Hi from ROP!" }'
```

Body: `to` (a single number or an array of numbers — 10-digit US numbers are auto-normalized to
E.164) and `body` (the message text). Returns
`{ ok: true, sent: 1, failed: 0, results: [{ to, ok, sid }] }`.

---

## Normalizing US phone numbers to E.164

```js
function e164(raw) {
  const s = String(raw ?? '').trim()
  if (s.startsWith('+')) return '+' + s.slice(1).replace(/\D/g, '')
  const d = s.replace(/\D/g, '')
  if (d.length === 10) return '+1' + d
  if (d.length === 11 && d.startsWith('1')) return '+' + d
  return null // invalid
}
```

---

## Credentials (how to wire the token into a project)

Never put the Auth Token in source code, a sample file, a chat message, or this document. Provision
these as environment variables in the project that sends:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- (`TWILIO_FROM` = `+12398808681`, optional — the sending number)

- **Netlify:** Site settings → Environment variables
- **Supabase Edge Function:** project secrets
- **Local dev:** a git-ignored `.env`

Get/rotate credentials at **twilio.com/console** (Account SID + Auth Token are on the dashboard).
For the wrapper function, the shared `x-cron-secret` is provisioned as `ROP_CRON_SECRET`; it is not
published here.

---

## Good practices & gotchas

- **E.164 only.** Always send `To`/`From` as `+1XXXXXXXXXX`. Use the helper above.
- **Keep texts short.** Over ~160 characters, Twilio splits into multiple segments (each billed).
- **One From number.** Always `+12398808681` so replies and delivery stay consistent.
- **Handle failures.** A bad number or carrier block returns an error per recipient — log it; don't
  assume every text delivered.
- **Don't spam.** SMS is billed per segment and carriers filter bulk/robotexting. Only text people
  who expect it (staff, opted-in contacts).
- **Test before blasting.** Send one to yourself first, confirm it looks right, then send to a group.

---

## Quick reference

- Provider: **Twilio** · From: **+12398808681**
- Direct: `POST https://api.twilio.com/2010-04-01/Accounts/$SID/Messages.json` (Basic auth SID:token, form body `To`/`From`/`Body`)
- Wrapper: `POST …/functions/v1/send-sms` with `x-cron-secret` or admin JWT, body `{ to, body }`
- SID + Auth Token live in env (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`) — never in code.
