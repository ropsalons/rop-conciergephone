// ROP Connect — Web Push subscription helpers (mobile background notifications).
// Registers this device with the browser's push service and stores the subscription
// in `push_subscriptions`. The DB trigger `push_on_notification` fans pushes out to
// these subscriptions (honoring notification_prefs + per-channel mute).

import { supabase } from '@/lib/supabase'

// VAPID *public* key — safe to ship in the client (the private half lives only in the
// push-send Edge Function). Must match the key baked into that function.
const VAPID_PUBLIC_KEY = 'BDyGhwfWqe89kd97jKadjaK7HFbXzzEeG_K-eB2HYU2y-utJFmd_LGcBZJBsGi321eFbU-h3YpzPLCYCb0XOkk8'

export type PushStatus = 'unsupported' | 'denied' | 'default' | 'subscribed' | 'off'

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

async function reg(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'default') return 'default'
  const r = await reg()
  const sub = r ? await r.pushManager.getSubscription() : null
  return sub ? 'subscribed' : 'off'
}

// Subscribe this device and persist the subscription. Returns an error message on failure.
export async function enablePush(userId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!isPushSupported()) return { ok: false, error: 'This device or browser does not support push notifications.' }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (perm !== 'granted') return { ok: false, error: 'Notification permission was not granted.' }
    const r = await reg()
    if (!r) return { ok: false, error: 'Service worker is not ready yet — reopen the app and try again.' }
    let sub = await r.pushManager.getSubscription()
    if (!sub) {
      sub = await r.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }
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
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}

// Unsubscribe this device and remove its stored subscription.
export async function disablePush(): Promise<void> {
  try {
    const r = await reg()
    const sub = r ? await r.pushManager.getSubscription() : null
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  } catch {
    /* ignore */
  }
}
