// Staff groups — Slack-style @mentions that fan out to a whole team.
//
// Groups are DERIVED from the directory (a person's role + salon location), so they never go
// stale: move someone to Promenade or change their role and the groups update automatically —
// there's no separate membership list to maintain. Typing "@stylists" or "@bayfront" in a message
// expands to every matching person and pings them, exactly like an @mention of one individual.
//
// Handles are single lowercase words so they play nicely with the composer's "@word" autocomplete
// and the message renderer's mention highlighting.
import type { Profile, LocationRow } from '@/types'

export interface StaffGroup {
  handle: string // mention token WITHOUT the @, e.g. 'stylists' | 'bayfront'
  label: string // display name, e.g. 'Stylists'
  description: string
  kind: 'role' | 'location'
  match: (p: Profile) => boolean
}

export interface ResolvedGroup extends StaffGroup {
  memberIds: string[]
  count: number
}

// A person can carry a primary AND a secondary role/location (dual role) — count them in both groups.
function hasRole(p: Profile, role: string) {
  return p.role === role || p.secondary_role === role
}
function atLocation(p: Profile, locId: string) {
  return p.location_id === locId || p.secondary_location_id === locId
}

// Role-based groups are fixed. Location groups are built from the live locations table (below).
const ROLE_GROUPS: StaffGroup[] = [
  { handle: 'stylists', label: 'Stylists', description: 'Everyone with the Stylist role', kind: 'role', match: (p) => hasRole(p, 'stylist') },
  { handle: 'associates', label: 'Associates', description: 'Everyone with the Associate role', kind: 'role', match: (p) => hasRole(p, 'associate') },
  { handle: 'concierge', label: 'Concierge', description: 'The whole concierge team', kind: 'role', match: (p) => hasRole(p, 'concierge') },
]

// All group definitions (role groups + one per salon location). No membership resolved yet.
export function buildGroups(locations: LocationRow[]): StaffGroup[] {
  const locGroups: StaffGroup[] = locations.map((l) => ({
    handle: l.slug, // 'bayfront' | 'village' | 'promenade'
    label: l.name,
    description: `Everyone who works at ${l.name}`,
    kind: 'location' as const,
    match: (p: Profile) => atLocation(p, l.id),
  }))
  return [...ROLE_GROUPS, ...locGroups]
}

// Resolve each group to its current member ids. Empty groups are dropped.
export function resolveGroups(profiles: Profile[], locations: LocationRow[]): ResolvedGroup[] {
  const active = profiles.filter((p) => p.is_active)
  return buildGroups(locations)
    .map((g) => {
      const memberIds = active.filter(g.match).map((p) => p.id)
      return { ...g, memberIds, count: memberIds.length }
    })
    .filter((g) => g.count > 0)
}

// Lowercase set of every group handle — used by the renderer to highlight "@stylists" etc.
export function groupHandleSet(locations: LocationRow[]): Set<string> {
  return new Set(buildGroups(locations).map((g) => g.handle.toLowerCase()))
}
