import type { ReactNode } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { Menu, LifeBuoy } from '@/components/ui/Icons'

// Standard top bar. Includes the hamburger that opens the mobile drawer.
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
}) {
  const toggle = useUIStore((s) => s.toggleMobileSidebar)
  const openHelp = useUIStore((s) => s.setHelpOpen)
  return (
    <header className="flex items-center gap-2 border-b border-white/10 bg-brand-900/60 px-3 py-3 backdrop-blur safe-top sm:px-4">
      <button onClick={toggle} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 lg:hidden">
        <Menu className="h-5 w-5" />
      </button>
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
