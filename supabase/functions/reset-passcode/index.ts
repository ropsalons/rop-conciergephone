// ROP Chat — self-service passcode reset. A person who forgot their passcode enters their phone (or
// email) on the login screen; we mint a fresh 6-digit code, set it as their password, and TEXT it to
// the phone on file. They sign in with the texted code and can keep using it.
//
// Public endpoint (verify_jwt=false) — but it never reveals whether an account exists: the response is
// always the same neutral "if that's on file, we texted the phone on record." The DB RPC does the real
// work as SECURITY DEFINER and rate-limits to one text per person per 45s, so this can't be used to spam
// someone or harvest accounts. The actual SMS goes out through the existing send-sms function (which
// holds the Twilio creds), authorized with the shared cron secret.
//
// Deployed copy bakes in the live CRON_SECRET; the repo copy keeps it redacted.

const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? 'https://qrigzwactbwbpuufehxo.supabase.co'
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // auto-injected by Supabase
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'

function corsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      req.headers.get('access-control-request-headers') ??
      'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
const json = (b: unknown, req: Request, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } })

// Always the same answer, whether or not the handle matched — no account-existence leak.
const NEUTRAL = { ok: true, message: 'If that phone or email is on file, we just texted a reset code to the phone on record.' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    const b = await req.json().catch(() => ({} as any))
    const identifier = String(b.identifier ?? b.email ?? b.phone ?? '').trim()
    if (!identifier) return json({ ok: false, error: 'Enter your phone number or email.' }, req, 400)

    // Mint the code + set the password server-side. Null => unknown handle / no phone / throttled.
    const rpc = await fetch(`${SUPA_URL}/rest/v1/rpc/request_passcode_reset`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_identifier: identifier }),
    })
    const result = rpc.ok ? await rpc.json().catch(() => null) : null

    if (result && result.phone && result.code) {
      const first = String(result.name ?? '').split(' ')[0]
      const hi = first ? `Hi ${first}! ` : ''
      const text = `${hi}Your ROP Chat reset code is ${result.code}. Use it as your password to sign in at chat.ropsalons.com — then you can keep using it.`
      // Send through the existing Twilio-backed function.
      await fetch(`${SUPA_URL}/functions/v1/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
        body: JSON.stringify({ to: result.phone, body: text }),
      }).catch(() => {})
    }
    // Neutral either way.
    return json(NEUTRAL, req)
  } catch (e) {
    return json({ ok: false, error: 'Something went wrong. Please try again.', detail: String((e as Error).message ?? e) }, req, 500)
  }
})
