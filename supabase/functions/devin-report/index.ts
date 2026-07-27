// ROP Chat — Devin (and any AI agent) report intake.
//
// Secure inbound endpoint that turns an automated report into a real ROP Chat message posted to the
// "Devin Daily Report" channel. Authenticates against the app's existing ai_agents token system, so
// Devin — and any future agent (Claude Code, ChatGPT, GitHub Actions, Netlify, Railway, Supabase,
// Snowflake, …) with its own token and post_message rights — reports through the same API.
//
//   POST /functions/v1/devin-report      → post a report   (Authorization: Bearer <agent token>)
//   GET  /functions/v1/devin-report      → health check
//
// No secret lives in this file: the bearer is hashed and checked against ai_agents.token_hash.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const BOT_ID = '00000000-0000-4000-8000-00000000b010'
const CHANNEL_SLUG = 'devin-daily-report'
const CHANNEL_NAME = 'Devin Daily Report'
const MAX_BODY_BYTES = 120_000 // reject oversized payloads
const KNOWN_TYPES = new Set([
  'ceo_morning_brief', 'sales', 'payroll', 'bank_deposits', 'google_reviews',
  'ai_jobs', 'github', 'netlify', 'security', 'operations', 'general',
])

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-devin-run-id',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function sevEmoji(sev?: string): string {
  switch (String(sev ?? '').toLowerCase()) {
    case 'critical': return '🔴'
    case 'error': return '🔴'
    case 'warning': case 'warn': return '🟠'
    case 'success': return '✅'
    default: return 'ℹ️'
  }
}
function statusEmoji(s?: string): string {
  const v = String(s ?? '').toLowerCase()
  if (v.includes('success') || v === 'ok' || v === 'done') return '✅'
  if (v.includes('fail') || v.includes('error')) return '❌'
  if (v.includes('partial') || v.includes('warn')) return '⚠️'
  return '•'
}

// US Eastern formatting for any timestamp.
function fmtTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso)
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short',
    }).format(d) + ' ET'
  } catch { return d.toISOString() }
}

