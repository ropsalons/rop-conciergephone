// ROP Chat — secure two-way AI gateway.
//
// One authenticated endpoint that lets an APPROVED AI agent (Claude Code, Cowork, an ops agent,
// an email automation, …) both READ and WRITE inside ROP Chat, under a strict least-privilege
// permission scope. Every request is authenticated by a hashed bearer token, checked against a
// global kill-switch and the agent's allowed actions + channel scope, rate-limited, made
// idempotent for writes, and written to a durable audit log.
//
//   POST https://<project>.supabase.co/functions/v1/ai-gateway
//   Headers: { "Authorization": "Bearer rop_ai_…", "Content-Type": "application/json" }
//   Body:    { "action": "<action>", ...params, "idempotency_key"?: "<uuid>" }
//
// Actions: list_channels · read_channel_messages · read_thread · search_messages ·
//          post_message · reply_thread · send_dm · send_group_dm · create_task · update_task ·
//          request_approval · list_approvals
//
// The endpoint uses the service role (bypassing RLS) but ONLY after validating the agent and
// enforcing its scope in code — content the agent isn't allowed to see is never returned.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const BOT_ID = '00000000-0000-4000-8000-00000000b010' // the inactive "Integrations" account AI posts as

function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      req.headers.get('access-control-request-headers') ??
      'authorization, x-api-key, content-type, x-idempotency-key, x-client-info, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Agent {
  id: string
  name: string
  slug: string
  provider: string
  is_active: boolean
  channel_scope: 'listed' | 'all_public' | 'all'
  allow_dms: boolean
  allowed_actions: string[]
  require_approval_for: string[]
  rate_per_min: number
}

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function htmlToText(h: string): string {
  let out = ''
  let inTag = false
  for (const c of h) {
    if (c === '<') inTag = true
    else if (c === '>') inTag = false
    else if (!inTag) out += c
  }
  out = out.split('\n').join(' ').split('\t').join(' ').split('\r').join(' ')
  while (out.includes('  ')) out = out.split('  ').join(' ')
  return out.trim().slice(0, 280)
}

