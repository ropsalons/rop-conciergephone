# ROP Central Login — Connection Kit

**Audience:** the teams/agents building `my.ropsalons.com`, `time.ropsalons.com`, and the Hub.
**Purpose:** one identity and one credential (mobile number + 4-digit PIN) across all four ROP web
properties, with `chat.ropsalons.com`'s Supabase project as the single source of truth for identity.

This document is the canonical contract. Nothing here contains secrets — the pepper and service-role key
never leave the central authority and are never needed by a consuming property that delegates auth.

---

## 1. The identity authority

- **DECIDED:** Chat's Supabase project is the single canonical identity authority for all four
  properties. Time (`ickfhzjmmlcjhqlljjwb`) and the Hub delegate to it; `my.ropsalons.com` (no prior
  auth) builds directly against it. Each property keeps its own data project — only the "who are you?"
  check moves to Chat's project.
- **Supabase project:** `qrigzwactbwbpuufehxo` (Chat).
- **Base URL:** `https://qrigzwactbwbpuufehxo.supabase.co`
- **Holds:** the workforce accounts (one row per person in `public.profiles`, keyed to a Supabase auth
  user). 51 of 55 accounts are active and **all 51 active accounts have a mobile phone number** — so
  phone is a reliable join key to other systems (e.g. Boulevard staff IDs).
- **Credential model:** mobile number + 4-digit PIN. The PIN is never stored and never used directly as
  a password. The server derives a strong secret — `HMAC_SHA256(pepper, last10(phone) + ":" + pin)` as
  64 hex chars — and that derived secret is the Supabase auth password (bcrypt-hashed). The pepper lives
  only inside the central authority. Email + password remains as an admin/manager fallback.

**Recommended integration = full delegation.** A consuming property should not copy the pepper or keep
its own credential store. It calls the `pin-auth` endpoint below with phone + PIN, receives a real
Supabase session (JWT), and verifies that JWT on its own server. Identity then comes from the token, not
from client-supplied IDs.

### Decisions locked (all four owners)

- **Front-door only.** Every property authenticates through the `pin-auth` endpoint (Section 2). The
  **pepper and service-role key are never distributed** — they stay inside Chat's project. This means a
  property does **not** re-derive the secret locally and does **not** need to match the derivation
  byte-for-byte; Chat does the derivation. (The exact formula is still documented in Section 2 for
  reference / audit, but delegators can ignore it.)
- **Each property keeps its own data and its own authorization.** Only the "who are you?" check moves to
  Chat. Roles/permissions (e.g. concierge/leader/admin, or otc roles) stay in each property, keyed by the
  central user id (`sub`) or normalized phone. Central identity answers *who*, not *what they can see*.
- **Provisioning stays central.** New staff accounts are created in Chat's project (one place), so no one
  else needs the service-role key.
- **Time keeps its data where it is** (auth-only delegation): otc/payroll stay in project
  `ickfhzjmmlcjhqlljjwb`; time's backend verifies Chat's JWT and serves its own data. No data migration.
- **Seamless SSO needs a real subdomain.** A property can only share a `.ropsalons.com` cookie if it's
  served from a `ropsalons.com` subdomain. The Hub must move from `rop-growth-performance.netlify.app`
  to `hub.ropsalons.com` before Phase 3. Until then it's "same credential, separate sign-ins."

---

## 2. `pin-auth` endpoint (the login engine)

`POST https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/pin-auth`
Headers: `Content-Type: application/json`. No auth header required (the function does its own auth).
CORS: `Access-Control-Allow-Origin: *` — `my.ropsalons.com` and the other subdomains are already allowed.

Body is `{ "action": "...", ... }`. Phone may be sent in any format; it is normalized to the last 10 digits.

| action  | request body                              | success (200)                         | notable failures |
|---------|-------------------------------------------|---------------------------------------|------------------|
| `setup` | `{action, phone, pin}` (first-time only)  | `{ ok:true, session }`                | `409 {code:"pin_exists"}`, `404` no such number |
| `login` | `{action, phone, pin}`                    | `{ ok:true, session }`                | `401` wrong PIN, `409 {code:"no_pin"}`, `404` |
| `forgot`| `{action, phone}`                         | `{ ok:true, message }` (always neutral)| — (texts a 6-digit code if on file) |
| `reset` | `{action, phone, code, pin}`              | `{ ok:true, session }`                | `400` bad/expired code |

