import { useEffect } from 'react'
import { useChatStore } from '@/stores/chatStore'

// Shows an unread count on the installed app's icon (macOS Dock / Windows taskbar / Android home
// screen) via the Badging API. Reflects the same count as the in-app notifications bell, so the app
// symbol lights up with a red number when something needs you — even before you open it. No-ops on
// browsers/platforms without Badging support.
export function AppBadge() {
  const count = useChatStore((s) => s.notificationsCount)

  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    try {
      if (count > 0) void nav.setAppBadge?.(count)
      else void nav.clearAppBadge?.()
    } catch {
      /* Badging API unsupported — ignore */
    }
  }, [count])

  // Clear the badge when the app is closed/backgrounded cleanly.
  useEffect(() => {
    const clear = () => {
      const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> }
      if (useChatStore.getState().notificationsCount === 0) {
        try { void nav.clearAppBadge?.() } catch { /* ignore */ }
      }
    }
    window.addEventListener('pagehide', clear)
    return () => window.removeEventListener('pagehide', clear)
  }, [])

  return null
}
