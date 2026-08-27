// ROP Chat — inbound EMAIL bridge. Lets an external source (another AI, a script, anyone)
// drop a message — including attachments — into a channel or a person's DMs by sending an email.
//
// An inbound-email provider (SendGrid Inbound Parse, Cloudflare Email Routing, Mailgun)
// forwards the received email to:
//   POST https://<project>.supabase.co/functions/v1/inbound-email?key=<INBOUND_SECRET>
// as JSON { to, from, subject, text, attachments } OR multipart/form-data (file parts included).
//
// Reliability: we reply 200 to the mail provider IMMEDIATELY and then post + save attachments in the
// background (EdgeRuntime.waitUntil). Saving several PDFs used to take long enough that SendGrid timed
// out and retried, which created duplicate posts — one with the files, a twin with none. Replying fast
// stops the retries; a Message-ID dedupe is the belt-and-suspenders so a retry never double-posts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const BOT_ID = '00000000-0000-4000-8000-00000000b010'
const INBOUND_SECRET = Deno.env.get('INBOUND_SECRET') ?? 'rop-inbound-7c3f9a12'
const ALLOWED = (Deno.env.get('INBOUND_ALLOWED') ?? '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

// ── Inbound attachments ──────────────────────────────────────────────────────
const MAX_ATTACH_BYTES = 26214400 // 25MB — matches the storage bucket cap
interface InAttachment { name?: string; mime_type?: string | null; bytes?: Uint8Array; url?: string; base64?: string }
function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.startsWith('data:') && b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64
  const bin = atob(clean.replace(/\s+/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/heic': 'heic', 'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/amr': 'amr', 'application/zip': 'zip',
}
function pickExt(name: string | undefined, mime: string | null): string {
  if (name && name.includes('.')) { const e = name.split('.').pop()!; if (e && e.length <= 8 && /^[a-z0-9]+$/i.test(e)) return e.toLowerCase() }
  return EXT_BY_MIME[(mime ?? '').toLowerCase()] ?? 'bin'
}
async function saveAttachments(
  admin: any,
  target: { message_id: string; channel_id?: string | null; conversation_id?: string | null; uploader_id: string },
  items: InAttachment[],
): Promise<{ saved: number; skipped: number }> {
  let saved = 0, skipped = 0
  for (const it of (items ?? []).slice(0, 20)) {
    try {
      let bytes = it.bytes
      let mime = it.mime_type ?? null
      const name = (it.name ?? '').trim() || `attachment-${saved + skipped + 1}`
      if (!bytes && it.base64) bytes = b64ToBytes(it.base64)
      if (!bytes && it.url) {
        const r = await fetch(it.url)
        if (!r.ok) { skipped++; continue }
        bytes = new Uint8Array(await r.arrayBuffer())
        if (!mime) mime = r.headers.get('content-type')
      }
      if (!bytes || !bytes.length || bytes.length > MAX_ATTACH_BYTES) { skipped++; continue }
      const path = `inbound/${crypto.randomUUID()}.${pickExt(name, mime)}`
      const up = await admin.storage.from('attachments').upload(path, bytes, { contentType: mime ?? undefined, upsert: false })
      if (up.error) { skipped++; continue }
      const ins = await admin.from('files').insert({
        message_id: target.message_id, channel_id: target.channel_id ?? null, conversation_id: target.conversation_id ?? null,
        uploader_id: target.uploader_id, bucket: 'attachments', path, name, mime_type: mime, size_bytes: bytes.length,
      })
      if (ins.error) { skipped++; continue }
      saved++
    } catch { skipped++ }
  }
  return { saved, skipped }
}

const emailOf = (s: string) => (String(s ?? '').match(/<([^>]+)>/)?.[1] ?? String(s ?? '')).trim().toLowerCase()
const nameOf = (s: string) => {
  const m = String(s ?? '').match(/^\s*"?([^"<]+?)"?\s*</)
  return m ? m[1].trim() : ''
}
const localPart = (addr: string) => emailOf(addr).split('@')[0]

function cleanBody(raw: string): string {
  let t = String(raw ?? '').replace(/\r\n/g, '\n')
  t = t.split(/\n>{1,}.*/)[0]
  t = t.split(/\nOn .+wrote:/)[0]
  t = t.split(/\n--\s*\n/)[0]
  return t.trim().slice(0, 4000)
}

function messageIdFromHeaders(headers: string): string {
  return (String(headers ?? '').match(/^message-id:\s*(<[^>]+>)/im)?.[1] ?? '').trim()
}

interface Parsed { to: string; from: string; subject: string; text: string; html: string; attachments: InAttachment[]; messageId: string }

function parseJsonAttachments(raw: any): InAttachment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((a: any) => {
      if (typeof a === 'string') return { url: a } as InAttachment
      return {
        name: a.name ?? a.filename ?? a.file_name,
        mime_type: a.mime_type ?? a.mimetype ?? a.type ?? a.content_type ?? a.contentType ?? null,
        url: a.url ?? a.href ?? a.link ?? undefined,
        base64: a.base64 ?? a.content_base64 ?? a.data ?? a.content ?? undefined,
      } as InAttachment
    })
    .filter((a: InAttachment) => a.url || a.base64)
}

