import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Profile, LocationRow, DepartmentRow, RoleRow } from '@/types'

// Company directory + reference data. Loaded once after sign-in and refreshed on demand.
interface DirectoryState {
  profiles: Profile[]
  profilesById: Record<string, Profile>
  locations: LocationRow[]
  departments: DepartmentRow[]
  roles: RoleRow[]
  loaded: boolean
  load: () => Promise<void>
  upsertProfile: (p: Profile) => void
}

export const useDirectoryStore = create<DirectoryState>((set, get) => ({
  profiles: [],
  profilesById: {},
  locations: [],
  departments: [],
  roles: [],
  loaded: false,

  load: async () => {
    const [profilesRes, locationsRes, departmentsRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('locations').select('*').order('sort_order'),
      supabase.from('departments').select('*').order('name'),
      supabase.from('roles').select('*').order('rank', { ascending: false }),
    ])
    const profiles = (profilesRes.data as Profile[]) ?? []
    set({
      profiles,
      profilesById: Object.fromEntries(profiles.map((p) => [p.id, p])),
      locations: (locationsRes.data as LocationRow[]) ?? [],
      departments: (departmentsRes.data as DepartmentRow[]) ?? [],
      roles: (rolesRes.data as RoleRow[]) ?? [],
      loaded: true,
    })
  },

  upsertProfile: (p) => {
    const profiles = [...get().profiles.filter((x) => x.id !== p.id), p].sort((a, b) =>
      a.full_name.localeCompare(b.full_name),
    )
    set({ profiles, profilesById: { ...get().profilesById, [p.id]: p } })
  },
}))