function buildMessage(b: any): string {
  const title = String(b.title)
  const lines: string[] = []
  lines.push(`${sevEmoji(b.severity)} **${title}**`)
  const meta1: string[] = []
  if (b.source) meta1.push(`**Source:** ${b.source}`)
  if (b.report_type) meta1.push(`**Type:** ${b.report_type}`)
  if (b.severity) meta1.push(`**Severity:** ${b.severity}`)
  if (meta1.length) lines.push(meta1.join('  ·  '))
  const meta2: string[] = []
  if (b.run_status) meta2.push(`**Status:** ${statusEmoji(b.run_status)} ${b.run_status}`)
  const when = b.run_completed_at || b.run_started_at
  if (when) meta2.push(`**When:** ${fmtTime(when)}`)
  if (meta2.length) lines.push(meta2.join('  ·  '))
  if (b.summary) lines.push(`\n**Summary**\n${String(b.summary)}`)
  if (b.body) lines.push(`\n**Report**\n${String(b.body)}`)
  if (b.metadata && typeof b.metadata === 'object' && Object.keys(b.metadata).length) {
    let m = ''
    try { m = JSON.stringify(b.metadata, null, 0) } catch { m = String(b.metadata) }
    if (m && m !== '{}') lines.push(`\n**Metadata:** \`${m.slice(0, 1500)}\``)
  }
  return lines.join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // ── Health ────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    return json({ ok: true, service: 'Devin to ROP Chat', channel: CHANNEL_NAME })
  }
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ── Auth: bearer token → ai_agents (active + may post_message) ─────────────
  const authz = req.headers.get('authorization') ?? ''
  const raw = authz.toLowerCase().startsWith('bearer ') ? authz.slice(authz.indexOf(' ') + 1).trim() : ''
  if (!raw) return json({ ok: false, error: 'Missing bearer token' }, 401)
  const { data: agent } = await admin
    .from('ai_agents')
    .select('id,name,slug,is_active,allowed_actions,rate_per_min')
    .eq('token_hash', await sha256hex(raw))
    .maybeSingle()
  if (!agent || !agent.is_active) return json({ ok: false, error: 'Invalid or revoked token' }, 401)
  if (!(agent.allowed_actions ?? []).includes('post_message'))
    return json({ ok: false, error: 'This token may not post reports' }, 403)

  // ── Global AI kill-switch ──────────────────────────────────────────────────
  const { data: settings } = await admin.from('ai_settings').select('ai_enabled').eq('only_row', true).maybeSingle()
  if (settings && settings.ai_enabled === false) return json({ ok: false, error: 'AI posting is disabled by an administrator' }, 503)

  // ── Size guard ──────────────────────────────────────────────────────────────
  const rawBody = await req.text()
  if (rawBody.length > MAX_BODY_BYTES) return json({ ok: false, error: 'Payload too large' }, 413)

  let b: any
  try { b = JSON.parse(rawBody) } catch { return json({ ok: false, error: 'Body must be valid JSON' }, 400) }

  // ── Required fields ─────────────────────────────────────────────────────────
  const missing = ['title', 'report_type', 'source', 'body', 'run_status'].filter((k) => !b?.[k] || !String(b[k]).trim())
  if (missing.length) return json({ ok: false, error: `Missing required field(s): ${missing.join(', ')}` }, 400)
  if (!KNOWN_TYPES.has(String(b.report_type)))
    b._type_note = `unknown report_type "${b.report_type}" (accepted, formatted as general)`

  // ── Rate limit (per agent, rolling 60s) ─────────────────────────────────────
  const limit = Number(agent.rate_per_min) || 120
  const since = new Date(Date.now() - 60_000).toISOString()
  const { count: recent } = await admin
    .from('devin_report_runs').select('run_id', { count: 'exact', head: true })
    .eq('agent_slug', agent.slug).gte('created_at', since)
  if ((recent ?? 0) >= limit) return json({ ok: false, error: 'Rate limit exceeded' }, 429)

  // ── Idempotency (X-Devin-Run-ID header or body.run_id) ─────────────────────
  const runId = (req.headers.get('x-devin-run-id') || (typeof b.run_id === 'string' ? b.run_id : '') || '').trim()
  if (runId) {
    const { data: prior } = await admin.from('devin_report_runs').select('message_id').eq('run_id', runId).maybeSingle()
    if (prior) return json({ ok: true, duplicate: true, message_id: prior.message_id }, 200)
  }
  const recordId = runId || crypto.randomUUID()

  // ── Resolve channel ─────────────────────────────────────────────────────────
  const { data: ch } = await admin.from('channels').select('id').eq('slug', CHANNEL_SLUG).maybeSingle()
  if (!ch) return json({ ok: false, error: 'Report channel not found' }, 500)

  // ── Post the message ────────────────────────────────────────────────────────
  const body = buildMessage(b)
  const metadata = {
    via_api: true,
    ai_agent: { slug: agent.slug, name: agent.name, provider: 'report' },
    author_name: agent.name,
    devin_report: {
      report_type: String(b.report_type), severity: b.severity ?? null,
      run_status: String(b.run_status), source: String(b.source),
      run_id: runId || null, run_started_at: b.run_started_at ?? null, run_completed_at: b.run_completed_at ?? null,
    },
  }
  const { data: msg, error: postErr } = await admin.from('messages')
    .insert({ channel_id: ch.id, user_id: BOT_ID, body, message_type: 'user', metadata })
    .select('id').single()
  if (postErr) return json({ ok: false, error: postErr.message }, 500)

  // Record for idempotency + rate limiting; also stamps last_used_at on the agent.
  await admin.from('devin_report_runs').insert({ run_id: recordId, agent_slug: agent.slug, channel_id: ch.id, message_id: msg.id })
  await admin.from('ai_agents').update({ last_used_at: new Date().toISOString() }).eq('id', agent.id)

  return json({ ok: true, message_id: msg.id, channel: CHANNEL_NAME, posted_as: agent.name })
})
