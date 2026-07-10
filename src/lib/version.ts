// App version + human-readable changelog.
// Bump APP_VERSION and prepend a CHANGELOG entry whenever you ship a change.
// Shown in the Help window (Version history) and the sidebar footer.

export const APP_VERSION = '1.6.4'

export interface ChangelogEntry {
  version: string
  date: string // ISO date (YYYY-MM-DD)
  time?: string // local time it shipped, e.g. "12:05 PM ET"
  title: string
  changes: string[]
}

// Newest first.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.6.4',
    date: '2026-07-10',
    time: '7:40 PM ET',
    title: 'Scorecard: By-salon breakdown',
    changes: [
      'The ROP Scorecard now shows three levels — Company total, By salon (Bayfront / Village / Bonita), and By stylist — with the same metrics (guests, new, RPG, prebook %, LUX %, new-request %). One Yesterday / WTD / MTD / YTD tab switches all three.',
    ],
  },
  {
    version: '1.6.3',
    date: '2026-07-10',
    time: '7:35 PM ET',
    title: 'Easier direct messages + who-booked summary',
    changes: [
      'Sending a private message is much easier now: a new Messages tab in the sidebar, a New Message button, and a blue Message button on every person in People — one tap to start a private chat.',
      'New #bookings-by-booker channel: an hourly card showing how many appointments each staff login booked today (plus online/guest self-bookings). Complements the instant #dc-coordinators feed with the actual booker’s name.',
    ],
  },
  {
    version: '1.6.2',
    date: '2026-07-10',
    time: '7:20 PM ET',
    title: 'Scorecard: prebook %, LUX %, new-request % on every window',
    changes: [
      'The ROP Scorecard now shows Prebook % and LUX % for Yesterday and Week-to-date too (not just monthly), computed from the daily Snowflake detail — LUX uses the official “Luxury Upgrades” definition.',
      'Replaced Request % with New-Request % (guests who were new and requested that stylist), shown at the end.',
    ],
  },
  {
    version: '1.6.1',
    date: '2026-07-10',
    time: '1:05 PM ET',
    title: 'Announcements + missing history backfilled',
    changes: [
      'Imported ~12,500 more messages from a full Slack export — the channels that came in empty before are now filled, including #announcements-rop (2,679 messages), #desk-closing, #desk-promenade, #products-rop, #education-all-levels, #caught-being-awesome, #share-vids-pics, #our-next-chapter and more. Total history is now ~30,700 messages.',
      'Re-imports are de-duplicated, so nothing already loaded was doubled.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-07-10',
    time: '12:05 PM ET',
    title: 'Update times + full-calendar link',
    changes: [
      'The “What’s new” list now shows the time of day each update shipped, not just the date.',
      'Added a pinned “full calendar” link in #rop-calendar so you can jump to the complete Google Calendar and browse any month — beyond the 14-day card.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-07-10',
    time: '11:41 AM ET',
    title: 'Company calendar in a channel',
    changes: [
      'New #rop-calendar channel shows an always-current “Upcoming ROP Events” card — the next 14 days from the Robert of Philadelphia company calendar (meetings, trainings, academies, content days), grouped by day with times and locations.',
      'It refreshes on its own every few hours, so newly added or moved events show up automatically — no manual updating.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-07-10',
    time: '11:12 AM ET',
    title: 'Sort & hide channels · live booking feed · fuller scorecard',
    changes: [
      'Sidebar channel controls: tap the ⇅ sort button to switch between A–Z, Recent activity, and Unread-first. Your choice is remembered on this device.',
      'Hide quiet channels: tap the 👁 (eye) button to show only channels with messages, unread, or favorited — a “+ Show N quiet channels” link brings the rest back. Favorites are never hidden.',
      'New live booking feed: every appointment booked in Boulevard (online or in-salon) posts automatically to #dc-coordinators within ~10 minutes — guest, new vs. repeat, stylist, service, who booked it and the appointment time.',
      'The ROP Scorecard’s per-stylist table now has Yesterday / Week-to-date / Month-to-date / Year-to-date tabs — tap a window to switch. Prebook % and LUX % show on the month-based views.',
    ],
  },
  {
    version: '1.3.2',
    date: '2026-07-10',
    title: 'Daily card runs on its own',
    changes: [
      'The #daily-numbers card now posts automatically every morning from a self-contained scheduled job (Supabase cron + Boulevard) — no manual step and nothing dependent on a live Claude session.',
      'Shows guests, appointments, first-visit guests, retail-per-guest (RPG) and rebooking, broken down by Bayfront / Village / Bonita.',
    ],
  },
  {
    version: '1.3.1',
    date: '2026-07-10',
    title: 'Automatic Daily Numbers card',
    changes: [
      'The #daily-numbers channel now posts an automatic morning stat card from live Snowflake data: guests, appointments, new clients and retail-per-guest (RPG) for the latest day, broken down by Bayfront / Village / Bonita, plus month-to-date and rebooking trend.',
      'Numbers come straight from the ANALYTICS.MARTS views (the same source of truth as the performance dashboards).',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-07-10',
    title: 'Edit member details',
    changes: [
      'Anyone can edit their own name shown in the app: Profile → Display name (e.g. set “Rob” instead of “Robert”).',
      'Admins can now edit any member’s full name, display name (nickname), title and phone from Admin → Users → Edit details — in addition to role, location, department and active status.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-07-10',
    title: 'Favorites + automated report cards',
    changes: [
      'Favorite (star) a channel to pin it to the top of your sidebar — your favorites are private to you. Star it from the sidebar (hover) or the ⭐ in the channel header.',
      'Channels are now sorted favorites-first, then alphabetically.',
      'The integration API can now post rich HTML “stat cards” (numbers, tables, charts) that render as a nice visual card in the channel — from a dashboard, Boulevard, a cron job, or an AI assistant.',
      'New “live board” mode: send the same external_key each run and the card updates in place instead of posting a new one.',
      'HTML cards render in a locked sandbox, so an outside report can never read or change your data.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-07-10',
    title: 'Team, history, and the Help guide',
    changes: [
      'Imported 18,158 messages of Slack history across 26 channels (June 2022 – December 2025), with the original author, reactions and threads preserved.',
      'Added all 52 active staff accounts from Boulevard/Gusto — name, nickname, role, location, job title, phone, birthday and hire date (for birthday & anniversary tracking).',
      'Excluded the two automated channels (missed-call voicemails and the “do not use” product-shipping feed) and stripped automated checklist/bot posts from the kept channels.',
      'Added this Help guide (the ? button, top-right of every page) and this version history.',
      'You can now Leave a channel, and owners/managers can Add or Remove members from the channel’s Members list.',
      'Added everyone to the channels that hold history so the archive is visible to the team.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-07-09',
    title: 'ROP Connect launch',
    changes: [
      'First release: channels (public / private / location / department / announcement), direct & group messages, threads, reactions, @mentions, file uploads, search and notifications.',
      'Salon workflows: Announcements, Urgent Alerts with acknowledgements, Daily Huddle, Shoutouts, Guest Recovery, Education and Scheduling.',
      'Admin Panel: user & role management, channel management, acknowledgement reports, audit log, storage usage and message export.',
      'Installable as a phone/desktop app (PWA) with an inbound integration API so dashboards and other systems can post messages in.',
    ],
  },
]
