import { Component, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { APP_VERSION } from '@/lib/version'

// Force the installed PWA off a stale/broken cached build: drop the service worker and every
// cache, then reload so the browser fetches the current deploy fresh. Exported so error screens
// (including the compact thread fallback) can offer a one-tap "get unstuck" button.
export async function hardReloadApp() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    /* ignore */
  }
  location.reload()
}

// Catches render/runtime errors so a crash shows a recoverable screen instead of a blank page.
// Use the top-level boundary as a safety net; wrap smaller pieces (e.g. the thread panel) with a
// compact `fallback` so one broken piece never takes down the whole app.
interface Props {
  children: ReactNode
  context?: string // label for where this boundary sits (e.g. "thread"), stored with crash reports
  fallback?: (reset: () => void, error: Error) => ReactNode
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }
  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info)
    // Fire-and-forget crash report so we can diagnose without asking the user to relay a stack.
    try {
      const componentStack =
        info && typeof info === 'object' && 'componentStack' in info
          ? String((info as { componentStack?: unknown }).componentStack ?? '')
          : ''
      supabase
        .from('client_errors')
        .insert({
          user_id: useAuthStore.getState().user?.id ?? null,
          context: this.props.context ?? 'app',
          message: String(error?.message || error?.name || error || 'Unknown error'),
          stack: `${error?.stack ?? ''}\n--- component stack ---${componentStack}`.slice(0, 8000),
          url: typeof location !== 'undefined' ? location.href : null,
          app_version: APP_VERSION,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        } as never)
        .then(() => {}, () => {})
    } catch {
      /* never let reporting break the fallback */
    }
  }
  reset = () => this.setState({ error: null })

  hardReload = () => hardReloadApp()

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(this.reset, error)

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-950 p-6 text-center">
        <div className="text-4xl">😕</div>
        <div>
          <p className="text-lg font-semibold text-white">Something went wrong</p>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            That screen hit an error. Reloading almost always fixes it.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button onClick={() => location.reload()} className="btn-primary px-4 py-2">Reload</button>
          <button onClick={() => this.hardReload()} className="btn-ghost px-4 py-2 text-sm">Reload &amp; clear cache</button>
        </div>
      </div>
    )
  }
}
