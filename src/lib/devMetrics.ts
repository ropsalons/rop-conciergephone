import type { SupabaseClient } from '@supabase/supabase-js'

// TEMPORARY, DEVELOPMENT-ONLY diagnostics for the Supabase performance work.
// - Counts Supabase REST/RPC requests per minute (by endpoint path only).
// - Tracks how many Realtime subscriptions are currently active, and warns if the count keeps
//   growing (the classic "subscriptions leak while navigating" symptom).
// It is a NO-OP in production builds (guarded by import.meta.env.DEV and tree-shaken out), and it
// never logs query strings, request bodies, headers, tokens, or any message/personal content.
export function initDevMetrics(supabase: SupabaseClient): void {
  if (!import.meta.env.DEV) return

  let host = ''
  try {
    host = new URL((import.meta.env.VITE_SUPABASE_URL as string) || window.location.origin).host
  } catch {
    return
  }

  // ---- REST / RPC request counter (per minute) ----------------------------------
  const counts = new Map<string, number>()
  const origFetch = window.fetch.bind(window)
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
      if (url && url.includes(host)) {
        // Endpoint path only — deliberately drop the query string, body, and headers.
        const path = new URL(url).pathname.replace('/rest/v1/', '').replace('/rpc/', 'rpc:')
        counts.set(path, (counts.get(path) ?? 0) + 1)
      }
    } catch {
      /* ignore */
    }
    return origFetch(input as RequestInfo, init)
  }) as typeof window.fetch

  // ---- Active Realtime subscription tracker -------------------------------------
  const active = new Set<string>()
  const origChannel = supabase.channel.bind(supabase)
  supabase.channel = ((name: string, opts?: unknown) => {
    active.add(name)
    if (active.size > 12) {
      console.warn(`[devMetrics] active realtime subscriptions high: ${active.size}`, [...active])
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (origChannel as any)(name, opts)
  }) as typeof supabase.channel
  const origRemove = supabase.removeChannel.bind(supabase)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase.removeChannel = ((ch: any) => {
    const topic: string | undefined = ch?.topic
    if (topic) active.delete(topic.replace(/^realtime:/, ''))
    return origRemove(ch)
  }) as typeof supabase.removeChannel

  window.setInterval(() => {
    let total = 0
    const top: string[] = []
    for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      total += v
      if (top.length < 8) top.push(`${k}=${v}`)
    }
    counts.clear()
    if (total || active.size) {
      console.info(
        `[devMetrics] Supabase requests/last-60s: ${total} · active realtime subs: ${active.size}`,
        top,
      )
    }
  }, 60_000)

  console.info('[devMetrics] enabled (dev only) — watching Supabase request volume + realtime subs')
}
