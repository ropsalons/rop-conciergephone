import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useDirectoryStore } from '@/stores/directoryStore'
import { useUIStore } from '@/stores/uiStore'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Feedback'
import { Bell, LogOut } from '@/components/ui/Icons'
import { ROLE_LABELS } from '@/lib/constants'
import { cn, uuid } from '@/lib/utils'
import { disablePush, enablePush, getPushStatus, type PushStatus } from '@/lib/push'
import type { NotificationPrefs, Presence, Profile } from '@/types'

const PREF_LABELS: Record<keyof NotificationPrefs, string> = {
  dm: 'Direct messages',
  mentions: 'Mentions',
  announcements: 'Announcements',
  urgent: 'Urgent alerts',
  channels: 'Channel activity',
  browser_push: 'Browser push',
  mobile_push: 'Mobile push',
  sound: 'Sound',
}

// Which per-type toggles to show under the enable button (the rest are managed elsewhere).
const TYPE_TOGGLES: (keyof NotificationPrefs)[] = ['dm', 'mentions', 'announcements', 'urgent', 'sound']

const DEFAULT_PREFS: NotificationPrefs = {
  dm: true,
  mentions: true,
  announcements: true,
  urgent: true,
  channels: false,
  browser_push: false,
  mobile_push: false,
  sound: true,
}

const PRESENCE_OPTIONS: Presence[] = ['online', 'away']

