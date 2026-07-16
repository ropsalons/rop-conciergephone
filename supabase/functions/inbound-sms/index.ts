// ROP Chat — inbound SMS / MMS bridge (Twilio). Lets a text message — including photos and
// other media (MMS) — post into a channel or a person's DMs in ROP Chat.
//
// Point a Twilio number's "A message comes in" webhook (HTTP POST) at:
//   https://<project>.supabase.co/functions/v1/inbound-sms?key=<INBOUND_SMS_SECRET>
// Optionally choose where texts land with query params on that URL:
//   ?channel=<slug>       -> post into that channel   (e.g. ?channel=front-desk)
//   ?to_email=<email>     -> DM that person
//   (default falls back to INBOUND_SMS_CHANNEL, then the owner's DM.)
//
// Twilio posts application/x-www-form-urlencoded: From, Body, NumMedia, MediaUrl0.., MediaContentType0..
// MMS media lives behind Twilio auth, so we fetch each with the account credentials and store it in
// the private `attachments` bucket, linked to the message — so it renders like any staff upload.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const BOT_ID = '00000000-0000-4000-8000-00000000b010' // the inactive "Integrations" account
const INBOUND_SMS_SECRET = Deno.env.get('INBOUND_SMS_SECRET') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
const OWNER_EMAIL = Deno.env.get('INBOUND_SMS_OWNER_EMAIL') ?? 'robd@rop2020.com'
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''

const MAX_ATTACH_BYTES = 26214400 // 25MB — matches the storage bucket cap
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/heic': 'heic', 'application/pdf': 'pdf', 'text/plain': 'txt', 'text/vcard': 'vcf',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'audio/mpeg': 'mp3', 'audio/amr': 'amr', 'audio/ogg': 'ogg',
}
function extFor(mime: string | null): string { return EXT_BY_MIME[(mime ?? '').toLowerCase()] ?? 'bin' }

// Twilio expects a TwiML (XML) 200 acknowledgement.
const twiml = (msg = '') =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${msg}</Response>`, {
    status: 200, headers: { 'Content-Type': 'text/xml' },
  })
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST' }, 405)
  const url = new URL(req.url)
  if (url.searchParams.get('key') !== INBOUND_SMS_SECRET) return json({ ok: false, error: 'unauthorized' }, 401)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const form = await req.formData()
    const from = String(form.get('From') ?? '').trim()
    const bodyText = String(form.get('Body') ?? '').trim()
    const numMedia = parseInt(String(form.get('NumMedia') ?? '0'), 10) || 0

    // Fetch each MMS media item (behind Twilio auth) as bytes.
    const media: Array<{ bytes: Uint8Array; mime: string | null }> = []
    const twAuth = 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)
    for (let i = 0; i < numMedia; i++) {
      const mUrl = String(form.get(`MediaUrl${i}`) ?? '')
      const mType = String(form.get(`MediaContentType${i}`) ?? '') || null
      if (!mUrl) continue
      try {
        const r = await fetch(mUrl, { headers: { Authorization: twAuth } })
        if (!r.ok) continue
        const bytes = new Uint8Array(await r.arrayBuffer())
        if (bytes.length && bytes.length <= MAX_ATTACH_BYTES) media.push({ bytes, mime: mType ?? r.headers.get('content-type') })
      } catch { /* skip bad media */ }
    }

    // Message body: the text, or a label when it's media-only.
    let text = bodyText
    if (!text) text = media.length ? (media.length === 1 ? '📎 Attachment' : `📎 ${media.length} attachments`) : ''
    if (!text && !media.length) return twiml() // nothing to post

    const authorName = from ? `SMS ${from}` : 'SMS'
    const metadata = { via_api: true, source: 'sms-inbound', author_name: authorName, sms_from: from }

    // Destination: ?to_email / ?channel on the webhook URL, else INBOUND_SMS_CHANNEL, else owner DM.
    const qEmail = url.searchParams.get('to_email')
    const qChannel = url.searchParams.get('channel') ?? Deno.env.get('INBOUND_SMS_CHANNEL') ?? ''

    let target: { channel_id?: string; conversation_id?: string } | null = null

    if (qEmail) {
      target = await dmTarget(admin, qEmail)
    } else if (qChannel) {
      const spaced = qChannel.replace(/-/g, ' ')
      const { data } = await admin.from('channels').select('id').or(`slug.eq.${qChannel},name.ilike.${qChannel},name.ilike.${spaced}`).limit(1)
      if (data?.[0]) target = { channel_id: data[0].id }
    }
    if (!target) target = await dmTarget(admin, OWNER_EMAIL) // safe fallback so nothing is lost
    if (!target) return twiml() // owner not found — acknowledge anyway

    const { data: msg, error } = await admin.from('messages').insert({ ...target, user_id: BOT_ID, body: text, metadata }).select('id').single()
    if (error) throw error

    // Store media and link to the message.
    for (const [i, m] of media.entries()) {
      const path = `inbound/${crypto.randomUUID()}.${extFor(m.mime)}`
      const up = await admin.storage.from('attachments').upload(path, m.bytes, { contentType: m.mime ?? undefined, upsert: false })
      if (up.error) continue
      await admin.from('files').insert({
        message_id: msg.id, channel_id: target.channel_id ?? null, conversation_id: target.conversation_id ?? null,
        uploader_id: BOT_ID, bucket: 'attachments', path, name: `mms-${i + 1}.${extFor(m.mime)}`, mime_type: m.mime, size_bytes: m.bytes.length,
      })
    }

    return twiml()
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500)
  }
})

// Resolve (or create) the Integrations↔person DM conversation for an email.
async function dmTarget(admin: any, email: string): Promise<{ conversation_id: string } | null> {
  const { data: user } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
  if (!user) return null
  const memberKey = [BOT_ID, user.id].sort().join(':')
  const { data: existing } = await admin.from('direct_conversations').select('id').eq('is_group', false).eq('member_key', memberKey).maybeSingle()
  if (existing) return { conversation_id: existing.id }
  const { data: conv, error } = await admin.from('direct_conversations').insert({ is_group: false, member_key: memberKey, created_by: BOT_ID }).select('id').single()
  if (error || !conv) return null
  await admin.from('direct_conversation_members').insert([
    { conversation_id: conv.id, user_id: BOT_ID },
    { conversation_id: conv.id, user_id: user.id },
  ])
  return { conversation_id: conv.id }
}
