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
      const nextUser = newSession?.user ?? null
      const sameUser = !!nextUser?.id && nextUser.id === get().user?.id
      // Only refetch the profile when the signed-in user actually changes (sign-in / switch / sign-out).
      // TOKEN_REFRESHED fires periodically and on tab focus with the SAME user — refetching there
      // replaced the profile object on every refresh and helped drive the bootstrap re-run loop.
      if (sameUser) {
        set({ session: newSession, user: nextUser })
        return
      }
      const nextProfile = nextUser ? await loadProfile(nextUser.id) : null
      set({ session: newSession, user: nextUser, profile: nextProfile })
    })
  },

  signIn: async (identifier, password) => {
    set({ loading: true })
    // People can log in with their PHONE NUMBER or their email. Supabase auth is email-based, so map a
    // phone to that person's email first (RPC returns the email as-is when they typed one already).
    let email = identifier.trim()
    if (!email.includes('@')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase.rpc as any)('resolve_login_email', { p_identifier: email })
        if (typeof data === 'string' && data) email = data
      } catch {
        /* fall through — signInWithPassword will just fail with a normal error below */
      }
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    set({ loading: false })
    // Record the login in the audit log (fire-and-forget; security-definer RPC so it works for all staff).
    if (!error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (supabase.rpc as any)('log_event', { p_action: 'login', p_entity_type: 'session', p_metadata: {} }).then(
        () => {},
        () => {},
      )
    }
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
    // Best-effort logging — fire and forget, never await (a hung request must not block sign-out).
    if (uid) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (supabase.rpc as any)('log_event', { p_action: 'logout', p_entity_type: 'session', p_metadata: {} }).catch(() => {})
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (supabase.rpc as any)('touch_last_seen', { p_presence: 'offline' }).catch(() => {})
    }
    // Clear in-memory state immediately.
    set({ session: null, user: null, profile: null })
    // Revoke the stored token as FIRE-AND-FORGET. Never await it: on an installed PWA this call can
    // hang, and awaiting it was blocking the whole sign-out so the button "did nothing".
    try {
      void supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    } catch {
      /* ignore */
    }
    // Belt-and-suspenders: drop any persisted Supabase auth keys directly so the app can't re-hydrate
    // a session on reload.
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('sb-') || k.includes('supabase.auth')) localStorage.removeItem(k)
      }
    } catch {
      /* ignore storage errors */
    }
    // HARD-reload to the login screen. We change the QUERY STRING (not just the hash): this app is
    // hash-routed, so assigning '/' from '/#/channel/x' only strips the hash and does NOT reload on
    // desktop — leaving the app looking signed in. A changed search param forces a real full reload.
    try {
      const base = import.meta.env.BASE_URL || '/'
      window.location.replace(`${base}?loggedout=${Date.now()}`)
    } catch {
      try {
        window.location.reload()
      } catch {
        /* ignore */
      }
    }
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
