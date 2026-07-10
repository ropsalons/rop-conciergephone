// ROP Connect — one-off Slack history importer.
// Fetches a Slack "Standard Export" .zip (public Google Drive URL), unzips it in memory,
// and imports channel messages into public.messages — attributed to the Slack Archive author,
// keyed idempotently as uuid_v5(NAMESPACE_URL, channelUuid + ':' + slack_ts) so re-running only
// inserts messages that are missing (existing 18k+ dedupe automatically). No Claude.
//
// Query params: ?mode=count|import (default count) · ?channels=a,b,c (optional filter by Slack name)
// Auth: x-cron-secret header.

import JSZip from 'https://esm.sh/jszip@3.10.1'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const CRON_SECRET = 'rop-daily-3f9ac21b'
const ARCHIVE_AUTHOR = '00000000-0000-4000-8000-00000000a5c8'
const NS_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'
const DEFAULT_FILE_ID = '1KZ5pYBQXwu4bpwm1dJbiIbttVMsIiINP'

// Slack message subtypes that are system/noise — never imported.
const SKIP_SUBTYPES = new Set([
  'channel_join', 'channel_leave', 'channel_topic', 'channel_purpose', 'channel_name',
  'channel_archive', 'channel_unarchive', 'group_join', 'group_leave', 'bot_add', 'bot_remove',
  'bot_message', 'reminder_add', 'pinned_item', 'app_conversation_join', 'sh_room_created',
])

function uuidToBytes(u: string): Uint8Array {
  const h = u.replace(/-/g, '')
  const a = new Uint8Array(16)
  for (let i = 0; i < 16; i++) a[i] = parseInt(h.substr(i * 2, 2), 16)
  return a
}
function bytesToUuid(b: Uint8Array): string {
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
async function uuidv5(name: string): Promise<string> {
  const ns = uuidToBytes(NS_URL)
  const nm = new TextEncoder().encode(name)
  const buf = new Uint8Array(ns.length + nm.length)
  buf.set(ns); buf.set(nm, ns.length)
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', buf)).slice(0, 16)
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  return bytesToUuid(hash)
}

function cleanText(text: string, users: Record<string, string>): string {
  if (!text) return ''
  return text
    .replace(/<@([A-Z0-9]+)(\|[^>]+)?>/g, (_m, id) => '@' + (users[id] || 'user'))
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$2 ($1)')
    .replace(/<(https?:[^>]+)>/g, '$1')
    .replace(/<(mailto:[^|>]+)\|([^>]+)>/g, '$2')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .trim()
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET)
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const u = new URL(req.url)
  const mode = u.searchParams.get('mode') || 'count'
  const fileId = u.searchParams.get('file_id') || DEFAULT_FILE_ID
  const filter = (u.searchParams.get('channels') || '').split(',').map((s) => s.trim()).filter(Boolean)
  const filterSet = new Set(filter)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    // 1. Fetch the zip (follows Drive's redirect to usercontent).
    const dlUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`
    const resp = await fetch(dlUrl)
    const buf = new Uint8Array(await resp.arrayBuffer())
    if (!(buf[0] === 0x50 && buf[1] === 0x4b)) {
      return new Response(JSON.stringify({ ok: false, error: 'not a zip (got ' + resp.status + ')', head: new TextDecoder().decode(buf.slice(0, 200)) }), { status: 502, headers: { 'Content-Type': 'application/json' } })
    }
    const zip = await JSZip.loadAsync(buf)

    // 2. users.json -> id => display name.
    const users: Record<string, string> = {}
    const uf = zip.file('users.json')
    if (uf) {
      for (const usr of JSON.parse(await uf.async('string'))) {
        const p = usr.profile || {}
        users[usr.id] = p.real_name || usr.real_name || p.display_name || usr.name || 'Unknown'
      }
    }

    // 3. our channels: slug -> uuid.
    const { data: chRows } = await db.from('channels').select('id, slug')
    const slugToId: Record<string, string> = {}
    for (const c of chRows || []) slugToId[c.slug] = c.id

    // 4. group zip entries by Slack channel folder.
    const byChannel: Record<string, string[]> = {}
    zip.forEach((path) => {
      const m = path.match(/^([^/]+)\/(\d{4}-\d{2}-\d{2})\.json$/)
      if (m) (byChannel[m[1]] ??= []).push(path)
    })

    const summary: any[] = []
    for (const slackName of Object.keys(byChannel).sort()) {
      if (filterSet.size && !filterSet.has(slackName)) continue
      const channelId = slugToId[slackName]
      if (!channelId) { summary.push({ channel: slackName, mapped: false, found: 0, inserted: 0 }); continue }

      let found = 0
      let inserted = 0
      let batch: any[] = []
      const flush = async () => {
        if (!batch.length) return
        if (mode === 'import') {
          const { error, count } = await db.from('messages').upsert(batch, { onConflict: 'id', ignoreDuplicates: true, count: 'exact' })
          if (!error) inserted += count ?? 0
        }
        batch = []
      }

      for (const path of byChannel[slackName].sort()) {
        let msgs: any[]
        try { msgs = JSON.parse(await zip.file(path)!.async('string')) } catch { continue }
        for (const msg of msgs) {
          if (msg.type !== 'message') continue
          if (msg.subtype && SKIP_SUBTYPES.has(msg.subtype)) continue
          if (msg.bot_id) continue
          const ts = msg.ts
          if (!ts) continue
          const body = cleanText(msg.text || '', users)
          if (!body && !(msg.files && msg.files.length) && !(msg.attachments && msg.attachments.length)) continue
          found++
          const author = users[msg.user] || msg.user_profile?.real_name || msg.user_profile?.name || 'Unknown'
          const meta: any = { slack_ts: ts, slack_author: author }
          if (msg.thread_ts && msg.thread_ts !== ts) meta.slack_thread_ts = msg.thread_ts
          if (Array.isArray(msg.reactions) && msg.reactions.length)
            meta.slack_reactions = msg.reactions.map((r: any) => ({ name: r.name, count: r.count }))
          batch.push({
            id: await uuidv5(channelId + ':' + ts),
            channel_id: channelId,
            user_id: ARCHIVE_AUTHOR,
            body: body || '(shared a file)',
            message_type: 'user',
            metadata: meta,
            created_at: new Date(parseFloat(ts) * 1000).toISOString(),
          })
          if (batch.length >= 400) await flush()
        }
      }
      await flush()
      summary.push({ channel: slackName, mapped: true, found, inserted })
    }

    summary.sort((a, b) => b.found - a.found)
    return new Response(JSON.stringify({ ok: true, mode, channels: summary.length, summary }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
