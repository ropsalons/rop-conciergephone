// ROP Chat — REMOTE MCP server (Streamable HTTP transport).
//
// This is the URL you paste into an MCP client that connects by URL (e.g. Hyperagent's "Add MCP
// server"). It speaks the MCP JSON-RPC protocol over a single HTTPS endpoint and proxies each tool
// call to the ROP Chat AI gateway, which enforces the agent's permissions, rate limits, and audit
// logging. It holds no database credentials and runs no SQL.
//
// Auth: the agent's bearer token travels in the URL (…/mcp-http/rop_ai_XXXX) or as ?key=rop_ai_XXXX,
// or an Authorization: Bearer header. The URL is therefore a secret — treat it like a password; mint
// a new agent token to rotate it. We never send an OAuth challenge, so an OAuth-capable client simply
// connects to it as an (already-credentialed) endpoint.
//
//   MCP URL:  https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/mcp-http/rop_ai_XXXXXXXX
//   Transport: Streamable HTTP (POST JSON-RPC; responds application/json)

const GATEWAY_URL =
  (Deno.env.get('SUPABASE_URL') ?? 'https://qrigzwactbwbpuufehxo.supabase.co') + '/functions/v1/ai-gateway'
const PROTOCOL_VERSION = '2025-03-26'

function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      req.headers.get('access-control-request-headers') ??
      'authorization, content-type, mcp-session-id, mcp-protocol-version',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}

// The tool surface — mirrors the gateway actions. name → { gateway action, schema }.
const TOOLS = [
  { name: 'list_channels', action: 'list_channels', description: 'List the ROP Chat channels this agent can see.',
    schema: { type: 'object', properties: {} } },
  { name: 'list_users', action: 'list_users', description: 'List the staff directory (id, name, email, role, location) to match people by name and address DMs/tags by ROP Chat identity.',
    schema: { type: 'object', properties: { query: { type: 'string' }, include_inactive: { type: 'boolean' }, limit: { type: 'integer' } } } },
  { name: 'read_channel_messages', action: 'read_channel_messages', description: 'Read recent messages from an allowed channel (by slug, name, or id).',
    schema: { type: 'object', required: ['channel'], properties: { channel: { type: 'string' }, limit: { type: 'integer' }, before: { type: 'string' } } } },
  { name: 'read_thread', action: 'read_thread', description: 'Read a message and all of its thread replies.',
    schema: { type: 'object', required: ['message_id'], properties: { message_id: { type: 'string' } } } },
  { name: 'search_messages', action: 'search_messages', description: 'Search message history within allowed channels.',
    schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, channel: { type: 'string' }, limit: { type: 'integer' } } } },
  { name: 'post_channel_message', action: 'post_message', description: 'Post a message to an allowed channel. Appears clearly tagged as this AI agent.',
    schema: { type: 'object', required: ['channel', 'text'], properties: { channel: { type: 'string' }, text: { type: 'string' }, title: { type: 'string' }, html: { type: 'string' } } } },
  { name: 'reply_to_thread', action: 'reply_thread', description: 'Reply within a thread on an existing message.',
    schema: { type: 'object', required: ['message_id', 'text'], properties: { message_id: { type: 'string' }, text: { type: 'string' } } } },
  { name: 'send_direct_message', action: 'send_dm', description: 'Send a DM to a person by ROP Chat user id (to_user_id) or email (to_email).',
    schema: { type: 'object', required: ['text'], properties: { to_user_id: { type: 'string' }, to_email: { type: 'string' }, text: { type: 'string' } } } },
  { name: 'send_group_message', action: 'send_group_dm', description: 'Start/continue a group DM with several people (to_user_ids or to_emails) and post a message.',
    schema: { type: 'object', required: ['text'], properties: { to_user_ids: { type: 'array', items: { type: 'string' } }, to_emails: { type: 'array', items: { type: 'string' } }, title: { type: 'string' }, text: { type: 'string' } } } },
  { name: 'create_channel', action: 'create_channel', description: 'Create a channel (public or private). Idempotent by name; the owner is always added.',
    schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, type: { type: 'string' }, description: { type: 'string' } } } },
  { name: 'create_task', action: 'create_task', description: 'Create a structured action item / task.',
    schema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, body: { type: 'string' }, channel: { type: 'string' }, assignee_email: { type: 'string' } } } },
  { name: 'update_task', action: 'update_task', description: 'Update a task (status: open | in_progress | done | cancelled).',
    schema: { type: 'object', required: ['task_id'], properties: { task_id: { type: 'string' }, status: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } } } },
  { name: 'list_pending_approvals', action: 'list_approvals', description: 'List this agent’s pending sensitive-action approvals.',
    schema: { type: 'object', properties: {} } },
  { name: 'request_sensitive_action', action: 'request_approval', description: 'Queue a sensitive action for human approval instead of doing it directly.',
    schema: { type: 'object', required: ['request_action', 'preview'], properties: { request_action: { type: 'string' }, preview: { type: 'string' }, payload: { type: 'object' } } } },
]
const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))

