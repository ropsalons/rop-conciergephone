import { avatarColor, cn, initials } from '@/lib/utils'
import type { Profile } from '@/types'

const SIZES: Record<string, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
}

const DOT: Record<string, string> = {
  online: 'bg-emerald-400',
  away: 'bg-amber-400',
  offline: 'bg-slate-500',
}

// Derive the dot from last-active time so it self-heals: active in the last 3 min = green (online),
// last 15 min = amber (away), otherwise fall back to the stored presence string / offline.
function effectivePresence(profile?: Partial<Profile> | null): 'online' | 'away' | 'offline' {
  const seen = profile?.last_seen_at ? new Date(profile.last_seen_at).getTime() : 0
  if (seen) {
    const age = Date.now() - seen
    if (age < 3 * 60_000) return 'online'
    if (age < 15 * 60_000) return 'away'
  }
  const p = profile?.presence
  return p === 'online' || p === 'away' ? p : 'offline'
}

export function Avatar({
  profile,
  size = 'md',
  showPresence = false,
  className,
}: {
  profile?: Partial<Profile> | null
  size?: keyof typeof SIZES
  showPresence?: boolean
  className?: string
}) {
  const name = profile?.display_name || profile?.full_name || '?'
  return (
    <div className={cn('relative shrink-0', className)}>
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt={name}
          className={cn('rounded-full object-cover', SIZES[size])}
        />
      ) : (
        <div
          className={cn(
            'flex items-center justify-center rounded-full font-semibold text-white',
            SIZES[size],
          )}
          style={{ backgroundColor: avatarColor(profile?.id) }}
        >
          {initials(name)}
        </div>
      )}
      {showPresence && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-brand-950',
            DOT[effectivePresence(profile)],
          )}
        />
      )}
    </div>
  )
}
