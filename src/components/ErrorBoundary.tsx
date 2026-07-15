import { Component, type ReactNode } from 'react'

// Catches render/runtime errors so a crash shows a recoverable screen instead of a blank page.
// Use the top-level boundary as a safety net; wrap smaller pieces (e.g. the thread panel) with a
// compact `fallback` so one broken piece never takes down the whole app.
interface Props {
  children: ReactNode
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
  }
  reset = () => this.setState({ error: null })

  async hardReload() {
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