// ── Inbound attachments ──────────────────────────────────────────────────────
// Uploads files an agent sends to the private `attachments` bucket (service role bypasses the
// per-user path RLS) and links them to a message via `files`, so they render in ROP Chat like
// a staff upload. Agents pass `attachments` (or `files`): [{ url } | { name, mime_type, base64 }].
const MAX_ATTACH_BYTES = 26214400 // 25MB — matches the storage bucket cap
interface InAttachment { name?: string; mime_type?: string | null; url?: string; base64?: string }
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
  'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'application/zip': 'zip',
}
function pickExt(name: string | undefined, mime: string | null): string {
  if (name && name.includes('.')) { const e = name.split('.').pop()!; if (e && e.length <= 8 && /^[a-z0-9]+$/i.test(e)) return e.toLowerCase() }
  return EXT_BY_MIME[(mime ?? '').toLowerCase()] ?? 'bin'
}
function parseJsonAttachments(raw: any): InAttachment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((a: any) => (typeof a === 'string' ? { url: a } : {
      name: a.name ?? a.filename ?? a.file_name,
      mime_type: a.mime_type ?? a.mimetype ?? a.type ?? a.content_type ?? a.contentType ?? null,
      url: a.url ?? a.href ?? a.link ?? undefined,
      base64: a.base64 ?? a.content_base64 ?? a.data ?? a.content ?? undefined,
    }) as InAttachment)
    .filter((a: InAttachment) => a.url || a.base64)
}
async function saveAttachments(
  admin: any,
  target: { message_id: string; channel_id?: string | null; conversation_id?: string | null; uploader_id: string },
  items: InAttachment[],
): Promise<{ saved: number; skipped: number }> {
  let saved = 0, skipped = 0
  for (const it of (items ?? []).slice(0, 20)) {
    try {
      let bytes: Uint8Array | undefined
      let mime = it.mime_type ?? null
      const name = (it.name ?? '').trim() || `attachment-${saved + skipped + 1}`
      if (it.base64) bytes = b64ToBytes(it.base64)
      else if (it.url) {
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

Deno.serve(async (req) => {
  const CORS = cors(req)
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const correlationId = crypto.randomUUID()
  const sourceIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  // ── Authenticate the agent ────────────────────────────────────────────────
  const authz = req.headers.get('authorization') ?? ''
  const raw =
    (authz.toLowerCase().startsWith('bearer ') ? authz.slice(authz.indexOf(' ') + 1).trim() : '') ||
    (req.headers.get('x-api-key') ?? '')
  if (!raw) return json({ ok: false, error: 'Missing agent token' }, 401)
  const hash = await sha256hex(raw)
  const { data: agent } = await admin
    .from('ai_agents')
    .select('id,name,slug,provider,is_active,channel_scope,allow_dms,allowed_actions,require_approval_for,rate_per_min')
    .eq('token_hash', hash)
    .maybeSingle()
  if (!agent || !agent.is_active) return json({ ok: false, error: 'Invalid, revoked, or disabled agent token' }, 401)
  const A = agent as Agent

  // Body
  let body: any
  try { body = await req.json() } catch { return json({ ok: false, error: 'Body must be JSON' }, 400) }
  const action = String(body.action ?? '')
  const idem: string | null =
    (req.headers.get('x-idempotency-key') || (typeof body.idempotency_key === 'string' ? body.idempotency_key : '')) || null

  // Durable audit — always recorded, even on denial/error.
  async function audit(status: string, allowed: boolean, extra: Record<string, unknown> = {}, channelId: string | null = null, error?: string) {
    try {
      await admin.from('ai_audit_logs').insert({
        agent_id: A.id, action: action || '(none)', allowed, status, error: error ?? null,
        correlation_id: correlationId, idempotency_key: idem, source_ip: sourceIp, channel_id: channelId,
        meta: extra,
      })
    } catch { /* never let audit failure break the response */ }
  }
  const deny = (msg: string, code = 403) => { void audit('denied', false, { reason: msg }); return json({ ok: false, error: msg, correlation_id: correlationId }, code) }

  // ── Global kill-switch ────────────────────────────────────────────────────
  const { data: settings } = await admin.from('ai_settings').select('ai_enabled').eq('only_row', true).maybeSingle()
  if (settings && settings.ai_enabled === false) return deny('All AI access is currently disabled by an administrator.', 503)

  // ── Rate limit (per agent, rolling 60s) ───────────────────────────────────
  const since = new Date(Date.now() - 60_000).toISOString()
  const { count: recent } = await admin
    .from('ai_audit_logs').select('id', { count: 'exact', head: true })
    .eq('agent_id', A.id).gte('created_at', since)
  if ((recent ?? 0) >= A.rate_per_min) { await audit('rate_limited', false); return json({ ok: false, error: 'Rate limit exceeded', correlation_id: correlationId }, 429) }

  // ── Permission: action must be allowed for this agent ─────────────────────
  if (!action) return deny('Missing "action"', 400)
  if (!A.allowed_actions.includes(action)) return deny(`Action "${action}" is not permitted for this agent.`)

  // Idempotency replay for writes.
  if (idem) {
    const { data: prior } = await admin
      .from('ai_audit_logs').select('meta,status')
      .eq('agent_id', A.id).eq('idempotency_key', idem).eq('status', 'ok').limit(1).maybeSingle()
    if (prior?.meta && (prior.meta as any).message_id) return json({ ok: true, replayed: true, ...(prior.meta as any), correlation_id: correlationId })
  }

  // Channel resolution + access helpers.
  async function resolveChannel(sel: string): Promise<{ id: string; slug: string; name: string; type: string; is_archived: boolean; ai_excluded: boolean } | null> {
    if (!sel) return null
    let q = admin.from('channels').select('id,slug,name,type,is_archived,ai_excluded')
    q = uuidRe.test(sel) ? q.eq('id', sel) : q.or(`slug.eq.${sel},name.eq.${sel}`)
    const { data } = await q.maybeSingle()
    return (data as any) ?? null
  }
  async function allowedChannelIds(): Promise<string[]> {
    // 'all' → every channel of any type (announcements, location, department, private…) that isn't
    // archived or explicitly AI-excluded. 'all_public' → public channels only. 'listed' → allow-list.
    if (A.channel_scope === 'all') {
      const { data } = await admin.from('channels').select('id').eq('is_archived', false).eq('ai_excluded', false)
      return (data ?? []).map((c: any) => c.id)
    }
    if (A.channel_scope === 'all_public') {
      const { data } = await admin.from('channels').select('id').eq('type', 'public').eq('is_archived', false).eq('ai_excluded', false)
      return (data ?? []).map((c: any) => c.id)
    }
    const { data } = await admin.from('ai_agent_channels').select('channel_id').eq('agent_id', A.id).eq('can_read', true)
    return (data ?? []).map((c: any) => c.channel_id)
  }
  async function canRead(ch: { id: string; type: string; is_archived: boolean; ai_excluded: boolean }): Promise<boolean> {
    if (A.channel_scope === 'all') return !ch.is_archived && !ch.ai_excluded
    if (A.channel_scope === 'all_public') return ch.type === 'public' && !ch.is_archived && !ch.ai_excluded
    const { data } = await admin.from('ai_agent_channels').select('can_read').eq('agent_id', A.id).eq('channel_id', ch.id).maybeSingle()
    return !!data?.can_read
  }
  async function canPost(ch: { id: string; type: string; is_archived: boolean; ai_excluded: boolean }): Promise<boolean> {
    if (ch.is_archived) return false
    if (A.channel_scope === 'all') return !ch.ai_excluded
    if (A.channel_scope === 'all_public') return ch.type === 'public' && !ch.ai_excluded
    const { data } = await admin.from('ai_agent_channels').select('can_post').eq('agent_id', A.id).eq('channel_id', ch.id).maybeSingle()
    return !!data?.can_post
  }
  // Attach display names to a set of message rows without leaking employee impersonation.
  async function withAuthors(rows: any[]): Promise<any[]> {
    const ids = [...new Set(rows.map((r) => r.user_id))]
    const { data: profs } = await admin.from('profiles').select('id,display_name,full_name').in('id', ids)
    const byId = new Map((profs ?? []).map((p: any) => [p.id, p.display_name || p.full_name || 'Unknown']))
    return rows.map((r) => {
      const meta = (r.metadata ?? {}) as any
      const author = meta.ai_agent?.name ? `${meta.ai_agent.name} (AI)` : meta.author_name || meta.slack_author || byId.get(r.user_id) || 'Unknown'
      return {
        id: r.id, author, is_ai: !!meta.ai_agent, body: r.body, created_at: r.created_at,
        parent_message_id: r.parent_message_id, reply_count: r.reply_count,
      }
    })
  }

  try {
    // ── Reads ────────────────────────────────────────────────────────────────
    if (action === 'list_channels') {
      const ids = await allowedChannelIds()
      if (!ids.length) { await audit('ok', true, { count: 0 }); return json({ ok: true, channels: [], correlation_id: correlationId }) }
      const { data } = await admin.from('channels').select('id,slug,name,type,description').in('id', ids).eq('is_archived', false).order('name')
      await audit('ok', true, { count: (data ?? []).length })
      return json({ ok: true, channels: data ?? [], correlation_id: correlationId })
    }

    if (action === 'read_channel_messages') {
      const ch = await resolveChannel(String(body.channel ?? body.channel_id ?? ''))
      if (!ch) return deny('Channel not found', 404)
      if (!(await canRead(ch))) return deny('This agent may not read that channel.')
      const limit = Math.min(Math.max(Number(body.limit) || 30, 1), 100)
      let q = admin.from('messages').select('id,user_id,body,metadata,created_at,parent_message_id,reply_count')
        .eq('channel_id', ch.id).eq('is_deleted', false).order('created_at', { ascending: false }).limit(limit)
      if (body.before) q = q.lt('created_at', String(body.before))
      const { data } = await q
      const msgs = (await withAuthors((data ?? []).reverse()))
      await audit('ok', true, { channel: ch.slug, count: msgs.length }, ch.id)
      return json({ ok: true, channel: { id: ch.id, slug: ch.slug, name: ch.name }, messages: msgs, correlation_id: correlationId })
    }

    if (action === 'read_thread') {
      const rootId = String(body.message_id ?? body.thread_id ?? '')
      if (!uuidRe.test(rootId)) return deny('Provide a valid message_id', 400)
      const { data: root } = await admin.from('messages').select('id,user_id,body,metadata,created_at,parent_message_id,reply_count,channel_id,conversation_id').eq('id', rootId).maybeSingle()
      if (!root) return deny('Message not found', 404)
      if (!root.channel_id) return deny('Threads in direct messages are not accessible via this action.')
      const ch = await resolveChannel(root.channel_id)
      if (!ch || !(await canRead(ch))) return deny('This agent may not read that thread.')
      const { data: replies } = await admin.from('messages').select('id,user_id,body,metadata,created_at,parent_message_id,reply_count')
        .eq('parent_message_id', rootId).eq('is_deleted', false).order('created_at', { ascending: true })
      const out = await withAuthors([root, ...(replies ?? [])])
      await audit('ok', true, { root: rootId, replies: (replies ?? []).length }, ch.id)
      return json({ ok: true, root: out[0], replies: out.slice(1), correlation_id: correlationId })
    }

    if (action === 'search_messages') {
      const query = String(body.query ?? '').trim()
      if (!query) return deny('Provide a "query"', 400)
      const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 50)
      let ids = await allowedChannelIds()
      if (body.channel) {
        const ch = await resolveChannel(String(body.channel))
        if (!ch || !(await canRead(ch))) return deny('This agent may not search that channel.')
        ids = [ch.id]
      }
      if (!ids.length) { await audit('ok', true, { count: 0 }); return json({ ok: true, results: [], correlation_id: correlationId }) }
      const { data } = await admin.from('messages').select('id,user_id,body,metadata,created_at,parent_message_id,reply_count,channel_id')
        .in('channel_id', ids).eq('is_deleted', false).ilike('body', `%${query}%`).order('created_at', { ascending: false }).limit(limit)
      const results = await withAuthors(data ?? [])
      await audit('ok', true, { query, count: results.length })
      return json({ ok: true, results, correlation_id: correlationId })
    }

    // ── Writes ────────────────────────────────────────────────────────────────
    const aiTag = { slug: A.slug, name: A.name, provider: A.provider }

    async function insertMessage(target: { channel_id?: string; conversation_id?: string }, opts: { text: string; html?: string; title?: string; author_name?: string; parent?: string; items?: InAttachment[] }) {
      const metadata: Record<string, unknown> = {
        via_api: true, ai_agent: aiTag, author_name: opts.author_name || A.name,
        ...(opts.html ? { format: 'html', html: opts.html, card_title: opts.title } : {}),
      }
      const { data, error } = await admin.from('messages')
        .insert({ ...target, user_id: BOT_ID, body: opts.text, parent_message_id: opts.parent ?? null, metadata })
        .select('id').single()
      if (error) throw error
      const id = data.id as string
      let attachments: { saved: number; skipped: number } | undefined
      if (opts.items?.length) attachments = await saveAttachments(admin, { message_id: id, channel_id: target.channel_id ?? null, conversation_id: target.conversation_id ?? null, uploader_id: BOT_ID }, opts.items)
      return { id, attachments }
    }

    // Sensitive-action gate: queue for human approval instead of executing.
    async function queueApproval(payload: Record<string, unknown>, preview: string) {
      const { data } = await admin.from('ai_action_approvals')
        .insert({ agent_id: A.id, action, payload: { ...payload, ai_agent: aiTag }, preview }).select('id').single()
      await audit('pending_approval', true, { approval_id: data?.id })
      return json({ ok: true, status: 'pending_approval', approval_id: data?.id, correlation_id: correlationId })
    }

    if (action === 'post_message') {
      const ch = await resolveChannel(String(body.channel ?? body.channel_id ?? ''))
      if (!ch) return deny('Channel not found', 404)
      if (!(await canPost(ch))) return deny('This agent may not post to that channel.')
      const html = typeof body.html === 'string' && body.html.trim() ? body.html : undefined
      const items = parseJsonAttachments(body.attachments ?? body.files)
      let text = String(body.text ?? body.message ?? (html ? htmlToText(html) : '')).trim()
      if (!text && items.length) text = items.length === 1 ? '📎 Attachment' : `📎 ${items.length} attachments`
      if (!text) return deny('Provide "text", "html", or "attachments"', 400)
      if (A.require_approval_for.includes('post_message'))
        return await queueApproval({ channel_id: ch.id, text, author_name: body.author_name }, `Post to #${ch.slug}: ${text.slice(0, 140)}`)
      const { id, attachments } = await insertMessage({ channel_id: ch.id }, { text, html, title: body.title, author_name: body.author_name, items })
      await admin.from('ai_agents').update({ last_used_at: new Date().toISOString() }).eq('id', A.id)
      await audit('ok', true, { message_id: id, channel: ch.slug, attachments }, ch.id)
      return json({ ok: true, message_id: id, channel_id: ch.id, attachments, correlation_id: correlationId })
    }

    if (action === 'reply_thread') {
      const parentId = String(body.message_id ?? body.parent_message_id ?? '')
      if (!uuidRe.test(parentId)) return deny('Provide a valid message_id to reply to', 400)
      const { data: parent } = await admin.from('messages').select('id,channel_id').eq('id', parentId).maybeSingle()
      if (!parent || !parent.channel_id) return deny('Parent message not found (or is a DM).', 404)
      const ch = await resolveChannel(parent.channel_id)
      if (!ch || !(await canPost(ch))) return deny('This agent may not reply in that channel.')
      const items = parseJsonAttachments(body.attachments ?? body.files)
      let text = String(body.text ?? body.message ?? '').trim()
      if (!text && items.length) text = items.length === 1 ? '📎 Attachment' : `📎 ${items.length} attachments`
      if (!text) return deny('Provide "text" or "attachments"', 400)
      if (A.require_approval_for.includes('reply_thread'))
        return await queueApproval({ channel_id: ch.id, parent_message_id: parentId, text }, `Reply in #${ch.slug}: ${text.slice(0, 140)}`)
      const { id, attachments } = await insertMessage({ channel_id: ch.id }, { text, parent: parentId, items })
      await audit('ok', true, { message_id: id, parent: parentId, attachments }, ch.id)
      return json({ ok: true, message_id: id, parent_message_id: parentId, attachments, correlation_id: correlationId })
    }

    if (action === 'send_dm') {
      if (!A.allow_dms) return deny('This agent is not permitted to send direct messages.')
      const email = String(body.to_email ?? '').trim()
      const items = parseJsonAttachments(body.attachments ?? body.files)
      let text = String(body.text ?? body.message ?? '').trim()
      if (!text && items.length) text = items.length === 1 ? '📎 Attachment' : `📎 ${items.length} attachments`
      if (!email || !text) return deny('Provide "to_email" and "text" (or "attachments")', 400)
      const { data: user } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
      if (!user) return deny(`No user with email ${email}`, 404)
      const memberKey = [BOT_ID, user.id].sort().join(':')
      let convId: string
      const { data: existing } = await admin.from('direct_conversations').select('id').eq('is_group', false).eq('member_key', memberKey).maybeSingle()
      if (existing) convId = existing.id
      else {
        const { data: conv, error } = await admin.from('direct_conversations').insert({ is_group: false, member_key: memberKey, created_by: BOT_ID }).select('id').single()
        if (error) throw error
        convId = conv.id
        await admin.from('direct_conversation_members').insert([{ conversation_id: convId, user_id: BOT_ID }, { conversation_id: convId, user_id: user.id }])
      }
      const { id, attachments } = await insertMessage({ conversation_id: convId }, { text, author_name: body.author_name, items })
      await audit('ok', true, { message_id: id, conversation_id: convId, attachments })
      return json({ ok: true, message_id: id, conversation_id: convId, attachments, correlation_id: correlationId })
    }

    if (action === 'send_group_dm') {
      if (!A.allow_dms) return deny('This agent is not permitted to send direct messages.')
      const emails: string[] = Array.isArray(body.to_emails)
        ? body.to_emails.map((e: unknown) => String(e).trim()).filter(Boolean)
        : (typeof body.to_emails === 'string' ? String(body.to_emails).split(',').map((e) => e.trim()).filter(Boolean) : [])
      const items = parseJsonAttachments(body.attachments ?? body.files)
      let text = String(body.text ?? body.message ?? '').trim()
      if (!text && items.length) text = items.length === 1 ? '📎 Attachment' : `📎 ${items.length} attachments`
      if (emails.length < 1 || !text) return deny('Provide "to_emails" (array or comma list) and "text" (or "attachments")', 400)
      const memberIds: string[] = []
      const notFound: string[] = []
      for (const em of emails) {
        const { data: u } = await admin.from('profiles').select('id').ilike('email', em).maybeSingle()
        if (u) memberIds.push(u.id); else notFound.push(em)
      }
      if (!memberIds.length) return deny(`No matching users for: ${notFound.join(', ')}`, 404)
      const allMembers = [...new Set([BOT_ID, ...memberIds])]
      const memberKey = [...allMembers].sort().join(':')
      let convId: string
      const { data: existing } = await admin.from('direct_conversations').select('id').eq('is_group', true).eq('member_key', memberKey).maybeSingle()
      if (existing) convId = existing.id
      else {
        const { data: conv, error } = await admin.from('direct_conversations')
          .insert({ is_group: true, title: body.title ?? null, member_key: memberKey, created_by: BOT_ID }).select('id').single()
        if (error) throw error
        convId = conv.id
        await admin.from('direct_conversation_members').insert(allMembers.map((uid) => ({ conversation_id: convId, user_id: uid })))
      }
      const { id, attachments } = await insertMessage({ conversation_id: convId }, { text, author_name: body.author_name, items })
      await audit('ok', true, { message_id: id, conversation_id: convId, members: memberIds.length, not_found: notFound, attachments })
      return json({ ok: true, message_id: id, conversation_id: convId, members: memberIds.length, not_found: notFound, attachments, correlation_id: correlationId })
    }

    if (action === 'create_task') {
      const title = String(body.title ?? '').trim()
      if (!title) return deny('Provide "title"', 400)
      let channelId: string | null = null
      if (body.channel) { const ch = await resolveChannel(String(body.channel)); channelId = ch?.id ?? null }
      let assignee: string | null = null
      if (body.assignee_email) { const { data: u } = await admin.from('profiles').select('id').ilike('email', String(body.assignee_email)).maybeSingle(); assignee = u?.id ?? null }
      const { data, error } = await admin.from('ai_tasks').insert({ agent_id: A.id, title, body: body.body ?? null, channel_id: channelId, assignee_id: assignee, external_ref: body.external_ref ?? null }).select('id,status').single()
      if (error) throw error
      await audit('ok', true, { task_id: data.id })
      return json({ ok: true, task_id: data.id, status: data.status, correlation_id: correlationId })
    }

    if (action === 'update_task') {
      const taskId = String(body.task_id ?? '')
      if (!uuidRe.test(taskId)) return deny('Provide a valid task_id', 400)
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (body.status) patch.status = String(body.status)
      if (body.title) patch.title = String(body.title)
      if (body.body !== undefined) patch.body = body.body
      const { data, error } = await admin.from('ai_tasks').update(patch).eq('id', taskId).select('id,status').maybeSingle()
      if (error) throw error
      if (!data) return deny('Task not found', 404)
      await audit('ok', true, { task_id: taskId, status: data.status })
      return json({ ok: true, task_id: taskId, status: data.status, correlation_id: correlationId })
    }

    if (action === 'request_approval') {
      const reqAction = String(body.request_action ?? body.for_action ?? 'custom')
      const preview = String(body.preview ?? '').slice(0, 500)
      const { data } = await admin.from('ai_action_approvals').insert({ agent_id: A.id, action: reqAction, payload: { ...(body.payload ?? {}), ai_agent: aiTag }, preview }).select('id').single()
      await audit('ok', true, { approval_id: data?.id })
      return json({ ok: true, approval_id: data?.id, status: 'pending', correlation_id: correlationId })
    }

    if (action === 'list_approvals') {
      const { data } = await admin.from('ai_action_approvals').select('id,action,preview,status,requested_at').eq('agent_id', A.id).eq('status', 'pending').order('requested_at', { ascending: false }).limit(50)
      await audit('ok', true, { count: (data ?? []).length })
      return json({ ok: true, approvals: data ?? [], correlation_id: correlationId })
    }

    return deny(`Unknown action "${action}"`, 400)
  } catch (e) {
    const msg = String((e as Error).message ?? e)
    await audit('error', false, {}, null, msg)
    return json({ ok: false, error: msg, correlation_id: correlationId }, 500)
  }
})
