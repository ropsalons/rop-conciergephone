import { useEffect, useState } from 'react'

// A one-tap "a new version is ready" banner. The app already auto-updates and reloads when a new
// build activates, but installed apps (especially on iPhone) sometimes hold onto a cached copy and
// don't reload on their own — so this gives everyone a visible, reliable way to pull the latest
// build. It listens for the `rop:update-ready` event dispatched from main.tsx when a fresh service
// worker has finished installing.
export function UpdatePrompt() {
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onReady = () => setShow(true)
    window.addEventListener('rop:update-ready', onReady)
    return () => window.removeEventListener('rop:update-ready', onReady)
  }, [])

  if (!show) return null

  // Swap in the newest build without destroying anything the user set up. We tell the waiting
  // service worker to activate (SKIP_WAITING) and reload once it takes control, then clear the
  // Workbox *page* caches with a cache-busting reload as a fallback.
  //
  // IMPORTANT: we deliberately do NOT call registration.unregister() here. Unregistering a service
  // worker also deletes its push subscription, which was turning everyone's notifications back off
  // on every update. skipWaiting + clientsClaim (set in the Workbox config) reliably activate the
  // new build on their own, so the heavy-handed unregister is unnecessary as well as harmful.
  const refresh = async () => {
    if (busy) return
    setBusy(true)
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        for (const r of regs) {
          try { (r.waiting ?? r.installing)?.postMessage({ type: 'SKIP_WAITING' }) } catch { /* ignore */ }
        }
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)))
      }
    } catch {
      /* ignore — reload anyway */
    }
    // Navigate with a cache-busting query so the browser re-fetches index.html from the network.
    // HashRouter keeps the current route in the hash, so this preserves where the user is.
    const bust = 'u=' + Date.now()
    const sep = window.location.search ? '&' : '?'
    window.location.replace(window.location.pathname + window.location.search + sep + bust + window.location.hash)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
      <div className="flex max-w-md items-center gap-3 rounded-xl border border-gold-400/40 bg-brand-800 px-4 py-3 shadow-2xl">
        <span className="text-sm text-slate-100">
          {busy ? 'Updating…' : 'A new version of ROP Chat is ready.'}
        </span>
        <button onClick={refresh} disabled={busy} className="btn-gold shrink-0 px-3 py-1.5 text-sm disabled:opacity-60">
          {busy ? 'Updating…' : 'Refresh'}
        </button>
        {!busy && (
          <button
            onClick={() => setShow(false)}
            aria-label="Dismiss"
            className="shrink-0 rounded-lg p-1 text-lg leading-none text-slate-400 hover:text-white"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}
