// Static reference data + tokens shared across the app.

export const APP_NAME = 'ROP Chat (Slack)'
export const COMPANY_NAME = 'Robert of Philadelphia Salons'

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner / Admin',
  admin: 'Administrator',
  leadership: 'Leadership',
  manager: 'Manager',
  operations: 'Operations',
  marketing: 'Marketing',
  education: 'Education',
  hr: 'Human Resources',
  concierge: 'Concierge',
  stylist: 'Stylist',
  associate: 'Associate',
}

export const ROLE_RANK: Record<string, number> = {
  owner: 100,
  admin: 90,
  leadership: 40,
  manager: 30,
  operations: 20,
  marketing: 20,
  education: 20,
  hr: 20,
  concierge: 10,
  stylist: 10,
  associate: 10,
}

// Roles offered in the sign-up dropdown (owner/admin are assigned, not self-selected).
export const SIGNUP_ROLES = [
  'leadership',
  'manager',
  'stylist',
  'associate',
  'concierge',
  'education',
  'marketing',
  'operations',
  'hr',
] as const

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

export function canModerate(role?: string | null) {
  return (ROLE_RANK[role ?? ''] ?? 0) >= 40
}
export function canManage(role?: string | null) {
  return (ROLE_RANK[role ?? ''] ?? 0) >= 30
}
export function isAdmin(role?: string | null) {
  return (ROLE_RANK[role ?? ''] ?? 0) >= 90
}
export function canPostEducation(role?: string | null) {
  return canManage(role) || role === 'education'
}
