import { useState, type ReactNode } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { Modal } from '@/components/ui/Modal'
import { ReportProblemModal } from './ReportProblemModal'
import { APP_VERSION, CHANGELOG } from '@/lib/version'
import { APP_NAME, COMPANY_NAME } from '@/lib/constants'
import {
  Home, Search, Bell, Users, Hash, Lock, Megaphone, MessageSquare, Plus,
  Star, LifeBuoy, GraduationCap, Calendar, ClipboardList, AlertTriangle, Shield, Pin, Sparkles,
  Eye, EyeOff, ArrowUpDown, Bookmark, Clock,
} from '@/components/ui/Icons'

// One collapsible topic in the Help guide.
function Topic({
  icon,
  title,
  children,
  defaultOpen,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-brand-950/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5"
      >
        <span className="text-gold-300">{icon}</span>
        <span className="flex-1 text-sm font-semibold text-white">{title}</span>
        <span className="text-slate-400">{open ? '–' : '+'}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-white/10 px-4 py-3 text-sm leading-relaxed text-slate-300">
          {children}
        </div>
      )}
    </div>
  )
}

// A labelled how-to step list.
function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="ml-4 list-decimal space-y-1 marker:text-slate-500">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ol>
  )
}

const K = ({ children }: { children: ReactNode }) => (
  <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-semibold text-white">{children}</span>
)

