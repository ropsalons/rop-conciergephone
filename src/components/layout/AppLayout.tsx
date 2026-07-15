import { useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAppBootstrap } from '@/hooks/useAppBootstrap'
import { useUIStore } from '@/stores/uiStore'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { SearchModal } from '@/components/search/SearchModal'
import { ThreadPanel } from '@/components/messages/ThreadPanel'
import { HelpModal } from '@/components/help/HelpModal'
import { ErrorBoundary, hardReloadApp } from '@/components/ErrorBoundary'
import { X } from '@/components/ui/Icons'
import { cn } from '@/lib/utils'

// Compact fallback for a thread that failed to render — closes it instead of blanking the app.
// Offers a cache-clearing reload because the most common cause is an installed app stuck on a
// stale build; always surfaces the underlying error text so a real bug can be diagnosed.
function ThreadError({ error }: { error?: Error }) {
  const closeThread = () => useUIStore.getState().openThread(null)
  const detail = error?.message || error?.name || (error ? String(error) : '')
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-brand-950 p-6 text-center">
      <p className="text-sm text-slate-300">This thread couldn't be opened.</p>
      <p className="max-w-xs text-xs text-slate-500">
        This is usually an out-of-date copy of the app. Tap “Reload app” to pull the latest version.
      </p>
      {detail && (
        <p className="max-w-xs break-words rounded-lg bg-red-950/40 px-3 py-2 font-mono text-[11px] text-red-200/90">{detail}</p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button onClick={() => hardReloadApp()} className="btn-primary px-3 py-1.5 text-sm">Reload app</button>
        <button onClick={closeThread} className="btn-ghost px-3 py-1.5 text-sm"><X className="h-4 w-4" /> Close</button>
      </div>
    </div>
  )
}

export function AppLayout() {
  useAppBootstrap()
  const { mobileSidebarOpen, setMobileSidebar, threadRootId } = useUIStore()
  const swipeX = useRef<number | null>(null)
  const { pathname } = useLocation()
  const inConversation = /^\/(channel|dm)\//.test(pathname)

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-brand-950">
      {/* Left-edge swipe zone to open the drawer (Slack-style), above the bottom nav */}
      <div
        className="fixed left-0 top-0 bottom-14 z-30 w-4 lg:hidden"
        onTouchStart={(e) => (swipeX.current = e.touches[0].clientX)}
        onTouchMove={(e) => {
          if (swipeX.current != null && e.touches[0].clientX - swipeX.current > 40) {
            setMobileSidebar(true)
            swipeX.current = null
          }
        }}
      />
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 border-r border-white/10 lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      <div className={cn('fixed inset-0 z-40 lg:hidden', mobileSidebarOpen ? '' : 'pointer-events-none')}>
        <div
          className={cn(
            'absolute inset-0 bg-black/60 transition-opacity',
            mobileSidebarOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setMobileSidebar(false)}
        />
        <aside
          className={cn(
            'absolute left-0 top-0 h-full w-[82%] max-w-xs border-r border-white/10 shadow-2xl transition-transform safe-top',
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          onTouchStart={(e) => (swipeX.current = e.touches[0].clientX)}
          onTouchMove={(e) => {
            if (swipeX.current != null && swipeX.current - e.touches[0].clientX > 45) {
              setMobileSidebar(false)
              swipeX.current = null
            }
          }}
        >
          <Sidebar onNavigate={() => setMobileSidebar(false)} />
        </aside>
      </div>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className={cn('min-h-0 flex-1 overflow-hidden lg:pb-0', inConversation ? '' : 'pb-14')}>
          <Outlet />
        </div>
        <MobileNav />
      </main>

      {/* Right-hand thread panel (desktop) */}
      {threadRootId && (
        <aside className="hidden w-96 shrink-0 border-l border-white/10 xl:block">
          <ErrorBoundary key={threadRootId} context="thread" fallback={(_r, err) => <ThreadError error={err} />}>
            <ThreadPanel rootId={threadRootId} />
          </ErrorBoundary>
        </aside>
      )}

      {/* Full-screen thread overlay (mobile / tablet) */}
      {threadRootId && (
        <div className="fixed inset-0 z-40 bg-brand-950 xl:hidden">
          <ErrorBoundary key={threadRootId} context="thread" fallback={(_r, err) => <ThreadError error={err} />}>
            <ThreadPanel rootId={threadRootId} />
          </ErrorBoundary>
        </div>
      )}

      <SearchModal />
      <HelpModal />
    </div>
  )
}
