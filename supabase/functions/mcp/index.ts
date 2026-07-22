// ROP Chat — MCP server (Streamable HTTP) for external assistants (ChatGPT connectors, Manus, etc.).
//
// Exposes ROP Chat as a set of MCP tools that any MCP-capable client can call. It is a thin,
// stateless wrapper: each tools/call is forwarded to the existing ai-gateway with the caller's
// agent token, so all authentication, per-agent scope, and audit logging happen there unchanged.
//
// AUTH: the caller's ROP Chat agent token rides in the URL as ?key=rop_ai_...  (so ChatGPT can be
// configured with "No authentication" — the secret is the URL itself). Example connector URL:
//   https://<project>.supabase.co/functions/v1/mcp?key=rop_ai_xxxxxxxx
// Keep that URL private — it is a credential.
//
// Transport: JSON-RPC 2.0 over HTTP POST, responding application/json (stateless). Implements
// initialize · notifications/initialized · tools/list · tools/call · ping.

const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? 'https://qrigzwactbwbpuufehxo.supabase.co'
const GATEWAY = `${SUPA_URL}/functions/v1/ai-gateway`
const DEFAULT_PROTOCOL = '2025-06-18'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// The tools we surface to the assistant, mapped to ai-gateway actions.
const TOOLS = [
  {
    name: 'rop_post_message',
    description: 'Post a message to a ROP Chat channel (by slug or name). Use for announcements, updates, or notes to the team.',
    action: 'post_message',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'channel slug or name, e.g. "ai-updates"' },
        text: { type: 'string', description: 'the message to post' },
        author_name: { type: 'string', description: 'optional display name for who is posting' },
      },
      required: ['channel', 'text'],
    },
  },
  {
    name: 'rop_list_channels',
    description: 'List the ROP Chat channels this connection can see (slug, name, description).',
    action: 'list_channels',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'rop_read_channel',
    description: 'Read recent messages from a ROP Chat channel (by slug or name).',
    action: 'read_channel_messages',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'channel slug or name' },
        limit: { type: 'integer', description: 'how many recent messages (default 30, max 100)' },
      },
      required: ['channel'],
    },
  },
  {
    name: 'rop_search_messages',
    description: 'Search message text across ROP Chat channels this connection can see.',
    action: 'search_messages',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'text to search for' },
        channel: { type: 'string', description: 'optional: restrict to one channel (slug or name)' },
        limit: { type: 'integer' },
      },
      required: ['query'],
    },
  },
  {
    name: 'rop_send_dm',
    description: 'Send a direct message to one ROP Chat person by their email.',
    action: 'send_dm',
    inputSchema: {
      type: 'object',
      properties: {
        to_email: { type: 'string', description: "recipient's email address on file in ROP Chat" },
        text: { type: 'string', description: 'the message' },
        author_name: { type: 'string', description: 'optional display name for who is sending' },
      },
      required: ['to_email', 'text'],
    },
  },
  {
    name: 'rop_create_task',
    description: 'File a task in ROP Chat so it is tracked and not forgotten.',
    action: 'create_task',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string', description: 'optional details' },
        channel: { type: 'string', description: 'optional channel to attach the task to' },
      },
      required: ['title'],
    },
  },
]
const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))

function tokenFrom(req: Request): string {
  const url = new URL(req.url)
  const q = url.searchParams.get('key') || url.searchParams.get('token') || ''
  if (q) return q
  const authz = req.headers.get('authorization') ?? ''
  return authz.toLowerCase().startsWith('bearer ') ? authz.slice(authz.indexOf(' ') + 1).trim() : ''
}

async function callGateway(token: string, action: string, params: Record<string, unknown>) {
  const r = await fetch(GATEWAY, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  })
  const j = await r.json().catch(() => ({ ok: false, error: `gateway returned ${r.status}` }))
  return { httpOk: r.ok, body: j }
}

// JSON-RPC helpers
const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result })
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  // Streamable-HTTP clients may open a GET SSE stream for server->client messages; this stateless
  // server has none, so decline it — clients fall back to plain POST request/response.
  if (req.method === 'GET') return new Response('Method Not Allowed', { status: 405, headers: CORS })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS })

  const token = tokenFrom(req)

  let msg: any
  try { msg = await req.json() } catch { return json(rpcError(null, -32700, 'Parse error'), 400) }

  // Notifications (no id) — acknowledge with 202 and no body.
  if (msg && msg.id === undefined) return new Response(null, { status: 202, headers: CORS })

  const { id, method, params } = msg ?? {}

  if (method === 'initialize') {
    const proto = params?.protocolVersion || DEFAULT_PROTOCOL
    return json(rpcResult(id, {
      protocolVersion: proto,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'ROP Chat', version: '1.0.0' },
      instructions: 'Tools to post to and read from ROP Chat. Use rop_post_message to post; channels are referenced by slug or name (e.g. "ai-updates").',
    }))
  }

  if (method === 'ping') return json(rpcResult(id, {}))

  if (method === 'tools/list') {
    return json(rpcResult(id, {
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    }))
  }

  if (method === 'tools/call') {
    if (!token) return json(rpcResult(id, { isError: true, content: [{ type: 'text', text: 'No ROP Chat key configured. Add ?key=rop_ai_… to the connector URL.' }] }))
    const name = params?.name
    const tool = TOOL_BY_NAME.get(name)
    if (!tool) return json(rpcError(id, -32602, `Unknown tool: ${name}`))
    const args = (params?.arguments ?? {}) as Record<string, unknown>
    try {
      const { body } = await callGateway(token, tool.action, args)
      const ok = body && body.ok !== false
      const text = ok
        ? summarize(tool.action, body)
        : `ROP Chat error: ${body?.error ?? 'unknown error'}`
      return json(rpcResult(id, { isError: !ok, content: [{ type: 'text', text }] }))
    } catch (e) {
      return json(rpcResult(id, { isError: true, content: [{ type: 'text', text: `Failed to reach ROP Chat: ${String((e as Error).message ?? e)}` }] }))
    }
  }

  return json(rpcError(id ?? null, -32601, `Method not found: ${method}`))
})

// Turn a gateway response into a short, model-friendly summary.
function summarize(action: string, body: any): string {
  switch (action) {
    case 'post_message':
      return `Posted to ROP Chat${body.channel_id ? '' : ''}. (message id ${body.message_id})`
    case 'send_dm':
      return `Direct message sent. (message id ${body.message_id})`
    case 'create_task':
      return `Task created. (task id ${body.task_id}, status ${body.status})`
    case 'list_channels':
      return JSON.stringify((body.channels ?? []).map((c: any) => ({ slug: c.slug, name: c.name, description: c.description })))
    case 'read_channel_messages':
      return JSON.stringify({ channel: body.channel, messages: body.messages })
    case 'search_messages':
      return JSON.stringify({ results: body.results })
    default:
      return JSON.stringify(body)
  }
}
