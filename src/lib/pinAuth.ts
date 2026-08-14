import { supabase } from '@/lib/supabase'

// Thin client for the pin-auth edge function (phone + 4-digit PIN, matching time.ropsalons.com).
// Every call returns { ok, ... }; on ok we get a Supabase session to install. The function is the
// only place the PIN is ever turned into the real auth password, so the browser never sees a secret.

export interface PinSession {
  access_token: string
  refresh_token: string
}
export interface PinResult {
  ok: boolean
  session?: PinSession
  code?: string // e.g. 'no_pin', 'pin_exists' — lets the UI branch to the right next step
  error?: string
  message?: string
}

type PinAction = 'setup' | 'login' | 'forgot' | 'reset'

async function call(body: Record<string, unknown>): Promise<PinResult> {
  try {
    const { data, error } = await supabase.functions.invoke('pin-auth', { body })
    // A non-2xx from the function still carries our JSON body in error.context — read it so the user
    // sees "That PIN doesn't match" instead of a generic "Edge Function returned a non-2xx status code".
    if (error) {
      const ctx = (error as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') {
        const parsed = await ctx.json().catch(() => null)
        if (parsed) return parsed as PinResult
      }
      return { ok: false, error: 'We couldn’t reach the server. Check your connection and try again.' }
    }
    return (data as PinResult) ?? { ok: false, error: 'Something went wrong. Please try again.' }
  } catch {
    return { ok: false, error: 'We couldn’t reach the server. Check your connection and try again.' }
  }
}

export const pinAuth = {
  setup: (phone: string, pin: string) => call({ action: 'setup' as PinAction, phone, pin }),
  login: (phone: string, pin: string) => call({ action: 'login' as PinAction, phone, pin }),
  forgot: (phone: string) => call({ action: 'forgot' as PinAction, phone }),
  reset: (phone: string, code: string, pin: string) => call({ action: 'reset' as PinAction, phone, code, pin }),
}
