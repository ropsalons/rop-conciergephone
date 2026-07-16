// ROP Chat — daily AI briefing.
//
// Once each morning (pg_cron) it digests the last 24h of activity across the team's public channels
// and asks Claude to write a short, friendly recap, posted to #daily-briefing as "ROP Assistant (AI)".
// Deployed copy holds the live ANTHROPIC_API_KEY; the repo copy keeps it redacted (Deno.env fallback).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const BOT_ID = '00000000-0000-4000-8000-00000000b010'
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? 'REDACTED_SEE_DEPLOYED_FUNCTION'
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001'
const AGENT = { slug: 'rop-assistant', name: 'ROP Assistant', provider: 'anthropic' }
const TZ = 'America/New_York'

const SYSTEM =
  'You are ROP Assistant, writing the morning briefing for Robert of Philadelphia (a group of salons) ' +
  'in their team chat. Given a digest of the last 24 hours of channel activity, write a concise, warm, ' +
  'scannable recap for leadership and staff: a one-line intro, then short bullet highlights grouped by ' +
  'theme (wins, questions needing answers, notable discussions, anything to follow up). Keep it under ' +
  '200 words. Do not invent anything that is not in the digest. If it was quiet, say so briefly.'

async function askClaude(digest: string): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, system: SYSTEM, messages: [{ role: 'user', content: 'Activity digest for the last 24 hours:\n\n' + digest + '\n\nWrite the morning briefing.' }] }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + JSON.stringify(j).slice(0, 200))
  return (Array.isArray(j.content) ? j.content.map((c: any) => (c.type === 'text' ? c.text : '')).join('').trim() : '') || 'No briefing generated.'
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET)
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: settings } = await admin.from('ai_settings').select('ai_enabled').eq('only_row', true).maybeSingle()
  if (!ANTHROPIC_KEY || settings?.ai_enabled === false)
    return new Response(JSON.stringify({ ok: true, dormant: !ANTHROPIC_KEY, disabled: settings?.ai_enabled === false }), { headers: { 'Content-Type': 'application/json' } })

  try {
    // Channels in scope: public, not archived, not AI-excluded, and not the briefing channel itself.
    const { data: chans } = await admin.from('channels').select('id,name,slug').eq('type', 'public').eq('is_archived', false).eq('ai_excluded', false)
    const byId = new Map((chans ?? []).map((c: any) => [c.id, c]))
    const ids = (chans ?? []).map((c: any) => c.id)
    const briefingCh = (chans ?? []).find((c: any) => c.slug === 'daily-briefing')

    const since = new Date(Date.now() - 24 * 3600_000).toISOString()
    const { data: msgs } = await admin.from('messages')
      .select('channel_id,user_id,body,metadata,created_at')
      .in('channel_id', ids).eq('is_deleted', false).neq('user_id', BOT_ID)
      .gte('created_at', since).order('created_at', { ascending: true }).limit(600)

    // Group by channel: count + a few sample lines (human conversation).
    const groups = new Map<string, { name: string; count: number; samples: string[] }>()
    for (const m of msgs ?? []) {
      const ch = byId.get(m.channel_id) as any
      if (!ch) continue
      const g = groups.get(m.channel_id) ?? { name: ch.name || ch.slug, count: 0, samples: [] }
      g.count++
      const t = String(m.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 180)
      if (t && g.samples.length < 4) g.samples.push(t)
      groups.set(m.channel_id, g)
    }

    let digest = ''
    for (const g of [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 25)) {
      digest += `#${g.name} — ${g.count} message${g.count === 1 ? '' : 's'}\n`
      for (const s of g.samples) digest += `   • ${s}\n`
    }
    if (!digest) digest = '(No human messages in the last 24 hours.)'

    const dateLabel = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
    const reply = await askClaude(digest)
    const body = `📋 Daily Briefing — ${dateLabel}\n\n${reply}`

    if (briefingCh) {
      await admin.from('messages').insert({
        channel_id: briefingCh.id, user_id: BOT_ID, body,
        metadata: { via_api: true, ai_agent: AGENT, author_name: AGENT.name, briefing: true },
      })
    }
    return new Response(JSON.stringify({ ok: true, channels: groups.size, messages: (msgs ?? []).length }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