export function ProfilePage() {
  const profile = useAuthStore((s) => s.profile)
  const user = useAuthStore((s) => s.user)
  const toast = useUIStore((s) => s.toast)
  const locations = useDirectoryStore((s) => s.locations)
  const departments = useDirectoryStore((s) => s.departments)

  const fileRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pushStatus, setPushStatus] = useState<PushStatus>('default')
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    void getPushStatus().then(setPushStatus)
  }, [])

  const [form, setForm] = useState(() => ({
    display_name: profile?.display_name ?? '',
    title: profile?.title ?? '',
    phone: profile?.phone ?? '',
    bio: profile?.bio ?? '',
    custom_status: profile?.custom_status ?? '',
  }))

  if (!profile || !user) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="My Profile" />
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="text-sm text-slate-400">Not signed in.</p>
        </div>
      </div>
    )
  }

  const prefs: NotificationPrefs = profile.notification_prefs ?? DEFAULT_PREFS
  const locationName = profile.location_id
    ? locations.find((l) => l.id === profile.location_id)?.name ?? '—'
    : '—'
  const departmentName = profile.department_id
    ? departments.find((d) => d.id === profile.department_id)?.name ?? '—'
    : '—'

  async function patch(update: Partial<Profile>, successMsg?: string) {
    const { error } = await useAuthStore.getState().updateProfile(update)
    if (error) toast({ kind: 'error', title: 'Update failed', body: error })
    else if (successMsg) toast({ kind: 'success', title: successMsg })
    return !error
  }

  async function saveDetails() {
    setSaving(true)
    await patch(
      {
        display_name: form.display_name.trim() || null,
        title: form.title.trim() || null,
        phone: form.phone.trim() || null,
        bio: form.bio.trim() || null,
        custom_status: form.custom_status.trim() || null,
      },
      'Profile saved',
    )
    setSaving(false)
  }

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return
    if (!file.type.startsWith('image/')) {
      toast({ kind: 'error', title: 'Invalid file', body: 'Please choose an image.' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ kind: 'error', title: 'Too large', body: 'Images must be under 5 MB.' })
      return
    }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `${user.id}/${uuid()}.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file)
      if (upErr) throw upErr
      const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
      await patch({ avatar_url: url }, 'Photo updated')
    } catch (err: any) {
      toast({ kind: 'error', title: 'Upload failed', body: err.message })
    } finally {
      setUploading(false)
    }
  }

  function togglePref(key: keyof NotificationPrefs, value: boolean) {
    void patch({ notification_prefs: { ...prefs, [key]: value } })
  }

  async function enableDevicePush() {
    if (!user) return
    setPushBusy(true)
    try {
      const res = await enablePush(user.id)
      if (!res.ok) {
        toast({ kind: 'error', title: 'Could not enable notifications', body: res.error })
        setPushStatus(await getPushStatus())
        return
      }
      await patch({ notification_prefs: { ...prefs, mobile_push: true, browser_push: true } }, 'Notifications on for this device')
      setPushStatus('subscribed')
    } finally {
      setPushBusy(false)
    }
  }

  async function disableDevicePush() {
    setPushBusy(true)
    try {
      await disablePush()
      await patch({ notification_prefs: { ...prefs, mobile_push: false } }, 'Notifications off for this device')
      setPushStatus('off')
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="My Profile" />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-xl space-y-4">
          {/* Identity + avatar */}
          <section className="card p-4">
            <div className="flex items-center gap-4">
              <Avatar profile={profile} size="xl" showPresence />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold text-white">
                  {profile.display_name || profile.full_name}
                </p>
                <p className="truncate text-sm text-slate-400">
                  {profile.title || ROLE_LABELS[profile.role] || profile.role}
                </p>
                <div className="mt-2">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatarChange} />
                  <button
                    className="btn-ghost px-3 py-1.5 text-sm"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? <Spinner className="h-4 w-4" /> : null}
                    {uploading ? 'Uploading…' : 'Change photo'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Editable details */}
          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-semibold text-white">Details</h2>
            <div>
              <label className="label" htmlFor="display_name">Display name</label>
              <input
                id="display_name"
                className="input"
                value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="title">Title</label>
              <input
                id="title"
                className="input"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="phone">Phone</label>
              <input
                id="phone"
                className="input"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="custom_status">Status</label>
              <input
                id="custom_status"
                className="input"
                placeholder="What are you up to?"
                value={form.custom_status}
                onChange={(e) => setForm((f) => ({ ...f, custom_status: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="bio">Bio</label>
              <textarea
                id="bio"
                className="input min-h-[80px]"
                value={form.bio}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              />
            </div>
            <button className="btn-primary" disabled={saving} onClick={saveDetails}>
              {saving ? <Spinner className="h-4 w-4" /> : null}
              Save changes
            </button>
          </section>

          {/* Presence */}
          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-semibold text-white">Availability</h2>
            <div>
              <label className="label" htmlFor="presence">Presence</label>
              <select
                id="presence"
                className="input"
                value={profile.presence === 'offline' ? 'away' : profile.presence}
                onChange={(e) => void patch({ presence: e.target.value as Presence })}
              >
                {PRESENCE_OPTIONS.map((p) => (
                  <option key={p} value={p} className="capitalize">{p}</option>
                ))}
              </select>
            </div>
          </section>

          {/* Read-only org info */}
          <section className="card space-y-2 p-4">
            <h2 className="text-sm font-semibold text-white">Organization</h2>
            <p className="text-xs text-slate-500">Managed by an administrator.</p>
            <ReadOnlyRow label="Role" value={ROLE_LABELS[profile.role] ?? profile.role} />
            <ReadOnlyRow label="Location" value={locationName} />
            <ReadOnlyRow label="Department" value={departmentName} />
          </section>

          {/* Notifications */}
          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-semibold text-white">Notifications</h2>

            {pushStatus === 'subscribed' ? (
              <button className="btn-ghost px-3 py-1.5 text-sm" onClick={disableDevicePush} disabled={pushBusy}>
                {pushBusy ? <Spinner className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                Notifications on for this device — tap to turn off
              </button>
            ) : (
              <button
                className="btn-primary px-3 py-1.5 text-sm"
                onClick={enableDevicePush}
                disabled={pushBusy || pushStatus === 'unsupported' || pushStatus === 'denied'}
              >
                {pushBusy ? <Spinner className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                {pushStatus === 'denied'
                  ? 'Notifications blocked in browser settings'
                  : pushStatus === 'unsupported'
                    ? 'Not supported on this device'
                    : 'Turn on notifications for this device'}
              </button>
            )}

            <p className="text-xs text-slate-500">
              {pushStatus === 'unsupported'
                ? 'On iPhone, add ROP Chat to your Home Screen first (Share → Add to Home Screen), then open it from there to enable notifications.'
                : pushStatus === 'denied'
                  ? 'You blocked notifications for this site. Re-enable them in your browser/phone settings, then come back here.'
                  : 'Get a push on your phone for direct messages, @mentions and announcements — even when the app is closed. Turn it on once per device. Mute any individual channel from that channel’s menu.'}
            </p>

            <div className="divide-y divide-white/5 pt-1">
              {TYPE_TOGGLES.map((key) => (
                <Toggle
                  key={key}
                  label={PREF_LABELS[key]}
                  checked={!!prefs[key]}
                  onChange={(v) => togglePref(key, v)}
                />
              ))}
            </div>
          </section>

          {/* Sign out */}
          <button className="btn-danger w-full" onClick={() => void useAuthStore.getState().signOut()}>
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-right text-slate-200">{value}</span>
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between py-2.5 text-left"
    >
      <span className="text-sm text-slate-200">{label}</span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand-500' : 'bg-white/15',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}
