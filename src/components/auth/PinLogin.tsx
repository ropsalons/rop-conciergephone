import { useRef, useState } from 'react'
import { pinAuth } from '@/lib/pinAuth'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { Spinner } from '@/components/ui/Feedback'

type Mode = 'login' | 'setup' | 'forgot' | 'reset'

// Keep just the digits; show them lightly formatted so a 10-digit US number reads as (555) 123-4567.
function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 10)
  if (d.length < 4) return d
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

// A single, big, reliable 4-digit PIN box. (Segmented boxes look nice but fight the iOS keyboard.)
function PinField({
  value,
  onChange,
  label,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  autoFocus?: boolean
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        type="password"
        inputMode="numeric"
        pattern="\d*"
        autoComplete="off"
        maxLength={4}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        placeholder="••••"
        className="input text-center text-2xl tracking-[0.6em] font-bold"
      />
    </div>
  )
}

export function PinLogin({ onUseEmail }: { onUseEmail: () => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const installSession = useAuthStore((s) => s.installSession)
  const toast = useUIStore((s) => s.toast)
  const digits = useRef('') // raw phone digits, kept in step with the formatted display
  digits.current = phone.replace(/\D/g, '').slice(0, 10)

  function to(next: Mode, keep?: { error?: string | null; notice?: string | null }) {
    setMode(next)
    setPin('')
    setPin2('')
    setError(keep?.error ?? null)
    setNotice(keep?.notice ?? null)
  }

  async function install(session: { access_token: string; refresh_token: string }) {
    const { error } = await installSession(session)
    if (error) return setError('Signed in, but we couldn’t start your session. Please try again.')
    toast({ kind: 'success', title: 'Welcome to ROP Chat', body: 'You’re all set.' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    const ph = digits.current
    if (ph.length < 10) return setError('Enter your full 10-digit mobile number.')
    setBusy(true)
    try {
      if (mode === 'login') {
        if (pin.length !== 4) { setBusy(false); return setError('Enter your 4-digit PIN.') }
        const r = await pinAuth.login(ph, pin)
        if (r.ok && r.session) return await install(r.session)
        if (r.code === 'no_pin') return to('setup', { notice: 'Looks like it’s your first time — let’s set up your PIN.' })
        setError(r.error ?? 'That didn’t work. Try again.')
      } else if (mode === 'setup') {
        if (pin.length !== 4) { setBusy(false); return setError('Your PIN must be exactly 4 digits.') }
        if (pin !== pin2) { setBusy(false); return setError('Those PINs don’t match. Try again.') }
        const r = await pinAuth.setup(ph, pin)
        if (r.ok && r.session) return await install(r.session)
        if (r.code === 'pin_exists') return to('login', { notice: 'You already have a PIN — enter it below (or tap “Forgot PIN?”).' })
        setError(r.error ?? 'We couldn’t set your PIN. Try again.')
      } else if (mode === 'forgot') {
        const r = await pinAuth.forgot(ph)
        return to('reset', { notice: r.message ?? 'If that number is on file, we just texted a 6-digit reset code.' })
      } else if (mode === 'reset') {
        if (!/^\d{6}$/.test(code.trim())) { setBusy(false); return setError('Enter the 6-digit code we texted you.') }
        if (pin.length !== 4) { setBusy(false); return setError('Your new PIN must be exactly 4 digits.') }
        if (pin !== pin2) { setBusy(false); return setError('Those PINs don’t match. Try again.') }
        const r = await pinAuth.reset(ph, code.trim(), pin)
        if (r.ok && r.session) return await install(r.session)
        setError(r.error ?? 'That code is wrong or expired. Request a new one.')
      }
    } finally {
      setBusy(false)
    }
  }

  const titles: Record<Mode, string> = {
    login: 'Sign in',
    setup: 'Set up your PIN',
    forgot: 'Forgot your PIN?',
    reset: 'Enter your reset code',
  }
  const cta: Record<Mode, string> = {
    login: 'Sign In',
    setup: 'Set PIN & Enter',
    forgot: 'Text me a code',
    reset: 'Set new PIN & Enter',
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-6">
      <div className="text-center">
        <p className="text-sm font-semibold text-white">{titles[mode]}</p>
        <p className="mt-0.5 text-[12px] text-slate-400">
          {mode === 'login' && 'Use your mobile number and 4-digit PIN — just like clocking in.'}
          {mode === 'setup' && 'Pick a 4-digit PIN you’ll remember. You’ll use it every time from now on.'}
          {mode === 'forgot' && 'We’ll text a 6-digit code to the mobile number on file.'}
          {mode === 'reset' && 'Enter the code we texted you, then choose a new 4-digit PIN.'}
        </p>
      </div>

      <div>
        <label className="label">Mobile number</label>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          className="input text-lg"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          placeholder="(555) 123-4567"
        />
      </div>

      {mode === 'reset' && (
        <div>
          <label className="label">6-digit code</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d*"
            autoComplete="one-time-code"
            maxLength={6}
            className="input text-center text-xl tracking-[0.4em] font-semibold"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
          />
        </div>
      )}

      {mode !== 'forgot' && (
        <PinField
          value={pin}
          onChange={setPin}
          autoFocus={mode === 'login'}
          label={mode === 'login' ? '4-digit PIN' : mode === 'setup' ? 'Choose a 4-digit PIN' : 'New 4-digit PIN'}
        />
      )}
      {(mode === 'setup' || mode === 'reset') && (
        <PinField value={pin2} onChange={setPin2} label="Confirm PIN" />
      )}

      {error && <p className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-200">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-900/40 px-3 py-2 text-sm text-emerald-200">{notice}</p>}

      <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
        {busy ? <Spinner /> : cta[mode]}
      </button>

      {/* Contextual links: first-time setup, forgot PIN, back to sign-in. */}
      <div className="space-y-1.5 text-center text-xs">
        {mode === 'login' && (
          <>
            <button type="button" onClick={() => to('setup')} className="block w-full font-semibold text-gold-300 hover:text-gold-200">
              First time here? Set up your PIN.
            </button>
            <button type="button" onClick={() => to('forgot')} className="block w-full text-slate-400 hover:text-slate-200">
              Forgot your PIN?
            </button>
          </>
        )}
        {(mode === 'setup' || mode === 'forgot' || mode === 'reset') && (
          <button type="button" onClick={() => to('login')} className="block w-full text-slate-400 hover:text-slate-200">
            ← Back to sign in
          </button>
        )}
        <button type="button" onClick={onUseEmail} className="block w-full pt-1 text-slate-500 hover:text-slate-300">
          Manager or admin? Sign in with email instead.
        </button>
      </div>
    </form>
  )
}
