// ROP Chat — always-on AI assistant (tool-using).
//
// Runs on a schedule (pg_cron, ~1/min). Finds unanswered human messages in the #ask-ai channel and
// in direct messages to the Integrations bot, then answers with Claude — but unlike a plain chatbot,
// Claude is given TOOLS so it can actually look inside ROP Chat: the staff directory, the channel
// list, where automated notifications come from, and recent/searched messages. It can also take a
// few safe actions (create a task, forward an item to a connected project) and, for the owner,
// capture an "app change / bug fix" request that the coding agent picks up. Anything risky (money,
// access changes, messaging staff, deletes) is escalated to Rob instead of done.
//
// Replies are posted back — threaded under the question in channels — clearly badged "ROP Assistant
// (AI)". Idempotent via ai_responder_seen so it never answers the same message twice. Every tool
// call runs with the service role but is SCOPED to what the person who asked is allowed to see.
//
// Dormant until an ANTHROPIC_API_KEY is set: with no key it no-ops. Respects the global kill-switch
// (ai_settings.ai_enabled).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const BOT_ID = '00000000-0000-4000-8000-00000000b010'
const ROB_ID = '6cd61125-689a-4889-82ab-fb5835acf59c'
const TASK_AGENT_ID = '8a8583dc-c335-4575-8a41-7558de0a80a4' // "Claude Code" agent — owns tasks the assistant files
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? 'rop-daily-3f9ac21b' // shared app cron secret (matches pg_cron job + other functions)
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '' // deployed copy holds the live key; repo copy stays redacted
const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001'
const AGENT = { slug: 'rop-assistant', name: 'ROP Assistant', provider: 'anthropic' }
const MAX_PER_RUN = 3        // messages answered per invocation (each may take several tool calls)
const MAX_TOOL_LOOPS = 6     // tool round-trips per message before we force a final answer

function rankOf(al: string | null | undefined): number {
  return al === 'owner' ? 100 : al === 'admin' ? 90 : al === 'leader' ? 40 : 10
}

const SYSTEM = [
  "You are ROP Assistant, the AI helper for Robert of Philadelphia (ROP) — a group of hair salons —",
  "working inside their private team-chat app (ROP Chat). You are talking to salon staff and leadership.",
  "",
  "You are NOT a generic chatbot. You have TOOLS that let you look inside ROP Chat and act. When a",
  "question is about ROP — people, channels, where notifications come from, what was posted, tasks —",
  "USE A TOOL to get the real answer instead of guessing or saying you can't. Never invent numbers,",
  "names, or facts; if a tool doesn't return it, say so plainly and say where it does live.",
  "",
  "Style: concise, warm, practical. A couple of short paragraphs at most. Plain language.",
  "",
  "What you CAN do yourself: answer using the tools; create a task; forward an item to a connected",
  "project (e.g. Command Center); and — for the owner (Rob) — capture an 'app change / bug fix' request",
  "for the coding agent. What you must NEVER do on your own: spend money, change anyone's access or role,",
  "delete data, or message staff/customers. For those, or anything ambiguous or risky, use the",
  "escalate_to_rob tool instead of acting — briefly tell the person you've flagged it for Rob.",
  "",
  "Requests to fix a bug or change how ROP Chat itself works CANNOT be done from here (you can't edit the",
  "app's code). If the person asking is the owner, use log_app_change_request to capture it so the coding",
  "agent picks it up and opens a change for Rob to approve; for anyone else, escalate_to_rob. Either way",
  "reply that it's been captured — do not pretend you changed the app.",
  "",
  "Sign off as ROP Assistant. You are an AI, not a person; never imply you are Rob or any staff member.",
].join('\n')

