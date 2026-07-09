import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

interface SignUpParams {
  email: string
  password: string
  fullName: string
  role: string
  locationSlug?: string
  departmentSlug?: string
}

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  initialized: boolean
  loading: boolean
  init: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (p: SignUpParams) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  updateProfile: (patch: Partial<Profile>) => Promise<{ error: string | null }>
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  return (data as Profile) ?? null
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  initialized: false,
  loading: false,

  init: async () => {
    const { data } = await supabase.auth.getSession()
    const session = data.session
    let profile: Profile | null = null
    if (session?.user) profile = await loadProfile(session.user.id)
    set({ session, user: session?.user ?? null, profile, initialized: true })

    supabase.auth.onAuthStateChange(async (_event, newSession) => {
      const nextProfile = newSession?.user ? await loadProfile(newSession.user.id) : null
      set({ session: newSession, user: newSession?.user ?? null, profile: nextProfile })
    })
  },

  signIn: async (email, password) => {
    set({ loading: true })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    set({ loading: false })
    return { error: error?.message ?? null }
  },

  signUp: async (p) => {
    set({ loading: true })
    const { error } = await supabase.auth.signUp({
      email: p.email,
      password: p.password,
      options: {
        data: {
          full_name: p.fullName,
          role: p.role,
          location_slug: p.locationSlug ?? '',
          department_slug: p.departmentSlug ?? '',
        },
      },
    })
    set({ loading: false })
    return { error: error?.message ?? null }
  },

  signOut: async () => {
    const uid = get().user?.id
    if (uid) await supabase.from('profiles').update({ presence: 'offline' }).eq('id', uid)
    await supabase.auth.signOut()
    set({ session: null, user: null, profile: null })
  },

  refreshProfile: async () => {
    const uid = get().user?.id
    if (!uid) return
    set({ profile: await loadProfile(uid) })
  },

  updateProfile: async (patch) => {
    const uid = get().user?.id
    if (!uid) return { error: 'Not signed in' }
    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', uid)
      .select('*')
      .maybeSingle()
    if (!error && data) set({ profile: data as Profile })
    return { error: error?.message ?? null }
  },
}))
