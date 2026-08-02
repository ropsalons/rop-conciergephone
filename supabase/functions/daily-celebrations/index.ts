// ROP Chat — daily birthday & work-anniversary shout-outs in #Announcements.
//
// Runs once a day (pg_cron). Reads birth_date + hire_date on profiles (sourced from Gusto) and, for
// anyone whose month/day is TODAY in Eastern time, posts an exciting, emoji-filled announcement that
// tags the person. Idempotent: at most one birthday and one anniversary post per person per year.
//
//   POST /functions/v1/daily-celebrations           (header x-cron-secret)   → posts
//   POST /functions/v1/daily-celebrations {"dry_run":true}                    → returns who WOULD post
//
// Auth: the shared x-cron-secret used by every other ROP Chat cron.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const BOT_ID = '00000000-0000-4000-8000-00000000b010'
const ANNOUNCEMENTS_ID = 'df22c0a7-e38c-41e6-9fa1-996b2d12da8a'
const TZ = 'America/New_York'
// Real value lives in the deployed function only (env CRON_SECRET / fallback); redacted in the repo.
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? 'REDACTED_SEE_DEPLOYED_DB'

function etParts(): { mmdd: string; year: number } {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date())
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return { mmdd: `${g('month')}-${g('day')}`, year: Number(g('year')) }
}
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - n % 10 === 10 ? 0 : n % 10)] ?? 'th'}`

Deno.serve(async (req) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-cron-secret, content-type' }
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  let body: any = {}
  try { body = await req.json() } catch { /* empty body is fine */ }
  const dryRun = body?.dry_run === true

  // Auth: cron secret (dry-run is also gated so nobody can enumerate birthdays).
  const provided = req.headers.get('x-cron-secret') ?? ''
  if (provided !== CRON_SECRET) return json({ ok: false, error: 'Unauthorized' }, 401)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { mmdd, year } = etParts()

  const { data: people } = await admin
    .from('profiles').select('id, display_name, full_name, birth_date, hire_date')
    .eq('is_active', true)
  const posted: Array<{ kind: string; name: string; years?: number }> = []

  for (const p of (people ?? []) as any[]) {
    const tag = (p.display_name || p.full_name || '').trim()
    if (!tag) continue
    const first = tag.split(/\s+/)[0]

    // Birthday — month/day matches today.
    if (p.birth_date && String(p.birth_date).slice(5) === mmdd) {
      if (await claim(admin, p.id, 'birthday', year, dryRun)) {
        const msg = `🎉🎂🥳 Happy Birthday, @${tag}!! 🎈🎊🎁\n\nHope your day is as amazing as you are, ${first}! 💛✨🙌`
        if (!dryRun) await post(admin, msg, p.id, 'birthday', year)
        posted.push({ kind: 'birthday', name: tag })
      }
    }

    // Work anniversary — month/day matches today, and it's been at least a year.
    if (p.hire_date && String(p.hire_date).slice(5) === mmdd) {
      const years = year - Number(String(p.hire_date).slice(0, 4))
      if (years >= 1 && (await claim(admin, p.id, 'anniversary', year, dryRun))) {
        const msg = `🎉🎊 Happy ${ordinal(years)} Anniversary, @${tag}!! 🥳🙌💛\n\n${years} ${years === 1 ? 'year' : 'years'} with ROP — thank you for everything you do, ${first}! 🚀✨🎈`
        if (!dryRun) await post(admin, msg, p.id, 'anniversary', year)
        posted.push({ kind: 'anniversary', name: tag, years })
      }
    }
  }

  return json({ ok: true, date_et: `${year}-${mmdd}`, dry_run: dryRun, count: posted.length, posted })
})

// Reserve a (person, kind, year) slot so we never double-post. Returns true if this run owns it.
async function claim(admin: any, personId: string, kind: string, year: number, dryRun: boolean): Promise<boolean> {
  const { data: existing } = await admin.from('celebration_posts').select('person_id').eq('person_id', personId).eq('kind', kind).eq('year', year).maybeSingle()
  if (existing) return false
  if (dryRun) return true
  const { error } = await admin.from('celebration_posts').insert({ person_id: personId, kind, year })
  return !error // if another run inserted first, the unique PK makes this fail → skip
}

async function post(admin: any, bodyText: string, personId: string) {
  const { data } = await admin.from('messages').insert({
    channel_id: ANNOUNCEMENTS_ID, user_id: BOT_ID, body: bodyText,
    metadata: { via_api: true, ai_agent: { slug: 'rop-celebrations', name: 'ROP Celebrations', provider: 'rop' }, author_name: 'ROP Celebrations', mentions: [personId] },
  }).select('id').single()
  if (data?.id) await admin.from('celebration_posts').update({ message_id: data.id }).eq('person_id', personId).eq('kind', bodyText.includes('Anniversary') ? 'anniversary' : 'birthday')
}
