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
// Writes accept an optional "report" string (stored on the message metadata) used to tag automated
// reports (e.g. "monthly_stylist") so downstream mirroring/routing can key off it. send_dm and
// post_message also accept "html" to render a rich card.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const BOT_ID = '00000000-0000-4000-8000-00000000b010' // the inactive "Integrations" account AI posts as
const FALLBACK_FORWARD = 'e9e00d78-8935-4ff2-a43a-9605786062c0' // Leadership & Operations — catch-all for dead channels

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
  post_as_user_id: string | null
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

  let body: any
  try { body = await req.json() } catch { return json({ ok: false, error: 'Body must be JSON' }, 400) }

  // ── Authenticate the agent ────────────────────────────────────────────────
  const authz = req.headers.get('authorization') ?? ''
  const raw =
    (authz.toLowerCase().startsWith('bearer ') ? authz.slice(authz.indexOf(' ') + 1).trim() : '') ||
    (req.headers.get('x-api-key') ?? '') ||
    (typeof body?.token === 'string' ? body.token.trim() : '') ||
    (typeof body?.key === 'string' ? body.key.trim() : '')
  if (!raw) return json({ ok: false, error: 'Missing agent token' }, 401)
  const hash = await sha256hex(raw)
  const { data: agent } = await admin
    .from('ai_agents')
    .select('id,name,slug,provider,is_active,channel_scope,allow_dms,allowed_actions,require_approval_for,rate_per_min,post_as_user_id')
    .eq('token_hash', hash)
    .maybeSingle()
  if (!agent || !agent.is_active) return json({ ok: false, error: 'Invalid, revoked, or disabled agent token' }, 401)
  const A = agent as Agent
  // The identity this agent posts AS. Defaults to the shared Integrations bot; agents like Chief post
  // as their own user (post_as_user_id) so their messages/DMs render as that person, not a system bot.
  const POSTER = A.post_as_user_id ?? BOT_ID

  const action = String(body.action ?? '')
  const idem: string | null =
    (req.headers.get('x-idempotency-key') || (typeof body.idempotency_key === 'string' ? body.idempotency_key : '')) || null
  const reportTag = typeof body.report === 'string' && body.report.trim() ? body.report.trim().slice(0, 60) : undefined

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

  const { data: settings } = await admin.from('ai_settings').select('ai_enabled').eq('only_row', true).maybeSingle()
  if (settings && settings.ai_enabled === false) return deny('All AI access is currently disabled by an administrator.', 503)

  const since = new Date(Date.now() - 60_000).toISOString()
  const { count: recent } = await admin
    .from('ai_audit_logs').select('id', { count: 'exact', head: true })
    .eq('agent_id', A.id).gte('created_at', since)
  if ((recent ?? 0) >= A.rate_per_min) { await audit('rate_limited', false); return json({ ok: false, error: 'Rate limit exceeded', correlation_id: correlationId }, 429) }

  if (!action) return deny('Missing "action"', 400)
  if (!A.allowed_actions.includes(action)) return deny(`Action "${action}" is not permitted for this agent.`)

  if (idem) {
    const { data: prior } = await admin
      .from('ai_audit_logs').select('meta,status')
      .eq('agent_id', A.id).eq('idempotency_key', idem).eq('status', 'ok').limit(1).maybeSingle()
    if (prior?.meta && (prior.meta as any).message_id) return json({ ok: true, replayed: true, ...(prior.meta as any), correlation_id: correlationId })
  }

  type Chan = { id: string; slug: string; name: string; type: string; is_archived: boolean; ai_excluded: boolean; forward_to_channel_id: string | null }

  async function resolveChannel(sel: string): Promise<Chan | null> {
    if (!sel) return null
    const s = sel.trim()
    if (uuidRe.test(s)) {
      const { data } = await admin.from('channels').select('id,slug,name,type,is_archived,ai_excluded,forward_to_channel_id').eq('id', s).maybeSingle()
      return (data as any) ?? null
    }
    const { data } = await admin.from('channels').select('id,slug,name,type,is_archived,ai_excluded,forward_to_channel_id')
    const list = (data ?? []) as Chan[]
    const norm = (x: string) => x.toLowerCase().replace(/^#/, '').trim()
    const slugify = (x: string) => norm(x).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const t = norm(s)
    const ts = slugify(s)
    return (
      list.find((c) => c.slug.toLowerCase() === t) ??
      list.find((c) => c.name.toLowerCase() === t) ??
      list.find((c) => slugify(c.name) === ts) ??
      list.find((c) => c.slug.toLowerCase() === ts) ??
      null
    )
  }
  async function followForward(ch: Chan): Promise<Chan> {
    let cur = ch
    let hops = 0
    while (cur.is_archived && cur.forward_to_channel_id && hops++ < 5) {
      const next = await resolveChannel(cur.forward_to_channel_id)
      if (!next || next.id === cur.id) break
      cur = next
    }
    if (cur.is_archived) {
      const fb = await resolveChannel(FALLBACK_FORWARD)
      if (fb && !fb.is_archived) return fb
    }
    return cur
  }
  async function allowedChannelIds(): Promise<string[]> {
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
  async function withAuthors(rows: any[]): Promise<any[]> {
    const ids = [...new Set(rows.map((r) => r.user_id))]
    const { data: profs } = await admin.from('profiles').select('id,display_name,full_name').in('id', ids)
    const byId = new Map((profs ?? []).map((p: any) => [p.id, p.display_name || p.full_name || 'Unknown']))
    return rows.map((r) => {
      const meta = (r.metadata ?? {}) as any
      const author = meta.ai_agent
        ? `${meta.author_name || meta.ai_agent.name} (AI)`
        : (meta.author_name || meta.slack_author || byId.get(r.user_id) || 'Unknown')
      return {
        id: r.id, author, is_ai: !!meta.ai_agent, body: r.body, created_at: r.created_at,
        parent_message_id: r.parent_message_id, reply_count: r.reply_count,
      }
    })
  }

  try {
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

    if (action === 'list_users') {
      const q = String(body.query ?? '').trim().toLowerCase()
      const includeInactive = body.include_inactive === true
      const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500)
      let sel = admin.from('profiles').select('id,display_name,full_name,email,phone,role,secondary_role,access_level,location_id,department_id,is_active').order('full_name')
      if (!includeInactive) sel = sel.eq('is_active', true)
      const { data } = await sel.limit(500)
      const [{ data: locs }, { data: deps }] = await Promise.all([
        admin.from('locations').select('id,name'),
        admin.from('departments').select('id,name'),
      ])
      const locName = new Map((locs ?? []).map((l: any) => [l.id, l.name]))
      const depName = new Map((deps ?? []).map((d: any) => [d.id, d.name]))
      let rows = ((data ?? []) as any[]).map((p) => ({
        id: p.id, display_name: p.display_name, full_name: p.full_name, email: p.email, phone: p.phone,
        role: p.role, secondary_role: p.secondary_role, access_level: p.access_level,
        location: p.location_id ? locName.get(p.location_id) ?? null : null,
        department: p.department_id ? depName.get(p.department_id) ?? null : null,
        is_active: p.is_active,
      }))
      if (q) rows = rows.filter((p) => `${p.full_name ?? ''} ${p.display_name ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q))
      rows = rows.slice(0, limit)
      await audit('ok', true, { count: rows.length })
      return json({ ok: true, users: rows, correlation_id: correlationId })
    }

    if (action === 'read_dm' || action === 'read_direct_messages') {
      // Read the messages of a DM the AGENT (the bot account) is part of — so a project can find the
      // id of a DM it sent (e.g. to delete or follow up on it). Scope: only 1:1/group conversations the
      // bot participates in. Resolve by explicit conversation_id, or by the counterpart's id/email.
      if (!A.allow_dms) return deny('This agent is not permitted to access direct messages.')
      const limit = Math.min(Math.max(Number(body.limit) || 30, 1), 100)
      let convId: string | null = uuidRe.test(String(body.conversation_id ?? '')) ? String(body.conversation_id) : null
      if (!convId) {
        let otherId: string | null = null
        if (uuidRe.test(String(body.with_user_id ?? body.to_user_id ?? ''))) otherId = String(body.with_user_id ?? body.to_user_id)
        else {
          const email = String(body.with_email ?? body.to_email ?? '').trim()
          if (email) {
            const { data: u } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
            if (!u) return deny(`No user with email ${email}`, 404)
            otherId = u.id
          }
        }
        if (!otherId) return deny('Provide "conversation_id", "with_user_id", or "with_email"', 400)
        const memberKey = [POSTER, otherId].sort().join(':')
        const { data: conv } = await admin.from('direct_conversations').select('id').eq('is_group', false).eq('member_key', memberKey).maybeSingle()
        if (!conv) { await audit('ok', true, { messages: 0 }); return json({ ok: true, conversation_id: null, messages: [], correlation_id: correlationId }) }
        convId = conv.id
      }
      const { data: mem } = await admin.from('direct_conversation_members').select('user_id').eq('conversation_id', convId).eq('user_id', POSTER).maybeSingle()
      if (!mem) return deny('This agent is not a participant in that conversation.')
      let q = admin.from('messages').select('id,user_id,body,metadata,created_at,parent_message_id,reply_count')
        .eq('conversation_id', convId).order('created_at', { ascending: false }).limit(limit)
      if (body.include_deleted !== true) q = q.eq('is_deleted', false)
      if (body.before) q = q.lt('created_at', String(body.before))
      const { data } = await q
      const msgs = await withAuthors((data ?? []).reverse())
      await audit('ok', true, { conversation_id: convId, count: msgs.length })
      return json({ ok: true, conversation_id: convId, messages: msgs, correlation_id: correlationId })
    }

    // ── Writes ────────────────────────────────────────────────────────────────
    const aiTag = { slug: A.slug, name: A.name, provider: A.provider }

    async function insertMessage(target: { channel_id?: string; conversation_id?: string }, opts: { text: string; html?: string; title?: string; author_name?: string; parent?: string; items?: InAttachment[]; report?: string }) {
      const metadata: Record<string, unknown> = {
        via_api: true, ai_agent: aiTag, author_name: opts.author_name || A.name,
        ...(opts.html ? { format: 'html', html: opts.html, card_title: opts.title } : {}),
        ...(opts.report ? { report: opts.report } : {}),
      }
      const { data, error } = await admin.from('messages')
        .insert({ ...target, user_id: POSTER, body: opts.text, parent_message_id: opts.parent ?? null, metadata })
        .select('id').single()
      if (error) throw error
      const id = data.id as string
      let attachments: { saved: number; skipped: number } | undefined
      if (opts.items?.length) attachments = await saveAttachments(admin, { message_id: id, channel_id: target.channel_id ?? null, conversation_id: target.conversation_id ?? null, uploader_id: POSTER }, opts.items)
      return { id, attachments }
    }

    async function queueApproval(payload: Record<string, unknown>, preview: string) {
      const { data } = await admin.from('ai_action_approvals')
        .insert({ agent_id: A.id, action, payload: { ...payload, ai_agent: aiTag }, preview }).select('id').single()
      await audit('pending_approval', true, { approval_id: data?.id })
      return json({ ok: true, status: 'pending_approval', approval_id: data?.id, correlation_id: correlationId })
    }

    if (action === 'post_message') {
      let ch = await resolveChannel(String(body.channel ?? body.channel_id ?? ''))
      if (!ch) return deny('Channel not found', 404)
      const original = ch
      ch = await followForward(ch)
      if (!(await canPost(ch))) return deny('This agent may not post to that channel.')
      const html = typeof body.html === 'string' && body.html.trim() ? body.html : undefined
      const items = parseJsonAttachments(body.attachments ?? body.files)
      let text = String(body.text ?? body.message ?? (html ? htmlToText(html) : '')).trim()
      if (!text && items.length) text = items.length === 1 ? '📎 Attachment' : `📎 ${items.length} attachments`
      if (!text) return deny('Provide "text", "html", or "attachments"', 400)
      if (A.require_approval_for.includes('post_message'))
        return await queueApproval({ channel_id: ch.id, text, author_name: body.author_name }, `Post to #${ch.slug}: ${text.slice(0, 140)}`)
      const { id, attachments } = await insertMessage({ channel_id: ch.id }, { text, html, title: body.title, author_name: body.author_name, items, report: reportTag })
      await admin.from('ai_agents').update({ last_used_at: new Date().toISOString() }).eq('id', A.id)
      const forwarded = original.id !== ch.id
      await audit('ok', true, { message_id: id, channel: ch.slug, forwarded_from: forwarded ? original.slug : undefined, attachments }, ch.id)
      return json({ ok: true, message_id: id, channel_id: ch.id, forwarded_from: forwarded ? original.slug : undefined, attachments, correlation_id: correlationId })
    }

    if (action === 'reply_thread') {
      const parentId = String(body.message_id ?? body.parent_message_id ?? '')
      if (!uuidRe.test(parentId)) return deny('Provide a valid message_id to reply to', 400)
      const { data: parent } = await admin.from('messages').select('id,channel_id,conversation_id').eq('id', parentId).maybeSingle()
      if (!parent) return deny('Parent message not found.', 404)
      if (parent.channel_id) {
        const ch = await resolveChannel(parent.channel_id)
        if (!ch || !(await canPost(ch))) return deny('This agent may not reply in that channel.')
        const items = parseJsonAttachments(body.attachments ?? body.files)
        let text = String(body.text ?? body.message ?? '').trim()
        if (!text && items.length) text = items.length === 1 ? '📎 Attachment' : `📎 ${items.length} attachments`
        if (!text) return deny('Provide "text" or "attachments"', 400)
        if (A.require_approval_for.includes('reply_thread'))
          return await queueApproval({ channel_id: ch.id, parent_message_id: parentId, text }, `Reply in #${ch.slug}: ${text.slice(0, 140)}`)
        const { id, attachments } = await insertMessage({ channel_id: ch.id }, { text, parent: parentId, items, report: reportTag })
        await audit('ok', true, { message_id: id, parent: parentId, attachments }, ch.id)
        return json({ ok: true, message_id: id, parent_message_id: parentId, attachments, correlation_id: correlationId })
      }
      if (parent.conversation_id) {
        if (!A.allow_dms) return deny('This agent is not permitted to reply in direct messages.')
        const { data: mem } = await admin.from('direct_conversation_members').select('user_id').eq('conversation_id', parent.conversation_id).eq('user_id', POSTER).maybeSingle()
        if (!mem) return deny('This agent is not a participant in that conversation.')
        const items = parseJsonAttachments(body.attachments ?? body.files)
        let text = String(body.text ?? body.message ?? '').trim()
        if (!text && items.length) text = items.length === 1 ? '📎 Attachment' : `📎 ${items.length} attachments`
        if (!text) return deny('Provide "text" or "attachments"', 400)
        const { id, attachments } = await insertMessage({ conversation_id: parent.conversation_id }, { text, parent: parentId, items, report: reportTag })
        await audit('ok', true, { message_id: id, parent: parentId, conversation_id: parent.conversation_id, attachments })
        return json({ ok: true, message_id: id, parent_message_id: parentId, conversation_id: parent.conversation_id, attachments, correlation_id: correlationId })
      }
      return deny('Parent message has no channel or conversation.', 400)
    }

    if (action === 'delete_message' || action === 'delete_messages') {
      const rawIds: string[] = Array.isArray(body.message_ids)
        ? body.message_ids.map((x: unknown) => String(x))
        : (body.message_id != null ? [String(body.message_id)] : [])
      const ids = [...new Set(rawIds.filter((x) => uuidRe.test(x)))]
      if (!ids.length) return deny('Provide "message_id" or "message_ids" (UUIDs)', 400)
      if (ids.length > 50) return deny('Delete at most 50 messages per call.', 400)
      const onlyOwn = body.only_own === true

      const { data: rows } = await admin.from('messages')
        .select('id,user_id,channel_id,conversation_id,is_deleted,metadata').in('id', ids)
      const byId = new Map(((rows ?? []) as any[]).map((r) => [r.id, r]))

      const results: Array<{ message_id: string; deleted: boolean; reason?: string }> = []
      const toDelete: string[] = []
      const channelsTouched = new Set<string>()
      let sawForeign = false
      for (const id of ids) {
        const m = byId.get(id)
        if (!m) { results.push({ message_id: id, deleted: false, reason: 'not found' }); continue }
        if (m.is_deleted) { results.push({ message_id: id, deleted: true, reason: 'already deleted' }); continue }
        if (m.channel_id) {
          const ch = await resolveChannel(m.channel_id)
          if (!ch || !(await canPost(ch))) { results.push({ message_id: id, deleted: false, reason: 'not permitted in this channel' }); continue }
          channelsTouched.add(ch.id)
        } else if (m.conversation_id) {
          if (!A.allow_dms) { results.push({ message_id: id, deleted: false, reason: 'DMs not permitted for this agent' }); continue }
          const { data: mem } = await admin.from('direct_conversation_members').select('user_id').eq('conversation_id', m.conversation_id).eq('user_id', POSTER).maybeSingle()
          if (!mem) { results.push({ message_id: id, deleted: false, reason: 'not a participant in this conversation' }); continue }
        } else { results.push({ message_id: id, deleted: false, reason: 'message has no channel or conversation' }); continue }
        const meta = (m.metadata ?? {}) as any
        const isBotPost = m.user_id === POSTER && !!meta.ai_agent
        if (onlyOwn && !isBotPost) { results.push({ message_id: id, deleted: false, reason: 'not an AI-posted message (only_own set)' }); continue }
        if (!isBotPost) sawForeign = true
        toDelete.push(id)
      }

      if (sawForeign && A.require_approval_for.includes('delete_message') && toDelete.length) {
        const { data: appr } = await admin.from('ai_action_approvals')
          .insert({ agent_id: A.id, action: 'delete_message', payload: { message_ids: toDelete, ai_agent: aiTag }, preview: `Delete ${toDelete.length} message(s) (includes non-AI messages)` })
          .select('id').single()
        await audit('pending_approval', true, { approval_id: appr?.id, message_ids: toDelete })
        return json({ ok: true, status: 'pending_approval', approval_id: appr?.id, requested: ids.length, correlation_id: correlationId })
      }

      for (const id of toDelete) {
        const { error } = await admin.from('messages').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id).eq('is_deleted', false)
        if (error) results.push({ message_id: id, deleted: false, reason: error.message })
        else results.push({ message_id: id, deleted: true })
      }
      const deleted = results.filter((r) => r.deleted && r.reason !== 'already deleted').length
      await admin.from('ai_agents').update({ last_used_at: new Date().toISOString() }).eq('id', A.id)
      await audit('ok', true, { deleted, requested: ids.length, results }, channelsTouched.size === 1 ? [...channelsTouched][0] : null)
      return json({ ok: true, deleted, requested: ids.length, results, correlation_id: correlationId })
    }

    if (action === 'send_dm') {
      if (!A.allow_dms) return deny('This agent is not permitted to send direct messages.')
      const items = parseJsonAttachments(body.attachments ?? body.files)
      const html = typeof body.html === 'string' && body.html.trim() ? body.html : undefined
      let text = String(body.text ?? body.message ?? (html ? htmlToText(html) : '')).trim()
      if (!text && items.length) text = items.length === 1 ? '📎 Attachment' : `📎 ${items.length} attachments`
      let user: { id: string } | null = null
      if (uuidRe.test(String(body.to_user_id ?? ''))) {
        const { data } = await admin.from('profiles').select('id').eq('id', String(body.to_user_id)).maybeSingle()
        if (!data) return deny('No user with that id', 404)
        user = data
      } else {
        const email = String(body.to_email ?? '').trim()
        if (!email) return deny('Provide "to_user_id" or "to_email"', 400)
        const { data } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
        if (!data) return deny(`No user with email ${email}`, 404)
        user = data
      }
      if (!text) return deny('Provide "text", "html", or "attachments"', 400)
      const memberKey = [POSTER, user.id].sort().join(':')
      let convId: string
      const { data: existing } = await admin.from('direct_conversations').select('id').eq('is_group', false).eq('member_key', memberKey).maybeSingle()
      if (existing) convId = existing.id
      else {
        const { data: conv, error } = await admin.from('direct_conversations').insert({ is_group: false, member_key: memberKey, created_by: POSTER }).select('id').single()
        if (error) throw error
        convId = conv.id
        await admin.from('direct_conversation_members').insert([{ conversation_id: convId, user_id: POSTER }, { conversation_id: convId, user_id: user.id }])
      }
      const { id, attachments } = await insertMessage({ conversation_id: convId }, { text, html, title: body.title, author_name: body.author_name, items, report: reportTag })
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
      const userIds: string[] = Array.isArray(body.to_user_ids) ? body.to_user_ids.map((x: unknown) => String(x)).filter((x: string) => uuidRe.test(x)) : []
      if (userIds.length < 1 && emails.length < 1) return deny('Provide "to_user_ids" or "to_emails", plus "text" (or "attachments")', 400)
      if (!text) return deny('Provide "text" or "attachments"', 400)
      const memberIds: string[] = []
      const notFound: string[] = []
      for (const uid of userIds) {
        const { data: u } = await admin.from('profiles').select('id').eq('id', uid).maybeSingle()
        if (u) memberIds.push(u.id); else notFound.push(uid)
      }
      for (const em of emails) {
        const { data: u } = await admin.from('profiles').select('id').ilike('email', em).maybeSingle()
        if (u) memberIds.push(u.id); else notFound.push(em)
      }
      if (!memberIds.length) return deny(`No matching users for: ${notFound.join(', ')}`, 404)
      const allMembers = [...new Set([POSTER, ...memberIds])]
      const memberKey = [...allMembers].sort().join(':')
      let convId: string
      const { data: existing } = await admin.from('direct_conversations').select('id').eq('is_group', true).eq('member_key', memberKey).maybeSingle()
      if (existing) convId = existing.id
      else {
        const { data: conv, error } = await admin.from('direct_conversations')
          .insert({ is_group: true, title: body.title ?? null, member_key: memberKey, created_by: POSTER }).select('id').single()
        if (error) throw error
        convId = conv.id
        await admin.from('direct_conversation_members').insert(allMembers.map((uid) => ({ conversation_id: convId, user_id: uid })))
      }
      const { id, attachments } = await insertMessage({ conversation_id: convId }, { text, author_name: body.author_name, items, report: reportTag })
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

    if (action === 'register_webhook') {
      const url = String(body.url ?? '').trim()
      if (!/^https:\/\//i.test(url)) return deny('Provide a valid https "url"', 400)
      const projectName = (String(body.project_name ?? body.author_name ?? A.name).trim() || A.name)
      const secret = typeof body.secret === 'string' && body.secret.trim() ? body.secret.trim() : null
      const events = Array.isArray(body.events) && body.events.length ? body.events.map((e: unknown) => String(e)) : ['message.created']
      const slug = (projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40)) || A.slug
      let { data: ch } = await admin.from('channels').select('id,slug').eq('slug', slug).maybeSingle()
      if (!ch) {
        const { data: created, error: cerr } = await admin.from('channels').insert({
          slug, name: projectName, type: 'private',
          description: `Type here to command ${projectName}. It reads messages here as instructions and replies back.`,
          category: 'AI Command Consoles', min_access_rank: 40, created_by: BOT_ID,
        }).select('id,slug').single()
        if (cerr) throw cerr
        ch = created
      }
      const key = projectName.toLowerCase()
      const { data: existing } = await admin.from('project_webhooks').select('id').eq('project_key', key).maybeSingle()
      if (existing) {
        await admin.from('project_webhooks').update({ agent_id: A.id, url, secret, events, command_channel_id: ch!.id, is_active: true, updated_at: new Date().toISOString() }).eq('id', existing.id)
      } else {
        await admin.from('project_webhooks').insert({ project_name: projectName, agent_id: A.id, url, secret, events, command_channel_id: ch!.id })
      }
      await audit('ok', true, { project: projectName, command_channel: ch!.slug })
      return json({ ok: true, command_channel: ch!.slug, command_channel_id: ch!.id, events, correlation_id: correlationId })
    }

    if (action === 'create_channel') {
      const name = String(body.name ?? body.channel_name ?? body.title ?? '').trim()
      if (!name) return deny('Provide "name"', 400)
      const vis = String(body.type ?? body.visibility ?? 'public').toLowerCase()
      const type = vis === 'private' ? 'private' : 'public'
      const description = typeof body.description === 'string' ? body.description.trim().slice(0, 300) : null

      async function addOwnersAndBot(channelId: string) {
        const { data: owners } = await admin.from('profiles').select('id').eq('access_level', 'owner').eq('is_active', true)
        const ids = [...new Set([BOT_ID, ...((owners ?? []) as any[]).map((o) => o.id)])]
        await admin.from('channel_members').upsert(ids.map((uid) => ({ channel_id: channelId, user_id: uid })), { onConflict: 'channel_id,user_id', ignoreDuplicates: true })
      }

      const found = await resolveChannel(name)
      if (found) {
        await addOwnersAndBot(found.id)
        await audit('ok', true, { channel: found.slug, existed: true }, found.id)
        return json({ ok: true, channel: { id: found.id, slug: found.slug, name: found.name, type: found.type }, existed: true, correlation_id: correlationId })
      }

      const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'channel'
      let created: { id: string; slug: string; name: string; type: string } | null = null
      for (let i = 0; i < 6 && !created; i++) {
        const trySlug = (i === 0 ? base : `${base}-${i + 1}`).slice(0, 48)
        const { data, error } = await admin.from('channels')
          .insert({ slug: trySlug, name, type, description, created_by: BOT_ID })
          .select('id,slug,name,type').single()
        if (!error && data) { created = data as any; break }
        if (error && !/duplicate|unique/i.test(String(error.message))) throw error
      }
      if (!created) return deny('Could not create channel — that name is already taken.', 409)
      await addOwnersAndBot(created.id)
      await audit('ok', true, { channel: created.slug, type }, created.id)
      return json({ ok: true, channel: created, correlation_id: correlationId })
    }

    if (action === 'delete_channel' || action === 'archive_channel') {
      const ch = await resolveChannel(String(body.channel ?? body.channel_id ?? body.name ?? ''))
      if (!ch) return deny('Channel not found', 404)
      if (ch.type === 'announcement') return deny('Announcement/urgent channels cannot be archived via the API.')
      if (!(await canPost(ch))) return deny('This agent may not manage that channel.')
      if (A.require_approval_for.includes('delete_channel'))
        return await queueApproval({ channel_id: ch.id, slug: ch.slug }, `Archive #${ch.slug}`)
      const { error } = await admin.from('channels').update({ is_archived: true }).eq('id', ch.id)
      if (error) throw error
      await admin.from('ai_agents').update({ last_used_at: new Date().toISOString() }).eq('id', A.id)
      await audit('ok', true, { channel: ch.slug, archived: true }, ch.id)
      return json({ ok: true, channel: { id: ch.id, slug: ch.slug, name: ch.name }, archived: true, correlation_id: correlationId })
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
