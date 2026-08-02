// ROP Chat — Events read/write API for the ROP Team App (and any authorized project).
//
// ROP Chat OWNS the event record; the consuming app owns registrations and writes them back here.
// Auth is the SAME scheme the rest of ROP Chat's integrations use: an `ai_agents` bearer token
// (Authorization: Bearer rop_ai_…) hashed to token_hash. Read requires the agent's allowed_actions
// to include "read_events"; the registration write-back requires "write_registration".
//
//   GET  /functions/v1/events-api?scope=upcoming|past|all&from=&to=&location=&updated_since=&limit=
//        → { ok, count, events: [ …full event shape… ] }
//   POST /functions/v1/events-api   body: { action: "register"|"cancel", event_id, user_id, source? }
//        → { ok, action, event_id, user_id, registration_count, spots_remaining, already }
//
// Timestamps are ISO 8601 with timezone; server logic runs in America/New_York.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const BOT_ID = '00000000-0000-4000-8000-00000000b010' // the "Integrations" account the API posts as
const EVENTS_CHANNEL_SLUG = 'events'
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      req.headers.get('access-control-request-headers') ??
      'authorization, x-api-key, content-type, x-client-info, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}
async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  const CORS = cors(req)
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ── Auth: ai_agents bearer token (never expose events to unauthenticated requests) ──────────
  const authz = req.headers.get('authorization') ?? ''
  const raw =
    (authz.toLowerCase().startsWith('bearer ') ? authz.slice(authz.indexOf(' ') + 1).trim() : '') ||
    (req.headers.get('x-api-key') ?? '')
  if (!raw) return json({ ok: false, error: 'Missing agent token' }, 401)
  const { data: agent } = await admin
    .from('ai_agents').select('id,name,slug,provider,is_active,allowed_actions')
    .eq('token_hash', await sha256hex(raw)).maybeSingle()
  if (!agent || !agent.is_active) return json({ ok: false, error: 'Invalid, revoked, or disabled agent token' }, 401)
  const actions: string[] = (agent.allowed_actions as string[]) ?? []

  // Image URLs attached to any message tied to this event (its thread). Private-bucket files are
  // returned as short-lived signed URLs; public-bucket files as public URLs.
  async function threadImages(eventId: string): Promise<string[]> {
    const { data: msgs } = await admin.from('messages').select('id').eq('event_id', eventId)
    const ids = (msgs ?? []).map((m: { id: string }) => m.id)
    if (!ids.length) return []
    const { data: files } = await admin.from('files').select('bucket,path,mime_type').in('message_id', ids).ilike('mime_type', 'image/%').limit(50)
    const out: string[] = []
    for (const f of (files ?? []) as Array<{ bucket: string; path: string }>) {
      if (f.bucket === 'attachments') {
        const { data } = await admin.storage.from('attachments').createSignedUrl(f.path, 3600)
        if (data?.signedUrl) out.push(data.signedUrl)
      } else {
        out.push(admin.storage.from(f.bucket).getPublicUrl(f.path).data.publicUrl)
      }
    }
    return out
  }

  async function shape(ev: any) {
    return {
      id: ev.id,
      title: ev.title,
      description: ev.description,
      start: ev.starts_at,
      end: ev.ends_at,
      timezone: ev.timezone,
      location: ev.location,
      location_id: ev.location_id,
      capacity: ev.capacity,
      cost: ev.price,
      registration_open: ev.registration_open,
      registration_count: ev.registration_count ?? 0,
      spots_remaining: ev.capacity == null ? null : Math.max(0, ev.capacity - (ev.registration_count ?? 0)),
      cover_image: ev.cover_url,
      category: ev.category,
      format: ev.format,
      audience: ev.audience,
      is_cancelled: ev.is_cancelled,
      created_by: ev.created_by,
      created_at: ev.created_at,
      updated_at: ev.updated_at,
      thread_images: await threadImages(ev.id),
    }
  }

  // ── READ ────────────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (!actions.includes('read_events')) return json({ ok: false, error: 'This agent may not read events.' }, 403)
    const u = new URL(req.url)
    const scope = (u.searchParams.get('scope') ?? 'upcoming').toLowerCase()
    const from = u.searchParams.get('from')
    const to = u.searchParams.get('to')
    const location = u.searchParams.get('location')
    const updatedSince = u.searchParams.get('updated_since')
    const limit = Math.min(Math.max(Number(u.searchParams.get('limit')) || 100, 1), 500)
    const nowIso = new Date().toISOString()

    let q = admin.from('events').select('*')
    if (scope === 'upcoming') q = q.gte('starts_at', nowIso)
    else if (scope === 'past') q = q.lt('starts_at', nowIso)
    if (from) q = q.gte('starts_at', from)
    if (to) q = q.lte('starts_at', to)
    if (location) q = q.ilike('location', `%${location}%`)
    if (updatedSince) q = q.gt('updated_at', updatedSince)
    q = q.order('starts_at', { ascending: scope !== 'past' }).limit(limit)

    const { data, error } = await q
    if (error) return json({ ok: false, error: error.message }, 500)
    const events = []
    for (const ev of data ?? []) events.push(await shape(ev))
    return json({ ok: true, count: events.length, events })
  }

  if (req.method !== 'POST') return json({ ok: false, error: 'Use GET or POST' }, 405)

  // ── REGISTRATION WRITE-BACK ─────────────────────────────────────────────────────────────────
  if (!actions.includes('write_registration')) return json({ ok: false, error: 'This agent may not write registrations.' }, 403)
  let body: any
  try { body = await req.json() } catch { return json({ ok: false, error: 'Body must be JSON' }, 400) }
  const action = String(body.action ?? '').toLowerCase()
  if (action !== 'register' && action !== 'cancel') return json({ ok: false, error: 'action must be "register" or "cancel"' }, 400)
  const eventId = String(body.event_id ?? '')
  const userId = String(body.user_id ?? '')
  if (!uuidRe.test(eventId)) return json({ ok: false, error: 'Provide a valid event_id' }, 400)
  if (!uuidRe.test(userId)) return json({ ok: false, error: 'Provide a valid user_id' }, 400)
  const source = typeof body.source === 'string' ? body.source.slice(0, 60) : (agent.slug as string)

  const { data: ev } = await admin.from('events').select('*').eq('id', eventId).maybeSingle()
  if (!ev) return json({ ok: false, error: 'Event not found' }, 404)
  const { data: prof } = await admin.from('profiles').select('id,display_name,full_name').eq('id', userId).maybeSingle()
  if (!prof) return json({ ok: false, error: 'Unknown user_id' }, 404)
  const who = (prof.display_name || prof.full_name || 'Someone') as string

  // Current registration state (idempotency source of truth).
  const { data: existing } = await admin.from('event_registrations').select('status').eq('event_id', eventId).eq('user_id', userId).maybeSingle()
  const already = existing?.status === (action === 'register' ? 'registered' : 'cancelled')

  const respond = async (posted: boolean) => {
    // Recompute the count from the ledger (never trust a delta) and persist it on the event.
    const { count } = await admin.from('event_registrations').select('user_id', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'registered')
    const registration_count = count ?? 0
    await admin.from('events').update({ registration_count }).eq('id', eventId)
    return json({
      ok: true, action, event_id: eventId, user_id: userId, posted,
      registration_count,
      spots_remaining: ev.capacity == null ? null : Math.max(0, ev.capacity - registration_count),
      already,
    })
  }

  // Idempotent no-op: the same registration/cancel submitted twice never double-counts or re-posts.
  if (already) return await respond(false)

  if (action === 'register' && ev.registration_open === false) return json({ ok: false, error: 'Registration is closed for this event.' }, 409)

  // Ensure the event has a chat thread (root message in #events), lazily creating it once.
  let channelId: string | null = ev.channel_id
  let rootId: string | null = ev.root_message_id
  if (!rootId) {
    if (!channelId) {
      const { data: ch } = await admin.from('channels').select('id').eq('slug', EVENTS_CHANNEL_SLUG).maybeSingle()
      channelId = ch?.id ?? null
    }
    if (channelId) {
      const header = `📅 *${ev.title}* — ${new Date(ev.starts_at).toLocaleString('en-US', { timeZone: ev.timezone || 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })} ET${ev.location ? ` · ${ev.location}` : ''}\nRSVPs from the ROP Team App will show up in this thread.`
      const { data: root } = await admin.from('messages').insert({
        channel_id: channelId, user_id: BOT_ID, body: header, event_id: eventId,
        metadata: { via_api: true, ai_agent: { slug: agent.slug, name: agent.name, provider: agent.provider }, author_name: 'ROP Events' },
      }).select('id').single()
      rootId = root?.id ?? null
      await admin.from('events').update({ channel_id: channelId, root_message_id: rootId }).eq('id', eventId)
    }
  }

  // Record the registration (idempotent upsert on the PK) …
  await admin.from('event_registrations').upsert(
    { event_id: eventId, user_id: userId, status: action === 'register' ? 'registered' : 'cancelled', source, updated_at: new Date().toISOString() },
    { onConflict: 'event_id,user_id' },
  )

  // … and post it into the event's thread so the room sees who's coming.
  if (channelId && rootId) {
    const verb = action === 'register' ? '✅ registered for' : '❎ cancelled for'
    await admin.from('messages').insert({
      channel_id: channelId, user_id: BOT_ID, parent_message_id: rootId, event_id: eventId,
      body: `${verb} *${ev.title}* — ${who}`,
      metadata: { via_api: true, ai_agent: { slug: agent.slug, name: agent.name, provider: agent.provider }, author_name: 'ROP Events' },
    })
  }

  return await respond(true)
})
