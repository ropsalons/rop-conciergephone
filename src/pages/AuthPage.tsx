import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { APP_NAME, COMPANY_NAME, SIGNUP_ROLES, ROLE_LABELS } from '@/lib/constants'
import type { LocationRow, DepartmentRow } from '@/types'
import { Spinner } from '@/components/ui/Feedback'

// An invite link looks like:  https://rop-connect.netlify.app/?invite=1&email=<email>&name=<name>
// When present we drop the person straight onto "Create account" with their email (and name)
// pre-filled and the employee-only fields hidden — a guest we already know just picks a password.
function readInvite() {
  try {
    const p = new URLSearchParams(window.location.search)
    const email = p.get('email') || ''
    const name = p.get('name') || ''
    const invited = p.get('invite') === '1' || !!email
    return { invited, email, name }
  } catch {
    return { invited: false, email: '', name: '' }
  }
}

export function AuthPage() {
  const invite = useMemo(readInvite, [])
  const [mode, setMode] = useState<'signin' | 'signup'>(invite.invited ? 'signup' : 'signin')
  const [email, setEmail] = useState(invite.email)
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState(invite.name)
  const [role, setRole] = useState<string>('associate')
  const [locationSlug, setLocationSlug] = useState('')
  const [departmentSlug, setDepartmentSlug] = useState('')
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [departments, setDepartments] = useState<DepartmentRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { signIn, signUp, loading } = useAuthStore()
  const toast = useUIStore((s) => s.toast)

  // Invited guests skip the employee-only fields (name/role/location come from their invite record).
  const invited = invite.invited

  useEffect(() => {
    if (invited) return // guests don't need the location/department pickers
    supabase.from('locations').select('*').order('sort_order').then(({ data }) => setLocations(data ?? []))
    supabase.from('departments').select('*').order('name').then(({ data }) => setDepartments(data ?? []))
  }, [invited])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (mode === 'signin') {
      const { error } = await signIn(email.trim(), password)
      if (error) setError(error)
    } else {
      if (!invited && !fullName.trim()) return setError('Please enter your full name.')
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
        // With email confirmation off (our setup), sign them straight in so there's no dead end.
        const { error: signInErr } = await signIn(email.trim(), password)
        if (signInErr) {
          setNotice('Account created — now tap Sign In with the same email and password.')
          setMode('signin')
        }
        toast({ kind: 'success', title: 'Welcome to ROP Chat', body: 'You’re all set.' })
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
          {invited ? (
            // Guests we already added: a clear welcome, no tabs to get lost in.
            <div className="rounded-lg border border-gold-400/30 bg-gold-400/10 p-3 text-sm text-gold-50">
              <p className="font-semibold text-white">Welcome{invite.name ? `, ${invite.name.split(' ')[0]}` : ''}! 👋</p>
              <p className="mt-0.5 text-[13px] text-slate-200">
                You’ve been invited to ROP Chat. We already have your details — just <b>pick a password below</b> to finish. That’s it.
              </p>
            </div>
          ) : (
            <>
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
              <p className="-mt-1 text-center text-[11px] text-slate-500">
                {mode === 'signin' ? 'Already have an account? Sign in.' : 'New here? Create your account.'}
              </p>
            </>
          )}

          {mode === 'signup' && !invited && (
            <div>
              <label className="label">Full name</label>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jordan Rivera" />
            </div>
          )}

          <div>
            <label className="label">Work email</label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@ropsalons.com"
              readOnly={invited && !!invite.email}
            />
          </div>

          <div>
            <label className="label">{mode === 'signup' ? 'Create a password' : 'Password'}</label>
            <input
              type="password"
              required
              minLength={6}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'Choose a password (at least 6 characters)' : 'Your password'}
            />
          </div>

          {mode === 'signup' && !invited && (
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
            {loading ? <Spinner /> : mode === 'signin' ? 'Sign In' : invited ? 'Finish & enter ROP Chat' : 'Create Account'}
          </button>

          {invited ? (
            <button
              type="button"
              onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(null) }}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-200"
            >
              {mode === 'signup' ? 'Already set a password? Sign in instead' : 'Need to set your password? Go back'}
            </button>
          ) : (
            <p className="text-center text-xs text-slate-500">
              The first person to sign up becomes the workspace Owner/Admin.
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
