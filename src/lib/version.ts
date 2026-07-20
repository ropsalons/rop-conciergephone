// App version + human-readable changelog.
// Bump APP_VERSION and prepend a CHANGELOG entry whenever you ship a change.
// Shown in the Help window (Version history) and the sidebar footer.

export const APP_VERSION = '1.24.0'

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
    version: '1.24.0',
    date: '2026-07-20',
    time: '4:20 PM ET',
    title: 'Forward any message to a project (Command Center)',
    changes: [
      'Admins now have a “Send to a project” action on any message (the 📋 icon on hover, or in the ⋯ menu on phone). Pick a connected project — Command Center or any other — add an optional note, and the message is sent straight into that project’s command channel, where it becomes a task/project item.',
      'It carries where it came from (channel + original sender) and your note, so the project has full context. Admins only.',
    ],
  },
  {
    version: '1.23.0',
    date: '2026-07-20',
    time: '3:45 PM ET',
    title: 'Feeds control — see & switch off any automated poster',
    changes: [
      'New Admin → Feeds tab lists every automation posting into ROP Chat (the Boulevard booking feed, the email bridge, inbound texts, and each connected AI project) — showing what it is, which channels it posts to, and how much.',
      'Each feed has a simple On/Off switch. Turning one Off silences it instantly — no matter which project or pipeline it came from — and turning it back on is one tap. Your team’s own messages are never affected.',
    ],
  },
  {
    version: '1.22.3',
    date: '2026-07-20',
    time: '3:05 PM ET',
    title: 'Download file attachments',
    changes: [
      'Files shared in chat (PDFs, docs, .md, spreadsheets, etc.) now download when you tap them, with a clear download button — instead of just opening in a browser tab. Images still preview inline and now have a “Download” link too.',
    ],
  },
  {
    version: '1.22.2',
    date: '2026-07-19',
    time: '3:00 AM ET',
    title: 'AI Command Consoles now on the Home screen',
    changes: [
      'Your AI Command Consoles now show as their own section on Home (both desktop and phone), not just in the sidebar — so you can jump into any project’s command channel right from the home screen.',
    ],
  },
  {
    version: '1.22.1',
    date: '2026-07-19',
    time: '2:45 AM ET',
    title: 'Back arrow always returns you Home',
    changes: [
      'The ← back arrow at the top of a channel or a direct message now takes you straight to Home, instead of dropping you on the channel list or DM list. One tap, you’re home.',
    ],
  },
  {
    version: '1.22.0',
    date: '2026-07-19',
    time: '2:20 AM ET',
    title: 'Guests — invite outside partners, reps & consultants',
    changes: [
      'New Admin → Guests tab for outside people who aren’t employees (partners, vendor/reps, consultants). They’re marked as guests and never sync to payroll.',
      'Add a guest with their name, type, title, email/phone, and which channels they should join. Then invite them with one tap — by text or by email — using a friendly, editable welcome message. Nothing sends until you hit Send.',
      'When an invited guest signs up with that email, they’re automatically marked a guest and dropped into the channels you picked for them.',
      'Added a #Color Orders channel, and pre-loaded Michelle and Bridget (Wella / Cosmoprof reps) and Scott Kelly (consultant) as guests ready to invite.',
    ],
  },
  {
    version: '1.21.0',
    date: '2026-07-19',
    time: '1:15 AM ET',
    title: 'Quiet hours & vacation — don’t get pinged when you don’t want to',
    changes: [
      'New “Do Not Disturb” in Profile → Notifications. Set Quiet hours (e.g. 10 PM–7 AM) and your phone stays silent overnight — notifications still pile up in the app, they just don’t buzz you.',
      'Going away? Flip “Pause all notifications (vacation).” Leave it on until you’re back, or set a “Resume on” date and it turns itself back on automatically.',
      'One safety rule: Urgent Alerts always come through, even during quiet hours or vacation — so a real emergency still reaches you. Everything else respects your settings. Times are Eastern.',
    ],
  },
  {
    version: '1.20.0',
    date: '2026-07-19',
    time: '12:45 AM ET',
    title: 'Command console channels for your connected AI projects',
    changes: [
      'Your connected outside projects/AI agents can now each have a dedicated “command” channel in ROP Chat — type an instruction there and (once the project’s return path is set up) it reads it as a command and replies back.',
      'These live in a collapsible “AI Command Consoles” group in the sidebar so they stay tidy and out of the way. Tap the group header to expand/collapse; it’s remembered on your device.',
      'By default a command channel is visible to Leaders & up, and membership tracks that automatically (promote someone to Leader and they’re added; no manual step). Change the level per-channel in Admin → Channels → “Who can see & use this channel” (Everyone / Leaders / Admins).',
      'Admin → Channels also gained a “Sidebar group” field so you can collapse any set of channels together, not just the AI ones.',
      'Started you off with a #command-center channel for the ROP Command Center project.',
    ],
  },
  {
    version: '1.19.0',
    date: '2026-07-18',
    time: '11:15 PM ET',
    title: 'Replies show in the channel + save & remind-me on any message',
    changes: [
      'Replies are no longer hidden. When someone replies to a message it now shows right in the channel — lightly indented, with a “↳ replying to …” tag you can tap to jump to the original — and new replies land at the bottom where you’re reading. (The thread panel is still there as a focused view for long back-and-forths.)',
      '⏰ Remind me: on any message, tap the clock (or ⋯ on your phone) and pick “In 1 hour,” “This evening,” “Tomorrow morning,” “Next week,” or a custom date/time. When it’s due you get a notification + a push to your phone, and tapping it jumps back to the message — so nothing slips.',
      '🔖 Save for later: tap the bookmark to stash any message in your new “Saved & Reminders” list (in the left menu). Only you see it — revisit, reschedule or clear anytime.',
      'Updated the Help guide (the ? button) to cover inline replies and saving/reminders.',
    ],
  },
  {
    version: '1.18.0',
    date: '2026-07-18',
    time: '10:45 PM ET',
    title: 'Access levels, dual job titles & two-location staff',
    changes: [
      'Your job title and your access level are now two separate things. Someone can stay a Concierge (so they keep getting concierge messages) and ALSO be an Admin — they’ll show as “Concierge” with a small “A” badge. Access levels are Owner, Admin, Leader and Member.',
      'Admin = full control (“god mode”). Leader (shown as an “L”) can send Urgent Alerts. Everyone can post to Announcements now — Urgent Alerts are reserved for Leaders and up.',
      'Dual job titles: people who hold two jobs now show both, e.g. “Associate + Stylist.” Set on the person’s card in Admin → Users (Title + Second title). Pulled straight from Gusto so it matches payroll — Elizabeth, Dori and Katie show Associate + Stylist.',
      'Two-location staff: you can now give someone a Second location in Admin → Users. They’ll be added to both salon channels and get location announcements/urgent alerts for both.',
      'Admin → Users redesigned: each person now has Title, Second title, Access level, Department, Location and Second location — plus the A/L badge right on the card.',
      'Cleaned up the pickers: titles are now Concierge, Stylist, Associate, Specialist, Leadership and Marketing. Departments are Styling, Concierge and Marketing. (Removed the old Administrator/Manager/Operations/Education/HR/Guest Experience/Leadership entries.)',
      'Updated the Help guide (the ? button) to explain access levels, dual titles and two-location staff.',
    ],
  },
  {
    version: '1.17.1',
    date: '2026-07-18',
    time: '10:05 PM ET',
    title: 'Admin: terminated staff hidden from the Users list',
    changes: [
      'In Admin → Users, people who’ve been deactivated/terminated no longer clutter the list — it shows current staff only. Tick “Show inactive / terminated” to see (and reactivate) them when you need to.',
    ],
  },
  {
    version: '1.17.0',
    date: '2026-07-18',
    time: '9:20 PM ET',
    title: 'You’re now notified on every channel (mute the ones you don’t want)',
    changes: [
      'New default for everyone: you now get a notification — on your phone and the desktop app — for every message in every channel you’re in, not just @mentions and DMs. This makes sure nothing gets missed.',
      'Too much on a busy channel? Open it, tap the 🔔 bell in the top bar, and choose “Mentions & DMs only” or “Mute.” That only quiets that one channel; everything else keeps notifying you. New channels you join will notify you by default.',
      'Updated the Help guide (the ? button) with how this works and how to quiet a channel.',
    ],
  },
  {
    version: '1.16.2',
    date: '2026-07-17',
    time: '2:20 PM ET',
    title: 'Unarchiving a channel brings it right back',
    changes: [
      'Fixed: when you unarchive a channel it now reappears in your sidebar immediately (and archiving one drops it off) — no more needing to reload the app to see the change.',
      'Behind the scenes: the Product Shipping channel is wired to receive Shopify order & shipping updates (see your DM for the one setup step in Shopify).',
    ],
  },
  {
    version: '1.16.1',
    date: '2026-07-17',
    time: '1:05 PM ET',
    title: 'Urgent Alerts now has a permanent home',
    changes: [
      'Added “Urgent Alerts” to the menu and to the Salon actions on Home, so you can always get there — to send a new alert or to open any past alert and see exactly who acknowledged it. (Previously it only appeared when you had an unread alert.)',
    ],
  },
  {
    version: '1.16.0',
    date: '2026-07-17',
    time: '12:40 PM ET',
    title: 'Urgent alerts you can clear + easier navigation',
    changes: [
      'Urgent alerts on your Home page now have an “I saw it” button — tap it and the alert clears off your Home (it’s still on the Alerts page under “History” if you need it). No more alerts blaring at you forever.',
      'Added a back arrow (←) to the top of every workflow page — Alerts, Events, Resources, Guest Recovery, Shoutouts, Scheduling, Announcements and more — so you can always get back to Home in one tap, on desktop and phone.',
      'Your three salons are now ROP Bayfront, ROP Village and ROP Promenade, pinned to the top of the channel list (along with Announcements) so they’re always right there.',
      'Restored the Concierge-Support channel, and added two new channels: Product Shipping (for Shopify order/shipping status) and Featured Products.',
    ],
  },
  {
    version: '1.15.0',
    date: '2026-07-17',
    time: '11:30 AM ET',
    title: 'Big channel cleanup + new Resources hub',
    changes: [
      'Cleaned up the channels. We went from ~90 channels (most of them old, empty, or leftover from the Slack import) down to a focused set of about 20 that are actually used — grouped into Company, Front Desk & Phones, Stylists & Education, Locations, Teams, and Automated Feeds. Nothing was deleted; the old channels are archived (history kept) and can be restored anytime.',
      'Renamed a few for clarity: the busy desk↔phones channel is now “Front Desk & Phones,” “rop-docs-hub” is now the “Resources Hub,” and “Victories” is now “Wins.” Added a new “Stylists” channel for all-stylist communication.',
      'New Resources tab (in the menu): one place for dashboards, guides, key links and forms — no more hunting. Managers can add resources with the “Add resource” button. The matching #resources-hub channel has a pinned index too.',
    ],
  },
  {
    version: '1.14.0',
    date: '2026-07-17',
    time: '9:45 AM ET',
    title: 'Events — RSVP, invite, and track attendance',
    changes: [
      'New Events tab (in the menu and on Home): browse Upcoming and Past events. Tap any event to see the full details — when, where, organizer, price, description and a map link.',
      'RSVP to any event with Going / Interested / Can’t Go, and see a live scoreboard of who’s coming, who’s interested, and who can’t make it.',
      'Anyone can post an event (tap “Post event”). Pick who’s invited — everyone, a location (e.g. just Bayfront), a department, or hand-picked people — set the date/time, and you’re done.',
      'Managers can flip on “Notify everyone invited now” when posting, which sends each person a push + in-app notification with a link straight to the event asking them to respond. There’s also a “Send reminder” button to nudge anyone who hasn’t answered, plus an automatic reminder a couple days before.',
      'Tap the bell on an event to be notified if its time or place changes. Share any event with the link button.',
      'Imported your current events from Salon Symphony (the staff meetings, Business Building, Back to School Haircuts, Behind The Chair Show and Model Day) so they’re ready to RSVP to.',
    ],
  },
  {
    version: '1.13.7',
    date: '2026-07-16',
    time: '9:25 PM ET',
    title: 'Fix: “invalid DM target” on your own profile',
    changes: [
      'Your own card in the People directory showed a “Message” button, and tapping it threw “Could not open conversation — invalid DM target” (you can’t message yourself). Your card now shows a small “You” label instead of a Message button, so that error is gone.',
    ],
  },
  {
    version: '1.13.6',
    date: '2026-07-16',
    time: '9:10 PM ET',
    title: 'Attach photos & videos from your gallery',
    changes: [
      'Tapping the paperclip now gives you a clear choice: Photo or video (from your phone’s gallery), Take photo or video (opens the camera), or File. Before, on some phones it only offered the file browser or the camera — never the photo gallery. Now the gallery is one tap away.',
      'Works the same in channels, direct messages and threads.',
    ],
  },
  {
    version: '1.13.5',
    date: '2026-07-16',
    time: '8:40 PM ET',
    title: 'Updates no longer turn your notifications off',
    changes: [
      'Fixed the big one: every app update was quietly switching phone notifications back off, so everyone had to go re-enable them. The update process was throwing away each phone’s notification registration. It no longer does that — your notifications stay on through updates.',
      'Added a safety net: whenever you open the app, if you’ve allowed notifications but the registration went missing for any reason, the app now quietly re-registers it in the background — no prompt, nothing to tap. Anyone whose notifications got switched off by a past update will be fixed automatically the next time they open ROP Chat (as long as they didn’t turn notifications off in their phone settings).',
    ],
  },
  {
    version: '1.13.4',
    date: '2026-07-16',
    time: '8:05 PM ET',
    title: 'Report a problem — right from Help',
    changes: [
      'New “Report a problem” button at the top of the Help window (the ? button on every page). Describe what went wrong and it posts to a new private App Support channel and notifies Rob directly — so app issues have one place to go instead of getting lost in a text or DM.',
      'Each report automatically includes your device and app version, so we can fix it faster without asking a bunch of follow-up questions.',
    ],
  },
  {
    version: '1.13.3',
    date: '2026-07-16',
    time: '7:45 PM ET',
    title: 'Search the staff list instead of scrolling',
    changes: [
      'When you log a guest issue and pick the “Involved team members,” there’s now a search box — type a name instead of scrolling the whole roster from the A’s.',
      'The urgent-alert “Specific people” picker is now searchable too — type a name or role to find someone fast.',
    ],
  },
  {
    version: '1.13.2',
    date: '2026-07-16',
    time: '7:10 PM ET',
    title: 'Big performance fix — much lighter on the server',
    changes: [
      'Fixed a background loop that was quietly re-loading the app’s data over and over, driving very high database usage. The app now loads that data once when you sign in. Everything works exactly the same — it’s just far lighter and faster, and should resolve the server CPU warnings.',
    ],
  },
  {
    version: '1.13.1',
    date: '2026-07-16',
    time: '6:20 PM ET',
    title: 'No more accidental deletes',
    changes: [
      'Deleting a message now asks you to confirm first — a stray tap can no longer delete a message. The delete button is also dimmer and set apart so it’s harder to hit by accident.',
      'Deleted messages now keep their text behind the scenes, so an accidental delete can always be restored (nothing is permanently wiped anymore).',
    ],
  },
  {
    version: '1.13.0',
    date: '2026-07-16',
    time: '5:55 PM ET',
    title: 'Share a link to any message',
    changes: [
      'You can now copy a link to any message: hover a message on desktop and click the link icon, or long-press it on your phone and choose “Copy / share link to message.” On phones this opens your share sheet so you can text it straight to someone.',
      'Opening a shared message link jumps ROP Chat right to that conversation and briefly highlights the message — great for nudging someone to check ROP Chat.',
    ],
  },
  {
    version: '1.12.8',
    date: '2026-07-16',
    time: '5:40 PM ET',
    title: 'Updates now install themselves',
    changes: [
      'Fixed the underlying reason updates kept getting “stuck”: new versions were installing but never switching on. Now the app updates itself automatically within a minute of a new version going out — and it refreshes to it for you. This should clear up the update trouble on its own, no reinstalling needed.',
    ],
  },
  {
    version: '1.12.7',
    date: '2026-07-16',
    time: '5:20 PM ET',
    title: 'The Refresh button now actually updates the app',
    changes: [
      'Fixed the "Refresh" update button — tapping it did nothing before. It now reliably clears the old cached copy and loads the newest version on both phone and desktop, keeping you on the same screen.',
    ],
  },
  {
    version: '1.12.6',
    date: '2026-07-16',
    time: '4:55 PM ET',
    title: 'iPhone: notifications open the exact message',
    changes: [
      'Fixed notification tapping on iPhone: tapping a message notification now opens ROP Chat straight to that exact conversation, instead of just the messages list. (Android already did this; iPhones drop the link when the app is opened from closed, so the app now grabs it on launch.)',
    ],
  },
  {
    version: '1.12.5',
    date: '2026-07-16',
    time: '4:30 PM ET',
    title: 'Fully stop iPhone zoom when tapping a text field',
    changes: [
      'Stronger fix for the iPhone zoom: the screen is now locked so it can no longer zoom in when you tap the message box, on top of the field-size fix. The message box and Send button stay put and fully visible when the keyboard opens.',
    ],
  },
  {
    version: '1.12.4',
    date: '2026-07-16',
    time: '4:05 PM ET',
    title: 'Fixed iPhone zooming when you tap a text field',
    changes: [
      'Fixed the real cause of the iPhone display trouble: tapping into the message box (or any text field) made iPhones zoom in and push the app past the edge of the screen. Text fields are now sized so iOS no longer zooms — the screen stays put when the keyboard opens.',
    ],
  },
  {
    version: '1.12.3',
    date: '2026-07-16',
    time: '3:35 PM ET',
    title: 'Simpler message box on phones — Send always visible',
    changes: [
      'Streamlined the message box on phones to Attach · type · Send, with a round Send button that’s always on screen — no more scrolling sideways to find it. Tested down to the smallest iPhone screens.',
      'The HTML and emoji buttons now live on desktop only (phones already have emoji on the keyboard), keeping the phone message box clean.',
    ],
  },
  {
    version: '1.12.2',
    date: '2026-07-16',
    time: '3:05 PM ET',
    title: 'One-tap “Refresh” when a new version is ready',
    changes: [
      'Added a small banner that appears when a new version of the app is ready, with a Refresh button — so nobody gets stuck on an old copy (this was the main reason a fix could look like it “didn’t work” on iPhone).',
    ],
  },
  {
    version: '1.12.1',
    date: '2026-07-16',
    time: '2:40 PM ET',
    title: 'Search works again (and is fast)',
    changes: [
      'Fixed search coming back empty for everything. The search was scanning every message the slow way and getting cut off by a time limit, so it returned nothing. It now uses a proper index and returns results in a fraction of a second — across messages, links, files, channels and people.',
      'One slow or failing part of a search no longer blanks the whole results screen.',
    ],
  },
  {
    version: '1.12.0',
    date: '2026-07-16',
    time: '12:15 PM ET',
    title: 'iPhone fit fix + attachments can be received from outside',
    changes: [
      'Fixed the message box on iPhone: the Send button was tucked under the home-bar at the bottom of the screen on installed iPhones, and the box could run past the edge. It now sits above the home bar and fits the screen. (If it still looks off, fully close and reopen the app to update.)',
      'ROP Chat can now RECEIVE files — photos, PDFs, docs — from outside: by email, from the API, from an AI assistant, and by text/MMS to the ROP number. They show up in the message like any normal attachment.',
      'New private #text-messages channel: texts and photos sent to the ROP number now post there.',
    ],
  },
  {
    version: '1.11.3',
    date: '2026-07-15',
    time: '11:45 PM ET',
    title: 'Much faster channel & message loading',
    changes: [
      'Opening a channel or DM is now near-instant. It used to blank the screen through two separate loads every time; now it shows the conversation immediately from what’s already loaded and refreshes in the background.',
      'Channels and DMs you’ve already opened this session reappear instantly when you go back to them.',
    ],
  },
  {
    version: '1.11.2',
    date: '2026-07-15',
    time: '11:20 PM ET',
    title: 'Fixed thread crash + daily AI briefing',
    changes: [
      'Fixed the bug that showed “This thread couldn’t be opened” when opening a thread or pinned message — it was a realtime subscription conflict; threads now open reliably.',
      'New #daily-briefing channel: every morning the AI posts a short recap of what happened across ROP Chat the day before.',
    ],
  },
  {
    version: '1.11.1',
    date: '2026-07-15',
    time: '6:05 PM ET',
    title: 'Tap-to-open notifications + Ask AI channel',
    changes: [
      'Tapping a phone notification now opens straight to that message/conversation — no more landing on the home screen and hunting for it.',
      'New #ask-ai channel where you can post a question for the AI. The always-on auto-responder is built and ready — it just needs an Anthropic API key switched on (see your DM).',
    ],
  },
  {
    version: '1.11.0',
    date: '2026-07-15',
    time: '5:20 PM ET',
    title: 'Two-way AI integration (Claude Code, Cowork & more)',
    changes: [
      'Approved AI agents can now securely read AND write ROP Chat — post to channels, reply in threads, DM people, search history, and create tasks — through a new authenticated gateway with per-agent permissions and full audit logging.',
      'New Admin → AI Integrations panel: add/disable AI agents, choose exactly which channels and actions each can use, review recent AI activity and pending approvals, rotate tokens, and a big “DISABLE ALL AI ACCESS” switch for instant shut-off.',
      'AI messages are clearly badged (🤖 AI + agent name) so they’re never mistaken for a person, and sensitive channels (payables, leadership) are protected from AI by default.',
      'Claude Code / Cowork connect via an included MCP server (see mcp-server/). Full docs in docs/ai-integration.md.',
    ],
  },
  {
    version: '1.10.18',
    date: '2026-07-15',
    time: '2:40 PM ET',
    title: 'Text blasts, login log, live green dots, backup status',
    changes: [
      'New Admin → Send Text tab: text a message to all staff, a location, hand-picked people, or custom numbers (36 of 50 staff have a phone on file — add numbers in Users for full reach).',
      'Logins and logouts are now recorded in the Audit Log, so you can see who’s coming and going alongside admin actions.',
      'Green “online” dots now work reliably — anyone active in the last few minutes shows green, and your own dot lights up as soon as you open the app.',
      'Storage & Export now shows Backup status: the app is snapshotted every night (all messages, channels, people, files, settings) and kept for 14 days.',
    ],
  },
  {
    version: '1.10.17',
    date: '2026-07-15',
    time: '10:20 AM ET',
    title: 'Activity log — see who’s using the app',
    changes: [
      'New Admin → Activity tab: see who has signed in, when they last logged in, when they were last active, and how many messages they’ve sent (7- and 30-day) — with a “Never signed in” flag so you can see who still needs to be onboarded. Search, filter to signed-in only, and Download CSV for your records.',
      'Fixed activity tracking so the app now reliably records when each person is active (it wasn’t saving before).',
    ],
  },
  {
    version: '1.10.16',
    date: '2026-07-15',
    time: '10:05 AM ET',
    title: 'Drag-and-drop files + text a reminder',
    changes: [
      'Drag a file straight onto the message box to attach it — no need to hit the paperclip. Works in channels, DMs and threads.',
      'Admins: when you’re in a 1:1 message with someone, tap “Text reminder” in the top bar to send them a text saying they have a message waiting in ROP Chat — with a link and how to log in / install the app. Great for nudging people who aren’t set up yet.',
      'ROP Scorecard: the “By salon” table now has an “All salons” total row at the bottom (company totals, with correctly-weighted percentages).',
    ],
  },
  {
    version: '1.10.15',
    date: '2026-07-15',
    time: '10:30 PM ET',
    title: 'Fix: pinned-message thread + easier “get unstuck”',
    changes: [
      'If a thread ever fails to open, the notice now has a “Reload app” button that clears the old cached copy and pulls the latest version — the usual cause of a stuck screen.',
      'Hardened the app against bad timestamps so a single odd message can’t blank out a thread.',
    ],
  },
  {
    version: '1.10.14',
    date: '2026-07-13',
    time: '6:05 PM ET',
    title: 'No more blank screens',
    changes: [
      'Added a safety net so if any screen ever hits an error, you get a friendly “Something went wrong — Reload” screen instead of a blank page.',
      'Opening a thread (including from a pinned message) is now isolated — if a thread fails to load, only that panel shows a small notice; the rest of the app keeps working.',
    ],
  },
  {
    version: '1.10.13',
    date: '2026-07-13',
    time: '5:10 PM ET',
    title: 'Clearer Notifications you can dismiss',
    changes: [
      'The Notifications page is now one simple newest-first list (not grouped by type), so it matches the order things happened.',
      'Unread items are obvious now — gold left-bar, highlight and a dot — and the header shows how many are unread.',
      'You can dismiss any notification with the ✕, or “Clear all” — so things like an old urgent alert no longer stick around forever.',
    ],
  },
  {
    version: '1.10.12',
    date: '2026-07-13',
    time: '4:35 PM ET',
    title: 'Per-channel notifications (get pinged on every post)',
    changes: [
      'Open any channel and tap the bell to choose how it notifies you: “All messages” (buzz on every post — great for Victories, Announcements, or any channel you want to follow closely), “Mentions & DMs only” (the default), or “Mute”.',
      'Set a channel to “All messages” and you’ll get a push on your phone/desktop for every new post there.',
    ],
  },
  {
    version: '1.10.11',
    date: '2026-07-13',
    time: '3:50 PM ET',
    title: 'Send HTML in messages',
    changes: [
      'New “</>” button in the message box: turn it on, paste your HTML, and it posts as a rendered card (in the same safe sandbox the automated cards use). Turn it off for normal messages. Works in channels, DMs and threads.',
    ],
  },
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
