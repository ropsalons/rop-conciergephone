// Static reference data + tokens shared across the app.

export const APP_NAME = 'ROP Chat'
export const COMPANY_NAME = 'Robert of Philadelphia Salons'

// Job TITLES (a person's designation / comms group). Someone can have two (dual role).
// These are separate from ACCESS LEVEL (below), which is what governs permissions.
export const ROLE_LABELS: Record<string, string> = {
  leadership: 'Leadership',
  marketing: 'Marketing',
  concierge: 'Concierge',
  stylist: 'Stylist',
  associate: 'Associate',
  specialist: 'Specialist',
}
export const TITLE_OPTIONS = ['concierge', 'stylist', 'associate', 'specialist', 'leadership', 'marketing'] as const

// ACCESS LEVELS — what a person can do. Owner/Admin = full control ("god mode"); Leader can
// post urgent alerts & moderate; Member is the default. Shown as a small badge (A / L).
export const ACCESS_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  leader: 'Leader',
  member: 'Member',
}
export const ACCESS_RANK: Record<string, number> = { owner: 100, admin: 90, leader: 40, member: 10 }
export const ACCESS_OPTIONS = ['member', 'leader', 'admin', 'owner'] as const
// Short badge shown next to a name/title. Members get no badge.
export const ACCESS_BADGE: Record<string, string> = { owner: 'Owner', admin: 'A', leader: 'L' }

// Titles offered in the sign-up dropdown (access level is assigned by an admin, not self-selected).
export const SIGNUP_ROLES = ['stylist', 'associate', 'concierge', 'specialist', 'leadership', 'marketing'] as const

export const SHOUTOUT_CATEGORIES = [
  { key: 'guest_experience', label: 'Guest Experience', emoji: '✨' },
  { key: 'teamwork', label: 'Teamwork', emoji: '🤝' },
  { key: 'education', label: 'Education', emoji: '📚' },
  { key: 'leadership', label: 'Leadership', emoji: '⭐' },
  { key: 'sales', label: 'Sales', emoji: '💈' },
  { key: 'kindness', label: 'Kindness', emoji: '💛' },
  { key: 'above_and_beyond', label: 'Above & Beyond', emoji: '🚀' },
] as const

export const GUEST_RECOVERY_STATUSES = [
  { key: 'new', label: 'New', color: 'bg-blue-500' },
  { key: 'in_progress', label: 'In Progress', color: 'bg-amber-500' },
  { key: 'waiting', label: 'Waiting', color: 'bg-purple-500' },
  { key: 'resolved', label: 'Resolved', color: 'bg-emerald-500' },
] as const

export const SCHEDULING_TYPES = [
  { key: 'open_shift', label: 'Open Shift' },
  { key: 'coverage_request', label: 'Coverage Request' },
  { key: 'staffing_need', label: 'Staffing Need' },
] as const

export const EDUCATION_CATEGORIES = [
  { key: 'class', label: 'Class' },
  { key: 'formula', label: 'Formula' },
  { key: 'product_tip', label: 'Product Tip' },
  { key: 'general', label: 'General' },
] as const

export const EVENT_CATEGORIES = [
  { key: 'team_meeting', label: 'Team Meeting', emoji: '👥' },
  { key: 'workshop', label: 'Workshop', emoji: '🎓' },
  { key: 'class', label: 'Class', emoji: '📚' },
  { key: 'training', label: 'Training', emoji: '💪' },
  { key: 'community', label: 'Community', emoji: '🤝' },
  { key: 'social', label: 'Social', emoji: '🎉' },
  { key: 'other', label: 'Other', emoji: '📅' },
] as const

export const RSVP_OPTIONS = [
  { key: 'going', label: 'Going', emoji: '✅', tone: 'emerald' },
  { key: 'interested', label: 'Interested', emoji: '⭐', tone: 'amber' },
  { key: 'cant_go', label: "Can't Go", emoji: '🚫', tone: 'slate' },
] as const

export const RESOURCE_CATEGORIES = [
  { key: 'dashboard', label: 'Dashboards', emoji: '📊' },
  { key: 'guide', label: 'Guides & How-Tos', emoji: '📖' },
  { key: 'link', label: 'Links', emoji: '🔗' },
  { key: 'form', label: 'Forms & Checklists', emoji: '📝' },
  { key: 'other', label: 'Other', emoji: '📁' },
] as const

export const QUICK_EMOJIS = ['👍', '❤️', '🎉', '🙌', '🔥', '💈', '✨', '😂', '👏', '✅']

export const MAX_FILE_BYTES = 25 * 1024 * 1024 // 25MB — matches the storage bucket cap

// All permission checks take a person's ACCESS LEVEL (owner/admin/leader/member).
export function accessRank(access?: string | null) {
  return ACCESS_RANK[access ?? ''] ?? 10
}
export function isOwner(access?: string | null) {
  return accessRank(access) >= 100
}
export function isAdmin(access?: string | null) {
  return accessRank(access) >= 90 // owner + admin ("god mode")
}
export function canModerate(access?: string | null) {
  return accessRank(access) >= 40 // leader + admin + owner (urgent alerts, moderation)
}
export function canManage(access?: string | null) {
  return accessRank(access) >= 40 // leader and up
}
export function canPostEducation(access?: string | null) {
  return canManage(access)
}
// Short access badge (A / L / Owner) for a person; null for regular members.
export function accessBadge(access?: string | null): string | null {
  return ACCESS_BADGE[access ?? ''] ?? null
}

// Pretty-print a single title key (falls back to a capitalized version of the raw key).
export function oneTitle(key?: string | null): string {
  if (!key) return ''
  return ROLE_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}
// Combined title label — "Concierge" or "Associate + Stylist" when a person has a dual role.
export function titleLabel(role?: string | null, secondary?: string | null): string {
  const primary = oneTitle(role)
  const sec = oneTitle(secondary)
  if (primary && sec && sec !== primary) return `${primary} + ${sec}`
  return primary || sec
}
