// ROP Chat — remote MCP server + OAuth 2.1 authorization server, on our own domain.
//
// Clients like Hyperagent REQUIRE the MCP OAuth handshake (they refuse to connect otherwise). We host
// the whole thing on chat.ropsalons.com, where we control every path:
//
//   /.well-known/oauth-protected-resource/mcp/<token>  → says "the AS is this origin"      (RFC 9728)
//   /.well-known/oauth-authorization-server            → AS metadata                        (RFC 8414)
//   /oauth/register                                    → Dynamic Client Registration        (RFC 7591)
//   /oauth/authorize                                   → auto-approves, returns a code (PKCE)
//   /oauth/token                                       → exchanges code → access token
//   /mcp/<token>                                       → the MCP JSON-RPC endpoint (proxies the gateway)
//
// The agent token lives in the resource URL (…/mcp/<token>) — that URL is the secret. We auto-approve
// (no login screen): possession of the URL is the authorization, PKCE binds the exchange, and the
// issued access token IS that agent token, which the ROP gateway independently validates on every
// call. The OAuth codes are stateless: the code is a base64url blob carrying the PKCE challenge +
// token, valid 10 minutes — so this needs no database.

import { createHash } from 'node:crypto'

const ORIGIN = 'https://chat.ropsalons.com'
const GATEWAY_URL = 'https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ai-gateway'
const PROTOCOL_VERSION = '2025-03-26'
const CODE_TTL_MS = 10 * 60 * 1000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, accept, mcp-session-id, mcp-protocol-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64urlJson = (obj) => b64url(JSON.stringify(obj))
const fromB64url = (s) => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
const sha256b64url = (s) => b64url(createHash('sha256').update(s).digest())
const json = (obj, status = 200, extra = {}) => ({ statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(obj) })

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

// Find the agent token in: Authorization header, ?key/token, a `resource`/URL string, or a path.
function tokenFromString(s) {
  if (!s) return null
  const m = String(s).match(/rop_ai_[A-Za-z0-9]+/)
  return m ? m[0] : null
}
function extractToken(event) {
  const h = event.headers || {}
  const authz = h.authorization || h.Authorization || ''
  if (authz.toLowerCase().startsWith('bearer ')) { const t = authz.slice(authz.indexOf(' ') + 1).trim(); if (t) return t }
  const q = event.queryStringParameters || {}
  return q.key || q.token || tokenFromString(event.path) || null
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

function parseBody(event) {
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '')
  const ct = (event.headers?.['content-type'] || event.headers?.['Content-Type'] || '')
  if (ct.includes('application/x-www-form-urlencoded')) {
    const out = {}
    for (const [k, v] of new URLSearchParams(raw)) out[k] = v
    return out
  }
  try { return JSON.parse(raw || '{}') } catch { return {} }
}