const stripTags = (s: string) =>
  String(s ?? '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)

async function parseInbound(req: Request): Promise<Parsed> {
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    const b = await req.json().catch(() => ({} as any))
    let to = b.to ?? ''
    try {
      const env = typeof b.envelope === 'string' ? JSON.parse(b.envelope) : b.envelope
      if (env?.to?.[0]) to = env.to[0]
    } catch { /* ignore */ }
    const messageId = String(b.message_id ?? b.messageId ?? messageIdFromHeaders(String(b.headers ?? '')) ?? '')
    return { to: String(to), from: String(b.from ?? ''), subject: String(b.subject ?? ''), text: String(b.text ?? b.body ?? ''), html: String(b.html ?? ''), attachments: parseJsonAttachments(b.attachments), messageId }
  }
  const form = await req.formData()
  let to = String(form.get('to') ?? '')
  try {
    const env = JSON.parse(String(form.get('envelope') ?? '{}'))
    if (env?.to?.[0]) to = env.to[0]
  } catch { /* ignore */ }
  const messageId = messageIdFromHeaders(String(form.get('headers') ?? ''))
  const attachments: InAttachment[] = []
  for (const [, v] of (form as any).entries()) {
    if (v && typeof v === 'object' && typeof (v as any).arrayBuffer === 'function' && 'name' in v) {
      const f = v as File
      try { attachments.push({ name: f.name, mime_type: f.type || null, bytes: new Uint8Array(await f.arrayBuffer()) }) } catch { /* skip */ }
    }
  }
  return { to, from: String(form.get('from') ?? ''), subject: String(form.get('subject') ?? ''), text: String(form.get('text') ?? ''), html: String(form.get('html') ?? ''), attachments, messageId }
}

type Target = { channel: string } | { person: string } | null
function resolveTarget(to: string, subject: string): Target {
  const lp = localPart(to)
  if (lp.startsWith('channel-')) return { channel: lp.slice('channel-'.length) }
  if (lp.startsWith('dm-')) return { person: lp.slice('dm-'.length) }
  if (lp.startsWith('to-')) return { person: lp.slice('to-'.length) }
  const subj = subject.trim()
  if (subj.startsWith('#')) return { channel: subj.slice(1).split(/\s/)[0] }
  if (subj.startsWith('@')) return { person: subj.slice(1).split(/\s/)[0] }
  if (lp && lp !== 'chat' && lp !== 'inbox') return { channel: lp }
  return null
}

