import { useState, type ReactNode } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { Modal } from '@/components/ui/Modal'
import { APP_VERSION, CHANGELOG } from '@/lib/version'
import { APP_NAME, COMPANY_NAME } from '@/lib/constants'
import {
  Home, Search, Bell, Users, Hash, Lock, Megaphone, MessageSquare, Plus,
  Star, LifeBuoy, GraduationCap, Calendar, ClipboardList, AlertTriangle, Shield, Pin, Sparkles,
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

  return (
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
                <>Favorites are pinned to the top of your sidebar (and are private to you). Tap the star again to un-favorite. Everything else is sorted alphabetically.</>,
              ]} />
              <p className="text-xs text-slate-400"><Lock className="inline h-3 w-3" /> = private/admin channel · <Megaphone className="inline h-3 w-3" /> = announcement channel (only leadership can post) · <Hash className="inline h-3 w-3" /> = normal channel.</p>
            </Topic>

            <Topic icon={<Plus className="h-4 w-4" />} title="Adding & removing other people in a channel">
              <p>Owners, admins and managers can add or remove other people from a channel.</p>
              <p className="font-semibold text-white">Add people:</p>
              <Steps items={[
                <>Open the channel → tap the <b>Members</b> button (<Users className="inline h-3.5 w-3.5" />) top-right.</>,
                <>Tap <K>+ Add people</K>, search a name, and tap <K>Add</K> for each person.</>,
              ]} />
              <p className="font-semibold text-white">Remove someone:</p>
              <Steps items={[
                <>In the same <b>Members</b> list, tap the <K>Remove</K> (✕) next to a person&apos;s name.</>,
              ]} />
              <p className="text-xs text-slate-400">Don&apos;t see these options? You need a manager, admin or owner role — ask an admin, or manage membership from the Admin Panel.</p>
            </Topic>

            <Topic icon={<MessageSquare className="h-4 w-4" />} title="Direct & group messages (DMs)">
              <Steps items={[
                <>In the sidebar, next to <b>Direct Messages</b>, tap the <Plus className="inline h-3.5 w-3.5" /> button.</>,
                <>Pick one person for a private chat, or several for a group DM.</>,
                <>Type at the bottom and send. DMs are private to their members.</>,
              ]} />
            </Topic>

            <Topic icon={<Pin className="h-4 w-4" />} title="Posting, replying, reacting, files">
              <ul className="ml-4 list-disc space-y-1 marker:text-slate-500">
                <li><b>Post</b> — type in the box at the bottom and press <K>Enter</K> (or the send button).</li>
                <li><b>Mention someone</b> — type <K>@</K> and pick a name; they&apos;ll be notified.</li>
                <li><b>React</b> — hover/long-press a message and tap the emoji.</li>
                <li><b>Reply in a thread</b> — tap the reply icon to keep a side-conversation tidy.</li>
                <li><b>Edit / delete</b> — on your own messages, use the ⋯ menu.</li>
                <li><b>Attach a file/photo</b> — tap the paperclip in the message box (up to 25&nbsp;MB).</li>
                <li><b>Pin</b> — important messages can be pinned; open the <Pin className="inline h-3.5 w-3.5" /> button up top to see them.</li>
              </ul>
            </Topic>

            <Topic icon={<Star className="h-4 w-4" />} title="Salon workflows">
              <ul className="ml-4 list-disc space-y-1 marker:text-slate-500">
                <li><Megaphone className="inline h-3.5 w-3.5" /> <b>Announcements</b> — company news.</li>
                <li><AlertTriangle className="inline h-3.5 w-3.5" /> <b>Urgent Alerts</b> — time-sensitive; tap <b>“I saw this”</b> to acknowledge. Leadership can see who hasn&apos;t.</li>
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
                <li><b>Users</b> — change a member&apos;s role, location, department, or deactivate/reactivate them. Tap <b>Edit details</b> on a person to change their full name, display name (nickname), title or phone.</li>
                <li><b>Channels</b> — create channels and archive old ones.</li>
                <li><b>Acknowledgements</b> — see who has/hasn&apos;t acknowledged urgent alerts &amp; announcements.</li>
                <li><b>Audit Log</b> — record of admin actions.</li>
                <li><b>Storage &amp; Export</b> — storage usage and export messages to CSV.</li>
              </ul>
              <p className="text-xs text-slate-400">To add someone to a specific channel, you can either use the channel&apos;s <b>Members → Add people</b> (above), or manage it here.</p>
            </Topic>

            <Topic icon={<Users className="h-4 w-4" />} title="Accounts, roles & the imported history">
              <ul className="ml-4 list-disc space-y-1 marker:text-slate-500">
                <li><b>Sign in</b> with your work email. New staff first-time password is provided by an admin — change it in <b>Profile</b>.</li>
                <li><b>Edit your own name/photo</b> — tap your name (bottom-left) → <b>Profile</b> → set your <b>Display name</b> (e.g. “Rob” instead of “Robert”), title, phone, bio and photo, then <b>Save</b>.</li>
                <li><b>Roles</b> set what you can do: everyone can chat &amp; DM; managers moderate channels &amp; run huddles; leadership posts announcements &amp; urgent alerts; owner/admin can do everything.</li>
                <li><b>Old Slack history</b> appears in the channels labelled with each message&apos;s original author and an <b>“archived”</b> tag — it was imported from the company&apos;s previous Slack.</li>
              </ul>
            </Topic>

            <Topic icon={<Sparkles className="h-4 w-4" />} title="Automated reports & posting from other systems">
              <p>Channels can receive posts automatically from outside {APP_NAME} — a dashboard, Boulevard, a nightly job, or an AI assistant (Manus / Claude / ChatGPT) — using a secure API key.</p>
              <ul className="ml-4 list-disc space-y-1 marker:text-slate-500">
                <li><b>Plain updates</b> — any system can drop a message into a channel (e.g. “Nightly report ready”).</li>
                <li><b>Rich stat cards</b> — send HTML and it renders as a nice visual card (numbers, tables, even charts) right in the channel.</li>
                <li><b>Live boards</b> — send the same <b>key</b> each run and the card updates in place instead of piling up, so a channel can show “today so far”.</li>
                <li><b>Already running:</b> the <b>#daily-numbers</b> channel auto-posts a morning card from live Snowflake data — guests, appointments, new clients and retail-per-guest by location, plus month-to-date.</li>
              </ul>
              <p className="text-xs text-slate-400">An owner/admin sets this up — ask for the integration API key and the one-page guide, or see the Admin. Rich cards are shown in a locked sandbox, so an outside report can never touch your data.</p>
            </Topic>

            <Topic icon={<Home className="h-4 w-4" />} title="Install it on your phone">
              <p>On <b>iPhone</b>: open the site in Safari → Share → <b>Add to Home Screen</b>. On <b>Android</b>: Chrome menu → <b>Install app</b>. On desktop Chrome/Edge: the install icon in the address bar.</p>
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
                  <span className="ml-auto text-xs text-slate-400">
                    {new Date(entry.date + 'T00:00:00').toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
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
  )
}
