// ROP one-identity sign-in for OTHER dashboards.
//
// Any ROP dashboard can POST a phone/email + passcode here and get back the person's identity if the
// passcode is right — so a stylist uses their OWN single passcode everywhere, never a shared one. This
// is a server-to-server endpoint: callers must present the shared secret in `x-auth-key`. It NEVER
// returns secrets or the passcode, only a small identity object. Deployed copy holds the live secrets;
// the repo copy keeps them redacted.
//
//   POST /functions/v1/auth-verify
//   headers: { "x-auth-key": "<shared secret>", "content-type": "application/json" }
//   body:    { "identifier": "2395551234" | "person@ropsalons.com", "passcode": "442055" }
//   200:     { "ok": true,  "user": { id, email, phone, full_name, role, access_level } }
//   200:     { "ok": false }                      // wrong passcode / unknown / inactive
//   401:     { "ok": false, "error": "unauthorized" }   // missing/wrong x-auth-key

const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? 'https://qrigzwactbwbpuufehxo.supabase.co'
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
// Server-to-server shared secret. Uses CRON_SECRET (the same secret the scheduled jobs present); an
// optional AUTH_VERIFY_KEY may be set later to give this endpoint its own key without touching cron.
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
const AUTH_VERIFY_KEY = Deno.env.get('AUTH_VERIFY_KEY') ?? ''
function keyOk(k: string | null): boolean {
  return !!k && (k === CRON_SECRET || (AUTH_VERIFY_KEY !== '' && k === AUTH_VERIFY_KEY))
}

function corsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      req.headers.get('access-control-request-headers') ?? 'authorization, apikey, content-type, x-auth-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
const json = (b: unknown, req: Request, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    if (!keyOk(req.headers.get('x-auth-key'))) {
      return json({ ok: false, error: 'unauthorized' }, req, 401)
    }
    const b = await req.json().catch(() => ({} as any))
    const identifier = String(b.identifier ?? b.email ?? b.phone ?? '').trim()
    const passcode = String(b.passcode ?? b.password ?? '')
    if (!identifier || !passcode) return json({ ok: false, error: 'need identifier + passcode' }, req, 400)

    const rpc = await fetch(`${SUPA_URL}/rest/v1/rpc/verify_login_credential`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_identifier: identifier, p_passcode: passcode }),
    })
    const out = rpc.ok ? await rpc.json().catch(() => ({ ok: false })) : { ok: false }
    return json(out, req)
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, req, 500)
  }
})
