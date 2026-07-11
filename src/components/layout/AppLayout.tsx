import { useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAppBootstrap } from '@/hooks/useAppBootstrap'
import { useUIStore } from '@/stores/uiStore'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { SearchModal } from '@/components/search/SearchModal'
import { ThreadPanel } from '@/components/messages/ThreadPanel'
import { HelpModal } from '@/components/help/HelpModal'
import { cn } from '@/lib/utils'

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
          <ThreadPanel rootId={threadRootId} />
        </aside>
      )}

      {/* Full-screen thread overlay (mobile / tablet) */}
      {threadRootId && (
        <div className="fixed inset-0 z-40 bg-brand-950 xl:hidden">
          <ThreadPanel rootId={threadRootId} />
        </div>
      )}

      <SearchModal />
      <HelpModal />
    </div>
  )
}
