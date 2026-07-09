import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { X, AlertTriangle, Check, Bell } from './Icons'

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-brand-300',
        className,
      )}
    />
  )
}

export function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-400">
      <Spinner className="h-8 w-8" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && <div className="text-slate-500">{icon}</div>}
      <h3 className="text-base font-semibold text-slate-200">{title}</h3>
      {body && <p className="max-w-sm text-sm text-slate-400">{body}</p>}
      {action}
    </div>
  )
}

const TOAST_STYLES: Record<string, string> = {
  info: 'border-brand-400/40 bg-brand-800',
  success: 'border-emerald-500/40 bg-emerald-900/40',
  error: 'border-red-500/40 bg-red-900/40',
  urgent: 'border-red-500 bg-red-800 animate-pulse-alert',
}

export function Toaster() {
  const { toasts, dismissToast } = useUIStore()
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[60] flex flex-col items-center gap-2 px-3 safe-top">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-xl animate-slide-up',
            TOAST_STYLES[t.kind],
          )}
        >
          <div className="mt-0.5 text-white">
            {t.kind === 'error' || t.kind === 'urgent' ? (
              <AlertTriangle className="h-5 w-5" />
            ) : t.kind === 'success' ? (
              <Check className="h-5 w-5" />
            ) : (
              <Bell className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">{t.title}</p>
            {t.body && <p className="mt-0.5 text-xs text-slate-200">{t.body}</p>}
          </div>
          <button onClick={() => dismissToast(t.id)} className="text-slate-300 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