// Pull the agent token from the path (…/mcp-http/<token>), ?key=, or Authorization: Bearer.
function extractToken(req: Request, url: URL): string | null {
  const authz = req.headers.get('authorization') ?? ''
  if (authz.toLowerCase().startsWith('bearer ')) {
    const t = authz.slice(authz.indexOf(' ') + 1).trim()
    if (t) return t
  }
  const key = url.searchParams.get('key') || url.searchParams.get('token')
  if (key) return key
  // Last non-empty path segment after "mcp-http", if it looks like an agent token.
  const parts = url.pathname.split('/').filter(Boolean)
  const i = parts.indexOf('mcp-http')
  const tail = i >= 0 ? parts.slice(i + 1) : []
  const cand = tail[tail.length - 1]
  if (cand && cand.startsWith('rop_ai_')) return cand
  return null
}

async function callGateway(token: string, action: string, params: Record<string, unknown>) {
  const res = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch { data = { ok: false, error: `Non-JSON (${res.status}): ${text.slice(0, 200)}` } }
  return { ok: res.ok && data.ok !== false, data }
}

// Handle one JSON-RPC request object → a JSON-RPC response object (or null for notifications).
async function handleRpc(msg: any, token: string): Promise<any | null> {
  const id = msg?.id
  const method = msg?.method
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id, result })
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } })

  if (method === 'initialize') {
    return reply({
      protocolVersion: msg?.params?.protocolVersion ?? PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'rop-chat', version: '1.0.0' },
      instructions: 'ROP Chat tools. Read and post messages, DMs, tasks under this agent’s permissions.',
    })
  }
  // Notifications (no id) — acknowledge with no response body.
  if (method === 'notifications/initialized' || (typeof id === 'undefined' && String(method).startsWith('notifications/'))) {
    return null
  }
  if (method === 'ping') return reply({})
  if (method === 'tools/list') {
    return reply({ tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.schema })) })
  }
  if (method === 'tools/call') {
    const tool = BY_NAME.get(msg?.params?.name)
    if (!tool) return fail(-32602, `Unknown tool: ${msg?.params?.name}`)
    const { ok, data } = await callGateway(token, tool.action, msg?.params?.arguments ?? {})
    return reply({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: !ok })
  }
  if (typeof id === 'undefined') return null // unknown notification
  return fail(-32601, `Method not found: ${method}`)
}

Deno.serve(async (req) => {
  const CORS = cors(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)
  const enc = new TextEncoder()
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
  // Frame one or more JSON-RPC responses as an SSE stream (what most Streamable-HTTP clients expect
  // back when they send `Accept: text/event-stream`). We send the response event(s) and close.
  const sse = (objs: unknown[]) => {
    const body = objs.map((o) => `event: message\ndata: ${JSON.stringify(o)}\n\n`).join('')
    return new Response(body, {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' },
    })
  }
  const wantsSSE = (req.headers.get('accept') ?? '').includes('text/event-stream')

  // GET opens the server→client notification stream. We're stateless (responses ride the POST), so we
  // hold an idle keep-alive stream open — its presence is what a client probes for.
  if (req.method === 'GET') {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(enc.encode(': ok\n\n'))
        const iv = setInterval(() => {
          try { controller.enqueue(enc.encode(': ping\n\n')) } catch { clearInterval(iv) }
        }, 15000)
        ;(req.signal as AbortSignal | undefined)?.addEventListener('abort', () => { clearInterval(iv); try { controller.close() } catch { /* */ } })
      },
    })
    return new Response(stream, { status: 200, headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' } })
  }
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS })

  const token = extractToken(req, url)
  if (!token) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Missing agent token in URL (…/mcp-http/rop_ai_… or ?key=…).' } }, 400)
  }

  let payload: any
  try { payload = await req.json() } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400) }

  // A batch (array) or a single request.
  const requests = Array.isArray(payload) ? payload : [payload]
  const out = (await Promise.all(requests.map((m) => handleRpc(m, token)))).filter((x) => x !== null)
  if (!out.length) return new Response(null, { status: 202, headers: CORS }) // only notifications
  if (wantsSSE) return sse(out)
  return json(Array.isArray(payload) ? out : out[0])
})
