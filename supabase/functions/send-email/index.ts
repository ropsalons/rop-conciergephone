// ROP Connect — outbound email via Resend.
// Two callers:
//  1) Trusted server/automation (x-cron-secret) — used to notify the owner and for scheduled sends.
//  2) An admin in the dashboard (their Supabase JWT) — verified via the am_i_admin() RPC — used to
//     broadcast a "special notification" email to staff or custom addresses.
// Deployed copy holds the live Resend key; the repo copy keeps it redacted (Deno.env fallback).

const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
const CRON_SECRET = 'rop-daily-3f9ac21b'
const SUPA_URL = 'https://qrigzwactbwbpuufehxo.supabase.co'
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
const DEFAULT_FROM = Deno.env.get('EMAIL_FROM') ?? 'ROP Chat <notifications@rop2020.com>'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-cron-secret, x-client-info, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

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

const arr = (v: unknown): string[] => (Array.isArray(v) ? v : v ? [String(v)] : []).map((s) => String(s).trim()).filter(Boolean)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const trusted = req.headers.get('x-cron-secret') === CRON_SECRET
    if (!trusted) {
      const authz = req.headers.get('Authorization') ?? ''
      if (!authz || !(await isAdmin(authz))) return json({ ok: false, error: 'forbidden' }, 403)
    }
    const b = await req.json().catch(() => ({} as any))

    // Debug (trusted only): what sender domains are verified in Resend?
    if (b.list_domains && trusted) {
      const d = await fetch('https://api.resend.com/domains', { headers: { Authorization: 'Bearer ' + RESEND_KEY } })
      return json(await d.json())
    }

    const to = arr(b.to)
    const bcc = arr(b.bcc)
    const from = (b.from as string) || DEFAULT_FROM
    if (!b.subject || (!to.length && !bcc.length)) return json({ ok: false, error: 'need subject + recipients' }, 400)

    const senderEmail = from.replace(/.*</, '').replace(/>.*/, '') || from
    const payload: Record<string, unknown> = {
      from,
      subject: String(b.subject),
      to: to.length ? to : [senderEmail], // Resend requires `to`; for a pure bcc blast, send to self.
    }
    if (bcc.length) payload.bcc = bcc
    if (b.html) payload.html = String(b.html)
    if (b.text) payload.text = String(b.text)
    if (!b.html && !b.text) payload.text = ' '
    if (b.replyTo) payload.reply_to = String(b.replyTo)

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const jr = await r.json().catch(() => ({} as any))
    return json({ ok: r.ok, status: r.status, id: jr.id ?? null, error: jr.message ?? jr.name ?? null, recipients: to.length + bcc.length })
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500)
  }
})
