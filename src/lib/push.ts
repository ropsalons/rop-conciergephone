// ROP Connect — Web Push subscription helpers (mobile background notifications).
// Registers this device with the browser's push service and stores the subscription
// in `push_subscriptions`. The DB trigger `push_on_notification` fans pushes out to
// these subscriptions (honoring notification_prefs + per-channel mute).

import { supabase } from '@/lib/supabase'

// VAPID *public* key — safe to ship in the client (the private half lives only in the
// push-send Edge Function). Must match the key baked into that function.
const VAPID_PUBLIC_KEY = 'BDyGhwfWqe89kd97jKadjaK7HFbXzzEeG_K-eB2HYU2y-utJFmd_LGcBZJBsGi321eFbU-h3YpzPLCYCb0XOkk8'

export type PushStatus = 'unsupported' | 'denied' | 'default' | 'subscribed' | 'off'

// Best-effort diagnostics so we can see, server-side, exactly where a phone's
// enable attempt gets to. Never throws.
async function dbg(userId: string | undefined, step: string, ok: boolean, detail?: string) {
  try {
    await supabase.from('push_debug').insert({
      user_id: userId ?? null,
      step,
      ok,
      detail: detail ? String(detail).slice(0, 300) : null,
      ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
    } as any)
  } catch {
    /* ignore */
  }
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  )
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

// Get an active SW registration without hanging forever if install stalls.
async function getReg(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const ready = navigator.serviceWorker.ready
  const timeout = new Promise<null>((res) => setTimeout(() => res(null), 6000))
  let reg = await Promise.race([ready, timeout])
  if (!reg) {
    // .ready stalled — fall back to an explicit registration.
    try {
      reg = await navigator.serviceWorker.register('/sw.js')
    } catch {
      reg = (await navigator.serviceWorker.getRegistration()) ?? null
    }
  }
  return reg
}

async function saveSubscription(userId: string, sub: PushSubscription): Promise<{ ok: boolean; error?: string }> {
  const json: any = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
      last_seen_at: new Date().toISOString(),
    } as any,
    { onConflict: 'endpoint' },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'default') return 'default'
  const r = await getReg()
  const sub = r ? await r.pushManager.getSubscription() : null
  return sub ? 'subscribed' : 'off'
}

// Runs quietly on app load: if this browser already has a push subscription but it never
// made it into the DB, save it now. Self-heals a half-finished enable. Never prompts.
export async function syncExistingSubscription(userId: string): Promise<void> {
  try {
    if (!isPushSupported() || Notification.permission !== 'granted') return
    const r = await getReg()
    const sub = r ? await r.pushManager.getSubscription() : null
    if (sub) await saveSubscription(userId, sub)
  } catch {
    /* ignore */
  }
}

// Subscribe this device and persist the subscription. Returns an error message on failure.
export async function enablePush(userId: string): Promise<{ ok: boolean; error?: string }> {
  await dbg(userId, 'enable:start', true, `supported=${isPushSupported()} perm=${typeof Notification !== 'undefined' ? Notification.permission : 'n/a'}`)
  try {
    if (!isPushSupported()) {
      await dbg(userId, 'enable:unsupported', false)
      return { ok: false, error: 'This device or browser does not support push notifications.' }
    }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    await dbg(userId, 'enable:permission', perm === 'granted', perm)
    if (perm !== 'granted') return { ok: false, error: 'Notification permission was not granted.' }

    const r = await getReg()
    await dbg(userId, 'enable:sw', !!r, r ? 'registration ready' : 'no registration')
    if (!r) return { ok: false, error: 'Service worker is not ready yet — fully close the app and reopen it, then try again.' }

    let sub = await r.pushManager.getSubscription()
    if (!sub) {
      sub = await r.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      await dbg(userId, 'enable:subscribed', !!sub, sub?.endpoint?.slice(0, 60))
    } else {
      await dbg(userId, 'enable:existing-sub', true, sub.endpoint.slice(0, 60))
    }

    const saved = await saveSubscription(userId, sub)
    await dbg(userId, 'enable:saved', saved.ok, saved.error)
    return saved
  } catch (e: any) {
    await dbg(userId, 'enable:error', false, e?.message ?? String(e))
    return { ok: false, error: e?.message ?? String(e) }
  }
}

// Unsubscribe this device and remove its stored subscription.
export async function disablePush(): Promise<void> {
  try {
    const r = await getReg()
    const sub = r ? await r.pushManager.getSubscription() : null
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  } catch {
    /* ignore */
  }
}