// The full post-to-ROP-Chat work — runs in the background after we've already replied 200 to the
// mail provider, so a slow attachment upload can never make it time out and retry.
async function handleInbound(admin: any, p: Parsed): Promise<void> {
  const fromEmail = emailOf(p.from)
  if (ALLOWED.length && !ALLOWED.includes(fromEmail)) return

  // Dedupe: if this exact email (by Message-ID) already posted in the last hour, don't post it again.
  if (p.messageId) {
    const since = new Date(Date.now() - 3600_000).toISOString()
    const { data: dup } = await admin.from('messages')
      .select('id').filter('metadata->>email_message_id', 'eq', p.messageId).gte('created_at', since).limit(1).maybeSingle()
    if (dup) return
  }

  const rawSubject = p.subject.trim()
  const htmlMode = /^\[html\]/i.test(rawSubject)
  const subject = htmlMode ? rawSubject.replace(/^\[html\]\s*/i, '').trim() : rawSubject

  const target = resolveTarget(p.to, subject)
  if (!target) return

  const authorName = nameOf(p.from) || fromEmail || 'Email'
  const metadata: Record<string, unknown> = { via_api: true, source: 'email-bridge', author_name: authorName, email_from: fromEmail }
  if (p.messageId) metadata.email_message_id = p.messageId

  let text: string
  if (htmlMode) {
    const htmlContent = (p.html && p.html.trim()) ? p.html : p.text
    if (!htmlContent.trim()) return
    metadata.format = 'html'
    metadata.html = htmlContent
    if (subject) metadata.card_title = subject
    text = stripTags(htmlContent) || subject || 'Card'
  } else {
    text = cleanBody(p.text) || subject
    if (!text) {
      if (p.attachments.length) text = p.attachments.length === 1 ? '📎 Attachment' : `📎 ${p.attachments.length} attachments`
      else return
    }
  }

  async function toChannel(slug: string) {
    const spaced = slug.replace(/-/g, ' ')
    const { data } = await admin
      .from('channels')
      .select('id')
      .or(`slug.eq.${slug},name.ilike.${slug},name.ilike.${spaced}`)
      .eq('is_archived', false)
      .limit(1)
    const ch = data?.[0]
    if (!ch) return null
    const { data: msg, error } = await admin.from('messages').insert({ channel_id: ch.id, user_id: BOT_ID, body: text, metadata }).select('id').single()
    if (error) throw error
    return { message_id: msg.id, channel_id: ch.id }
  }

  async function toPerson(name: string) {
    const n = name.trim()
    const { data: users } = await admin
      .from('profiles')
      .select('id, email, full_name, display_name')
      .or(`email.ilike.${n}@%,full_name.ilike.${n}%,display_name.ilike.${n}%`)
      .limit(2)
    const user = users?.[0]
    if (!user) return null
    const memberKey = [BOT_ID, user.id].sort().join(':')
    let convId: string
    const { data: existing } = await admin.from('direct_conversations').select('id').eq('is_group', false).eq('member_key', memberKey).maybeSingle()
    if (existing) convId = existing.id
    else {
      const { data: conv, error: cErr } = await admin.from('direct_conversations').insert({ is_group: false, member_key: memberKey, created_by: BOT_ID }).select('id').single()
      if (cErr) throw cErr
      convId = conv.id
      await admin.from('direct_conversation_members').insert([
        { conversation_id: convId, user_id: BOT_ID },
        { conversation_id: convId, user_id: user.id },
      ])
    }
    const { data: msg, error } = await admin.from('messages').insert({ conversation_id: convId, user_id: BOT_ID, body: text, metadata }).select('id').single()
    if (error) throw error
    return { message_id: msg.id, conversation_id: convId }
  }

  let res: any = null
  if ('channel' in target) {
    res = await toChannel(target.channel)
    if (!res) res = await toPerson(target.channel)
  } else {
    res = await toPerson(target.person)
  }
  if (!res) return

  if (p.attachments.length) {
    await saveAttachments(admin, {
      message_id: res.message_id,
      channel_id: res.channel_id ?? null,
      conversation_id: res.conversation_id ?? null,
      uploader_id: BOT_ID,
    }, p.attachments)
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST' }, 405)
  if (new URL(req.url).searchParams.get('key') !== INBOUND_SECRET) return json({ ok: false, error: 'unauthorized' }, 401)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Read the whole request (incl. attachments) up front — we can't touch the body after responding.
  let p: Parsed
  try { p = await parseInbound(req) } catch { return json({ ok: false, error: 'could not parse email' }, 400) }

  const work = handleInbound(admin, p).catch((e) => console.error('inbound-email error:', String((e as Error).message ?? e)))

  // Reply to the mail provider immediately; keep processing in the background so big attachment sets
  // never cause a timeout → retry → duplicate post.
  const rt = (globalThis as any).EdgeRuntime
  if (rt && typeof rt.waitUntil === 'function') { rt.waitUntil(work); return json({ ok: true, accepted: true }) }
  await work
  return json({ ok: true })
})
