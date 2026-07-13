import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

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
}

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, reg) {
    if (!reg) return
    const check = () => {
      if (navigator.onLine) reg.update().catch(() => {})
    }
    setInterval(check, 30_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

// HashRouter keeps deep links working on static hosts (GitHub Pages, Supabase Storage)
// that don't rewrite unknown paths to index.html. On Netlify the netlify.toml SPA
// redirect also supports BrowserRouter, but HashRouter works everywhere with no config.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
