// ROP Chat — remote MCP server on our OWN domain (chat.ropsalons.com/mcp/<token>).
//
// Why here and not the Supabase URL: MCP clients like Hyperagent do OAuth discovery first — they
// GET /.well-known/oauth-protected-resource<path>. On shared supabase.co that path is owned by
// Supabase and returns 401, so the client bails. On our Netlify domain we control every path, so we
// answer that discovery with a clean 404 ("this resource is not OAuth-protected") and the client then
// connects directly to the MCP endpoint, authenticated by the token carried in the URL.
//
// This function only speaks MCP JSON-RPC and proxies each tool call to the ROP Chat AI gateway, which
// enforces the agent's permissions, rate limits, and audit logging. It holds no DB credentials.

const GATEWAY_URL = 'https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ai-gateway'
const PROTOCOL_VERSION = '2025-03-26'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, accept, mcp-session-id, mcp-protocol-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const TOOLS = [
  { name: 'list_channels', action: 'list_channels', description: 'List the ROP Chat channels this agent can see.', schema: { type: 'object', properties: {} } },
  { name: 'list_users', action: 'list_users', description: 'List the staff directory (id, name, email, role, location) to match people by name and address DMs/tags by ROP Chat identity.', schema: { type: 'object', properties: { query: { type: 'string' }, include_inactive: { type: 'boolean' }, limit: { type: 'integer' } } } },
  { name: 'read_channel_messages', action: 'read_channel_messages', description: 'Read recent messages from an allowed channel (by slug, name, or id).', schema: { type: 'object', required: ['channel'], properties: { channel: { type: 'string' }, limit: { type: 'integer' }, before: { type: 'string' } } } },
  { name: 'read_thread', action: 'read_thread', description: 'Read a message and all of its thread replies.', schema: { type: 'object', required: ['message_id'], properties: { message_id: { type: 'string' } } } },
  { name: 'search_messages', action: 'search_messages', description: 'Search message history within allowed channels.', schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, channel: { type: 'string' }, limit: { type: 'integer' } } } },
  { name: 'post_channel_message', action: 'post_message', description: 'Post a message to an allowed channel. Appears clearly tagged as this AI agent.', schema: { type: 'object', required: ['channel', 'text'], properties: { channel: { type: 'string' }, text: { type: 'string' }, title: { type: 'string' }, html: { type: 'string' } } } },
  { name: 'reply_to_thread', action: 'reply_thread', description: 'Reply within a thread on an existing message.', schema: { type: 'object', required: ['message_id', 'text'], properties: { message_id: { type: 'string' }, text: { type: 'string' } } } },
  { name: 'send_direct_message', action: 'send_dm', description: 'Send a DM to a person by ROP Chat user id (to_user_id) or email (to_email).', schema: { type: 'object', required: ['text'], properties: { to_user_id: { type: 'string' }, to_email: { type: 'string' }, text: { type: 'string' } } } },
  { name: 'send_group_message', action: 'send_group_dm', description: 'Start/continue a group DM with several people (to_user_ids or to_emails) and post a message.', schema: { type: 'object', required: ['text'], properties: { to_user_ids: { type: 'array', items: { type: 'string' } }, to_emails: { type: 'array', items: { type: 'string' } }, title: { type: 'string' }, text: { type: 'string' } } } },
  { name: 'create_channel', action: 'create_channel', description: 'Create a channel (public or private). Idempotent by name; the owner is always added.', schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, type: { type: 'string' }, description: { type: 'string' } } } },
  { name: 'create_task', action: 'create_task', description: 'Create a structured action item / task.', schema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, body: { type: 'string' }, channel: { type: 'string' }, assignee_email: { type: 'string' } } } },
  { name: 'update_task', action: 'update_task', description: 'Update a task (status: open | in_progress | done | cancelled).', schema: { type: 'object', required: ['task_id'], properties: { task_id: { type: 'string' }, status: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } } } },
  { name: 'list_pending_approvals', action: 'list_approvals', description: 'List this agent’s pending sensitive-action approvals.', schema: { type: 'object', properties: {} } },
  { name: 'request_sensitive_action', action: 'request_approval', description: 'Queue a sensitive action for human approval instead of doing it directly.', schema: { type: 'object', required: ['request_action', 'preview'], properties: { request_action: { type: 'string' }, preview: { type: 'string' }, payload: { type: 'object' } } } },
]
const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))

function extractToken(event) {
  const h = event.headers || {}
  const authz = h.authorization || h.Authorization || ''
  if (authz.toLowerCase().startsWith('bearer ')) { const t = authz.slice(authz.indexOf(' ') + 1).trim(); if (t) return t }
  const q = event.queryStringParameters || {}
  if (q.key) return q.key
  if (q.token) return q.token
  const path = event.path || ''
  const seg = path.split('/').filter(Boolean)
  const cand = seg[seg.length - 1]
  if (cand && cand.startsWith('rop_ai_')) return cand
  return null
}

async function callGateway(token, action, params) {
  const res = await fetch(GATEWAY_URL, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...params }) })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = { ok: false, error: `Non-JSON (${res.status}): ${text.slice(0, 200)}` } }
  return { ok: res.ok && data.ok !== false, data }
}

async function handleRpc(msg, token) {
  const id = msg?.id
  const method = msg?.method
  const reply = (result) => ({ jsonrpc: '2.0', id, result })
  const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })
  if (method === 'initialize') return reply({ protocolVersion: msg?.params?.protocolVersion ?? PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'rop-chat', version: '1.0.0' }, instructions: 'ROP Chat tools. Read and post messages, DMs, tasks under this agent’s permissions.' })
  if (method === 'notifications/initialized' || (typeof id === 'undefined' && String(method).startsWith('notifications/'))) return null
  if (method === 'ping') return reply({})
  if (method === 'tools/list') return reply({ tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.schema })) })
  if (method === 'tools/call') {
    const tool = BY_NAME.get(msg?.params?.name)
    if (!tool) return fail(-32602, `Unknown tool: ${msg?.params?.name}`)
    const { ok, data } = await callGateway(token, tool.action, msg?.params?.arguments ?? {})
    return reply({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: !ok })
  }
  if (typeof id === 'undefined') return null
  return fail(-32601, `Method not found: ${method}`)
}

export const handler = async (event) => {
  const method = event.httpMethod
  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }

  const path = event.path || ''
  // OAuth discovery: tell the client this resource is NOT OAuth-protected → it connects directly.
  if (path.includes('/.well-known/')) {
    return { statusCode: 404, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'no_oauth', detail: 'This MCP endpoint authenticates via the token in its URL; no OAuth.' }) }
  }

  const accept = (event.headers?.accept || event.headers?.Accept || '')
  const wantsSSE = accept.includes('text/event-stream')

  if (method === 'GET') {
    // A minimal SSE "stream" so a probe sees a live event-stream endpoint.
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' }, body: ': ok\n\n' }
  }
  if (method !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  const token = extractToken(event)
  if (!token) return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Missing agent token in URL (…/mcp/rop_ai_… or ?key=…).' } }) }

  let payload
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '')
  try { payload = JSON.parse(raw) } catch { return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) } }

  const requests = Array.isArray(payload) ? payload : [payload]
  const out = (await Promise.all(requests.map((m) => handleRpc(m, token)))).filter((x) => x !== null)
  if (!out.length) return { statusCode: 202, headers: CORS, body: '' }

  if (wantsSSE) {
    const body = out.map((o) => `event: message\ndata: ${JSON.stringify(o)}\n\n`).join('')
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' }, body }
  }
  const single = Array.isArray(payload) ? out : out[0]
  return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(single) }
}
