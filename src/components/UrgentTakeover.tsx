import { useEffect } from 'react'
import { useUIStore } from '@/stores/uiStore'

// Full-screen "urgent takeover" alert. Fires when a message lands in a channel an admin flagged as
// urgent_popup (see useAppBootstrap). It grabs the screen, plays a repeating alert tone, and won't
// go away until someone opens it or acknowledges it — so time-sensitive things (a name on the
// waitlist, a guest issue) can't be missed. This is the in-app half of the urgent system; a desktop
// wrapper can later reuse the same signal to pop over other apps.
export function UrgentTakeover() {
  const urgent = useUIStore((s) => s.urgent)
  const dismiss = useUIStore((s) => s.dismissUrgent)

  // Repeating alert tone + phone buzz while the alert is up (auto-quiets after 20s; the alert stays).
  useEffect(() => {
    if (!urgent) return
    // If we're running inside the ROP Chat desktop app, hand the alert to the native shell so it pops
    // an always-on-top window OVER other programs (works even when ROP Chat isn't focused). The
    // in-app overlay below still shows when the app itself is on screen. No-op in a plain browser.
    try {
      ;(window as unknown as { ropDesktop?: { urgent: (p: unknown) => void } }).ropDesktop?.urgent({
        title: urgent.title, body: urgent.body, link: urgent.link,
      })
    } catch { /* ignore */ }
    let stopped = false
    let ctx: AudioContext | null = null
    const beep = () => {
      if (stopped) return
      try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        ctx = ctx || new Ctor()
        if (ctx.state === 'suspended') void ctx.resume()
        const now = ctx.currentTime
        for (const [i, freq] of [880, 1175].entries()) {
          const o = ctx.createOscillator()
          const g = ctx.createGain()
          o.type = 'square'
          o.frequency.value = freq
          const t = now + i * 0.18
          g.gain.setValueAtTime(0.0001, t)
          g.gain.exponentialRampToValueAtTime(0.28, t + 0.02)
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
          o.connect(g)
          g.connect(ctx.destination)
          o.start(t)
          o.stop(t + 0.17)
        }
      } catch {
        /* audio may be blocked until a gesture — the visual alert still shows */
      }
      try { navigator.vibrate?.([200, 100, 200]) } catch { /* ignore */ }
    }
    beep()
    const iv = setInterval(beep, 1600)
    const kill = setTimeout(() => { stopped = true; clearInterval(iv) }, 20000)
    return () => {
      stopped = true
      clearInterval(iv)
      clearTimeout(kill)
      try { ctx?.close() } catch { /* ignore */ }
    }
  }, [urgent?.id])

  if (!urgent) return null

  const open = () => {
    if (urgent.link) window.location.hash = urgent.link
    dismiss()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-red-950/80 p-4 backdrop-blur-sm">
      <div className="w-[min(92vw,640px)] overflow-hidden rounded-3xl border-4 border-red-500 bg-brand-950 shadow-2xl ring-4 ring-red-500/30">
        <div className="flex items-center gap-3 bg-red-600 px-6 py-4">
          <span className="text-3xl motion-safe:animate-pulse" aria-hidden>🚨</span>
          <span className="text-lg font-extrabold uppercase tracking-wide text-white">Urgent — action needed</span>
        </div>
        <div className="px-6 py-6">
          <h2 className="text-2xl font-bold text-white">{urgent.title}</h2>
          {urgent.body && <p className="mt-3 whitespace-pre-wrap text-lg leading-relaxed text-slate-200">{urgent.body}</p>}
          <div className="mt-7 flex flex-col gap-2 sm:flex-row">
            {urgent.link && (
              <button onClick={open} className="btn-primary flex-1 bg-red-600 px-4 py-3 text-base font-semibold hover:bg-red-500">
                Open &amp; take action
              </button>
            )}
            <button
              onClick={dismiss}
              className="flex-1 rounded-xl border border-white/20 px-4 py-3 text-base font-semibold text-slate-200 hover:bg-white/10"
            >
              Acknowledge
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
