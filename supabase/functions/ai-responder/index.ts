// ROP Chat — always-on AI auto-responder.
//
// Runs on a schedule (pg_cron, ~1/min). Finds unanswered human questions in the #ask-ai channel and
// in direct messages to the Integrations bot, asks Claude for a reply, and posts it back — threaded
// under the question in channels — clearly badged as "ROP Assistant (AI)". Idempotent via
// ai_responder_seen so it never answers the same message twice.
//
// Dormant until an ANTHROPIC_API_KEY is set: with no key it no-ops (marks nothing), so it activates
// the moment the key is added. All AI writes respect the global kill-switch (ai_settings.ai_enabled).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const BOT_ID = '00000000-0000-4000-8000-00000000b010'
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001'
const AGENT = { slug: 'rop-assistant', name: 'ROP Assistant', provider: 'anthropic' }
const MAX_PER_RUN = 5

const SYSTEM = [
  'You are ROP Assistant, the AI helper for Robert of Philadelphia (ROP), a group of salons, working',
  'inside their private team chat app. Be concise, warm, and practical — a couple of short paragraphs',
  'at most. You can see the recent messages in this conversation for context. If someone asks for data',
  'or an action you cannot see or do from here, say so briefly and suggest the next step. Never invent',
  'numbers. You are talking to salon staff and leadership.',
].join(' ')

async function askClaude(transcript: string): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Recent conversation (oldest first):\n\n${transcript}\n\nWrite a helpful reply to the most recent message.` }],
    }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + JSON.stringify(j).slice(0, 200))
  const text = Array.isArray(j.content) ? j.content.map((c: any) => (c.type === 'text' ? c.text : '')).join('').trim() : ''
  return text || 'Sorry — I could not generate a reply just now.'
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET)
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Respect the global AI kill-switch and the API-key requirement.
  const { data: settings } = await admin.from('ai_settings').select('ai_enabled').eq('only_row', true).maybeSingle()
  if (!ANTHROPIC_KEY || (settings && settings.ai_enabled === false))
    return new Response(JSON.stringify({ ok: true, dormant: !ANTHROPIC_KEY, disabled: settings?.ai_enabled === false }), { headers: { 'Content-Type': 'application/json' } })

  const nameById = new Map<string, string>()
  async function authorName(userId: string, meta: any): Promise<string> {
    if (meta?.ai_agent?.name) return meta.ai_agent.name
    if (typeof meta?.author_name === 'string') return meta.author_name
    if (nameById.has(userId)) return nameById.get(userId)!
    const { data } = await admin.from('profiles').select('display_name,full_name').eq('id', userId).maybeSingle()
    const n = (data?.display_name || data?.full_name || 'Someone') as string
    nameById.set(userId, n)
    return n
  }

  // Collect candidate human messages (unanswered, last 2h) from #ask-ai and from DMs to the bot.
  const cutoff = new Date(Date.now() - 2 * 3600_000).toISOString()
  const candidates: any[] = []

  const { data: askCh } = await admin.from('channels').select('id').eq('slug', 'ask-ai').maybeSingle()
  if (askCh) {
    const { data } = await admin.from('messages')
      .select('id,user_id,body,metadata,created_at,channel_id,conversation_id,parent_message_id')
      .eq('channel_id', askCh.id).eq('is_deleted', false).neq('user_id', BOT_ID)
      .gte('created_at', cutoff).order('created_at', { ascending: true }).limit(30)
    for (const m of data ?? []) candidates.push(m)
  }

  const { data: botConvs } = await admin.from('direct_conversation_members').select('conversation_id').eq('user_id', BOT_ID)
  const convIds = (botConvs ?? []).map((c: any) => c.conversation_id)
  if (convIds.length) {
    const { data } = await admin.from('messages')
      .select('id,user_id,body,metadata,created_at,channel_id,conversation_id,parent_message_id')
      .in('conversation_id', convIds).eq('is_deleted', false).neq('user_id', BOT_ID)
      .gte('created_at', cutoff).order('created_at', { ascending: true }).limit(30)
    for (const m of data ?? []) candidates.push(m)
  }

  let answered = 0
  const errors: string[] = []
  for (const m of candidates) {
    if (answered >= MAX_PER_RUN) break
    if (m.metadata?.ai_agent) continue // skip AI-authored
    // Claim it (idempotent): if already seen, skip.
    const { data: claim } = await admin.from('ai_responder_seen').insert({ message_id: m.id }).select('message_id').maybeSingle()
    if (!claim) continue

    try {
      // Build a short transcript for context.
      const col = m.channel_id ? 'channel_id' : 'conversation_id'
      const key = m.channel_id ?? m.conversation_id
      const { data: hist } = await admin.from('messages')
        .select('user_id,body,metadata,created_at').eq(col, key).eq('is_deleted', false)
        .lte('created_at', m.created_at).order('created_at', { ascending: false }).limit(12)
      const lines: string[] = []
      for (const h of (hist ?? []).reverse()) {
        const nm = await authorName(h.user_id, h.metadata)
        const txt = String(h.body ?? '').slice(0, 500)
        if (txt) lines.push(`${nm}: ${txt}`)
      }
      const reply = await askClaude(lines.join('\n'))
      const metadata = { via_api: true, ai_agent: AGENT, author_name: AGENT.name, auto_reply: true }
      const target = m.channel_id ? { channel_id: m.channel_id, parent_message_id: m.id } : { conversation_id: m.conversation_id }
      await admin.from('messages').insert({ ...target, user_id: BOT_ID, body: reply, metadata })
      answered++
    } catch (e) {
      errors.push(String((e as Error).message ?? e))
    }
  }

  return new Response(JSON.stringify({ ok: true, candidates: candidates.length, answered, errors }), { headers: { 'Content-Type': 'application/json' } })
})
