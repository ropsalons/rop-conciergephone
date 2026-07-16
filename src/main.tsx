import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { supabase } from './lib/supabase'
import { initDevMetrics } from './lib/devMetrics'
import './index.css'

// Development-only: log Supabase request volume + active realtime subscriptions. No-op in production.
initDevMetrics(supabase)

// Keep installed apps current. A service worker only re-checks for a new build on a full
// navigation, which almost never happens inside a PWA — so phones get stuck on an old
// version until they're force-closed. Here we register the SW and actively poll for updates
// (every 30s and whenever the app is brought back to the foreground); when a new version
// activates we reload once so users always land on the latest build.
if ('serviceWorker' in navigator) {
  let reloading = false
  const wasControlled = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only reload when an existing version is being replaced — not on the very first install.
    if (reloading || !wasControlled) return
    reloading = true
    window.location.reload()
  })
  // When a push notification is tapped, the service worker asks us to route to the exact
  // conversation/channel. HashRouter picks up the hash change and navigates there.
  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data as { type?: string; path?: string } | undefined
    if (d && d.type === 'navigate' && typeof d.path === 'string') {
      window.location.hash = d.path
    }
  })

  // Tell the service worker we're ready to receive a deep link. On iOS, tapping a notification while
  // the app is closed launches it at the start URL and drops the target; the SW is holding it and
  // replies with a 'navigate' message so we still land on the right conversation. We announce on
  // load and whenever the app comes to the foreground (covers cold launch + resume).
  const announceReady = () => {
    navigator.serviceWorker.ready
      .then((reg) => {
        const sw = reg.active || navigator.serviceWorker.controller
        if (sw) sw.postMessage({ type: 'client-ready' })
      })
      .catch(() => {})
  }
  announceReady()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') announceReady()
  })
}

const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, reg) {
    if (!reg) return
    // Surface a visible "Refresh" banner when a fresh build has finished installing, so nobody is
    // ever stuck on a stale cached copy (see components/UpdatePrompt.tsx).
    const announce = () => window.dispatchEvent(new CustomEvent('rop:update-ready'))
    if (reg.waiting && navigator.serviceWorker.controller) announce()
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing
      if (!nw) return
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          // Tell the freshly-installed worker to take over now. It then controls the page, which
          // fires `controllerchange` above and reloads us onto the new build automatically. Without
          // this nudge the new version sat waiting and never applied. The banner is the backup.
          try { nw.postMessage({ type: 'SKIP_WAITING' }) } catch { /* ignore */ }
          announce()
        }
      })
    })
    const check = () => {
      if (navigator.onLine) reg.update().catch(() => {})
    }
    setInterval(check, 30_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})
// The banner's "Refresh" button calls this to force the waiting worker to activate and reload.
;(window as unknown as { __ropUpdate?: () => void }).__ropUpdate = () => {
  updateSW(true).catch(() => window.location.reload())
}

// HashRouter keeps deep links working on static hosts (GitHub Pages, Supabase Storage)
// that don't rewrite unknown paths to index.html. On Netlify the netlify.toml SPA
// redirect also supports BrowserRouter, but HashRouter works everywhere with no config.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
