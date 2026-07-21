# ROP Growth Dashboard — Switch to the Central ROP Login

**Goal:** make the Growth Dashboard (and eventually every ROP app) use **one shared login** — the
same accounts people already have in **ROP Chat** — so a person has *one* email + passcode that works
across ROP Chat, Growth Dashboard, On the Clock, and anything we build next. Managed from one place,
no per-app passwords, **no "Sign in with Google"** (email + passcode only).

**Audience:** the ROP Growth Dashboard app / its developer or AI.
**Authorized by** Rob DiLella, owner of all ROP systems.

---

## 1. The big idea (read this first)

There is **already a central login system** — it's **ROP Chat's Supabase project**. It securely stores
every ROP person (email + a *hashed* password — never plaintext), plus their name, role, access level,
and locations in a `profiles` table. **We do not build a new "passwords table."** That would be
insecure. Instead, **every app authenticates against this one Supabase project.**

Result: whatever email + passcode someone uses in ROP Chat logs them into Growth Dashboard too. Add a
person once (in ROP Chat's Admin), and they can log into everything.

---

## 2. Connect the Growth Dashboard to the shared identity

Use the official Supabase client. These two values are **public and safe to ship in the browser** (the
anon key only allows what Row-Level Security permits):

```
SUPABASE_URL      = https://qrigzwactbwbpuufehxo.supabase.co
SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyaWd6d2FjdGJ3YnB1dWZlaHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNDY1NTAsImV4cCI6MjA5NTgyMjU1MH0.clfVimJMuFEc_6YZO6RmItPntDxJKFlQ-7ug7HAqSDA
```

> ⚠️ Never put the **service_role** key in the browser. Only the anon key above. All data access is
> protected by Row-Level Security on the server.

```js
// supabaseClient.js
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  'https://qrigzwactbwbpuufehxo.supabase.co',
  '<SUPABASE_ANON_KEY from above>',
  { auth: { persistSession: true, autoRefreshToken: true } },
)
```

---

## 3. Replace the Growth Dashboard login with this

Swap whatever login it has now for Supabase Auth. **Email + passcode. No Google, no magic links.**

```js
// Log in
const { data, error } = await supabase.auth.signInWithPassword({
  email: email.trim().toLowerCase(),
  password: passcode,
})
if (error) showError('Wrong email or passcode.')     // else: they're in

// Who's logged in? (call on load + subscribe to changes)
const { data: { session } } = await supabase.auth.getSession()
supabase.auth.onAuthStateChange((_event, session) => { /* update app state */ })

// Log out
await supabase.auth.signOut({ scope: 'local' })
```

**Gate the app on a session** — if `getSession()` returns null, show the login screen; otherwise show
the dashboard. (Mirror how ROP Chat does it.)

### Get the person's role/permissions
After login, read their profile from the shared table to decide what they can see:

```js
const { data: profile } = await supabase
  .from('profiles')
  .select('id, full_name, display_name, email, role, access_level, is_active, location_id')
  .eq('id', session.user.id)
  .single()

// access_level is the permission dial, same everywhere:
//   'owner'  -> everything
//   'admin'  -> full admin
//   'leader' -> elevated
//   'member' -> standard
if (!profile?.is_active) { /* block: account deactivated */ }
```

Use `profile.access_level` to show/hide the Growth Dashboard's pages instead of any local role list.

---

## 4. The passcode convention — the important part (don't skip)

Today people are told: **"log in with the last 4 of your phone."** One catch to solve up front:
**Supabase requires passwords of at least 6 characters**, so a 4-digit code can't literally be the
password. To keep it just as easy but valid everywhere, standardize on **one simple rule** — pick one:

- **Recommended: last 6 digits of your phone number.** Almost as easy as "last 4," everyone knows it,
  meets the 6-char rule, and it's uniform across every ROP app.
- Alternatives: the **full 10-digit phone**, or a memorable default like `rop` + last 4 (e.g. `rop1819`).

**Whatever we pick, it becomes the single passcode for that person across all ROP apps.** Nobody has to
learn anything new per app — that's the whole point.

> **We (the ROP Chat side) can pre-set everyone's passcode to this standard in one batch**, so on day
> one every existing person can log into Growth Dashboard with the exact same rule. Rob just says the
> word and we set it. Ask before building your own reset flow.

---

## 5. Merging without screwing anyone up (migration plan)

1. **Everyone already in ROP Chat works immediately.** The whole team roster lives in this Supabase
   project. The moment Growth Dashboard points here, they log in with their ROP email + the standard
   passcode. No re-signup.
2. **People who use Growth Dashboard but are NOT in ROP Chat yet** need an account created in this
   project. Send ROP Chat the list (name, email, phone) and we bulk-create them with the standard
   passcode — or they self-sign-up once. Nobody gets locked out; we reconcile the list first.
3. **Keep the old Growth Dashboard login working until the switch is verified** — flip to Supabase auth
   behind a flag, test with a few accounts, then make it the only login.
4. **Password resets** are centralized: done in ROP Chat's Admin (or Supabase dashboard). One reset
   works for every app, because it's one account.

---

## 6. What you get / what stays in one place

- **One account per person** → ROP Chat + Growth Dashboard + On the Clock + future apps.
- **One admin** (ROP Chat → Admin → Users) to add/remove people, set roles, reset passcodes.
- **One roles table** (`profiles.access_level`) every app reads for permissions.
- **No Google required**, no separate password per app, no plaintext password list anywhere.

---

## 7. Security notes

- Ship only the **anon key** (above) in the browser. It exposes nothing beyond what Row-Level Security
  allows. The **service_role** key must never leave a server.
- Passwords are hashed by Supabase Auth — not readable by anyone, including us. Resets, not lookups.
- Don't cache passcodes in localStorage or logs. Let Supabase manage the session.

---

## 8. Drop-in prompt (paste into the Growth Dashboard project)

> You are the **ROP Growth Dashboard**. We're moving to **one shared login** used by all ROP apps — the
> ROP Chat **Supabase** identity. **Email + passcode only — do NOT add Google/OAuth or magic links.**
>
> 1. Add `@supabase/supabase-js` and create a client pointed at
>    `https://qrigzwactbwbpuufehxo.supabase.co` with the **anon** key from §2 of this doc (browser-safe;
>    never use the service_role key). `persistSession: true`.
> 2. Replace the current login with `supabase.auth.signInWithPassword({ email, password })`. Gate the
>    whole app on `supabase.auth.getSession()` (null → show login) and subscribe to
>    `onAuthStateChange`. Log out with `supabase.auth.signOut({ scope: 'local' })`.
> 3. After login, read the person's row from the shared **`profiles`** table
>    (`select ... where id = session.user.id`) and drive page permissions off **`access_level`**
>    (owner/admin/leader/member); block if `is_active` is false.
> 4. Passcode standard is **last 6 digits of phone** (≥6 chars, valid in Supabase). Do NOT invent your
>    own signup/reset — ROP Chat manages accounts and can pre-set everyone's passcode in one batch.
> 5. Keep the old login behind a flag until the new one is verified with a few accounts, then cut over.
>
> Report back: that login works against the shared Supabase project, that permissions read from
> `profiles.access_level`, and any accounts that exist in Growth Dashboard but not yet in ROP Chat (so we
> can reconcile the roster).
