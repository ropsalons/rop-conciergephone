import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { APP_NAME, COMPANY_NAME, SIGNUP_ROLES, ROLE_LABELS } from '@/lib/constants'
import type { LocationRow, DepartmentRow } from '@/types'
import { Spinner } from '@/components/ui/Feedback'

export function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<string>('associate')
  const [locationSlug, setLocationSlug] = useState('')
  const [departmentSlug, setDepartmentSlug] = useState('')
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [departments, setDepartments] = useState<DepartmentRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { signIn, signUp, loading } = useAuthStore()
  const toast = useUIStore((s) => s.toast)

  useEffect(() => {
    supabase.from('locations').select('*').order('sort_order').then(({ data }) => setLocations(data ?? []))
    supabase.from('departments').select('*').order('name').then(({ data }) => setDepartments(data ?? []))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (mode === 'signin') {
      const { error } = await signIn(email.trim(), password)
      if (error) setError(error)
    } else {
      if (!fullName.trim()) return setError('Please enter your full name.')
      const { error } = await signUp({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        role,
        locationSlug,
        departmentSlug,
      })
      if (error) setError(error)
      else {
        setNotice('Account created. If email confirmation is on, check your inbox — otherwise sign in below.')
        setMode('signin')
        toast({ kind: 'success', title: 'Welcome to ROP Chat', body: 'Your account is ready.' })
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-900 to-brand-950 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-800 text-2xl font-black text-gold-400 shadow-lg">
            R
          </div>
          <h1 className="text-2xl font-bold text-white">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-slate-400">{COMPANY_NAME}</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <div className="flex rounded-lg bg-black/30 p-1 text-sm">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => { setMode(m); setError(null) }}
                className={`flex-1 rounded-md py-2 font-semibold transition ${
                  mode === m ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {mode === 'signup' && (
            <div>
              <label className="label">Full name</label>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jordan Rivera" />
            </div>
          )}

          <div>
            <label className="label">Work email</label>
            <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@ropsalons.com" />
          </div>

          <div>
            <label className="label">Passcode</label>
            <input type="password" required minLength={4} className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="last 4 digits of your phone" />
          </div>

          {mode === 'signup' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="label">Role</label>
                <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                  {SIGNUP_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Location</label>
                <select className="input" value={locationSlug} onChange={(e) => setLocationSlug(e.target.value)}>
                  <option value="">—</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.slug}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Department</label>
                <select className="input" value={departmentSlug} onChange={(e) => setDepartmentSlug(e.target.value)}>
                  <option value="">—</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.slug}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {error && <p className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-200">{error}</p>}
          {notice && <p className="rounded-lg bg-emerald-900/40 px-3 py-2 text-sm text-emerald-200">{notice}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? <Spinner /> : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>

          <p className="text-center text-xs text-slate-500">
            The first person to sign up becomes the workspace Owner/Admin.
          </p>
        </form>
      </div>
    </div>
  )
}
