// Client side of the Web Share Target flow. The service worker (public/push-sw.js) stashes files
// shared from the phone's share sheet into the `rop-share` cache and redirects to /?share=1; here we
// read them back into real File objects for the "Share to ROP Chat" screen, then clear the cache.

export interface SharedMedia {
  files: File[]
  text: string
}

// True when the app was opened from a share (…/?share=1).
export function isShareLaunch(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('share') === '1'
  } catch {
    return false
  }
}

// Remove the ?share=1 flag from the URL without reloading, once we've handled it.
export function clearShareFlag() {
  try {
    const u = new URL(window.location.href)
    u.searchParams.delete('share')
    window.history.replaceState({}, '', u.pathname + (u.search || '') + (u.hash || ''))
  } catch {
    /* ignore */
  }
}

// Pull the shared files out of the cache (and clear it, so a refresh doesn't re-open the share).
export async function takeSharedMedia(): Promise<SharedMedia | null> {
  if (typeof caches === 'undefined') return null
  try {
    const cache = await caches.open('rop-share')
    const metaRes = await cache.match('/__share/meta')
    if (!metaRes) return null
    const meta = (await metaRes.json()) as { files: Array<{ key: string; name: string; type: string }>; text: string }
    const files: File[] = []
    for (const m of meta.files ?? []) {
      const r = await cache.match(m.key)
      if (!r) continue
      const blob = await r.blob()
      files.push(new File([blob], m.name || 'shared', { type: m.type || blob.type || 'application/octet-stream' }))
    }
    await caches.delete('rop-share')
    if (!files.length) return null
    return { files, text: meta.text || '' }
  } catch {
    return null
  }
}
