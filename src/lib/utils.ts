import { formatDistanceToNowStrict, format, isToday, isYesterday, isSameDay } from 'date-fns'
import type { Profile } from '@/types'

// Tiny classnames helper (no clsx dependency).
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function displayName(p?: Partial<Profile> | null): string {
  if (!p) return 'Unknown'
  return p.display_name || p.full_name || p.email || 'Unknown'
}

export function initials(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Deterministic avatar background from a user id.
const AVATAR_COLORS = [
  '#3a53a8', '#c78a1f', '#0d9488', '#7c3aed', '#db2777',
  '#0284c7', '#65a30d', '#ea580c', '#4f46e5', '#be123c',
]
export function avatarColor(id?: string | null): string {
  if (!id) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function timeAgo(iso: string): string {
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true })
  } catch {
    return ''
  }
}

export function messageTime(iso: string): string {
  const d = new Date(iso)
  if (isToday(d)) return format(d, 'h:mm a')
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`
  return format(d, 'MMM d, h:mm a')
}

export function dayLabel(iso: string): string {
  const d = new Date(iso)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'EEEE, MMMM d')
}

export function sameDay(a: string, b: string): boolean {
  return isSameDay(new Date(a), new Date(b))
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function isImage(mime?: string | null): boolean {
  return !!mime && mime.startsWith('image/')
}

// Extract @tokens (used to power mention autocomplete + highlighting).
export function extractMentionQuery(text: string, caret: number): string | null {
  const upto = text.slice(0, caret)
  const match = upto.match(/(?:^|\s)@([\w.-]*)$/)
  return match ? match[1] : null
}

export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let handle: ReturnType<typeof setTimeout>
  return ((...args: any[]) => {
    clearTimeout(handle)
    handle = setTimeout(() => fn(...args), ms)
  }) as T
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
