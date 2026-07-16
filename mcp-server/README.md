# ROP Chat — MCP server

Lets **Claude Code** (and any MCP-compatible Claude client) read and write ROP Chat as native tools,
under a strict per-agent permission scope. It's a thin, safe wrapper around the ROP Chat **AI gateway**
edge function — it holds **no database credentials** and runs **no SQL**; every tool call is a single
authenticated HTTPS request that the gateway authorizes, rate-limits, and audits server-side.

## Tools exposed

`list_channels` · `read_channel_messages` · `read_thread` · `search_messages` ·
`post_channel_message` · `reply_to_thread` · `send_direct_message` ·
`create_task` · `update_task` · `list_pending_approvals` · `request_sensitive_action`

Each tool only does what the agent's permissions allow — content the agent can't see is never returned,
and disallowed actions are rejected with a clear error.

## Setup

1. Install dependencies (once):

   ```bash
   cd mcp-server
   npm install
   ```

2. Get an **agent token** from ROP Chat: **Admin → AI Integrations → Add agent** (or use an existing
   agent). The token is shown **once** — it looks like `rop_ai_…`. Treat it like a password.

3. Configure your MCP client:

   ### Claude Code (`.mcp.json` in your project, or `~/.claude.json`)

   ```json
   {
     "mcpServers": {
       "rop-chat": {
         "command": "node",
         "args": ["/ABSOLUTE/PATH/TO/rop-conciergephone/mcp-server/index.mjs"],
         "env": {
           "ROP_AI_TOKEN": "rop_ai_XXXXXXXXXXXXXXXXXXXXXXXX",
           "ROP_GATEWAY_URL": "https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ai-gateway"
         }
       }
     }
   }
   ```

   Or via the CLI:

   ```bash
   claude mcp add rop-chat \
     --env ROP_AI_TOKEN=rop_ai_XXXX \
     --env ROP_GATEWAY_URL=https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/ai-gateway \
     -- node /ABSOLUTE/PATH/TO/rop-conciergephone/mcp-server/index.mjs
   ```

   ### Claude Desktop / Claude Cowork (`claude_desktop_config.json`)

   Same `mcpServers` block as above. Cowork uses the same MCP config surface as Claude Desktop where
   MCP servers are supported.

4. Restart the client. You should see the `rop-chat` tools available. Try: *"List my ROP Chat channels"*.

## Environment variables

| Variable          | Required | Description                                                        |
| ----------------- | -------- | ------------------------------------------------------------------ |
| `ROP_AI_TOKEN`    | yes      | The agent's bearer token (`rop_ai_…`). Secret. Rotatable in Admin. |
| `ROP_GATEWAY_URL` | yes      | The gateway endpoint (the Supabase `…/functions/v1/ai-gateway`).   |

## Security notes

- The token maps to one **AI agent identity** with an explicit allow-list of channels and actions.
- Sensitive channels (e.g. payables, leadership) are excluded from AI access by default.
- An admin can **rotate** the token, **disable** the agent, or hit **Disable all AI access** at any time.
- Never commit the token. `node_modules/` is gitignored; do not add `.mcp.json` with a real token to git.
