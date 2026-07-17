// ROP Chat — staff-sync: keep phone numbers current from Boulevard (Snowflake).
// Matches active Boulevard staff to existing ROP Chat profiles BY EMAIL and fills in any
// MISSING phone number. Fill-blanks-only: it never overwrites a number already on file, so a
// manual correction in the app is always safe. Boulevard is used ONLY for phone numbers here —
// never for creating accounts, because its staff list is full of alias/duplicate rows
// (e.g. "Name_Concierge", "...DO NOT USE", "+shadow@"). New-employee onboarding is handled
// separately from Gusto (a clean HR roster) with a human in the loop.
//
// DMs Rob a short summary from the "ROP Chat" assistant whenever it fills anything in.
// Scheduled daily via pg_cron. Auth: x-cron-secret header (no JWT).
//
// The DEPLOYED copy holds the live Snowflake token; this repo copy keeps it redacted.
// Requires the read-only Snowflake role (ROP_CONNECT_READONLY) to have been granted read
// access to the Boulevard share:
//   grant imported privileges on database BLVD_SHARE to role ROP_CONNECT_READONLY;

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SF_URL = 'https://QXKKQNU-JNB21158.snowflakecomputing.com/api/v2/statements'
const SF_TOKEN = Deno.env.get('SF_TOKEN') ?? 'REDACTED_IN_REPO'
const CRON_SECRET = 'rop-daily-3f9ac21b'
const ROB_DM_CONV = 'b76822f1-8501-453c-b22d-97340378672f'
const ASSISTANT_ID = '00000000-0000-4000-8000-00000000a5c8'

async function sf(sql: string): Promise<string[][]> {
  const headers = {
    Authorization: 'Bearer ' + SF_TOKEN,
    'X-Snowflake-Authorization-Token-Type': 'PROGRAMMATIC_ACCESS_TOKEN',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const r = await fetch(SF_URL, { method: 'POST', headers, body: JSON.stringify({ statement: sql, timeout: 60, warehouse: 'COMPUTE_WH', role: 'ROP_CONNECT_READONLY', database: 'BLVD_SHARE', schema: 'BOULEVARD' }) })
  let j: any = await r.json()
  if (r.status === 202 && j.statementHandle) {
    for (let i = 0; i < 12; i++) { await new Promise((res) => setTimeout(res, 1500)); const g = await fetch(SF_URL + '/' + j.statementHandle, { headers }); if (g.status === 200) { j = await g.json(); break } }
  }
  if (!j.data) throw new Error('Snowflake: ' + JSON.stringify(j).slice(0, 300))
  return j.data as string[][]
}

// Normalize to a bare 10-digit US number to match the format already stored in profiles.
function normPhone(raw: string): string {
  const d = (raw || '').replace(/\D/g, '')
  if (d.length === 11 && d[0] === '1') return d.slice(1)
  return d.length === 10 ? d : ''
}

async function run() {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Boulevard active staff with an email + phone.
  const rows = await sf(`select lower(EMAIL), PHONE_NUMBER from BLVD_SHARE.BOULEVARD.STAFF where IS_ACTIVE=true and EMAIL is not null and EMAIL<>'' and PHONE_NUMBER is not null and PHONE_NUMBER<>''`)
  const phoneByEmail = new Map<string, string>()
  for (const [em, ph] of rows) { const p = normPhone(ph); if (em && p && !phoneByEmail.has(em)) phoneByEmail.set(em, p) }

  const { data: profs, error } = await sb.from('profiles').select('id,email,full_name,display_name,phone,is_active')
  if (error) throw new Error('profiles: ' + error.message)

  const filled: string[] = []
  for (const p of profs ?? []) {
    if (!p.is_active) continue
    if ((p.phone ?? '').trim()) continue // fill blanks only — never overwrite
    const em = (p.email ?? '').toLowerCase()
    const found = em ? phoneByEmail.get(em) : undefined
    if (!found) continue
    const { error: uerr } = await sb.from('profiles').update({ phone: found, updated_at: new Date().toISOString() }).eq('id', p.id)
    if (!uerr) filled.push(p.display_name || p.full_name || em)
  }

  if (filled.length) {
    const body = `📱 Phone sync: added a phone number for ${filled.length} ${filled.length === 1 ? 'person' : 'people'} from Boulevard — ${filled.join(', ')}. They can now be texted from Admin → Send Text.`
    await sb.from('messages').insert({ conversation_id: ROB_DM_CONV, user_id: ASSISTANT_ID, body, message_type: 'user', metadata: {} })
  }

  return { ok: true, boulevard_with_phone: phoneByEmail.size, filled: filled.length, filled_names: filled }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET)
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  try {
    return new Response(JSON.stringify(await run()), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
