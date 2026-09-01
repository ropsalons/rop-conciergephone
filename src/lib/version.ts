// App version + human-readable changelog.
// Bump APP_VERSION and prepend a CHANGELOG entry whenever you ship a change.
// Shown in the Help window (Version history) and the sidebar footer.

export const APP_VERSION = '1.52.2'

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
    version: '1.52.2',
    date: '2026-08-31',
    time: '6:15 PM ET',
    title: 'Invite a whole group to an event',
    changes: [
      'When creating or editing an event, you can now invite a group in one tap — Rising Stars, Silver Stylists, Stylists in Training, Concierge, or All Stylists — instead of picking people one by one. It drops the group into “Specific people,” where you can still add or remove anyone.',
      'Works on past events too: open any event → Edit → tap a group (or adjust individuals) → Save.',
      'Backfilled past trainings and meetings with credit hours (from each event’s calendar length) and a type, so they now show up in the Training Log with everyone’s hours.',
    ],
  },
  {
    version: '1.52.1',
    date: '2026-08-31',
    time: '5:45 PM ET',
    title: 'Training Log: cohorts, the hours matrix & CSV exports',
    changes: [
      'Added Cohorts to the Training Log — starting with “Rising Stars” (Stylists-in-Training + Silver stylists + their leaders, pulled from Boulevard). Membership is sticky, so a promotion never drops someone from their history.',
      'New “Cohorts” view shows a grid: everyone in the cohort down the side, their sessions across the top, hours earned in each cell, and a running total per person. Export the whole grid to CSV in one tap.',
      'Each person’s transcript (in “By person”) can now be exported to CSV for their file.',
    ],
  },
  {
    version: '1.52.0',
    date: '2026-08-31',
    time: '5:20 PM ET',
    title: 'Training Log — attendance & continuing-education hours',
    changes: [
      'Events can now carry Credit hours and a Credit type (Advanced Education, Continuing Education, Concierge Training, Staff Meeting, Special Event, or your own). Hours default to the event’s length and are editable.',
      'Staff confirm the same way they always have — tap Going on the event. After it happens, admins open the event and mark who actually attended (Attended / No-show / Excused). Everyone who confirmed can be marked attended in one tap; attended earns the event’s hours.',
      'New “Training Log” page (managers only, up by Resources): browse every tracked event with its roster and hours, or flip to “By person” to see each teammate’s all-time hours and the events they attended — their record stays intact even after a promotion.',
    ],
  },
  {
    version: '1.51.9',
    date: '2026-08-31',
    time: '4:40 PM ET',
    title: 'New channels show up on their own',
    changes: [
      'When you get added to a channel, it now appears in your sidebar automatically — the app rebuilds your channel list whenever you return to it (or your connection comes back), instead of needing a full reload.',
      'Fixed a related gotcha: a brand-new channel could be hidden by the “hide quiet channels” setting because it had no activity yet. Favoriting a channel (star it) always keeps it visible at the top.',
    ],
  },
  {
    version: '1.51.8',
    date: '2026-08-31',
    time: '4:05 PM ET',
    title: 'Admins can edit any message',
    changes: [
      'Owners, admins, and managers can now edit any message — not just their own — including automated posts (announcements, celebrations, reports). The pencil now shows on every message for you, so you can fix a name, a typo, or a tag yourself without asking anyone.',
      'Everyone else can still only edit their own messages. Deleting already worked this way; editing now matches.',
    ],
  },
  {
    version: '1.51.7',
    date: '2026-08-31',
    time: '1:55 PM ET',
    title: 'Text an event reminder — with a tap-to-RSVP link',
    changes: [
      'Events now have a “Text reminder” button (managers/admins). It sends an actual text message to everyone invited who hasn’t responded yet and has a mobile number on file — reminding them of the event and asking if they can make it.',
      'Each text includes a link that opens the event right in ROP Chat so they can tap Going / Interested / Can’t Go in one step.',
      'The button shows how many people it will text, and asks you to confirm before sending. The existing in-app “Send reminder to non-responders” nudge is still there too.',
    ],
  },
  {
    version: '1.51.6',
    date: '2026-08-28',
    time: '11:15 AM ET',
    title: 'Android fix: tapping a notification lands on the message again',
    changes: [
      'Fixed the Android bug where tapping a notification opened ROP Chat on the home screen instead of the message you tapped. The deep link was being dropped when the app was resumed from the background (Android freezes backgrounded apps, so the “open this message” hand-off could be missed).',
      'The app now reliably holds onto the tapped target and delivers it the moment ROP Chat comes to the foreground — so you land on exactly the message, in the right channel or DM, and it flashes to show you.',
    ],
  },
  {
    version: '1.51.5',
    date: '2026-08-23',
    time: '9:20 PM ET',
    title: 'The Notifications bell now means “someone needs me”',
    changes: [
      'The bell badge now counts only things directed at you — @mentions, DMs, urgent alerts, and replies/reactions to your messages. Everyday channel messages and automated reports still appear in the Notifications list, but they no longer inflate the red number.',
      'Reading a channel or DM now clears its notifications automatically, so the count reflects what you actually still need to look at (no more “unread” items you already saw).',
      'New channel messages and DMs keep showing on their own sidebar badges, where they belong.',
    ],
  },
  {
    version: '1.51.4',
    date: '2026-08-23',
    time: '8:55 PM ET',
    title: 'Resources: everyone can add, only owners & admins can edit',
    changes: [
      'Anyone on the team can now add their own resources to any section.',
      'You can only edit or delete a resource you created — other people’s resources (including yours) are protected. Admins can still edit or remove anything.',
    ],
  },
  {
    version: '1.51.3',
    date: '2026-08-23',
    time: '6:45 PM ET',
    title: 'Real social logos + advanced-training events',
    changes: [
      'Resources → Social Media now shows each platform’s real logo — Instagram, Facebook, TikTok, YouTube, X, LinkedIn, Spotify and Apple Podcasts — instead of a generic icon. Added the Spotlight on Good People podcast on Apple Podcasts too.',
      'Advanced Stylist Academy / advanced-training events now have their own distinct look in Events (a training badge, not a plain calendar tile).',
      'Advanced classes & academies now invite only the right people — our Silver stylists and Stylists in Training (pulled straight from Boulevard), plus Sara and Jenn — instead of the entire styling team.',
    ],
  },
  {
    version: '1.51.2',
    date: '2026-08-23',
    time: '6:20 PM ET',
    title: 'Nicer salon meetings + more social channels',
    changes: [
      'Salon meetings from the calendar now read cleanly and consistently — “Bayfront Team Meeting,” “Village Team Meeting,” “Promenade Team Meeting” — with casing and abbreviations fixed automatically.',
      'Each salon’s team meeting now invites only that location’s team (plus Marina, Rob and Zach) instead of the whole company, and carries a short ROP 5.0 note on the next few months’ meetings.',
      'Newsletter Due now shows in Events (routed to Lexi + Rob); the internal “Marketing Check-In” and “Content Due” items no longer clutter the calendar.',
      'Added more channels to Resources → Social Media: the Spotlight on Good People podcast (Spotify + YouTube) and our All Things Hair Salons training channel.',
    ],
  },
  {
    version: '1.51.1',
    date: '2026-08-23',
    time: '5:55 PM ET',
    title: 'Our social channels are now in Resources',
    changes: [
      'Added a “Social Media” section to Resources with one-tap links to all our channels — Instagram, Facebook, TikTok, YouTube, X, and LinkedIn.',
    ],
  },
  {
    version: '1.51.0',
    date: '2026-08-23',
    time: '5:30 PM ET',
    title: 'Company calendar fills Events automatically',
    changes: [
      'Staff meetings, trainings, academies and salon events from the company calendar now flow into Events on their own — with times, locations and descriptions filled in. It refreshes every 30 minutes (new events, time changes and cancellations included), running on the server so nobody’s computer has to be on.',
      'It cleans things up: tidies lower-case titles, pulls the salon from the title (e.g. “bayfront Staff Meeting”), routes Marketing to Lexi + Rob, SOGP/podcasts to Rob + Zach, and advanced classes to the styling team — and skips personal/admin items.',
      'Admins can force an update anytime: Admin → Feeds → “Sync now.”',
    ],
  },
  {
    version: '1.50.0',
    date: '2026-08-21',
    time: '4:15 PM ET',
    title: 'Urgent takeover alerts — flag a channel for full-screen popups',
    changes: [
      'Any channel can now be flagged as an “Urgent takeover” channel: open the channel → pencil (Edit) → turn on “Urgent takeover popup.” Admins/owners only.',
      'When a message hits an urgent channel, everyone in it gets a full-screen red alert with a repeating alert tone (and a phone buzz) — it stays up until you tap “Open & take action” or “Acknowledge.” Perfect for a name hitting the waitlist or a guest issue that needs someone now.',
      'It works over any screen you’re on in the app, and phones still get an urgent push. (A desktop app that pops over other programs is the next step.)',
      'Connected tools can trigger it just by posting to an urgent channel through the API — no special flag needed.',
    ],
  },
  {
    version: '1.49.3',
    date: '2026-08-21',
    time: '2:45 PM ET',
    title: 'Mention someone who isn’t in the channel? One tap to add them',
    changes: [
      'When you @mention a person who isn’t a member of the channel, a banner now appears letting you know they won’t see it — with an “Add to channel” button to pull them right in (managers/admins).',
      'Group mentions are unaffected — they already only ping people who are in the channel.',
    ],
  },
  {
    version: '1.49.2',
    date: '2026-08-21',
    time: '11:30 AM ET',
    title: 'Tapping a notification opens the right message (Android fix)',
    changes: [
      'Fixed the Android bug where tapping one notification (say the morning brief) could open ROP Chat on a different message than the one you tapped — especially when you had several notifications stacked up.',
      'The cause: the app reused a single “open this” target, and when it came to the foreground it could replay an older one. Now every tap carries its own fresh target, and a stale one is never reused — so you land on exactly the message you tapped.',
    ],
  },
  {
    version: '1.49.1',
    date: '2026-08-18',
    time: '4:00 PM ET',
    title: 'Fixed the notification menu getting cut off on iPhone',
    changes: [
      'The channel notification menu (the 🔔 bell → All messages / Mentions & DMs only / Nothing) was running off the left edge of the screen on iPhone, so the options were cut off and unreadable. It now stays fully on-screen — anchored just under the top bar on the right — no matter how narrow your phone is.',
    ],
  },
  {
    version: '1.49.0',
    date: '2026-08-14',
    time: '1:15 PM ET',
    title: 'Invite someone to ROP Chat with one tap (admins)',
    changes: [
      'Managers can now invite a teammate straight from the Directory: open their profile (or tap the ✉ button on their card) and choose “Invite to ROP Chat.”',
      'It texts them a friendly, ready-to-go invite that explains what ROP Chat is, that they’ve been picked as an early tester, and walks them through setting it up on their phone or desktop with their mobile number + a 4-digit PIN.',
      'The message is fully editable before you send it, so you can personalize it for each person.',
    ],
  },
  {
    version: '1.48.0',
    date: '2026-08-14',
    time: '11:45 AM ET',
    title: 'Sign in with your phone number + a 4-digit PIN',
    changes: [
      'ROP Chat now works just like clocking in at time.ropsalons.com — enter your mobile number and a 4-digit PIN. No email or long password to remember.',
      'First time? Tap “First time here? Set up your PIN,” enter your mobile number, and pick a 4-digit PIN. That’s your login from then on.',
      'Forgot your PIN? Tap “Forgot your PIN?” and we’ll text a 6-digit code to the mobile number on file so you can set a new one.',
      'Managers and admins can still sign in with email — tap “Manager or admin? Sign in with email instead.”',
      'Your PIN is never stored anywhere — it’s turned into a secure key on our server, so even we can’t see it. This is the first step toward one simple login across my/time/chat.ropsalons.com.',
    ],
  },
  {
    version: '1.47.0',
    date: '2026-08-13',
    time: '3:30 PM ET',
    title: 'Refresh button + auto-reload for new messages',
    changes: [
      'Added a Refresh button (↻) in the top bar of every channel and DM — tap it to pull in new messages without closing and reopening the app.',
      'Fixed the root cause too: when you switch back to ROP Chat (or your connection comes back), it now re-checks for new messages automatically. The live connection can quietly drop when the app is in the background — this catches it.',
    ],
  },
  {
    version: '1.46.0',
    date: '2026-08-13',
    time: '9:00 AM ET',
    title: 'Search now takes you to the exact message',
    changes: [
      'Clicking a search result now jumps you straight to that message — even one from months ago — and flashes it, instead of dropping you at the bottom of the channel.',
      'The app loads the conversation around that message (with context above and below), so an old result lands in the right place instead of making you scroll.',
      'Same for file search results — they take you to the message the file was posted in.',
    ],
  },
  {
    version: '1.45.0',
    date: '2026-08-11',
    time: '5:40 PM ET',
    title: 'Copy an image too',
    changes: [
      'Image attachments now have a “Copy” button (next to Download) that copies the actual picture to your clipboard, so you can paste it straight into a message, email, or document.',
      'Works with any image type — it’s converted automatically so the paste works everywhere.',
    ],
  },
  {
    version: '1.44.0',
    date: '2026-08-11',
    time: '5:15 PM ET',
    title: 'Copy the text of a message',
    changes: [
      'You can now copy just the text of any message to paste somewhere else. On a computer, hover the message and click the new copy icon; on a phone, press and hold the message and tap “Copy text.”',
      'This copies the words only (not a link) — the “copy link” option is still there separately.',
    ],
  },
  {
    version: '1.43.0',
    date: '2026-08-11',
    time: '4:30 PM ET',
    title: 'Tapping a notification now reliably lands on the message (iPhone fix)',
    changes: [
      'Fixed the big one: tapping a notification (or a “Replying to…” banner) sometimes opened the conversation but didn’t scroll to the actual message — especially on iPhone. It now jumps straight to the message and flashes it.',
      'The scroll is calculated directly instead of relying on the browser, which was unreliable inside the message list on iOS Safari.',
      'If the linked message is further back in the history, the app now loads older messages until it finds it, instead of leaving you at the bottom.',
    ],
  },
  {
    version: '1.42.0',
    date: '2026-08-11',
    time: '1:15 PM ET',
    title: 'Replies read clearly — and you can jump to what they answer',
    changes: [
      'Replies are back in the normal order (newest at the bottom), so a new reply is always easy to find where you’d expect it.',
      'A reply is now clearly indented with a colored line down the side, so you can tell at a glance it’s a reply.',
      'Each reply shows a bold, tappable “Replying to [name]” banner with a preview of the original — tap it to jump straight up to the message being answered (it flashes so you can spot it).',
      'Reverses the brief experiment where replies were tucked under the original — that made new replies hard to find.',
    ],
  },
  {
    version: '1.41.0',
    date: '2026-08-11',
    time: '12:30 PM ET',
    title: 'Replies now nest under the message they answer',
    changes: [
      'When you reply to a specific message, your reply now appears indented right below that message — with a colored line down the side — instead of dropping to the bottom of the channel. All the replies to a comment stay grouped together under it, so a back-and-forth is easy to follow.',
      'Nothing is hidden — every reply is shown inline (you can still open the thread view too).',
      'If the original message is too far up to be loaded, the reply still shows its little “replying to …” chip so you can tap to jump to it.',
      'Works the same in channels and direct messages.',
    ],
  },
  {
    version: '1.40.0',
    date: '2026-08-07',
    time: '5:45 PM ET',
    title: 'Favorite DMs + reset sidebar layout',
    changes: [
      'You can now star a direct message (or group DM), just like a channel — hover the DM in the sidebar and tap the star. Starred DMs join your Favorites section alongside starred channels.',
      'Added a “Reset sidebar layout” link that snaps Favorites, Channels and Direct Messages back to the default order and expands them all. It only appears once you’ve customized the layout.',
    ],
  },
  {
    version: '1.39.0',
    date: '2026-08-07',
    time: '5:00 PM ET',
    title: 'Roll up and rearrange your sidebar',
    changes: [
      'You can now collapse (roll up) the Favorites, Channels, and Direct Messages sections in the sidebar — just tap the section name. Rolled-up sections show a badge if there’s anything unread, the same way the AI console groups already worked.',
      'You can reorder those sections with the ↑ / ↓ buttons on each header — put Direct Messages above Channels, or Favorites wherever you like.',
      'Starred favorites now live in their own “Favorites” section (instead of just floating at the top of Channels), so you can position them where you want. It only appears once you’ve starred something.',
      'Your layout choices are remembered on each device.',
    ],
  },
  {
    version: '1.38.0',
    date: '2026-08-07',
    time: '3:30 PM ET',
    title: 'Log in with your phone number + “Forgot passcode?”',
    changes: [
      'You can now sign in with your phone number — not just your email. Everyone has a phone, so it’s the easiest thing to remember. Email still works.',
      'Added a “Forgot passcode?” link on the login screen. Enter your phone (or email) and we text a fresh 6-digit code to the phone on file — sign in with it and keep using it.',
      'Renamed the password field to “Passcode,” with a tip that the last 6 digits of your phone is an easy one to remember.',
      'Under the hood: one identity + your own passcode can now sign you in across ROP dashboards — you keep your own code (no shared password), it just works in more places.',
    ],
  },
  {
    version: '1.37.0',
    date: '2026-08-07',
    time: '12:00 PM ET',
    title: 'Unread badge on the app icon',
    changes: [
      'The ROP Chat app icon (Dock on Mac, taskbar on Windows, home screen on Android) now shows a red number badge for unread notifications — so you can see something’s waiting without opening the app.',
      'It clears automatically as you catch up.',
    ],
  },
  {
    version: '1.36.1',
    date: '2026-08-07',
    time: '12:30 PM ET',
    title: 'Opening a channel now reliably lands on the newest message',
    changes: [
      'Fixed the bug where opening a channel sometimes dropped you into the middle instead of at the bottom. It happened on channels with photos/cards: the app jumped to the bottom before the images finished loading, and once they loaded they pushed everything down. Now it stays pinned to the newest message until everything has loaded.',
      'Switching between channels reliably lands you at the latest message every time.',
      'Opening a specific message from a notification or shared link still takes you right to that message.',
    ],
  },
  {
    version: '1.36.0',
    date: '2026-08-07',
    time: '11:45 AM ET',
    title: 'Share photos & videos straight into ROP Chat (Android)',
    changes: [
      'On Android, ROP Chat now shows up in your phone’s Share menu. Open a photo or video, tap Share, choose ROP Chat, pick a channel and add a caption — done. No more saving it first and uploading.',
      'You can share several photos/videos at once.',
      'iPhone note: Apple doesn’t let installed web apps appear in the iPhone Share menu, so on iPhone the quickest way is still to tap the 📎 in a channel, which opens your photo library directly.',
    ],
  },
  {
    version: '1.35.2',
    date: '2026-08-05',
    time: '4:20 PM ET',
    title: 'Tagging someone by name always notifies them',
    changes: [
      'Whenever anyone is @mentioned by name in a channel — whether you type it or an automated report posts it — that person now actually gets notified. Before, only tags picked from the pop-up list would notify.',
      'Smart matching: “@Rob” pings Rob (not Robert), and an email address like name@example.com never accidentally tags anyone.',
    ],
  },
  {
    version: '1.35.1',
    date: '2026-08-05',
    time: '3:45 PM ET',
    title: 'Fixed the emoji reaction picker on phones',
    changes: [
      'When you react to a message, the emoji picker no longer runs off the side of the screen on mobile — it now stays fully on-screen and wraps so you can see and tap every emoji.',
      'Reaction emojis are also a bit bigger and easier to tap.',
    ],
  },
  {
    version: '1.35.0',
    date: '2026-08-02',
    time: '2:45 PM ET',
    title: 'Automatic birthday & anniversary shout-outs',
    changes: [
      'ROP Chat now posts an automatic, emoji-filled Happy Birthday in #Announcements on each teammate’s birthday — tagging them so it’s front and center. Work anniversaries get their own “Happy Nth Anniversary” shout-out too.',
      'It runs every morning and covers the whole team automatically (dates come from Gusto). Each person gets one birthday and one anniversary post per year — never a repeat.',
      'We only ever use the month and day — no age or birth year is shown.',
    ],
  },
  {
    version: '1.34.0',
    date: '2026-07-31',
    time: '6:45 PM ET',
    title: 'Structured events + Team App events API',
    changes: [
      'The event form now has real, structured fields: a required Location (pick a salon or type your own), Capacity (blank = unlimited), Cost (e.g. “Covered by ROP” or “$45”), a Registration open toggle, and a Cover image upload — alongside the existing name, date/time, and description.',
      'ROP Chat is now the single source of truth for company events: a separate app (the ROP Team App) can securely read all events and write registrations back, and each event gets a chat thread in #Events showing who’s coming.',
      'Existing events were left untouched — new fields default sensibly and nothing was overwritten.',
    ],
  },
  {
    version: '1.33.0',
    date: '2026-07-31',
    time: '5:40 PM ET',
    title: 'Edit channel details from the channel itself',
    changes: [
      'Admins/owners can now edit a channel right from its top bar — tap the pencil icon to rename it, set its topic and description, and switch it between public and private. No trip to the Admin portal.',
      'Renaming keeps the channel’s address (its slug) the same, so existing links and integrations that post to it keep working.',
    ],
  },
  {
    version: '1.32.3',
    date: '2026-07-31',
    time: '4:45 PM ET',
    title: 'Notifications open the exact message',
    changes: [
      'Tapping a message notification now jumps straight to that specific message and highlights it — not just the top of the channel or DM.',
      'If a notification ever drops you at the home screen instead (most often on iPhone after an app update), fully close and reopen the app so it’s on the latest version; if it persists, re-install from chat.ropsalons.com and turn notifications back on.',
    ],
  },
  {
    version: '1.32.2',
    date: '2026-07-30',
    time: '4:35 PM ET',
    title: 'A few more reaction emojis',
    changes: [
      'Added champagne 🥂, heart-eyes cat 😻, and a hairstyle 💇‍♀️ to the reactions.',
    ],
  },
  {
    version: '1.32.1',
    date: '2026-07-30',
    time: '4:20 PM ET',
    title: 'More fun reaction emojis',
    changes: [
      'Way more emoji choices when you react to a message or add one while typing — including 🙏, plus lots of upbeat ones (🥳 💯 🤩 🚀 💪 ⭐ 🫶) and a few softer/sad ones (🥺 😢 😔) for when they fit.',
      'The picker now shows them in a neat grid so you can see the whole set at a glance.',
      'Dropped the barber pole — we’re a salon, not a barber shop. 💇✨',
    ],
  },
  {
    version: '1.32.0',
    date: '2026-07-30',
    time: '3:10 PM ET',
    title: 'Mute a direct message / group DM',
    changes: [
      'You can now mute a one-on-one or group DM: open the conversation and tap the bell in the top bar. Muted means your phone won’t buzz on new messages there.',
      'You still see everything — a muted conversation keeps showing its unread count (and a small 🔕 icon) in your Messages list, so you can check it when you want instead of getting pinged on every one-line reply.',
      'Great for busy group chats with lots of people replying. Un-mute anytime by tapping the bell again. This is per-conversation and only affects you.',
    ],
  },
  {
    version: '1.31.3',
    date: '2026-07-30',
    time: '2:05 PM ET',
    title: 'Install & notifications now use chat.ropsalons.com',
    changes: [
      'The in-app install and notification instructions now point to chat.ropsalons.com instead of the old rop-connect.netlify.app address. Both are the same app, but installing from the clean address makes your phone/desktop notifications show “chat.ropsalons.com”.',
      'If your notifications still show the old netlify address, it just means that device was set up on the old address — re-install from chat.ropsalons.com and turn notifications on there to switch it.',
    ],
  },
  {
    version: '1.31.2',
    date: '2026-07-30',
    time: '1:20 PM ET',
    title: 'Fixed: Sign out not working (especially on desktop)',
    changes: [
      'The Sign out button now reliably logs you out and returns you to the login screen. On the installed desktop app it could previously appear to do nothing.',
      'Under the hood: sign-out no longer waits on a network call that could hang, and it now forces a full reload instead of only changing the address bar — which the desktop app was ignoring.',
    ],
  },
  {
    version: '1.31.1',
    date: '2026-07-30',
    time: '12:05 PM ET',
    title: 'Add a whole group to a channel in one tap',
    changes: [
      'Open a channel → Members → “Add people”, and you’ll see a row of group chips (@concierge, @stylists, @bayfront, …). Tap one to add everyone in that group who isn’t already in the channel.',
      'The number on each chip shows how many people it would add, and anyone already in the channel is skipped automatically.',
    ],
  },
  {
    version: '1.31.0',
    date: '2026-07-30',
    time: '11:15 AM ET',
    title: 'Group @mentions, channel clean-up, and default channels',
    changes: [
      'Group mentions (like Slack): type @ and a group name to ping a whole team at once — @stylists, @associates, @concierge, and one per salon (@bayfront, @village, @promenade). Everyone in that group gets notified.',
      'Groups update themselves — they’re based on each person’s role and salon location, so when someone moves or changes role the groups stay correct with nothing to maintain.',
      'In a channel, a group @mention only pings people who are actually in that channel, so nobody gets a buzz about a message they can’t open.',
      'Clean up a channel: open Members → “Clean up”, keep just yourself plus any groups you choose (e.g. keep @bayfront), and remove everyone else in one tap. Nobody’s messages are deleted and people can be re-added anytime.',
      'Default channels: new staff now automatically land in their salon location channel plus Announcements, Education, Resources Hub, ROP Calendar, and Featured Products. Everyone already here was backfilled to match.',
    ],
  },
  {
    version: '1.30.3',
    date: '2026-07-30',
    time: '9:30 AM ET',
    title: 'Text a link to anyone — from any channel',
    changes: [
      'The 📱 “Text a link” button now shows on every message — in any channel (including big public ones like Media) and in DMs — for leaders and admins.',
      'Tapping it opens a searchable people picker: type a name, tap who you want, and send. No more mass blast — you text exactly the person you mean (e.g. just Zach).',
      'If your message @mentions someone, they’re pre-selected, so the usual case is one tap → Send.',
      'You can pick more than one person at once too, and everyone gets a text with a link straight to the message.',
    ],
  },
  {
    version: '1.30.2',
    date: '2026-07-25',
    time: '12:10 AM ET',
    title: 'Harder to accidentally tap Delete',
    changes: [
      'On the message hover toolbar, the Delete (trash) button is now separated from the other actions by a divider and a gap, so you don’t accidentally hit it when reaching for forward / save / text.',
      'Deleting still asks for confirmation first, so a stray tap never deletes on its own.',
    ],
  },
  {
    version: '1.30.1',
    date: '2026-07-25',
    time: '11:58 PM ET',
    title: 'Text-a-link now works in private group channels too',
    changes: [
      'The “Text them a link” button now shows in private group channels (like “Operations Lexi Robert”), not just one-on-one DMs — so you can nudge a small group.',
      'When it would text more than one person, it asks you to confirm first (with their names), so there’s no accidental group blast.',
      'Still leaders/admins only, and still hidden in big public channels.',
    ],
  },
  {
    version: '1.30.0',
    date: '2026-07-25',
    time: '11:40 PM ET',
    title: 'Text someone a link to a DM',
    changes: [
      'In a direct message, leaders and admins now get a 📱 “Text them a link” button on any message (hover on desktop, or long-press → menu on mobile).',
      'It sends the other person a text with a link straight to that message — handy for nudging someone who doesn’t check ROP Chat often. They tap the link and land right on the message.',
      'DM-only, and only for leaders/admins. If the person has no phone number on file, it tells you instead of failing silently.',
    ],
  },
  {
    version: '1.29.0',
    date: '2026-07-23',
    time: '12:20 AM ET',
    title: 'A friendlier Home: daily inspiration + upcoming events',
    changes: [
      'Home now opens with a rotating inspirational quote — from voices like Wayne Dyer, Stephen Covey, Zig Ziglar, Jim Rohn, Alex Hormozi, Gary Vaynerchuk, Jordan Peterson and more. It changes a few times through the day, and you can click the arrows to browse others (and jump back to “Today”).',
      'Added an “Upcoming events” card on Home showing the next few events, so what’s coming up is right there.',
      'Removed the “AI Command Consoles” list from Home — it was clutter for most people. Those channels are still in the sidebar for anyone who uses them.',
    ],
  },
  {
    version: '1.28.1',
    date: '2026-07-22',
    time: '2:05 PM ET',
    title: 'Muted channels now show a 🔕 icon',
    changes: [
      'When you mute a channel, a small “bell off” icon now appears next to its name in the channel list (both desktop sidebar and mobile), so you can tell at a glance which channels are muted.',
    ],
  },
  {
    version: '1.28.0',
    date: '2026-07-21',
    time: '10:05 AM ET',
    title: 'The “Ask AI” assistant can now actually help',
    changes: [
      'Fixed the AI assistant in the Ask AI channel — it had quietly stopped answering on July 19 (a bad security token). It’s working again and answering within about a minute.',
      'The assistant is no longer a generic chatbot: it can now look inside ROP Chat and answer with real information — your staff directory, the channel list, where automated notifications come from, and what was posted in channels you can see.',
      'It can also take a few safe actions when you ask: file a task, or (for admins) forward an item to a connected project. Anything sensitive — money, access changes, deletes — it flags to Rob instead of doing it.',
      'Ask it things like “which feeds are posting into chat and where do they go?”, “who are the admins?”, or “summarize the daily briefing channel.”',
    ],
  },
  {
    version: '1.27.0',
    date: '2026-07-21',
    time: '8:50 AM ET',
    title: 'Custom address: chat.ropsalons.com',
    changes: [
      'ROP Chat now has its own clean web address — chat.ropsalons.com — with a secure SSL certificate. The old rop-connect.netlify.app address still works and forwards to it, so nothing breaks.',
      'Invite links now hand out the chat.ropsalons.com address.',
    ],
  },
  {
    version: '1.26.0',
    date: '2026-07-20',
    time: '10:40 PM ET',
    title: 'It’s just “ROP Chat” now — no more “(Slack)”',
    changes: [
      'Dropped “(Slack)” from the app’s name everywhere — the installed app name, the browser tab, and the invite wording. It’s simply ROP Chat now.',
      'Note: if you already installed it on your phone/desktop, the old “ROP Chat (Slack)” icon name sticks until you remove and re-add it — the name only refreshes on a fresh install.',
    ],
  },
  {
    version: '1.25.3',
    date: '2026-07-20',
    time: '10:30 PM ET',
    title: 'Password rule now says the right number (6)',
    changes: [
      'The sign-up password field said “min 4 characters” but the system actually requires 6 — so you’d get an error after following the hint. It now correctly says “at least 6 characters” and won’t let you submit a shorter one.',
    ],
  },
  {
    version: '1.25.2',
    date: '2026-07-20',
    time: '9:40 PM ET',
    title: 'Sign out now always works (hard reset)',
    changes: [
      'On installed phone apps (especially Android), Sign out could still leave you looking signed in. It now clears the saved session and hard-reloads straight to the login screen, every time.',
    ],
  },
  {
    version: '1.25.1',
    date: '2026-07-20',
    time: '9:15 PM ET',
    title: 'Fixed “Sign out” doing nothing on mobile',
    changes: [
      'Sign out could hang on a phone (it waited on a server call that sometimes never returned), so the button looked dead. It now signs you out instantly and returns to the login screen every time.',
    ],
  },
  {
    version: '1.25.0',
    date: '2026-07-20',
    time: '7:05 PM ET',
    title: 'Much simpler invites — guests just pick a password',
    changes: [
      'Invites now include a personal link that pre-fills the person’s email and name and drops them straight onto “pick a password.” Guests we already added no longer re-enter their name, role, or location — because we already have it.',
      'The login screen no longer defaults new people into the wrong place: invited guests get a clear “Welcome — just set a password” screen instead of the Sign In / Create Account tabs, and everyone else gets a plain hint about which to use.',
      'Invite text/email rewritten to say who it’s from (Rob), exactly what to do, and that there’s nothing to fill out but a password.',
    ],
  },
  {
    version: '1.24.2',
    date: '2026-07-20',
    time: '6:35 PM ET',
    title: 'Fixed the “Notify me about…” menu',
    changes: [
      'The channel notification menu (the 🔔 bell → All messages / Mentions & DMs only / Nothing) was see-through and hard to read because the message text behind it was showing through. It now has a solid background and sits cleanly on top, on both phone and desktop. Picking an option applies right away and the bell reflects your choice.',
    ],
  },
  {
    version: '1.24.1',
    date: '2026-07-20',
    time: '6:15 PM ET',
    title: 'Fixes: Activity tab, texting invites, and admin guests',
    changes: [
      'Fixed the admin check that had drifted after the access-level redesign — it was reading your old job title instead of your access level. This was making the Admin → Activity tab show “forbidden” and causing “Send text” invites to fail with a non-2xx error. Both work now.',
      'Guests can now be given an access level (Member / Leader / Admin) right on their card. Set a guest to Admin and they get full admin access the moment they sign up — so you can have trusted outside people (like a consultant) as “admin guests.”',
    ],
  },
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