export const handler = async (event) => {
  const method = event.httpMethod
  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }
  const path = event.path || ''
  const q = event.queryStringParameters || {}

  // ── OAuth discovery ──────────────────────────────────────────────────────
  // We thread the agent token through the discovery chain via the URL path (…/as/<token>) rather
  // than depending on the client to echo a `resource` param — some clients (Hyperagent) don't, which
  // left the token unknown at /authorize. The token is known here (it's in the PRM path), so we point
  // the client at a per-token authorization server whose authorize endpoint carries the token.
  if (path.includes('/.well-known/oauth-protected-resource')) {
    const token = tokenFromString(path)
    const resource = token ? `${ORIGIN}/mcp/${token}` : `${ORIGIN}/mcp`
    const as = token ? `${ORIGIN}/as/${token}` : ORIGIN
    return json({ resource, authorization_servers: [as], bearer_methods_supported: ['header'], scopes_supported: ['ropchat'] })
  }
  if (path.includes('/.well-known/oauth-authorization-server') || path.includes('/.well-known/openid-configuration')) {
    const token = tokenFromString(path)
    const issuer = token ? `${ORIGIN}/as/${token}` : ORIGIN
    return json({
      issuer,
      authorization_endpoint: token ? `${ORIGIN}/oauth/authorize/${token}` : `${ORIGIN}/oauth/authorize`,
      token_endpoint: `${ORIGIN}/oauth/token`,
      registration_endpoint: `${ORIGIN}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['ropchat'],
    })
  }

  // ── Dynamic Client Registration ──────────────────────────────────────────
  if (path.endsWith('/oauth/register')) {
    const body = parseBody(event)
    return json({
      client_id: 'ropchat-' + b64url(createHash('sha256').update(JSON.stringify(body.redirect_uris || []) + Date.now()).digest()).slice(0, 22),
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
      redirect_uris: body.redirect_uris || [],
      client_id_issued_at: Math.floor(Date.now() / 1000),
    }, 201)
  }

  // ── Authorize (auto-approve, PKCE) ───────────────────────────────────────
  // Match with includes(): the token rides the path as …/oauth/authorize/<token>.
  if (path.includes('/oauth/authorize')) {
    const redirectUri = q.redirect_uri
    const state = q.state
    const cc = q.code_challenge
    // Token comes from the authorize URL path (…/oauth/authorize/<token>), or a resource param if sent.
    const token = tokenFromString(event.path) || tokenFromString(q.resource) || tokenFromString(q.mcp_url) || tokenFromString(q.aud)
    const bad = (err) => redirectUri
      ? { statusCode: 302, headers: { ...CORS, Location: `${redirectUri}?error=${err}${state ? `&state=${encodeURIComponent(state)}` : ''}` }, body: '' }
      : json({ error: err }, 400)
    if (!redirectUri || !cc) return bad('invalid_request')
    if (q.code_challenge_method && q.code_challenge_method !== 'S256') return bad('invalid_request')
    if (!token) return bad('invalid_target') // couldn't find the agent token in the resource
    const code = b64urlJson({ cc, ru: redirectUri, t: token, iat: Date.now() })
    const sep = redirectUri.includes('?') ? '&' : '?'
    return { statusCode: 302, headers: { ...CORS, Location: `${redirectUri}${sep}code=${code}${state ? `&state=${encodeURIComponent(state)}` : ''}` }, body: '' }
  }

  // ── Token (verify PKCE, return the agent token as the access token) ───────
  if (path.endsWith('/oauth/token')) {
    const body = parseBody(event)
    if (body.grant_type !== 'authorization_code') return json({ error: 'unsupported_grant_type' }, 400)
    let payload
    try { payload = fromB64url(String(body.code || '')) } catch { return json({ error: 'invalid_grant' }, 400) }
    if (!payload?.t || !payload?.cc || Date.now() - Number(payload.iat || 0) > CODE_TTL_MS) return json({ error: 'invalid_grant' }, 400)
    const verifier = String(body.code_verifier || '')
    if (!verifier || sha256b64url(verifier) !== payload.cc) return json({ error: 'invalid_grant', error_description: 'PKCE check failed' }, 400)
    return json({ access_token: payload.t, token_type: 'Bearer', expires_in: 31536000, scope: 'ropchat' })
  }

  // ── MCP endpoint ─────────────────────────────────────────────────────────
  const accept = (event.headers?.accept || event.headers?.Accept || '')
  const wantsSSE = accept.includes('text/event-stream')
  if (method === 'GET') {
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' }, body: ': ok\n\n' }
  }
  if (method !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  const token = extractToken(event)
  if (!token) {
    const prm = `${ORIGIN}/.well-known/oauth-protected-resource${path.startsWith('/mcp') ? path : '/mcp'}`
    return { statusCode: 401, headers: { ...CORS, 'Content-Type': 'application/json', 'WWW-Authenticate': `Bearer resource_metadata="${prm}"` }, body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Authentication required' } }) }
  }

  let payload
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '')
  try { payload = JSON.parse(raw) } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400) }
  const requests = Array.isArray(payload) ? payload : [payload]
  const out = (await Promise.all(requests.map((m) => handleRpc(m, token)))).filter((x) => x !== null)
  if (!out.length) return { statusCode: 202, headers: CORS, body: '' }
  if (wantsSSE) {
    const b = out.map((o) => `event: message\ndata: ${JSON.stringify(o)}\n\n`).join('')
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' }, body: b }
  }
  return json(Array.isArray(payload) ? out : out[0])
}