export function HelpModal() {
  const open = useUIStore((s) => s.helpOpen)
  const setOpen = useUIStore((s) => s.setHelpOpen)
  const [tab, setTab] = useState<'guide' | 'whatsnew'>('guide')
  const [reportOpen, setReportOpen] = useState(false)

  return (
    <>
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      size="lg"
      title={
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-gold-300" />
          <span>Help &amp; Guide</span>
          <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-slate-300">
            v{APP_VERSION}
          </span>
        </div>
      }
    >
      {/* Tabs */}
      <div className="mb-3 flex gap-1 rounded-lg bg-brand-950/60 p-1 text-sm">
        <button
          onClick={() => setTab('guide')}
          className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === 'guide' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          How to use it
        </button>
        <button
          onClick={() => setTab('whatsnew')}
          className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === 'whatsnew' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          What&apos;s new
        </button>
      </div>

      {/* Always-visible way to flag a problem, from any page. */}
      <button
        onClick={() => setReportOpen(true)}
        className="mb-3 flex w-full items-center gap-2 rounded-lg border border-gold-400/30 bg-gold-400/10 px-3 py-2 text-left text-sm font-medium text-gold-100 hover:bg-gold-400/20"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-gold-300" />
        <span className="flex-1">Something not working? <span className="font-semibold">Report a problem</span></span>
        <span aria-hidden className="text-gold-300">→</span>
      </button>

      <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
        {tab === 'guide' ? (
          <>
            <p className="px-1 pb-1 text-sm text-slate-300">
              {APP_NAME} is the private team app for {COMPANY_NAME}. Tap any topic below.
            </p>

            <Topic icon={<Home className="h-4 w-4" />} title="The basics — getting around" defaultOpen>
              <ul className="ml-4 list-disc space-y-1 marker:text-slate-500">
                <li><b>Home</b> — your dashboard: recent activity, announcements and workflows.</li>
                <li><b>Left sidebar</b> — your Channels and Direct Messages. On a phone, tap the <K>☰</K> menu (top-left) to open it.</li>
                <li><b>Search</b> <Search className="inline h-3.5 w-3.5" /> — find any message or person.</li>
                <li><b>Notifications</b> <Bell className="inline h-3.5 w-3.5" /> — @mentions, replies, reactions and alerts.</li>
                <li><b>People</b> <Users className="inline h-3.5 w-3.5" /> — the staff directory.</li>
                <li><b>Help</b> <LifeBuoy className="inline h-3.5 w-3.5" /> — this window, from the <K>?</K> button at the top-right of any page.</li>
              </ul>
            </Topic>

            <Topic icon={<Hash className="h-4 w-4" />} title="Channels — join, leave, create">
              <p><b>Channels</b> are group conversations by topic, team, or location. You only see channels you&apos;ve joined; the rest you can browse and join.</p>
              <p className="font-semibold text-white">Add yourself to a channel (join):</p>
              <Steps items={[
                <>In the sidebar, next to <b>Channels</b>, tap the search icon <Search className="inline h-3.5 w-3.5" /> (“Browse channels”).</>,
                <>Search for the channel, then tap <K>Join</K>. It now appears in your sidebar.</>,
                <>Or, open any channel link and tap <K>Join channel</K> at the bottom.</>,
              ]} />
              <p className="font-semibold text-white">Remove yourself from a channel (leave):</p>
              <Steps items={[
                <>Open the channel and tap the <b>Members</b> button (<Users className="inline h-3.5 w-3.5" />) in the top-right.</>,
                <>Tap <K>Leave channel</K> at the bottom of the Members list. It disappears from your sidebar (you can re-join anytime).</>,
              ]} />
              <p className="font-semibold text-white">Create a channel:</p>
              <Steps items={[
                <>In the sidebar, next to <b>Channels</b>, tap the <Plus className="inline h-3.5 w-3.5" /> button.</>,
                <>Give it a name, pick the type (public, private, etc.) and create it.</>,
              ]} />
              <p className="font-semibold text-white">Favorite a channel (keep it at the top):</p>
              <Steps items={[
                <>In the sidebar, hover a channel and tap the <Star className="inline h-3.5 w-3.5" /> star — or open the channel and tap the <Star className="inline h-3.5 w-3.5" /> in the top bar.</>,
                <>Favorites are pinned to the top of your sidebar (and are private to you). Tap the star again to un-favorite.</>,
              ]} />
              <p className="font-semibold text-white">Sort your channels (<ArrowUpDown className="inline h-3.5 w-3.5" />):</p>
              <p>Tap the <ArrowUpDown className="inline h-3.5 w-3.5" /> button next to <b>Channels</b> to cycle the order. Favorites always stay on top; this changes everything below them:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li><b>A–Z</b> — alphabetical (the default).</li>
                <li><b>Recent activity</b> — the channels with the newest messages float up.</li>
                <li><b>Unread first</b> — channels you haven&apos;t caught up on come first, so you can clear them top-down.</li>
              </ul>
              <p className="font-semibold text-white">Hide quiet / empty channels (<Eye className="inline h-3.5 w-3.5" />):</p>
              <Steps items={[
                <>Tap the <Eye className="inline h-3.5 w-3.5" /> eye button next to <b>Channels</b>. It turns to <EyeOff className="inline h-3.5 w-3.5" /> and hides any channel that has no messages, no unread, and isn&apos;t favorited.</>,
                <>A <K>+ Show N quiet channels</K> link appears at the bottom of the list — tap it (or the <EyeOff className="inline h-3.5 w-3.5" /> button) to bring them all back.</>,
              ]} />
              <p className="text-xs text-slate-400">Your sort and hide choices are remembered on this device (they don&apos;t change what anyone else sees).</p>
              <p className="text-xs text-slate-400"><Lock className="inline h-3 w-3" /> = private/admin channel · <Megaphone className="inline h-3 w-3" /> = announcement channel (everyone can post) · <Hash className="inline h-3 w-3" /> = normal channel.</p>
            </Topic>

            <Topic icon={<Plus className="h-4 w-4" />} title="Adding & removing other people in a channel">
              <p>Owners, admins and leaders can add or remove other people from a channel.</p>
              <p className="font-semibold text-white">Add people:</p>
              <Steps items={[
                <>Open the channel → tap the <b>Members</b> button (<Users className="inline h-3.5 w-3.5" />) top-right.</>,
                <>Tap <K>+ Add people</K>, search a name, and tap <K>Add</K> for each person.</>,
              ]} />
              <p className="font-semibold text-white">Remove someone:</p>
              <Steps items={[
                <>In the same <b>Members</b> list, tap the <K>Remove</K> (✕) next to a person&apos;s name.</>,
              ]} />
              <p className="text-xs text-slate-400">Don&apos;t see these options? You need Leader access or higher — ask an admin, or manage membership from the Admin Panel.</p>
            </Topic>

            <Topic icon={<MessageSquare className="h-4 w-4" />} title="Direct & group messages (DMs)">
              <p className="font-semibold text-white">Easiest way — message someone from People:</p>
              <Steps items={[
                <>Open <b>People</b> (<Users className="inline h-3.5 w-3.5" />) in the sidebar.</>,
                <>Find the person and tap the blue <K><MessageSquare className="inline h-3 w-3" /> Message</K> button on their card — it opens a private chat instantly.</>,
              ]} />
              <p className="font-semibold text-white">Or start from Messages:</p>
              <Steps items={[
                <>Tap <b>Messages</b> (<MessageSquare className="inline h-3.5 w-3.5" />) in the sidebar → <K>New Message</K> (top-right).</>,
                <>Pick one person for a private chat, or several for a group DM.</>,
                <>Type at the bottom and send. DMs are private to their members.</>,
              ]} />
            </Topic>

            <Topic icon={<Pin className="h-4 w-4" />} title="Posting, replying, reacting, files">
              <ul className="ml-4 list-disc space-y-1 marker:text-slate-500">
                <li><b>Post</b> — type in the box at the bottom and press <K>Enter</K> (or the send button).</li>
                <li><b>Mention someone</b> — type <K>@</K> and pick a name; they&apos;ll be notified.</li>
                <li><b>React</b> — hover/long-press a message and tap the emoji.</li>
                <li><b>Reply to a message</b> — tap the reply icon. Your reply shows right in the channel, lightly indented with a “↳ replying to …” tag you can tap to jump to the original — so replies are never hidden. (The thread panel still opens as a focused view for a long back-and-forth.)</li>
                <li><b>Edit / delete</b> — on your own messages, use the ⋯ menu.</li>
                <li><b>Attach a file/photo</b> — tap the paperclip in the message box (up to 25&nbsp;MB).</li>
                <li><b>Pin</b> — important messages can be pinned; open the <Pin className="inline h-3.5 w-3.5" /> button up top to see them.</li>
              </ul>
            </Topic>

            <Topic icon={<Bookmark className="h-4 w-4" />} title="Save a message & get reminded">
              <p>Don’t lose an important message. On <b>any</b> message you can save it or have the app nudge you about it later.</p>
              <p className="font-semibold text-white">Remind me later (<Clock className="inline h-3.5 w-3.5" />):</p>
              <Steps items={[
                <>Hover the message and tap the <Clock className="inline h-3.5 w-3.5" /> clock (on a phone, long-press or tap <K>⋯</K> → <b>Remind me about this later</b>).</>,
                <>Pick <b>In 1 hour</b>, <b>This evening</b>, <b>Tomorrow morning</b>, <b>Next week</b>, or a custom date &amp; time.</>,
                <>When it’s due you’ll get a notification <Bell className="inline h-3.5 w-3.5" /> and a push on your phone — tap it to jump straight back to the message.</>,
              ]} />
              <p className="font-semibold text-white">Save for later (<Bookmark className="inline h-3.5 w-3.5" />):</p>
              <Steps items={[
                <>Tap the <Bookmark className="inline h-3.5 w-3.5" /> bookmark on a message (or <K>⋯</K> → <b>Save for later</b>) to stash it — no time needed.</>,
                <>Find everything under <b>Saved &amp; Reminders</b> in the left menu. Only you can see your saved items.</>,
                <>Open it, reschedule a reminder, or clear it once you’re done.</>,
              ]} />
            </Topic>

            <Topic icon={<ClipboardList className="h-4 w-4" />} title="Send a message to a project (admins)">
              <p>Admins can forward <b>any</b> message straight to a connected project — like <b>ROP Command Center</b> — so it becomes a task/project item over there.</p>
              <Steps items={[
                <>On any message, tap the <ClipboardList className="inline h-3.5 w-3.5" /> icon on hover (on a phone, long-press or tap <K>⋯</K> → <b>Send to a project</b>).</>,
                <>Pick the project (defaults to <b>Command Center</b>), add an optional note, and tap <b>Send to project</b>.</>,
                <>It drops into that project’s command channel with where it came from and your note, and the project turns it into a task. Admins only.</>,
              ]} />
            </Topic>

            <Topic icon={<Star className="h-4 w-4" />} title="Salon workflows">
              <ul className="ml-4 list-disc space-y-1 marker:text-slate-500">
                <li><Megaphone className="inline h-3.5 w-3.5" /> <b>Announcements</b> — company news. <b>Anyone</b> can post one.</li>
                <li><AlertTriangle className="inline h-3.5 w-3.5" /> <b>Urgent Alerts</b> — time-sensitive; tap <b>“I saw this”</b> to acknowledge. Sent by <b>Leaders &amp; Admins</b>; they can see who hasn&apos;t acknowledged.</li>
                <li><ClipboardList className="inline h-3.5 w-3.5" /> <b>Daily Huddle</b> — the day&apos;s focus and goals.</li>
                <li><Star className="inline h-3.5 w-3.5" /> <b>Shoutouts</b> — recognize a teammate.</li>
                <li><LifeBuoy className="inline h-3.5 w-3.5" /> <b>Guest Recovery</b> — log and follow up on guest issues.</li>
                <li><GraduationCap className="inline h-3.5 w-3.5" /> <b>Education</b> — training and classes.</li>
                <li><Calendar className="inline h-3.5 w-3.5" /> <b>Scheduling</b> — shift posts and coverage.</li>
              </ul>
            </Topic>

            <Topic icon={<Shield className="h-4 w-4" />} title="Admin area (owners & admins)">
              <p>Open the <b>Admin Panel</b> <Shield className="inline h-3.5 w-3.5" /> at the bottom of the sidebar (visible to admins/owners only). Tabs:</p>
              <ul className="ml-4 list-disc space-y-1 marker:text-slate-500">
                <li><b>Users</b> — on each person&apos;s card set their <b>Title</b>, a <b>Second title</b> (dual role, shows as “Associate + Stylist”), <b>Access level</b> (Owner / Admin / Leader / Member), <b>Department</b>, <b>Location</b> and a <b>Second location</b> for two-salon staff. You can also deactivate/reactivate them. Tap <b>Edit details</b> to change their full name, display name (nickname), free-text title or phone. Terminated people are hidden until you tick <b>“Show inactive / terminated.”</b></li>
                <li><b>Channels</b> — create channels, and tap the <b>✏️ Edit</b> button on any channel to <b>rename</b> it or change its <b>type</b> (public / private / announcement / location / department), <b>topic</b>, description, default-join, or <b>archived</b> status. You can also set <b>“Who can see &amp; use this channel”</b> (Everyone / Leaders / Admins — membership auto-tracks that level) and a <b>“Sidebar group”</b> so related channels collapse together (this is how the <b>AI Command Consoles</b> group works). Archive old ones or delete them here too.</li>
                <li><b>Guests</b> — add outside people who aren&apos;t employees (partners, vendor/reps, consultants). They&apos;re marked as guests (never synced to payroll). Add their name, type, title, email/phone and which channels they join, then <b>Invite by text or email</b> with a friendly editable message. When they sign up with that email they&apos;re auto-added to the channels you picked.</li>
                <li><b>Feeds</b> — a live list of every <b>automation posting into ROP Chat</b> (the Boulevard booking feed, the email bridge, inbound texts, and each connected AI project), showing what it is, which channels it posts to, and how loud it is. Flip any one <b>Off</b> to silence it instantly — no matter which project it came from — and back <b>On</b> with one tap. Your team&apos;s own messages are never affected.</li>
                <li><b>AI Integrations</b> — manage AI agent keys, permissions, approvals and the master AI kill-switch.</li>
                <li><b>Acknowledgements</b> — see who has/hasn&apos;t acknowledged urgent alerts &amp; announcements.</li>
                <li><b>Audit Log</b> — record of admin actions.</li>
                <li><b>Storage &amp; Export</b> — storage usage and export messages to CSV.</li>
              </ul>
              <p className="text-xs text-slate-400">To add someone to a specific channel, you can either use the channel&apos;s <b>Members → Add people</b> (above), or manage it here.</p>
            </Topic>

            <Topic icon={<Users className="h-4 w-4" />} title="Accounts, the imported history">
              <ul className="ml-4 list-disc space-y-1 marker:text-slate-500">
                <li><b>Sign in</b> with your work email. New staff first-time password is provided by an admin — change it in <b>Profile</b>.</li>
                <li><b>Edit your own name/photo</b> — tap your name (bottom-left) → <b>Profile</b> → set your <b>Display name</b> (e.g. “Rob” instead of “Robert”), title, phone, bio and photo, then <b>Save</b>.</li>
                <li><b>Old Slack history</b> appears in the channels labelled with each message&apos;s original author and an <b>“archived”</b> tag — it was imported from the company&apos;s previous Slack.</li>
              </ul>
            </Topic>

            <Topic icon={<Shield className="h-4 w-4" />} title="Access levels, job titles & two-location staff">
              <p>Your <b>job title</b> and your <b>access level</b> are two separate things — that&apos;s on purpose.</p>
              <p className="font-semibold text-white">Job title (your comms group)</p>
              <p>Your title — Concierge, Stylist, Associate, Specialist, Leadership or Marketing — decides which team conversations you belong to. It never changes just because you get more app permissions. So a Concierge who&apos;s also an admin still shows as a <b>Concierge</b> and stays in all concierge messages.</p>
              <p className="font-semibold text-white">Dual titles (“Associate + Stylist”)</p>
              <p>Been promoted but still doing your first role? You can carry <b>two titles</b>. They show together, e.g. <b>Associate + Stylist</b>, and you stay in both groups. An admin sets the second title in <b>Admin → Users</b>.</p>
              <p className="font-semibold text-white">Access level — what you can do</p>
              <ul className="ml-4 list-disc space-y-1 marker:text-slate-500">
                <li><b>Member</b> — everyone. Chat, DM, react, and <b>post to Announcements</b>.</li>
                <li><b>Leader</b> (shown as an <b>L</b> badge) — everything a Member can do, plus send <b>Urgent Alerts</b>, run huddles, and add/remove people in channels.</li>
                <li><b>Admin</b> (shown as an <b>A</b> badge) — full control (“god mode”): the whole Admin Panel, every channel, every setting.</li>
                <li><b>Owner</b> — the top level (Rob), same powers as Admin.</li>
              </ul>
              <p>The little <b>A</b> / <b>L</b> / <b>Owner</b> badge next to a name shows their access level. Members have no badge.</p>
              <p className="font-semibold text-white">Two-location staff</p>
              <p>Work at two salons? An admin can give you a <b>Second location</b> in <b>Admin → Users</b>. You&apos;ll be added to both salon channels and get location announcements &amp; urgent alerts for both.</p>
            </Topic>

            <Topic icon={<Sparkles className="h-4 w-4" />} title="Automated reports & posting from other systems">
              <p>Channels can receive posts automatically from outside {APP_NAME} — a dashboard, Boulevard, a nightly job, or an AI assistant (Manus / Claude / ChatGPT) — using a secure API key.</p>
              <ul className="ml-4 list-disc space-y-1 marker:text-slate-500">
                <li><b>Plain updates</b> — any system can drop a message into a channel (e.g. “Nightly report ready”).</li>
                <li><b>Rich stat cards</b> — send HTML and it renders as a nice visual card (numbers, tables, even charts) right in the channel.</li>
                <li><b>Live boards</b> — send the same <b>key</b> each run and the card updates in place instead of piling up, so a channel can show “today so far”.</li>
                <li><b>Already running — daily numbers:</b> the <b>#daily-numbers</b> channel auto-posts a morning <b>ROP Scorecard</b> (from Snowflake) — guests, new clients, request %, RPG, prebook % and LUX %, company-wide and per stylist, each with Yesterday / Week-to-date / Month-to-date / Year-to-date tabs.</li>
                <li><b>Already running — live bookings:</b> the <b>#dc-coordinators</b> channel gets a message within ~10 minutes of every appointment booked in Boulevard (online or in-salon) — guest, new vs. repeat, stylist, service, who booked it and the appointment time.</li>
                <li><b>Already running — company calendar:</b> the <b>#rop-calendar</b> channel shows an auto-updating card of the next 14 days from the Robert of Philadelphia calendar (meetings, trainings, academies, events), grouped by day. It refreshes itself every few hours.</li>
                <li><b>Already running — who booked:</b> the <b>#bookings-by-booker</b> channel posts an hourly card of how many appointments each staff login booked today (and online/guest self-bookings). Data lags real time by ~1&ndash;2 hours.</li>
              </ul>
              <p className="text-xs text-slate-400">An owner/admin sets this up — ask for the integration API key and the one-page guide, or see the Admin. Rich cards are shown in a locked sandbox, so an outside report can never touch your data.</p>
            </Topic>

            <Topic icon={<MessageSquare className="h-4 w-4" />} title="Post into ROP Chat by email">
              <p>You — or another system, like an outside AI — can drop a message into {APP_NAME} just by sending an <b>email</b> to a special address. The email&apos;s body becomes the message, and the sender&apos;s name shows as the author.</p>
              <p className="font-semibold text-white">To a channel:</p>
              <p><K>channel-&lt;name&gt;@chat.rop2020.com</K> — use the channel&apos;s name (spaces become hyphens).</p>
              <ul className="ml-4 list-disc space-y-1 marker:text-slate-500">
                <li><K>channel-announcements@chat.rop2020.com</K> → posts in Announcements</li>
                <li><K>channel-victories@chat.rop2020.com</K> → posts in Victories</li>
              </ul>
              <p className="font-semibold text-white">To a person (a DM):</p>
              <p><K>dm-&lt;name&gt;@chat.rop2020.com</K> — use their first name, or the part before the @ in their email if the name isn&apos;t unique.</p>
              <ul className="ml-4 list-disc space-y-1 marker:text-slate-500">
                <li><K>dm-zach@chat.rop2020.com</K> → DMs Zach</li>
                <li><K>dm-robd@chat.rop2020.com</K> → DMs Rob</li>
              </ul>
              <p className="text-xs text-slate-400">The Subject line can also route: send to <K>chat@chat.rop2020.com</K> with a subject of <K>#channel-name</K> or <K>@firstname</K>. Anyone who knows the address can post, so keep it internal.</p>
            </Topic>

            <Topic icon={<Home className="h-4 w-4" />} title="Install it on your phone">
              <p>On <b>iPhone</b>: open the site in Safari → Share → <b>Add to Home Screen</b>. On <b>Android</b>: Chrome menu → <b>Install app</b>. On desktop Chrome/Edge: the install icon in the address bar.</p>
            </Topic>

            <Topic icon={<Bell className="h-4 w-4" />} title="Phone notifications & muting channels">
              <p>Get a push on your phone when something needs you — even when the app is closed. You turn it on once on each phone you use.</p>

              <p className="mt-3 font-semibold text-white">On iPhone (iOS 16.4 or newer)</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                <li>Open <b>rop-connect.netlify.app</b> in <b>Safari</b> (it must be Safari).</li>
                <li>Tap the <b>Share</b> button (square with an up-arrow) at the bottom.</li>
                <li>Scroll down, tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
                <li>Open ROP Chat from the <b>new Home Screen icon</b> (not the Safari tab).</li>
                <li>Go to <b>Profile → Notifications</b> and tap <b>“Turn on notifications for this device.”</b></li>
                <li>Tap <b>Allow</b> on the iPhone prompt. Done.</li>
              </ol>
              <p className="mt-1 text-xs text-slate-500">Apple only allows notifications for the installed (Home Screen) app — not a Safari tab. If the button says “Not supported on this device,” you&apos;re still in a tab; open it from the Home Screen icon instead.</p>

              <p className="mt-3 font-semibold text-white">On Android (Pixel & others)</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                <li>Open <b>rop-connect.netlify.app</b> in <b>Chrome</b>.</li>
                <li>Tap the <b>⋮</b> menu (top-right) → <b>Add to Home screen</b> / <b>Install app</b> → <b>Install</b>. (Recommended, so it opens like a real app.)</li>
                <li>Open ROP Chat from its <b>Home Screen / app-drawer icon</b>.</li>
                <li>Go to <b>Profile → Notifications</b> and tap <b>“Turn on notifications for this device.”</b></li>
                <li>Tap <b>Allow</b> when Android asks. Done.</li>
              </ol>
              <p className="mt-1 text-xs text-slate-500">On a Pixel, if notifications seem silent, also check <b>Settings → Notifications</b> and make sure <b>Do Not Disturb</b> / <b>Bedtime mode</b> isn&apos;t hiding them.</p>

              <p className="mt-3"><b>What you&apos;ll get by default:</b> a notification on <b>every message in every channel you&apos;re in</b>, plus all your direct messages, <b>@mentions</b>, and announcements — on your phone and the desktop app. Tapping a notification opens straight to that message.</p>
              <p className="mt-2"><b>Too much on a channel? Quiet it:</b> open the channel and tap the <b>bell</b> in the top bar, then choose <b>“Mentions &amp; DMs only”</b> (only ping me when I&apos;m @mentioned) or <b>“Mute”</b> (never ping me here). This only affects that one channel — every other channel keeps notifying you.</p>
              <p className="mt-2"><b>Fine-tune:</b> in <b>Profile → Notifications</b> you can switch DMs, mentions, announcements and urgent alerts on or off individually.</p>
              <p className="mt-2"><b>Quiet hours &amp; vacation:</b> in <b>Profile → Notifications → Do Not Disturb</b>, turn on <b>Quiet hours</b> and pick a window (e.g. 10 PM–7 AM) to silence phone push overnight, or <b>Pause all notifications</b> when you’re away (optionally with a “resume on” date). Messages still wait for you in the app — your phone just won’t buzz. <b>Urgent Alerts always come through</b> regardless. Times are Eastern.</p>
              <p className="mt-2 text-xs text-slate-500">Blocked before? On iPhone: <b>Settings → Notifications → ROP Chat → Allow Notifications</b>. On Android: <b>Settings → Apps → ROP Chat → Notifications</b>. Then re-open the app and tap the button again.</p>
            </Topic>
          </>
        ) : (
          <div className="space-y-4">
            {CHANGELOG.map((entry) => (
              <div key={entry.version} className="rounded-xl border border-white/10 bg-brand-950/40 p-4">
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="rounded-full bg-gold-400/20 px-2 py-0.5 text-xs font-bold text-gold-200">
                    v{entry.version}
                  </span>
                  <span className="text-sm font-semibold text-white">{entry.title}</span>
                  <span className="ml-auto text-right text-xs text-slate-400">
                    {new Date(entry.date + 'T00:00:00').toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                    {entry.time && <span className="ml-1 text-slate-500">· {entry.time}</span>}
                  </span>
                </div>
                <ul className="ml-4 list-disc space-y-1 text-sm leading-relaxed text-slate-300 marker:text-slate-500">
                  {entry.changes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="px-1 text-center text-xs text-slate-500">
              {APP_NAME} v{APP_VERSION} · {COMPANY_NAME}
            </p>
          </div>
        )}
      </div>
    </Modal>
    <ReportProblemModal open={reportOpen} onClose={() => setReportOpen(false)} />
    </>
  )
}
