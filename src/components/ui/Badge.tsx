import { cn } from '@/lib/utils'

export function UnreadBadge({ count, className }: { count?: number; className?: string }) {
  if (!count) return null
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gold-400 px-1.5 text-[11px] font-bold text-brand-950',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function Dot({ className }: { className?: string }) {
  return <span className={cn('inline-block h-2 w-2 rounded-full bg-red-500', className)} />
}

const TONES: Record<string, string> = {
  slate: 'bg-white/10 text-slate-200',
  brand: 'bg-brand-400/20 text-brand-200',
  gold: 'bg-gold-400/20 text-gold-200',
  green: 'bg-emerald-500/20 text-emerald-300',
  amber: 'bg-amber-500/20 text-amber-300',
  red: 'bg-red-500/20 text-red-300',
  purple: 'bg-purple-500/20 text-purple-300',
}

export function Tag({
  children,
  tone = 'slate',
  className,
}: {
  children: React.ReactNode
  tone?: keyof typeof TONES
  className?: string
}) {
  return <span className={cn('chip', TONES[tone], className)}>{children}</span>
}

import { accessBadge, ACCESS_LABELS } from '@/lib/constants'

// Small A / L / Owner badge shown beside a name. Renders nothing for regular members.
export function AccessBadge({ access, className }: { access?: string | null; className?: string }) {
  const label = accessBadge(access)
  if (!label) return null
  const tone =
    access === 'owner'
      ? 'bg-gold-500/20 text-gold-300'
      : access === 'admin'
        ? 'bg-brand-500/25 text-brand-200'
        : 'bg-white/10 text-slate-200'
  return (
    <span
      className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none', tone, className)}
      title={ACCESS_LABELS[access ?? ''] ?? ''}
    >
      {label}
    </span>
  )
}
