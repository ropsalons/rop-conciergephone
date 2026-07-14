// App version + human-readable changelog.
// Bump APP_VERSION and prepend a CHANGELOG entry whenever you ship a change.
// Shown in the Help window (Version history) and the sidebar footer.

export const APP_VERSION = '1.10.10'

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
    version: '1.10.10',
    date: '2026-07-13',
    time: '3:30 PM ET',
    title: 'Email → Chat bridge',
    changes: [
      'You can now post into ROP Chat by email. Send to channel-<name>@chat.rop2020.com to post in a channel, or dm-<name>@chat.rop2020.com to DM a person — the email body becomes the message. Full instructions are in Help → “Post into ROP Chat by email” and in the how-to-operations channel.',
    ],
  },
  {
    version: '1.10.9',
    date: '2026-07-13',
    time: '2:55 PM ET',
    title: 'Powerful search — including Links',
    changes: [
      'New “Links” tab in Search finds every link ever shared across channels and DMs — open the Links tab with no search term to browse them all, or type to narrow down.',
      'Search now handles multi-word queries (all words must match) and is indexed for speed across the entire message archive, so results are instant.',
      'Search still spans messages, files, channels and people, with filters for sender, date, location and department.',
    ],
  },
  {
    version: '1.10.8',
    date: '2026-07-13',
    time: '2:20 PM ET',
    title: 'Home you can actually organize',
    changes: [
      'Mobile Home now has collapsible sections — tap “Direct Messages”, “Starred”, or “Channels” to expand/collapse. Direct Messages sits up top, and collapsing Channels gets you to your DMs instantly. Collapsed state is remembered.',
      'Channels now sort by most-recent activity by default (not A–Z), so the conversations that are actually moving float to the top — everywhere in the app.',
    ],
  },
  {
    version: '1.10.7',
    date: '2026-07-13',
    time: '1:55 PM ET',
    title: 'Auto-updating app + cleaner dashboard',
    changes: [
      'The app now checks for new versions on its own (every 30 seconds and whenever you reopen it) and quietly refreshes to the latest — no more force-closing to get updates.',
      'Cleaned up the Salon Dashboard: removed Daily Huddle, and the “Quick actions” grid is now a focused “Salon actions” set (New Shoutout, Guest Recovery, Scheduling).',
    ],
  },
  {
    version: '1.10.6',
    date: '2026-07-13',
    time: '1:25 PM ET',
    title: 'Slack-style mobile Home + easy Settings',
    changes: [
      'The mobile Home tab now looks like Slack: your Starred channels, all Channels, and Direct Messages in one scroll, with unread DMs pulled to the top.',
      'Settings & notifications are now front-and-center on Home — tap the gear or your avatar in the top-right (or the Settings tile). The salon dashboard moved to its own “Salon Dashboard” tile at the top of Home.',
    ],
  },
  {
    version: '1.10.5',
    date: '2026-07-13',
    time: '1:05 PM ET',
    title: 'Slack-style mobile tab bar',
    changes: [
      'The mobile bottom bar now matches Slack: Home · DMs · Activity · Search · More. Channels live under “More” (with their unread count on the badge).',
    ],
  },
  {
    version: '1.10.4',
    date: '2026-07-13',
    time: '12:35 PM ET',
    title: 'Drag to reorder your channels + merged Announcements',
    changes: [
      'You can now put your channels in any order you want: tap the sort button in the Channels header until it says “My order,” then drag the ⣿ handle to arrange them. Your order is remembered on that device.',
      'Merged the old imported announcements channel into the main Announcements channel, so all 4 years of history now live in the one channel everyone follows.',
    ],
  },
  {
    version: '1.10.3',
    date: '2026-07-13',
    time: '12:12 PM ET',
    title: 'Simpler sidebar',
    changes: [
      'Removed the extra “Salon” shortcut group from the left menu (it duplicated real channels like Announcements and confused people). Your actual Channels now come right after the top menu, followed by Direct Messages.',
    ],
  },
  {
    version: '1.10.2',
    date: '2026-07-13',
    time: '10:26 AM ET',
    title: 'Reliability: auto-recover stuck installs',
    changes: [
      'Fixed an issue where a phone that opened the app during a bad deploy could get stuck on a blank screen. Installs now automatically pull the latest working version instead of holding onto a broken cached copy.',
    ],
  },
  {
    version: '1.10.1',
    date: '2026-07-11',
    time: '10:05 PM ET',
    title: 'Fix: blank screen when replying to a card',
    changes: [
      'Fixed a bug where replying to a posted card (like the ROP Scorecard or a Victory) opened a thread that went completely blank. Threads now show the original card at the top and open reliably.',
    ],
  },
  {
    version: '1.10.0',
    date: '2026-07-11',
    time: '9:45 AM ET',
    title: 'New name & look — ROP Chat + Directory upgrades',
    changes: [
      'Say hello to ROP Chat (shown as “ROP Chat (Slack)” for now so everyone connects it to Slack). New app icon and notification badge to match.',
      'Directory: sort people by A–Z, Recently active, Newest hires, or Longest here — and each person now shows the year they started (“since 2019”).',
    ],
  },
  {
    version: '1.9.1',
    date: '2026-07-11',
    time: '9:05 AM ET',
    title: 'Simpler passcodes',
    changes: [
      'Your passcode is now the last 4 digits of your phone number (or rop2020 if we don’t have your number on file). The login screen accepts short passcodes.',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-07-11',
    time: '8:10 AM ET',
    title: 'Slack-style mobile experience',
    changes: [
      'New Channels tab in the bottom bar — a full-screen list of your channels with unread badges, favorites on top, a quick filter, and browse/create. (Search moved into Menu.)',
      'Opening a channel or DM is now full-screen: the bottom bar tucks away and a back arrow (top-left) returns you to the list — just like the Slack app.',
      'Long-press any message (or tap the ⋯) to open an action sheet — react, reply, pin, edit, or delete — instead of hunting for tiny buttons.',
      'Swipe from the left edge to open the menu, swipe it away to close.',
    ],
  },
  {
    version: '1.8.1',
    date: '2026-07-11',
    time: '7:35 AM ET',
    title: 'Email staff from the dashboard + more mobile polish',
    changes: [
      'New Admin → Send Email tool: compose a message and send it by email to all active staff, a whole location, hand-picked people, or custom addresses — sent from notifications@rop2020.com (recipients are BCC’d, replies come to you).',
      'More mobile: swipe from the left edge to open the channel drawer (and swipe it away to close), a clearer highlighted tab in the bottom bar, and bigger touch targets throughout.',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-07-10',
    time: '11:20 PM ET',
    title: 'Edit channels · mobile polish · nightly backup',
    changes: [
      'Admins can now rename a channel and change its details: Admin → Channels → the ✏️ Edit button lets you change the name, type, topic, description, default-join, and archived status.',
      'Mobile: message actions (react / reply / pin / edit / delete) are now reachable by tapping the ⋯ on a message — no more hover-only. The favorite ⭐ is now visible and tappable on phones, tap targets are bigger, and pinch-to-zoom is allowed again.',
      'The ROP Scorecard now shows stylists by first name + last initial so the by-stylist table fits phone screens.',
      'Added an automatic nightly backup of the app’s data (channels, messages, people, settings) saved into our own database and kept for 14 days, so a bad change can be rolled back.',
    ],
  },
  {
    version: '1.7.2',
    date: '2026-07-10',
    time: '10:45 PM ET',
    title: 'Live “Today” on the Scorecard + fuller booking counts',
    changes: [
      'The ROP Scorecard now has a live Today view — company, by salon, and by stylist — that fills in through the day (refreshes hourly) and is complete after close. It sits alongside Yesterday / WTD / MTD / YTD, and Today is the default tab. Quick “today” tiles (guests, new, RPG, prebook %, LUX %) sit up top.',
      'Fresh look: a gradient header and cleaner tables so the numbers are easier to read.',
      '#bookings-by-booker now counts every appointment booked today (including bookings made today for future dates) — it was previously only counting same-day completed appointments, so it under-reported. Staff show by name; online self-bookings are grouped.',
    ],
  },
  {
    version: '1.7.1',
    date: '2026-07-10',
    time: '9:40 PM ET',
    title: 'Step-by-step: turning on phone notifications',
    changes: [
      'The Help guide now has numbered, phone-specific steps for turning on notifications — one set for iPhone (install to Home Screen first) and one for Android/Pixel — plus what to do if they’re blocked or silent.',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-07-10',
    time: '9:27 PM ET',
    title: 'Phone notifications 🔔',
    changes: [
      'You can now get a push notification on your phone when something needs you — even with the app closed. Open Profile → Notifications and tap “Turn on notifications for this device.” On iPhone, add ROP Connect to your Home Screen first, then open it from there.',
      'By default you’ll be pushed for direct messages, @mentions, and announcements. Tapping a notification opens right to that message.',
      'Mute any channel you don’t want buzzing you: open the channel and tap the bell in the top bar. Muted channels never send phone notifications. You can also fine-tune types (DMs / mentions / announcements / urgent) in Profile → Notifications.',
    ],
  },
  {
    version: '1.6.6',
    date: '2026-07-10',
    time: '8:59 PM ET',
    title: 'Scorecard: home-run rows 🏆',
    changes: [
      'When a stylist (or salon, or the company) hits all three targets at once — Prebook % ≥ 70, RPG ≥ $8 and LUX % ≥ 33 — that whole row now lights up green with a 🏆 to celebrate the home run. Works on every window (Yesterday / WTD / MTD / YTD).',
    ],
  },
  {
    version: '1.6.5',
    date: '2026-07-10',
    time: '8:19 PM ET',
    title: 'New-guest prebook % + a cleaner look',
    changes: [
      'The ROP Scorecard now shows New PB% — the share of each stylist’s (and salon’s) new guests who pre-booked their next visit — alongside the existing new-guest counts, on every window (Yesterday / WTD / MTD / YTD).',
      'Both report cards got a visual refresh: rounded tables with a blue header, zebra striping, summary tiles and color-coded targets (green/amber/red) so the numbers are easier to scan. The #bookings-by-booker card now matches and clearly covers the whole day.',
    ],
  },
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