- **`session`** is a standard Supabase session: `{ access_token, refresh_token, expires_in, expires_at,
  token_type, user }`. Install it with `supabase.auth.setSession({access_token, refresh_token})` if you
  use `supabase-js`, or just hold the tokens yourself.
- **`profile`** is returned inline on every success: `{ id, full_name, phone (last-10), email }`. This is
  the identity payload for mapping — so a consuming app needs **no second call and no key** to learn who
  signed in. (`id` == the JWT `sub`. Note the JWT itself does not carry phone; use this `profile.phone`.)
- **Rate limiting (live):** 6 failed PIN tries per phone, or 30 failed tries per IP, in a rolling
  15-minute window → `429 {code:"locked_phone"|"locked_ip"}`. A correct entry clears the phone's streak.
  `forgot` is capped at 3 reset texts per person per 15 minutes. Consuming properties get this protection
  for free by delegating.

---

## 3. Verifying the session server-side (JWT)

Supabase issues **ES256** JWTs. Verify them on your server with the project's public JWKS — no secret needed.

- **JWKS URL:** `https://qrigzwactbwbpuufehxo.supabase.co/auth/v1/.well-known/jwks.json`
- **Issuer (`iss`):** `https://qrigzwactbwbpuufehxo.supabase.co/auth/v1`
- **Audience (`aud`):** `authenticated`
- **Algorithm:** `ES256`
- **Key claims:** `sub` = the person's Chat/Supabase **user id** (stable identity key); `email`; `role`.

Validate: signature against JWKS, `iss`, `aud`, and `exp`. Then trust `sub` as the caller's identity and
resolve their `staff_id` server-side — never from a query string.

**Anon (publishable) key** — public, safe in client code, needed for `supabase-js` and token refresh:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyaWd6d2FjdGJ3YnB1dWZlaHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNDY1NTAsImV4cCI6MjA5NTgyMjU1MH0.clfVimJMuFEc_6YZO6RmItPntDxJKFlQ-7ug7HAqSDA
```

You do **not** need — and will not be given — the service-role key or the pepper.

---

## 4. Identity mapping (Chat ↔ Boulevard / your system)

The JWT `sub` is the Chat user id. To reach a Boulevard staff id (or any external key), join on **phone**:

1. With the user's `access_token`, read their own profile:
   `GET /rest/v1/profiles?id=eq.<sub>&select=id,full_name,phone` (RLS lets a user read their own row).
2. Normalize `phone` to its last 10 digits and match it to your own directory (e.g.
   `stylist_map.json` / Boulevard). All active staff have a phone, so this covers everyone active.
3. Cache the mapping per session; you only need to resolve it once per login.

If a shared, queryable mapping table is preferred over the phone join, the central authority can add a
synced column to `profiles` — ask and we'll provision it.

---

## 5. Session sharing across the four properties (open decision)

True "log in once, you're in everywhere" needs a shared session mechanism. Two paths:

- **A domain-wide `.ropsalons.com` cookie** is the simplest but the weakest link: an XSS on any one
  subdomain would expose all of them. **Not recommended as the default.**
- **Preferred:** each property keeps its own short-lived Supabase session and the person signs in with
  the *same* phone + PIN on each (Phases 1–2). This already delivers "one login everywhere" — one thing
  to remember, one credential — with a minimal blast radius. If we later want the seamless carry-over
  (Phase 3), we add a central token exchange (OIDC-style) and decide the session mechanism explicitly
  then, rather than defaulting to a shared cookie.

---

## 6. Suggested sequence for a consuming property

1. **Phase 1 — delegated login.** Add a phone + PIN screen; call `pin-auth`; on success store the session
   and resolve the current user from it. Existing staff sign in with the PIN they already set in Chat —
   nothing to re-enroll.
2. **Phase 2 — server-side enforcement.** Verify the JWT in your backend (Section 3), resolve `staff_id`
   from `sub` + the mapping (Section 4), and reject mismatched requests. This closes any
   client-supplied-ID trust gap.
3. **Phase 3 — cross-property SSO.** Adopt the shared-session mechanism the four properties agree on
   (Section 5).

---

## 7. Open coordination items

- **Confirm which project `time.ropsalons.com` authenticates against today**, and whether its PIN
  derivation is byte-for-byte identical to Section 1 (so its accounts already share the credential, or
  need reconciling onto this authority).
- **Decide the Phase 3 session mechanism** (Section 5) as a four-property group.
- **Reconcile edge cases:** staff without a Chat account, and the ~4 accounts missing a phone number.
