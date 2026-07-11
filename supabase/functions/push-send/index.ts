// ROP Connect — Web Push sender. Called (fire-and-forget, once per device subscription)
// by the `push_on_notification` DB trigger via pg_net. Encrypts + delivers a single push
// with VAPID. The trigger already decided the message is allowed (prefs + channel mute),
// so this function just signs and sends.
// Deployed copy holds the live VAPID private key; the repo copy keeps it redacted.

import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC = 'BDyGhwfWqe89kd97jKadjaK7HFbXzzEeG_K-eB2HYU2y-utJFmd_LGcBZJBsGi321eFbU-h3YpzPLCYCb0XOkk8'
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
const VAPID_SUBJECT = 'mailto:robd@rop2020.com'
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET)
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  try {
    const { subscription, payload } = await req.json()
    if (!subscription?.endpoint)
      return new Response(JSON.stringify({ ok: false, error: 'no subscription' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    await webpush.sendNotification(subscription, JSON.stringify(payload ?? {}), { TTL: 3600 })
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    // 404/410 = subscription expired; anything else = transient. Never hard-fail the caller.
    const status = (e as any)?.statusCode ?? 0
    return new Response(JSON.stringify({ ok: false, gone: status === 404 || status === 410, status, error: String((e as Error).message ?? e) }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
