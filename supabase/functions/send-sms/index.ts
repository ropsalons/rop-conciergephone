// ROP Chat — outbound SMS via Twilio.
// Two callers:
//  1) Trusted server/automation (x-cron-secret) — used for the owner's test + scheduled sends.
//  2) An admin in the dashboard (their Supabase JWT) — verified via am_i_admin() — to blast a text.
// Deployed copy holds the live Twilio auth token; the repo copy keeps it redacted (Deno.env fallback).

const ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
const AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
const FROM = Deno.env.get('TWILIO_FROM') ?? '+12398808681'
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? 'https://qrigzwactbwbpuufehxo.supabase.co'
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

// Reflect whatever headers the browser's CORS preflight asks for (supabase-js sends x-client-info,
// x-supabase-api-version, etc.). A fixed allow-list silently dropped the POST — the preflight passed
// but the browser blocked the real request ("Failed to send a request to the Edge Function").
function corsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      req.headers.get('access-control-request-headers') ??
      'authorization, apikey, content-type, x-cron-secret, x-client-info, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
const json = (b: unknown, req: Request, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } })

async function isAdmin(authz: string): Promise<boolean> {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/am_i_admin`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: authz, 'Content-Type': 'application/json' },
      body: '{}',
    })
    return r.ok && (await r.json()) === true
  } catch {
    return false
  }
}

// Coerce a US phone into E.164 (+1XXXXXXXXXX). Passes through anything already +-prefixed.
function e164(raw: string): string | null {
  const s = String(raw ?? '').trim()
  if (s.startsWith('+')) return '+' + s.slice(1).replace(/\D/g, '')
  const d = s.replace(/\D/g, '')
  if (d.length === 10) return '+1' + d
  if (d.length === 11 && d.startsWith('1')) return '+' + d
  return null
}

async function sendOne(to: string, body: string): Promise<{ to: string; ok: boolean; sid?: string; error?: string }> {
  const dest = e164(to)
  if (!dest) return { to, ok: false, error: 'invalid phone number' }
  const params = new URLSearchParams({ To: dest, From: FROM, Body: body })
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
  const j = await r.json().catch(() => ({} as any))
  return { to: dest, ok: r.ok, sid: j.sid, error: r.ok ? undefined : j.message ?? `HTTP ${r.status}` }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    const trusted = req.headers.get('x-cron-secret') === CRON_SECRET
    if (!trusted) {
      const authz = req.headers.get('Authorization') ?? ''
      if (!authz || !(await isAdmin(authz))) return json({ ok: false, error: 'forbidden' }, req, 403)
    }
    const b = await req.json().catch(() => ({} as any))
    const recipients: string[] = Array.isArray(b.to) ? b.to.map(String) : b.to ? [String(b.to)] : []
    const body = String(b.body ?? b.message ?? '').trim()
    if (!recipients.length || !body) return json({ ok: false, error: 'need `to` + `body`' }, req, 400)

    const results = []
    for (const to of recipients) results.push(await sendOne(to, body))
    const sent = results.filter((r) => r.ok).length
    return json({ ok: sent > 0, sent, failed: results.length - sent, results }, req)
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, req, 500)
  }
})