// ── Anthropic tool schema ─────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'list_channels',
    description: "List the ROP Chat channels the person asking is allowed to see (name, purpose, category, member count, last activity). Use for 'what channels are there', 'where does X get posted', general orientation.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'staff_directory',
    description: "Look up ROP staff/leadership: name, role, access level, location, department. Optional case-insensitive name/role filter. Use for 'who is…', 'who works at…', 'who are the admins'.",
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'optional filter on name/role/location' } }, additionalProperties: false },
  },
  {
    name: 'notification_sources',
    description: "Show where ROP Chat's automated notifications come from: known feeds (and whether they're muted) plus which channels have received machine/automated posts recently. Use for 'which projects/feeds are posting into chat', 'where are these updates coming from', 'how do I turn one off'.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_channel',
    description: "Read recent messages in one channel the asker can access (author, time, text). Use to summarize a channel or find something that was posted (e.g. yesterday's numbers in a daily briefing/scorecard channel).",
    input_schema: { type: 'object', properties: { channel: { type: 'string', description: 'channel slug, name, or id' }, limit: { type: 'integer' } }, required: ['channel'], additionalProperties: false },
  },
  {
    name: 'search_messages',
    description: "Search message text across the channels the asker can access (optionally within one channel). Returns matches with author, channel, snippet, date.",
    input_schema: { type: 'object', properties: { query: { type: 'string' }, channel: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'create_task',
    description: "File a task/reminder in ROP so it isn't forgotten. Use when someone asks you to remember or track something actionable.",
    input_schema: { type: 'object', properties: { title: { type: 'string' }, details: { type: 'string' } }, required: ['title'], additionalProperties: false },
  },
  {
    name: 'forward_to_project',
    description: "Forward an item to a connected project's command channel so it becomes work there (e.g. Command Center). Owner/admin only — for others, escalate instead.",
    input_schema: { type: 'object', properties: { project: { type: 'string', description: 'project name or key' }, note: { type: 'string', description: 'what to forward / the instruction' } }, required: ['project', 'note'], additionalProperties: false },
  },
  {
    name: 'log_app_change_request',
    description: "Owner-only. Capture a request to change or fix ROP Chat itself (a bug, a behavior change, a feature) so the coding agent implements it on a branch and opens a change for Rob to approve. Do NOT use for regular questions.",
    input_schema: { type: 'object', properties: { summary: { type: 'string', description: 'one-line what to change' }, detail: { type: 'string', description: 'full context: what it does now, what it should do, where' } }, required: ['summary'], additionalProperties: false },
  },
  {
    name: 'escalate_to_rob',
    description: "Flag something for Rob (the owner) instead of doing it: risky/powerful actions, ambiguous requests, or app changes asked by non-owners. Posts a visible note for Rob in the channel.",
    input_schema: { type: 'object', properties: { summary: { type: 'string' }, question: { type: 'string', description: 'the decision you need from Rob' } }, required: ['summary'], additionalProperties: false },
  },
]

Deno.serve(async (req) => {
  const provided = req.headers.get('x-cron-secret')
  if (provided !== CRON_SECRET && provided !== 'rop-daily-3f9ac21b')
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

  const { data: settings } = await admin.from('ai_settings').select('ai_enabled').eq('only_row', true).maybeSingle()
  if (!ANTHROPIC_KEY || (settings && settings.ai_enabled === false))
    return json({ ok: true, dormant: !ANTHROPIC_KEY, disabled: settings?.ai_enabled === false })

  // ── lookups / caches ────────────────────────────────────────────────────────
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
  const [{ data: locs }, { data: deps }] = await Promise.all([
    admin.from('locations').select('id,name'),
    admin.from('departments').select('id,name'),
  ])
  const locName = new Map((locs ?? []).map((l: any) => [l.id, l.name]))
  const depName = new Map((deps ?? []).map((d: any) => [d.id, d.name]))

  // Channels a given requester may read: channels they're a member of, plus public channels whose
  // min_access_rank they meet. Mirrors the app's own visibility rules.
  async function accessibleChannels(requesterId: string, rank: number) {
    const [{ data: mem }, { data: pub }] = await Promise.all([
      admin.from('channel_members').select('channel_id').eq('user_id', requesterId),
      admin.from('channels').select('id,slug,name,type,category,description,min_access_rank,is_archived').eq('is_archived', false),
    ])
    const memberIds = new Set((mem ?? []).map((m: any) => m.channel_id))
    const list = (pub ?? []).filter((c: any) =>
      memberIds.has(c.id) || (c.type === 'public' && (c.min_access_rank ?? 0) <= rank))
    return list
  }

  async function runTools(requester: { id: string; name: string; access_level: string; rank: number; isOwner: boolean }, replyTarget: { channel_id?: string; conversation_id?: string }, latestBody: string) {
    const chans = await accessibleChannels(requester.id, requester.rank)
    const byId = new Map(chans.map((c: any) => [c.id, c]))
    const resolve = (sel: string) => {
      const s = (sel || '').trim().toLowerCase()
      return chans.find((c: any) => c.id === sel || (c.slug || '').toLowerCase() === s || (c.name || '').toLowerCase() === s) ?? null
    }

    async function exec(name: string, input: any): Promise<any> {
      try {
        if (name === 'list_channels') {
          const rows = await Promise.all(chans.slice(0, 60).map(async (c: any) => {
            const { count } = await admin.from('channel_members').select('user_id', { count: 'exact', head: true }).eq('channel_id', c.id)
            const { data: last } = await admin.from('messages').select('created_at').eq('channel_id', c.id).eq('is_deleted', false).order('created_at', { ascending: false }).limit(1).maybeSingle()
            return { name: c.name, slug: c.slug, category: c.category, purpose: c.description, members: count ?? 0, last_activity: last?.created_at ?? null }
          }))
          return { channels: rows.sort((a, b) => String(b.last_activity ?? '').localeCompare(String(a.last_activity ?? ''))) }
        }

        if (name === 'staff_directory') {
          let sel = admin.from('profiles').select('display_name,full_name,role,secondary_role,access_level,location_id,department_id,is_active').eq('is_active', true).order('full_name')
          const { data } = await sel.limit(500)
          let rows = (data ?? []).map((p: any) => ({
            name: p.display_name || p.full_name, role: p.role, secondary_role: p.secondary_role,
            access_level: p.access_level, location: p.location_id ? locName.get(p.location_id) ?? null : null,
            department: p.department_id ? depName.get(p.department_id) ?? null : null,
          }))
          const q = String(input?.query ?? '').trim().toLowerCase()
          if (q) rows = rows.filter((r) => `${r.name ?? ''} ${r.role ?? ''} ${r.secondary_role ?? ''} ${r.location ?? ''}`.toLowerCase().includes(q))
          return { count: rows.length, staff: rows.slice(0, 80) }
        }

        if (name === 'notification_sources') {
          const { data: fc } = await admin.from('feed_controls').select('source,muted,note,updated_at').order('source')
          // channels that received automated/machine posts in the last 21 days
          const since = new Date(Date.now() - 21 * 864e5).toISOString()
          const { data: autos } = await admin.from('messages').select('channel_id,metadata,created_at').gte('created_at', since).eq('user_id', BOT_ID).eq('is_deleted', false).limit(2000)
          const counts = new Map<string, number>()
          for (const m of autos ?? []) counts.set(m.channel_id, (counts.get(m.channel_id) ?? 0) + 1)
          const channelsGettingPosts = [...counts.entries()].map(([cid, n]) => ({ channel: (byId.get(cid) as any)?.name ?? cid, slug: (byId.get(cid) as any)?.slug ?? null, automated_posts_21d: n }))
            .filter((r) => r.slug).sort((a, b) => b.automated_posts_21d - a.automated_posts_21d).slice(0, 25)
          return { feeds: fc ?? [], note: 'muted=true means that source is turned off. Admins manage these in Admin → Feeds.', channels_receiving_automated_posts: channelsGettingPosts }
        }

        if (name === 'read_channel') {
          const ch = resolve(String(input?.channel ?? ''))
          if (!ch) return { error: 'That channel was not found or you do not have access to it.' }
          const limit = Math.min(Math.max(Number(input?.limit) || 20, 1), 50)
          const { data } = await admin.from('messages').select('user_id,body,metadata,created_at').eq('channel_id', ch.id).eq('is_deleted', false).order('created_at', { ascending: false }).limit(limit)
          const msgs = []
          for (const m of (data ?? []).reverse()) msgs.push({ author: await authorName(m.user_id, m.metadata), at: m.created_at, text: String(m.body ?? '').slice(0, 600) })
          return { channel: ch.name, messages: msgs }
        }

        if (name === 'search_messages') {
          const query = String(input?.query ?? '').trim()
          if (!query) return { error: 'empty query' }
          let ids = chans.map((c: any) => c.id)
          if (input?.channel) { const ch = resolve(String(input.channel)); if (!ch) return { error: 'channel not found/accessible' }; ids = [ch.id] }
          const limit = Math.min(Math.max(Number(input?.limit) || 15, 1), 30)
          const { data } = await admin.from('messages').select('channel_id,user_id,body,metadata,created_at').in('channel_id', ids).eq('is_deleted', false).ilike('body', `%${query}%`).order('created_at', { ascending: false }).limit(limit)
          const out = []
          for (const m of data ?? []) out.push({ channel: (byId.get(m.channel_id) as any)?.name ?? '?', author: await authorName(m.user_id, m.metadata), at: m.created_at, text: String(m.body ?? '').slice(0, 400) })
          return { matches: out }
        }

        if (name === 'create_task') {
          const title = String(input?.title ?? '').trim()
          if (!title) return { error: 'title required' }
          const { data, error } = await admin.from('ai_tasks').insert({ agent_id: TASK_AGENT_ID, title, body: input?.details ?? null, channel_id: replyTarget.channel_id ?? null, external_ref: `ask:${requester.id}` }).select('id').single()
          if (error) return { error: error.message }
          return { ok: true, task_id: data.id, message: 'Task filed.' }
        }

        if (name === 'forward_to_project') {
          if (requester.rank < 90) return { denied: true, message: 'Forwarding to a project is limited to admins/owner. Use escalate_to_rob instead.' }
          const key = String(input?.project ?? '').trim().toLowerCase()
          const { data: hooks } = await admin.from('project_webhooks').select('project_name,project_key,command_channel_id,is_active')
          const hook = (hooks ?? []).find((h: any) => h.is_active && (String(h.project_key).toLowerCase() === key || String(h.project_name).toLowerCase().includes(key)))
          if (!hook || !hook.command_channel_id) return { error: `No connected project matching "${input?.project}". Known: ${(hooks ?? []).map((h: any) => h.project_name).join(', ') || 'none'}` }
          const body = `📤 Forwarded by ${requester.name} via ROP Assistant:\n\n${String(input?.note ?? '')}`
          const { data, error } = await admin.from('messages').insert({ channel_id: hook.command_channel_id, user_id: BOT_ID, body, metadata: { via_api: true, ai_agent: AGENT, author_name: AGENT.name, forwarded_by: requester.id } }).select('id').single()
          if (error) return { error: error.message }
          return { ok: true, forwarded_to: hook.project_name, message_id: data.id }
        }

        if (name === 'log_app_change_request') {
          if (!requester.isOwner) return { denied: true, message: 'Only the owner can request app changes. Use escalate_to_rob.' }
          const summary = String(input?.summary ?? '').trim()
          if (!summary) return { error: 'summary required' }
          const { data, error } = await admin.from('ai_tasks').insert({ agent_id: TASK_AGENT_ID, title: `[APP CHANGE] ${summary}`, body: String(input?.detail ?? ''), channel_id: replyTarget.channel_id ?? null, external_ref: 'app-change', status: 'open' }).select('id').single()
          if (error) return { error: error.message }
          return { ok: true, request_id: data.id, message: 'Captured for the coding agent. It will be implemented on a branch and opened as a change for Rob to approve.' }
        }

        if (name === 'escalate_to_rob') {
          const summary = String(input?.summary ?? '').trim()
          const q = String(input?.question ?? '').trim()
          const body = `🔔 **For Rob** — flagged by ROP Assistant\n\n**Request from ${requester.name}:** ${summary}${q ? `\n\n**Decision needed:** ${q}` : ''}`
          const target = replyTarget.channel_id ? { channel_id: replyTarget.channel_id } : { conversation_id: replyTarget.conversation_id }
          const { data, error } = await admin.from('messages').insert({ ...target, user_id: BOT_ID, body, metadata: { via_api: true, ai_agent: AGENT, author_name: AGENT.name, escalation: true } }).select('id').single()
          if (error) return { error: error.message }
          return { ok: true, message: 'Flagged for Rob in this channel.' }
        }

        return { error: `unknown tool ${name}` }
      } catch (e) {
        return { error: String((e as Error).message ?? e) }
      }
    }

    // Anthropic tool-use loop.
    const messages: any[] = [{ role: 'user', content: `You are helping ${requester.name} (access level: ${requester.access_level}${requester.isOwner ? ', THIS IS THE OWNER Rob' : ''}). Their message:\n\n"${latestBody}"\n\nAnswer them. Use tools to get real ROP data before answering when relevant.` }]
    for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: SYSTEM, tools: TOOLS, messages }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + JSON.stringify(j).slice(0, 200))
      messages.push({ role: 'assistant', content: j.content })
      const toolUses = (j.content ?? []).filter((c: any) => c.type === 'tool_use')
      if (j.stop_reason !== 'tool_use' || !toolUses.length) {
        const text = (j.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim()
        return text || 'Sorry — I could not put together a reply just now.'
      }
      const results = []
      for (const tu of toolUses) results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(await exec(tu.name, tu.input)).slice(0, 6000) })
      messages.push({ role: 'user', content: results })
    }
    // Ran out of loops — ask for a final answer with no tools.
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 800, system: SYSTEM, messages: [...messages, { role: 'user', content: 'Give your best final answer now, no more tools.' }] }),
    })
    const j = await r.json()
    const text = r.ok ? (j.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim() : ''
    return text || 'Sorry — I could not put together a reply just now.'
  }

  // ── Gather candidate human messages (unanswered, last 2h) ────────────────────
  const cutoff = new Date(Date.now() - 2 * 3600_000).toISOString()
  const candidates: any[] = []
  const { data: askCh } = await admin.from('channels').select('id').eq('slug', 'ask-ai').maybeSingle()
  if (askCh) {
    const { data } = await admin.from('messages').select('id,user_id,body,metadata,created_at,channel_id,conversation_id,parent_message_id')
      .eq('channel_id', askCh.id).eq('is_deleted', false).neq('user_id', BOT_ID).gte('created_at', cutoff).order('created_at', { ascending: true }).limit(30)
    for (const m of data ?? []) candidates.push(m)
  }
  const { data: botConvs } = await admin.from('direct_conversation_members').select('conversation_id').eq('user_id', BOT_ID)
  const convIds = (botConvs ?? []).map((c: any) => c.conversation_id)
  if (convIds.length) {
    const { data } = await admin.from('messages').select('id,user_id,body,metadata,created_at,channel_id,conversation_id,parent_message_id')
      .in('conversation_id', convIds).eq('is_deleted', false).neq('user_id', BOT_ID).gte('created_at', cutoff).order('created_at', { ascending: true }).limit(30)
    for (const m of data ?? []) candidates.push(m)
  }

  let answered = 0
  const errors: string[] = []
  for (const m of candidates) {
    if (answered >= MAX_PER_RUN) break
    if (m.metadata?.ai_agent) continue
    const { data: claim } = await admin.from('ai_responder_seen').insert({ message_id: m.id }).select('message_id').maybeSingle()
    if (!claim) continue
    try {
      const { data: prof } = await admin.from('profiles').select('display_name,full_name,access_level').eq('id', m.user_id).maybeSingle()
      const requester = {
        id: m.user_id, name: (prof?.display_name || prof?.full_name || 'Someone') as string,
        access_level: (prof?.access_level || 'member') as string, rank: rankOf(prof?.access_level),
        isOwner: m.user_id === ROB_ID || prof?.access_level === 'owner',
      }
      const replyTarget = m.channel_id ? { channel_id: m.channel_id } : { conversation_id: m.conversation_id }
      const reply = await runTools(requester, replyTarget, String(m.body ?? ''))
      const metadata = { via_api: true, ai_agent: AGENT, author_name: AGENT.name, auto_reply: true }
      const target = m.channel_id ? { channel_id: m.channel_id, parent_message_id: m.id } : { conversation_id: m.conversation_id }
      await admin.from('messages').insert({ ...target, user_id: BOT_ID, body: reply, metadata })
      answered++
    } catch (e) {
      errors.push(String((e as Error).message ?? e))
    }
  }

  return json({ ok: true, candidates: candidates.length, answered, errors })
})
