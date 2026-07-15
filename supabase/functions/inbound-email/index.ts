// ROP Chat — inbound EMAIL bridge. Lets an external source (another AI, a script, anyone)
// drop a message into a channel or a person's DMs by sending an email.
//
// An inbound-email provider (Cloudflare Email Routing worker, SendGrid Inbound Parse,
// Mailgun route, etc.) forwards the received email to:
//   POST https://<project>.supabase.co/functions/v1/inbound-email?key=<INBOUND_SECRET>
// as JSON  { to, from, subject, text }  OR  multipart/form-data (SendGrid style).
//
// Routing — where the message lands is read from the recipient address, with a Subject fallback:
//   channel-<slug>@…      -> posts to that channel        (e.g. channel-victories@)
//   dm-<name>@… / to-<name>@…  -> DMs that person          (e.g. dm-zach@)
//   <slug>@…              -> tries channel <slug>, else a person named <slug>
//   Subject "#slug …"     -> channel <slug>
//   Subject "@name …"     -> person <name>
//
// The message is authored by the "Integrations" bot but shows the sender's name (from the
// email's From) so recipients know who it came from. Secured by the URL secret, plus an
// optional sender allow-list. Deployed copy holds the live secret; repo copy redacts it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const BOT_ID = '00000000-0000-4000-8000-00000000b010'
const INBOUND_SECRET = Deno.env.get('INBOUND_SECRET') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
// Comma-separated allow-list of sender emails. Empty = allow any sender (still gated by the URL secret).
const ALLOWED = (Deno.env.get('INBOUND_ALLOWED') ?? '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

const emailOf = (s: string) => (String(s ?? '').match(/<([^>]+)>/)?.[1] ?? String(s ?? '')).trim().toLowerCase()
const nameOf = (s: string) => {
  const m = String(s ?? '').match(/^\s*"?([^"<]+?)"?\s*</)
  return m ? m[1].trim() : ''
}
const localPart = (addr: string) => emailOf(addr).split('@')[0]

// Trim quoted reply history / signatures so only the fresh message posts.
function cleanBody(raw: string): string {
  let t = String(raw ?? '').replace(/\r\n/g, '\n')
  t = t.split(/\n>{1,}.*/)[0] // drop quoted ">" lines onward
  t = t.split(/\nOn .+wrote:/)[0] // "On <date>, X wrote:"
  t = t.split(/\n--\s*\n/)[0] // signature delimiter
  return t.trim().slice(0, 4000)
}

interface Parsed { to: string; from: string; subject: string; text: string; html: string }

const stripTags = (s: string) =>
  String(s ?? '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)

async function parseInbound(req: Request): Promise<Parsed> {
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    const b = await req.json().catch(() => ({} as any))
    // SendGrid "envelope" carries the true recipient; prefer it when present.
    let to = b.to ?? ''
    try {
      const env = typeof b.envelope === 'string' ? JSON.parse(b.envelope) : b.envelope
      if (env?.to?.[0]) to = env.to[0]
    } catch { /* ignore */ }
    return { to: String(to), from: String(b.from ?? ''), subject: String(b.subject ?? ''), text: String(b.text ?? b.body ?? ''), html: String(b.html ?? '') }
  }
  const form = await req.formData()
  let to = String(form.get('to') ?? '')
  try {
    const env = JSON.parse(String(form.get('envelope') ?? '{}'))
    if (env?.to?.[0]) to = env.to[0]
  } catch { /* ignore */ }
  return { to, from: String(form.get('from') ?? ''), subject: String(form.get('subject') ?? ''), text: String(form.get('text') ?? ''), html: String(form.get('html') ?? '') }
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
  if (lp && lp !== 'chat' && lp !== 'inbox') return { channel: lp } // bare slug → try as channel, fall back to person below
  return null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST' }, 405)
  if (new URL(req.url).searchParams.get('key') !== INBOUND_SECRET) return json({ ok: false, error: 'unauthorized' }, 401)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const p = await parseInbound(req)
    const fromEmail = emailOf(p.from)
    if (ALLOWED.length && !ALLOWED.includes(fromEmail)) return json({ ok: false, error: `sender ${fromEmail} not allowed` }, 403)

    // A Subject beginning with [html] means "render my body as an HTML card"; the rest of the
    // subject becomes the card title. Otherwise the plain-text body is posted (markdown-lite).
    const rawSubject = p.subject.trim()
    const htmlMode = /^\[html\]/i.test(rawSubject)
    const subject = htmlMode ? rawSubject.replace(/^\[html\]\s*/i, '').trim() : rawSubject

    const target = resolveTarget(p.to, subject)
    if (!target) return json({ ok: false, error: 'could not determine destination from address or subject' }, 400)

    const authorName = nameOf(p.from) || fromEmail || 'Email'
    const metadata: Record<string, unknown> = { via_api: true, source: 'email-bridge', author_name: authorName, email_from: fromEmail }

    let text: string
    if (htmlMode) {
      const htmlContent = (p.html && p.html.trim()) ? p.html : p.text
      if (!htmlContent.trim()) return json({ ok: false, error: 'empty html body' }, 400)
      metadata.format = 'html'
      metadata.html = htmlContent
      if (subject) metadata.card_title = subject
      text = stripTags(htmlContent) || subject || 'Card'
    } else {
      text = cleanBody(p.text) || subject
      if (!text) return json({ ok: false, error: 'empty message' }, 400)
    }

    // Post to a channel (by slug or name).
    async function toChannel(slug: string) {
      const { data: ch } = await admin.from('channels').select('id').or(`slug.eq.${slug},name.eq.${slug}`).maybeSingle()
      if (!ch) return null
      const { data: msg, error } = await admin.from('messages').insert({ channel_id: ch.id, user_id: BOT_ID, body: text, metadata }).select('id').single()
      if (error) throw error
      return { message_id: msg.id, channel_id: ch.id }
    }

    // DM a person (resolve by email local-part, first name, or display name).
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
      if (!res) res = await toPerson(target.channel) // bare slug fallback → person
    } else {
      res = await toPerson(target.person)
    }
    if (!res) return json({ ok: false, error: 'no matching channel or person for destination' }, 404)
    return json({ ok: true, ...res, author: authorName })
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500)
  }
})
