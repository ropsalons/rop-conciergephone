import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUIStore } from '@/stores/uiStore'
import { Menu, LifeBuoy, ChevronLeft } from '@/components/ui/Icons'

// Standard top bar. Shows the hamburger (mobile drawer) — or, when `backTo` is set,
// a back chevron for full-screen conversation views (Slack-style).
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  backTo,
  backAlways,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  backTo?: string
  // When true, the back chevron shows on every screen size (not just mobile). Use on
  // workflow pages reached from Home so there's always an obvious way back.
  backAlways?: boolean
}) {
  const toggle = useUIStore((s) => s.toggleMobileSidebar)
  const openHelp = useUIStore((s) => s.setHelpOpen)
  const navigate = useNavigate()
  return (
    <header className="flex items-center gap-2 border-b border-white/10 bg-brand-900/60 px-3 py-3 backdrop-blur safe-top sm:px-4">
      {backTo ? (
        <button onClick={() => navigate(backTo)} aria-label="Back" className={`-ml-1 rounded-lg p-2 text-slate-300 hover:bg-white/10 ${backAlways ? '' : 'lg:hidden'}`}>
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : (
        <button onClick={toggle} aria-label="Menu" className="rounded-lg p-2 text-slate-300 hover:bg-white/10 lg:hidden">
          <Menu className="h-5 w-5" />
        </button>
      )}
      {icon && <div className="text-slate-400">{icon}</div>}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-bold text-white">{title}</h1>
        {subtitle && <p className="truncate text-xs text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
      <button
        onClick={() => openHelp(true)}
        title="Help & Guide"
        aria-label="Help & Guide"
        className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
      >
        <LifeBuoy className="h-5 w-5" />
        <span className="hidden text-xs font-semibold sm:inline">Help</span>
      </button>
    </header>
  )
}

// Scrollable content wrapper for non-chat pages.
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`min-h-0 flex-1 overflow-y-auto ${className ?? ''}`}>{children}</div>
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col">{children}</div>
}
