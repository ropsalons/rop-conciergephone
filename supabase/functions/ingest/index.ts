// ROP Connect — inbound integration endpoint (Slack "incoming webhook" style).
//
// Any external system (dashboards, phone/booking systems, other APIs) can POST a message
// into a channel or a direct message, authenticated with a revocable API key.
//
//   POST https://<project>.supabase.co/functions/v1/ingest
//   Headers: { "x-api-key": "rop_live_…", "Content-Type": "application/json" }
//   Body (post to a channel):
//     { "channel": "announcements-rop", "text": "Hello team", "author_name": "Booking Bot" }
//   Body (direct message a person by email):
//     { "to_email": "jordan@ropsalons.com", "text": "Your 2pm cancelled", "author_name": "Front Desk" }
//
// Returns: { ok: true, message_id, channel_id? , conversation_id? }
//
// The endpoint uses the service role (bypassing RLS) but only after validating the API key
// against public.integration_tokens (sha-256 hashed). Messages are authored by the inactive
// "Integrations" account and display the provided author_name via metadata.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const BOT_ID = '00000000-0000-4000-8000-00000000b010'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST' }, 405)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // --- Authenticate the API key -------------------------------------------------
  const key =
    req.headers.get('x-api-key') ??
    (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!key) return json({ ok: false, error: 'Missing API key' }, 401)

  const hash = await sha256hex(key)
  const { data: token } = await admin
    .from('integration_tokens')
    .select('id, name, is_active')
    .eq('token_hash', hash)
    .maybeSingle()
  if (!token || !token.is_active) return json({ ok: false, error: 'Invalid or revoked API key' }, 401)

  // --- Parse payload ------------------------------------------------------------
  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Body must be JSON' }, 400)
  }
  const text: string = (body.text ?? body.message ?? '').toString().trim()
  if (!text) return json({ ok: false, error: 'text is required' }, 400)

  const metadata = {
    via_api: true,
    source: body.source ?? token.name,
    author_name: body.author_name ?? body.source ?? token.name,
    ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
  }

  try {
    // --- Direct message to a person by email ----------------------------------
    if (body.to_email) {
      const { data: user } = await admin
        .from('profiles')
        .select('id')
        .ilike('email', body.to_email)
        .maybeSingle()
      if (!user) return json({ ok: false, error: `No user with email ${body.to_email}` }, 404)

      const memberKey = [BOT_ID, user.id].sort().join(':')
      let convId: string
      const { data: existing } = await admin
        .from('direct_conversations')
        .select('id')
        .eq('is_group', false)
        .eq('member_key', memberKey)
        .maybeSingle()
      if (existing) {
        convId = existing.id
      } else {
        const { data: conv, error: cErr } = await admin
          .from('direct_conversations')
          .insert({ is_group: false, member_key: memberKey, created_by: BOT_ID })
          .select('id')
          .single()
        if (cErr) throw cErr
        convId = conv.id
        await admin
          .from('direct_conversation_members')
          .insert([
            { conversation_id: convId, user_id: BOT_ID },
            { conversation_id: convId, user_id: user.id },
          ])
      }
      const { data: msg, error: mErr } = await admin
        .from('messages')
        .insert({ conversation_id: convId, user_id: BOT_ID, body: text, metadata })
        .select('id')
        .single()
      if (mErr) throw mErr
      await admin.from('integration_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', token.id)
      return json({ ok: true, message_id: msg.id, conversation_id: convId })
    }

    // --- Post to a channel (by slug, name, or id) -----------------------------
    const slug: string | undefined = body.channel ?? body.channel_slug
    let channelId: string | undefined = body.channel_id
    if (!channelId && slug) {
      const { data: ch } = await admin
        .from('channels')
        .select('id')
        .or(`slug.eq.${slug},name.eq.${slug}`)
        .maybeSingle()
      if (!ch) return json({ ok: false, error: `No channel "${slug}"` }, 404)
      channelId = ch.id
    }
    if (!channelId) return json({ ok: false, error: 'Provide "channel" (slug) or "to_email"' }, 400)

    const { data: msg, error: mErr } = await admin
      .from('messages')
      .insert({ channel_id: channelId, user_id: BOT_ID, body: text, metadata })
      .select('id')
      .single()
    if (mErr) throw mErr
    await admin.from('integration_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', token.id)
    return json({ ok: true, message_id: msg.id, channel_id: channelId })
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500)
  }
})
