// ROP Chat — Phone + 4-digit PIN login (matches time.ropsalons.com).
//
// A 4-digit PIN alone is weak, so we never use it as the password. Instead (phone + PIN) is HMAC'd
// with a server-side pepper into a strong 64-char secret; THAT is the Supabase auth password (bcrypt
// hashed as always). Staff never see the secret and the PIN is never stored. The same phone+PIN always
// derives the same secret, so the exact math can later be shared across ROP platforms for one login.
//
// Actions (POST { action, ... }):
//   setup { phone, pin }          → first-time: set a PIN (only if none set yet) → returns a session
//   login { phone, pin }          → daily sign-in → returns a session
//   forgot { phone }              → text a 6-digit reset code (15 min, one-time). Always neutral.
//   reset { phone, code, pin }    → verify code + set a new PIN → returns a session
//
// A "session" is { access_token, refresh_token, ... } the browser installs via supabase.auth.setSession.
// Deployed copy holds the live pepper + cron secret; the repo copy keeps them redacted.

const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? 'https://qrigzwactbwbpuufehxo.supabase.co'
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const PEPPER = Deno.env.get('PIN_PEPPER') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'

function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      req.headers.get('access-control-request-headers') ??
      'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
const json = (b: unknown, req: Request, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...cors(req) } })

const normPhone = (p: string) => String(p ?? '').replace(/\D/g, '').slice(-10)
const isPin = (p: string) => /^\d{4}$/.test(String(p ?? ''))

async function hmacHex(pepper: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
// (phone + PIN) → strong 64-char secret.
const deriveSecret = (phone: string, pin: string) => hmacHex(PEPPER, normPhone(phone) + ':' + pin)

async function rpc(fn: string, args: Record<string, unknown>): Promise<any> {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  return r.ok ? await r.json().catch(() => null) : null
}
async function lookup(phone: string): Promise<{ id: string; email: string; pin_set: boolean; phone: string } | null> {
  const rows = await rpc('pin_lookup', { p_phone: phone })
  return Array.isArray(rows) && rows[0] ? rows[0] : null
}
// Sign in with the derived secret and return the session tokens.
async function signIn(email: string, secret: string): Promise<any | null> {
  const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: secret }),
  })
  return r.ok ? await r.json() : null
}
async function sendSms(toDigits: string, body: string) {
  await fetch(`${SUPA_URL}/functions/v1/send-sms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
    body: JSON.stringify({ to: toDigits, body }),
  }).catch(() => {})
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  try {
    const b = await req.json().catch(() => ({} as any))
    const action = String(b.action ?? '')
    const phone = String(b.phone ?? '')
    const pin = String(b.pin ?? '')

    if (action === 'setup') {
      if (!isPin(pin)) return json({ ok: false, error: 'Your PIN must be exactly 4 digits.' }, req, 400)
      const prof = await lookup(phone)
      if (!prof) return json({ ok: false, error: "We couldn't find that mobile number on file. Ask a manager to add it." }, req, 404)
      if (prof.pin_set) return json({ ok: false, code: 'pin_exists', error: 'You already have a PIN. Tap “Forgot PIN?” to change it.' }, req, 409)
      const secret = await deriveSecret(phone, pin)
      await rpc('pin_set', { p_profile: prof.id, p_secret: secret })
      const session = await signIn(prof.email, secret)
      if (!session?.access_token) return json({ ok: false, error: 'PIN set, but sign-in failed — please try Sign In.' }, req, 500)
      return json({ ok: true, session }, req)
    }

    if (action === 'login') {
      if (!isPin(pin)) return json({ ok: false, error: 'Enter your 4-digit PIN.' }, req, 400)
      const prof = await lookup(phone)
      if (!prof) return json({ ok: false, error: "We couldn't find that mobile number on file." }, req, 404)
      if (!prof.pin_set) return json({ ok: false, code: 'no_pin', error: 'No PIN yet — tap “First time here? Set up your PIN.”' }, req, 409)
      const session = await signIn(prof.email, await deriveSecret(phone, pin))
      if (!session?.access_token) return json({ ok: false, error: 'That PIN doesn’t match. Try again or reset it.' }, req, 401)
      return json({ ok: true, session }, req)
    }

    if (action === 'forgot') {
      const neutral = { ok: true, message: 'If that number is on file, we just texted a 6-digit reset code.' }
      const prof = await lookup(phone)
      if (prof) {
        const code = String(Math.floor(100000 + Math.random() * 900000))
        await rpc('pin_store_code', { p_profile: prof.id, p_hash: await sha256hex(code) })
        await sendSms(normPhone(phone), `Your ROP Chat PIN reset code is ${code}. It expires in 15 minutes.`)
      }
      return json(neutral, req)
    }

    if (action === 'reset') {
      if (!isPin(pin)) return json({ ok: false, error: 'Your new PIN must be exactly 4 digits.' }, req, 400)
      const code = String(b.code ?? '').trim()
      if (!/^\d{6}$/.test(code)) return json({ ok: false, error: 'Enter the 6-digit code we texted you.' }, req, 400)
      const prof = await lookup(phone)
      if (!prof) return json({ ok: false, error: "We couldn't find that mobile number on file." }, req, 404)
      const ok = await rpc('pin_use_code', { p_profile: prof.id, p_hash: await sha256hex(code) })
      if (ok !== true) return json({ ok: false, error: 'That code is wrong or has expired. Request a new one.' }, req, 400)
      const secret = await deriveSecret(phone, pin)
      await rpc('pin_set', { p_profile: prof.id, p_secret: secret })
      const session = await signIn(prof.email, secret)
      if (!session?.access_token) return json({ ok: false, error: 'PIN reset, but sign-in failed — please try Sign In.' }, req, 500)
      return json({ ok: true, session }, req)
    }

    return json({ ok: false, error: 'Unknown action' }, req, 400)
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, req, 500)
  }
})
