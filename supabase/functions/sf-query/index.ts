// ROP Chat — Snowflake query endpoint for AI agents.
//
// A permission-gated, audited, READ-ONLY bridge to the company's Snowflake analytics (ANALYTICS.MARTS).
// The MCP server's `run_snowflake_query` tool calls this with the agent's bearer token; we validate the
// token against ai_agents (must be active and have `run_snowflake_query` in allowed_actions), enforce
// read-only SQL, run it under the ROP_CONNECT_READONLY role (which itself can't write), cap the rows
// returned, and write an audit row — same trust model as the ROP Chat gateway.
//
// Deployed copy holds the live Snowflake token; the repo copy keeps it redacted.

const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? 'https://qrigzwactbwbpuufehxo.supabase.co'
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // auto-injected
const SF_URL = 'https://QXKKQNU-JNB21158.snowflakecomputing.com/api/v2/statements'
const SF_TOKEN = Deno.env.get('SF_TOKEN') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
const MAX_ROWS = 1000

function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': req.headers.get('access-control-request-headers') ?? 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
const json = (b: unknown, req: Request, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...cors(req) } })

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Only allow read statements. The Snowflake role is read-only too, so this is a second belt.
function isReadOnly(sql: string): boolean {
  const s = sql.trim().replace(/^\(+/, '').toLowerCase()
  if (!/^(with|select|show|describe|desc|explain)\b/.test(s)) return false
  // Block obvious write/DDL verbs even if smuggled after a CTE/semicolon.
  if (/;\s*\S/.test(sql.trim().replace(/;\s*$/, ''))) return false // no multiple statements
  if (/\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|copy|call|use)\b/i.test(s)) return false
  return true
}

async function runSnowflake(sql: string): Promise<{ columns: string[]; rows: string[][] }> {
  const headers = {
    Authorization: 'Bearer ' + SF_TOKEN,
    'X-Snowflake-Authorization-Token-Type': 'PROGRAMMATIC_ACCESS_TOKEN',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const r = await fetch(SF_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ statement: sql, timeout: 60, warehouse: 'COMPUTE_WH', role: 'ROP_CONNECT_READONLY', database: 'ANALYTICS', schema: 'MARTS' }),
  })
  let j: any = await r.json()
  if (r.status === 202 && j.statementHandle) {
    for (let i = 0; i < 20; i++) {
      await new Promise((res) => setTimeout(res, 1500))
      const g = await fetch(SF_URL + '/' + j.statementHandle, { headers })
      if (g.status === 200) { j = await g.json(); break }
      if (g.status !== 202) { j = await g.json(); break }
    }
  }
  if (!j.data) throw new Error('Snowflake: ' + JSON.stringify(j).slice(0, 300))
  const columns = (j.resultSetMetaData?.rowType ?? []).map((c: any) => c.name as string)
  const rows = (j.data as string[][]).slice(0, MAX_ROWS)
  return { columns, rows }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST' }, req, 405)

  // Authenticate the agent token.
  const authz = req.headers.get('authorization') ?? ''
  const raw = authz.toLowerCase().startsWith('bearer ') ? authz.slice(authz.indexOf(' ') + 1).trim() : ''
  if (!raw) return json({ ok: false, error: 'Missing agent token' }, req, 401)
  const hash = await sha256hex(raw)
  const ar = await fetch(`${SUPA_URL}/rest/v1/ai_agents?token_hash=eq.${hash}&select=id,is_active,allowed_actions`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  })
  const agents = ar.ok ? await ar.json().catch(() => []) : []
  const agent = Array.isArray(agents) ? agents[0] : null
  if (!agent || !agent.is_active) return json({ ok: false, error: 'Invalid, revoked, or disabled agent token' }, req, 401)
  if (!Array.isArray(agent.allowed_actions) || !agent.allowed_actions.includes('run_snowflake_query'))
    return json({ ok: false, error: 'This agent may not run Snowflake queries.' }, req, 403)

  const audit = async (status: string, allowed: boolean, meta: Record<string, unknown>) => {
    try {
      await fetch(`${SUPA_URL}/rest/v1/ai_audit_logs`, {
        method: 'POST',
        headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ agent_id: agent.id, action: 'run_snowflake_query', allowed, status, meta }),
      })
    } catch { /* never let audit break the response */ }
  }

  const body = await req.json().catch(() => ({} as any))
  const sql = String(body.sql ?? body.query ?? body.statement ?? '').trim()
  if (!sql) return json({ ok: false, error: 'Provide "sql"' }, req, 400)
  if (!isReadOnly(sql)) {
    await audit('denied', false, { reason: 'not read-only', sql: sql.slice(0, 300) })
    return json({ ok: false, error: 'Only read-only queries are allowed (SELECT / WITH / SHOW / DESCRIBE / EXPLAIN, single statement).' }, req, 400)
  }
  try {
    const { columns, rows } = await runSnowflake(sql)
    await audit('ok', true, { sql: sql.slice(0, 300), row_count: rows.length })
    return json({ ok: true, columns, rows, row_count: rows.length, truncated: rows.length >= MAX_ROWS }, req)
  } catch (e) {
    const msg = String((e as Error).message ?? e)
    await audit('error', true, { sql: sql.slice(0, 300), error: msg.slice(0, 300) })
    return json({ ok: false, error: msg }, req, 500)
  }
})
