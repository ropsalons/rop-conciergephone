#!/usr/bin/env node
// ROP Chat — MCP server.
//
// Exposes the ROP Chat AI gateway as a set of narrowly-scoped MCP tools so Claude Code (and any
// other MCP-compatible client) can read + write ROP Chat under the agent's permission scope.
//
// It is a THIN, SAFE wrapper: it holds no database credentials and runs no SQL. Every tool call is
// a single authenticated HTTPS request to the gateway edge function, which enforces the agent's
// permissions, rate limits, approval rules, and audit logging server-side.
//
// Configure (see README.md):
//   env ROP_AI_TOKEN   = the agent's bearer token (rop_ai_…)   [required]
//   env ROP_GATEWAY_URL= https://<project>.supabase.co/functions/v1/ai-gateway   [required]

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const TOKEN = process.env.ROP_AI_TOKEN
const GATEWAY_URL = process.env.ROP_GATEWAY_URL
if (!TOKEN || !GATEWAY_URL) {
  console.error('[rop-chat-mcp] Missing ROP_AI_TOKEN or ROP_GATEWAY_URL environment variables.')
  process.exit(1)
}

// tool name → { description, gateway action, input schema }
const TOOLS = [
  { name: 'list_channels', action: 'list_channels', description: 'List the ROP Chat channels this agent is allowed to see.',
    schema: { type: 'object', properties: {} } },
  { name: 'list_users', action: 'list_users', description: 'List the staff directory (id, name, email, role, location) so you can match people by name and address DMs/tags by ROP Chat identity.',
    schema: { type: 'object', properties: { query: { type: 'string', description: 'Filter by name/email' }, include_inactive: { type: 'boolean' }, limit: { type: 'integer' } } } },
  { name: 'read_channel_messages', action: 'read_channel_messages', description: 'Read recent messages from an allowed channel (by slug, name, or id).',
    schema: { type: 'object', required: ['channel'], properties: { channel: { type: 'string' }, limit: { type: 'integer', description: '1-100 (default 30)' }, before: { type: 'string', description: 'ISO timestamp to page older' } } } },
  { name: 'read_thread', action: 'read_thread', description: 'Read a message and all of its thread replies.',
    schema: { type: 'object', required: ['message_id'], properties: { message_id: { type: 'string' } } } },
  { name: 'search_messages', action: 'search_messages', description: 'Search message history within allowed channels.',
    schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, channel: { type: 'string' }, limit: { type: 'integer' } } } },
  { name: 'post_channel_message', action: 'post_message', description: 'Post a message to an allowed channel. Appears in ROP Chat clearly tagged as this AI agent.',
    schema: { type: 'object', required: ['channel', 'text'], properties: { channel: { type: 'string' }, text: { type: 'string' }, title: { type: 'string' }, html: { type: 'string', description: 'Optional HTML to render as a card' } } } },
  { name: 'reply_to_thread', action: 'reply_thread', description: 'Reply within a thread on an existing message.',
    schema: { type: 'object', required: ['message_id', 'text'], properties: { message_id: { type: 'string' }, text: { type: 'string' } } } },
  { name: 'delete_message', action: 'delete_message', description: 'Delete one or more ROP Chat messages you can reach (anywhere you can post, or a DM you are part of). Soft delete — reversible by an admin. Pass message_id, or message_ids for a batch (max 50). Set only_own:true to restrict to messages this agent posted.',
    schema: { type: 'object', properties: { message_id: { type: 'string' }, message_ids: { type: 'array', items: { type: 'string' } }, only_own: { type: 'boolean', description: 'If true, only delete messages this agent itself posted' } } } },
  { name: 'send_direct_message', action: 'send_dm', description: 'Send a direct message to a person by their ROP Chat user id (to_user_id) or email (to_email). Requires DM permission.',
    schema: { type: 'object', required: ['text'], properties: { to_user_id: { type: 'string' }, to_email: { type: 'string' }, text: { type: 'string' } } } },
  { name: 'send_group_message', action: 'send_group_dm', description: 'Start/continue a group DM with several people (by to_user_ids or to_emails) and post a message. Requires DM permission.',
    schema: { type: 'object', required: ['text'], properties: { to_user_ids: { type: 'array', items: { type: 'string' } }, to_emails: { type: 'array', items: { type: 'string' } }, title: { type: 'string' }, text: { type: 'string' } } } },
  { name: 'create_channel', action: 'create_channel', description: 'Create a channel (public or private). Idempotent — reuses an existing channel of the same name. The workspace owner is always added.',
    schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, type: { type: 'string', description: 'public | private' }, description: { type: 'string' } } } },
  { name: 'register_webhook', action: 'register_webhook', description: 'Register a return-path webhook and auto-create a dedicated command channel that routes messages to this project.',
    schema: { type: 'object', required: ['url'], properties: { url: { type: 'string' }, project_name: { type: 'string' }, secret: { type: 'string' }, events: { type: 'array', items: { type: 'string' } } } } },
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

async function callGateway(action, params) {
  const res = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = { ok: false, error: `Non-JSON response (${res.status}): ${text.slice(0, 200)}` } }
  return { ok: res.ok && data.ok !== false, data }
}

const server = new Server({ name: 'rop-chat', version: '1.0.0' }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.schema })),
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = BY_NAME.get(req.params.name)
  if (!tool) return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }] }
  const { ok, data } = await callGateway(tool.action, req.params.arguments ?? {})
  return {
    isError: !ok,
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[rop-chat-mcp] ready — ' + TOOLS.length + ' tools connected to ' + GATEWAY_URL)
