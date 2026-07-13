import { useMediaQuery } from '@/hooks/useMediaQuery'
import { DashboardPage } from '@/pages/DashboardPage'
import { MobileHomePage } from '@/pages/MobileHomePage'

// The Home tab. On desktop the left sidebar already lists channels/DMs, so Home shows the
// salon Dashboard. On mobile (no persistent sidebar) Home is the Slack-style list; the
// Dashboard is one tap away from there. Route /dashboard always shows the Dashboard.
export function HomePage() {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  return isDesktop ? <DashboardPage /> : <MobileHomePage />
}
