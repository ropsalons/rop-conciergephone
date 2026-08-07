import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { Toaster, FullPageLoader } from '@/components/ui/Feedback'
import { MissingConfig } from '@/components/MissingConfig'
import { UpdatePrompt } from '@/components/UpdatePrompt'
import { AuthPage } from '@/pages/AuthPage'
import { AppLayout } from '@/components/layout/AppLayout'
import { DashboardPage } from '@/pages/DashboardPage'
import { HomePage } from '@/pages/HomePage'
import { ChannelPage } from '@/pages/ChannelPage'
import { ChannelsHomePage } from '@/pages/ChannelsHomePage'
import { DMPage } from '@/pages/DMPage'
import { DMListPage } from '@/pages/DMListPage'
import { DirectoryPage } from '@/pages/DirectoryPage'
import { SearchPage } from '@/pages/SearchPage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { SavedPage } from '@/pages/SavedPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { AnnouncementsPage } from '@/pages/AnnouncementsPage'
import { UrgentAlertsPage } from '@/pages/UrgentAlertsPage'
import { HuddlePage } from '@/pages/HuddlePage'
import { ShoutoutsPage } from '@/pages/ShoutoutsPage'
import { GuestRecoveryPage } from '@/pages/GuestRecoveryPage'
import { EducationPage } from '@/pages/EducationPage'
import { SchedulingPage } from '@/pages/SchedulingPage'
import { EventsPage } from '@/pages/EventsPage'
import { EventDetailPage } from '@/pages/EventDetailPage'
import { ResourcesPage } from '@/pages/ResourcesPage'
import { AdminPage } from '@/pages/AdminPage'
import { DeactivatedPage } from '@/pages/DeactivatedPage'
import { ShareTargetModal } from '@/components/share/ShareTargetModal'
import { AppBadge } from '@/components/AppBadge'

export default function App() {
  const { initialized, session, profile, init } = useAuthStore()

  useEffect(() => {
    if (isSupabaseConfigured) init()
  }, [init])

  if (!isSupabaseConfigured) return <MissingConfig />
  if (!initialized) return <FullPageLoader label="Starting ROP Chat…" />

  if (!session) {
    return (
      <>
        <Routes>
          {/* Show the login screen without changing the URL, so a shared/notification deep link
              (e.g. /#/dm/123?m=456) survives sign-in and routes to the right message afterward. */}
          <Route path="/login" element={<AuthPage />} />
          <Route path="*" element={<AuthPage />} />
        </Routes>
        <Toaster />
        <UpdatePrompt />
      </>
    )
  }

  // Signed in but the admin has deactivated this account.
  if (profile && !profile.is_active) {
    return (
      <>
        <DeactivatedPage />
        <Toaster />
      </>
    )
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/" element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="channels" element={<ChannelsHomePage />} />
          <Route path="channel/:channelId" element={<ChannelPage />} />
          <Route path="dms" element={<DMListPage />} />
          <Route path="dm/:conversationId" element={<DMPage />} />
          <Route path="people" element={<DirectoryPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="saved" element={<SavedPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="alerts" element={<UrgentAlertsPage />} />
          <Route path="huddle" element={<HuddlePage />} />
          <Route path="shoutouts" element={<ShoutoutsPage />} />
          <Route path="recovery" element={<GuestRecoveryPage />} />
          <Route path="education" element={<EducationPage />} />
          <Route path="scheduling" element={<SchedulingPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="events/:eventId" element={<EventDetailPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      {/* Opens only when the app was launched from the phone's share sheet (Android). */}
      <ShareTargetModal />
      {/* Unread count on the app's Dock/taskbar/home-screen icon. */}
      <AppBadge />
      <Toaster />
      <UpdatePrompt />
    </>
  )
}
