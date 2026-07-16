import { useEffect, useState } from 'react'

// A one-tap "a new version is ready" banner. The app already auto-updates and reloads when a new
// build activates, but installed iPhone apps sometimes hold onto a cached copy and don't reload on
// their own — so this gives everyone a visible, reliable way to pull the latest build immediately.
// It listens for the `rop:update-ready` event dispatched from main.tsx when a fresh service worker
// has finished installing.
export function UpdatePrompt() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onReady = () => setShow(true)
    window.addEventListener('rop:update-ready', onReady)
    return () => window.removeEventListener('rop:update-ready', onReady)
  }, [])

  if (!show) return null

  const refresh = () => {
    const fn = (window as unknown as { __ropUpdate?: () => void }).__ropUpdate
    if (typeof fn === 'function') fn()
    else window.location.reload()
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
      <div className="flex max-w-md items-center gap-3 rounded-xl border border-gold-400/40 bg-brand-800 px-4 py-3 shadow-2xl">
        <span className="text-sm text-slate-100">A new version of ROP Chat is ready.</span>
        <button onClick={refresh} className="btn-gold shrink-0 px-3 py-1.5 text-sm">Refresh</button>
        <button
          onClick={() => setShow(false)}
          aria-label="Dismiss"
          className="shrink-0 rounded-lg p-1 text-lg leading-none text-slate-400 hover:text-white"
        >
          ×
        </button>
      </div>
    </div>
  )
}
