# State of AI & Technology at Robert of Philadelphia

**Executive briefing prepared for Rob DiLella — for the meeting with Alexi (Marketing & Communications)**
**Date: July 16, 2026**

> Purpose: a single, honest, comprehensive picture of everything we've built across AI, automation,
> dashboards and technology — what's live, what's in progress, what's planned — plus a practical
> playbook for how Alexi can start using AI in marketing immediately.

A note on scope and honesty: two things are true and I want to keep them clearly separated so you can
speak to them with confidence.

- **ROP Chat / ROP Connect** (our internal team app, live at `rop-connect.netlify.app`) is fully
  built and running. Everything I describe about it below I can verify in the code and the live system.
- **The Command Center analytics project** (the separate initiative that houses On The Clock, the
  Guest Experience / Retention / Cancellation dashboards, and the deeper concierge analytics) is a
  **separate codebase**. I've helped design its data plumbing and integration, but it is not in front
  of me in this session, so I describe it from what we've actually built and decided together and mark
  it clearly as the companion project — not as verified-line-by-line the way ROP Chat is.

---

# SECTION 1 — EXECUTIVE SUMMARY

## 1. Every major AI project currently underway

| # | Project | What it is | Status |
| - | ------- | ---------- | ------ |
| 1 | **ROP Chat two-way AI integration** | A secure, permissioned, audited gateway that lets approved AI (Claude Code, Cowork, automations) read and write into ROP Chat under least-privilege rules | **Live** |
| 2 | **ROP Chat AI Auto-Responder** (`#ask-ai`) | Always-on assistant that answers staff questions in a channel and by DM, powered by Claude | **Live** |
| 3 | **Daily AI Briefing** (`#daily-briefing`) | Every morning, Claude reads the last 24h of activity and writes a plain-English recap | **Live** |
| 4 | **Automated data feeds** (8 scheduled jobs) | Scorecard, bookings-by-booker, live booking feed, victories, calendar, daily numbers — auto-posted from Boulevard + Snowflake | **Live** |
| 5 | **AI-assisted development (Claude Code)** | The app itself is built and maintained by an AI engineering loop — features, fixes, deploys | **Ongoing / Live** |
| 6 | **Command Center dashboards** (companion project) | On The Clock, Guest Experience, Retention, Cancellation, deeper concierge analytics | **In development (separate codebase)** |
| 7 | **Cross-project comms toolkit** | Reusable Resend (email) + Twilio (SMS) send capability any ROP app/agent can use | **Live + documented** |

## 2. Every dashboard that exists or is being developed

**Live inside ROP Chat** (each is an auto-updating card posted into a channel):

- **ROP Scorecard** — company total, by salon, and by stylist. Metrics: guests/appointments, new
  guests, new-guest prebook %, retail-per-guest (RPG), prebook %, LUX % (Luxury Upgrades), new-request
  %. Time windows: **Today (live), Yesterday, Week-to-date, Month-to-date, Year-to-date.** Mobile-fit.
- **Bookings by Booker** — bookings + new-guest counts per staff member who booked, across **8 windows**
  (Today / Yesterday / WTD / Last week / MTD / Last month / Last 3 months / Last 12 months), with a
  tabbed card you tap to switch windows.
- **Daily Numbers** — yesterday's guests, appointments, new clients, retail-per-guest by location,
  posted automatically each morning.
- **Live Booking Feed** (`#dc-coordinators`) — every appointment booked in Boulevard posts within ~10
  minutes: guest, new-vs-repeat, stylist, service, who booked it, appointment time.
- **Victories Feed** — celebrates each guest win at checkout (prebooks, brand-new-guest prebooks, etc.).
- **Company Calendar** — an auto-updating 14-day upcoming-events card from the Google Calendar.
- **Admin dashboards** — Activity/usage log (who's logging in, who's online now — green dots),
  AI Integrations console, Send-Text (SMS blast) console, Storage & Backups status.

**In the Command Center companion project** (separate codebase, in development):

- **On The Clock** — real-time staff/time visibility.
- **Guest Experience Dashboard** — service quality and guest-satisfaction view.
- **Retention Dashboard** — rebooking / return-rate view.
- **Cancellation Dashboard** — cancellations and no-shows.
- **Concierge analytics tools** — front-desk / concierge performance.

## 3. Current development status of each project

- **ROP Chat core app** — **Production.** Used daily by staff, installable on phones (PWA), push
  notifications working.
- **ROP Chat AI layer** (gateway, responder, briefing, badges, audit, kill-switch) — **Production.**
- **Automated feeds** — **Production**, running on schedule (every ~1–10 min to daily).
- **Command Center dashboards** — **Active development** in the separate project; data pipeline
  (Boulevard → Snowflake) that feeds them is live.
- **Cross-project email/SMS toolkit** — **Done and documented.**

## 4. Features that are completed

- Realtime channels, DMs, threads, reactions, file uploads (with drag-and-drop), full-text search.
- Announcements, urgent alerts with "I saw this" acknowledgements + escalation reporting.
- Daily huddles, shoutouts, guest recovery workflow, education posts, scheduling/shift coverage.
- Admin panel: users/roles, channel management, acknowledgement reports, **audit log**, storage usage,
  CSV message export, **usage/activity log + live presence**, **automated 14-day rolling backups**.
- PWA install + **push notifications with per-channel mute** and **deep-linking** (tap a notification →
  opens the exact message).
- The full **two-way AI integration** — agents, per-agent permissions, approval queue, audit trail,
  global kill-switch, MCP server, admin console, and a 🤖 AI badge so AI messages are never mistaken
  for a person.
- **AI auto-responder** and **daily AI briefing** — both live on Claude.
- Eight **automated data feeds** from Boulevard + Snowflake.
- **Speed optimization** — instant-render-from-cache + background refresh; channels/DMs open near-instantly.
- **Slack history import** — prior Slack channels and messages imported so nothing was lost in the switch.
- **Email-in bridge** (`chat.rop2020.com`) and **webhook ingest** so any outside system can post in.
- **Resend (email)** and **Twilio (SMS)** send capability, wrapped and documented for reuse.

## 5. Features currently being built

- **Command Center dashboards** (On The Clock, Guest Experience, Retention, Cancellation, concierge
  analytics) — the analytics companion to ROP Chat.
- **Beta wishlist items** for ROP Chat (Slack-parity polish): quick-switcher (Cmd/Ctrl+K), typing
  indicators, swipe-to-reply on mobile, custom status ("🎨 With a client"), save/bookmark a message,
  scheduled send, per-channel drafts, `@channel`/`@here`, full searchable emoji picker.
- Continued **staff adoption** push (see blockers): ~40 team members have not yet signed in.

## 6. Features planned for the future

- **Outbound AI webhooks** — today AI *pulls* from ROP Chat (reads/searches on demand). The next step
  is *pushing* events to external AI in real time (e.g. "a guest complaint just posted → trigger a
  workflow"). Designed, not yet built.
- **Semantic / vector search** across chat history (today it's fast keyword search).
- **Richer approval auto-execution** for more sensitive AI actions.
- **Marketing automations** built on the data we already have (birthdays, anniversaries, prebook gaps —
  see §23).
- Deeper **Boulevard write-backs** (today we mostly read from Boulevard; writing back — e.g. tagging
  guests — is a future option).

## 7. Marketing improvements made through AI

- A dedicated **`#marketing` channel** with the AI assistant reachable there for instant copywriting,
  brainstorming and campaign help.
- **Victories feed** = a continuous stream of real, specific guest wins — ready-made social-proof and
  content fuel for Alexi (see §23).
- **Staff data enriched** — 52 active staff imported with birthdays and hire dates, enabling
  birthday/anniversary marketing and recognition.
- **Reusable Resend email capability** so marketing sends (from `notifications@rop2020.com`, on the
  verified `rop2020.com` domain) can be triggered from any app or AI with good deliverability.
- **Reusable Twilio SMS capability** (from `+1 239-880-8681`) for text campaigns and reminders, one
  person or a whole list.

## 8. Automation improvements made through AI

- **No more manual daily numbers.** The morning scorecard/daily-numbers used to depend on someone (or a
  live AI session) running it. It's now a **self-contained scheduled job** — it just happens.
- **Live operational awareness** — bookings, victories and the scorecard update themselves throughout
  the day from Boulevard/Snowflake, so leadership sees reality without asking anyone.
- **Auto-responder** handles routine "how do I…/what's the number for…" questions without a human.
- **Daily briefing** turns 24h of scattered activity into one readable recap automatically.
- **Automated backups** (14-day rolling) protect the data with no manual step.
- **Text/email reminders** to staff (e.g. "you have a message waiting") can be sent from the admin tools.

## 9. Claude Code accomplishments

Claude Code is the AI engineering system that **builds and maintains ROP Chat**. Concretely, it has:

- Built the entire app from scaffold → production (database, security, realtime, PWA, admin).
- Imported the full Slack history (all channels, all years) so the switch lost nothing.
- Built and deployed all **8 automated feeds** and the **entire AI integration layer**.
- Root-caused and fixed hard bugs (e.g. a thread-opening crash traced to a realtime subscription reuse;
  the week-to-date number not including "today"; notifications not deep-linking).
- Diagnosed and fixed **app slowness** with an evidence-first method (proved the database was fast in
  ~0.1 ms, found the real cause on the client, fixed it) — and wrote that up as a **reusable prompt** so
  your other apps can be sped up the same way.
- Wrote the **operational documentation** (AI integration, email bridge, Resend, Twilio, speed guide).
- Ships through **Netlify CI** on every push — fresh build, verified live.

## 10. Cowork workflows and how they fit into our operations

**Cowork** is the collaborative AI workspace where you (and, going forward, Alexi) can direct AI to do
real work using the same secure connection Claude Code uses. It fits our operations three ways:

1. **Talk to ROP Chat from AI** — via the MCP server, Cowork can read channels, search history, post
   updates, DM people and file action items, all under the permissioned, audited gateway.
2. **Marketing execution** — Alexi can use Cowork to draft campaigns, generate copy and images,
   brainstorm, and plan, then push results into `#marketing` or out via email/SMS.
3. **Operational assist** — pull a number, summarize a channel, draft an announcement — without
   touching code.

The guardrails matter: every AI system is a named agent with an explicit scope (which channels, whether
it can DM, which actions), a rate limit, an **audit trail**, and a **global kill-switch**. Nothing an
agent isn't allowed to see is ever returned.

## 11. ROP Chat and Slack integration progress

- **ROP Chat has replaced paid Slack.** It's a Slack-style app, ROP-branded and legally distinct, built
  for ~60 staff across three locations.
- **Full Slack history was imported** (channels, messages, mapped to staff) so the team kept its past.
- **Feature parity is high** and climbing: channels, DMs, threads, reactions, files, search,
  announcements, urgent alerts, mobile app, push notifications. The **beta wishlist** (§5) tracks the
  remaining Slack niceties.
- **Cost:** replaces Slack's per-seat subscription with our own infrastructure.

## 12. On The Clock — implementation progress

*(Command Center companion project — separate codebase.)* On The Clock is the real-time staff/time
visibility view. The **data foundation it needs is live** — Boulevard feeds Snowflake, and ROP Chat
already proves we can post live cards from that data. Implementation of the dedicated On The Clock
dashboard is proceeding in the Command Center project. I don't have that codebase in this session, so I
can't quote a line-level status here — recommend we pull its current build state directly before the
meeting if Alexi needs specifics.

## 13. Guest Experience Dashboard — progress

Two related things exist and shouldn't be confused:

- **In ROP Chat (live):** a `#guest-experience` channel and a **Guest Recovery workflow** (log a guest
  issue, track it New → In Progress → Waiting → Resolved, restricted to managers + involved staff). This
  is the "act on it now" surface.
- **In Command Center (in development):** the analytical **Guest Experience Dashboard** — quality/
  satisfaction trends over time. Its underlying quality data (`STYLIST_QUALITY_DAILY` in Snowflake) is
  live and already powers the LUX %, prebook % and new-request % on the scorecard.

## 14. Retention Dashboard — progress

*(Command Center companion project.)* Retention = are guests coming back. The **leading indicators are
already flowing today**: prebook % and new-guest prebook % (a prebooked guest is a retained guest) are
on the live scorecard, and the **Victories feed** celebrates each prebook as it happens. The dedicated
Retention Dashboard (cohort/return-rate view) is being built in Command Center on top of the same
Snowflake data.

## 15. Concierge tools

- **In ROP Chat (live):** "Concierge" is a defined staff role; concierge/front-desk staff use channels,
  DMs, the guest-recovery workflow, and receive the live booking feed and text reminders.
- **In Command Center (in development):** deeper concierge analytics (who's booking, conversion, follow-
  up). The **Bookings-by-Booker** dashboard already live in ROP Chat is effectively a concierge/front-
  desk performance view — bookings and new guests per person who booked, across 8 time windows.

## 16. Cancellation dashboard

*(Command Center companion project — in development.)* Cancellations/no-shows view. The raw appointment
data (including status changes) comes from **Boulevard**, which we already pull. This dashboard is on
the Command Center roadmap; it is **not yet live**. Honest status: planned/in-progress, data source
ready.

## 17. Snowflake integration

- **Live and central.** Snowflake is our analytics warehouse. Boulevard's data lands in Snowflake, and
  we read curated marts (`ANALYTICS.MARTS.*` — `STYLIST_DAILY`, `STYLIST_QUALITY_DAILY`,
  `BOOKINGS_CREATED`, `VICTORIES_TODAY`).
- It powers the **Scorecard, Bookings-by-Booker, and Victories** feeds, and it's the foundation the
  Command Center dashboards build on.
- The Snowflake access token was restored and secured; the feeds read it server-side (never in the browser).

## 18. Boulevard integration

- **Live.** Boulevard is our booking/POS/retail system and the **source of truth** for appointments,
  guests, retail and prebooks.
- We integrate two ways: **(a) directly via the Boulevard Admin API** (the live booking feed within ~10
  minutes of a booking, and the morning daily-numbers card), and **(b) via Boulevard's data share into
  Snowflake** for the richer analytics marts.
- Everything downstream — scorecard, victories, bookings-by-booker, and the Command Center dashboards —
  traces back to Boulevard.

## 19. Supabase architecture

- **Supabase is the backend** for ROP Chat: Postgres database, Row-Level Security (RLS) on every table,
  Realtime (live messages/notifications/presence), Storage (avatars + attachments), and **Edge Functions**
  (the serverless jobs that run every feed, the AI gateway, the responder, the briefing, email/SMS).
- **Security model:** the browser only ever holds a public "anon" key; **all access rules are enforced in
  the database** by RLS. The powerful service key never touches the browser. The AI gateway uses the
  service role but **re-checks every agent's scope in code**.
- **Scheduling:** `pg_cron` runs the timed jobs; `pg_net` lets the database make secure outbound calls.
- **19 database migrations** define the whole schema, security and AI layer, versioned in the repo.

## 20. Netlify deployment status

- **Live in production** at `rop-connect.netlify.app`.
- **Continuous deployment:** every push to the working branch triggers a **fresh build + deploy** via
  GitHub Actions/Netlify; deploys are verified against the live site.
- The app installs to phones as a PWA (Add to Home Screen) with an offline app shell.

## 21. Important technical decisions we've made

- **Own our stack instead of renting Slack** — Supabase + Netlify gives us control, lower ongoing cost,
  and the freedom to build salon-specific features Slack never would.
- **Security-first AI** — every AI agent is scoped, rate-limited, audited, and killable with one button;
  AI messages are visibly badged. We chose least-privilege from day one.
- **Server-side secrets only** — no API keys in the browser; RLS enforces data access; deployed functions
  hold live keys while repo copies use redacted placeholders (secrets are never committed).
- **Automate the recurring, schedule it in the database** — the daily numbers don't depend on a person or
  a live AI session; `pg_cron` jobs make them self-sufficient.
- **Boulevard + Snowflake as the data spine** — one source of truth, curated marts, reused everywhere.
- **Evidence-first performance work** — measure before changing; we proved the DB was fast and fixed the
  real (client-side) cause, then codified the method as a reusable prompt.

## 22. Unresolved issues or blockers

- **Adoption gap** — roughly **40 staff have never signed in.** This is the single biggest limiter on the
  app's value; it's a rollout/change-management task, not a technical one. (Robert III and Alexi were
  personally re-invited by text + email.)
- **iOS push fragility** — Apple occasionally drops a phone's push subscription when the app updates;
  the fix is the user re-enabling notifications in Profile. Worth a one-line staff instruction.
- **AI is pull, not push** — external AI can read/search ROP Chat on demand but isn't yet *notified* in
  real time when something happens. Outbound webhooks are the designed next step.
- **Idempotency edge case** — two truly-simultaneous identical AI writes can create two messages
  (documented; sequential retries are safe).
- **Connector auth** — the Twilio and GoDaddy AI connectors need a one-time authorization in an
  interactive session before AI can use them directly (the wrapped send-SMS path already works today).
- **Command Center visibility** — its dashboards live in a separate codebase not in this session; to
  brief on exact build status we should open that project directly.

## 23. Opportunities Alexi should know about — marketing can leverage AI immediately

These are ready to act on now, using data and tools we already have:

1. **Turn Victories into content.** The Victories feed is a live stream of real guest wins. Alexi can
   have AI turn these into social posts, testimonials, and "why guests rebook" stories — authentic,
   specific, on-brand, daily. **This is the fastest win.**
2. **Birthday & anniversary marketing.** We already have every active staff member's birthday and hire
   date, and Boulevard has guest data. AI can draft and (via Resend/Twilio) send birthday offers and
   milestone recognitions on a schedule.
3. **Prebook-gap campaigns.** The scorecard shows where prebook % is low. That's a targeted marketing/
   comms opportunity: AI can draft the re-engagement message and we can send it.
4. **On-brand copy in seconds.** A `#marketing` channel with the AI assistant means Alexi can draft
   emails, captions, ad copy and landing-page text instantly, then refine.
5. **One email/SMS engine for all campaigns.** Resend (email) and Twilio (SMS) are set up, verified, and
   documented — marketing sends can go out from any tool without re-plumbing anything.
6. **Data-driven creative.** The scorecard/booker data tells Alexi *what's working by location and
   stylist* — AI can turn that into targeted promotion of the right services at the right salon.

## 24. Recommendations — next 30 / 60 / 90 days

**Next 30 days (adopt + activate):**
- Close the adoption gap: get the ~40 non-users signed in (manager-led, in-person, with the text/email
  reminders). The app's value scales with usage.
- Give Alexi a Cowork seat + the `#marketing` AI workflow, and ship **one** AI-generated content stream
  from the Victories feed (social proof) to prove the model.
- Stand up the birthday/anniversary send on a schedule (data + Resend/Twilio already exist).

**Next 60 days (dashboards + campaigns):**
- Bring the Command Center dashboards (Retention, Cancellation, Guest Experience, On The Clock) to a
  reviewable state and wire their key numbers into ROP Chat cards so leadership sees them where they
  already look.
- Launch a first **prebook-gap re-engagement campaign** driven by scorecard data.
- Add the top beta-wishlist items (quick-switcher, typing indicators, scheduled send) to keep adoption sticky.

**Next 90 days (scale + push):**
- Build **outbound AI webhooks** so events (a guest complaint, a big cancellation day) can trigger
  automated marketing/ops responses in real time.
- Establish a monthly **"State of AI" review** (this document, kept current) so leadership stays aligned.
- Evaluate **Boulevard write-backs** and semantic search once the above is delivering.

---

# SECTION 2 — HOW ALEXI CAN LEVERAGE AI EVERY DAY

Practical, repeatable workflows. Each is written so Alexi can start today. "The assistant" = Claude, via
Cowork or the `#marketing` channel in ROP Chat.

### Marketing (general)
- **Daily social proof:** "Here are today's guest victories: [paste from the Victories feed]. Write me 3
  Instagram captions and 1 Facebook post, warm and on-brand for a Southwest Florida luxury salon."
- **Repurpose everything:** one testimonial → a caption, an email blurb, a website quote, an ad line.
  Ask the assistant to "give me 5 formats of this."

### Social media
- **Weekly content calendar:** "Plan next week's posts for Instagram + Facebook: 2 education, 2 social
  proof, 1 promo, 1 team spotlight. Give me captions, hashtags, and a suggested image for each."
- **Reply drafts:** paste comments/DMs → "Draft friendly, on-brand replies."
- **Trend adaptation:** "Here's a trending audio/hook — adapt it to a balayage before-and-after for us."

### Advertising (general)
- **Offer testing:** "Give me 5 promo angles for slow Tuesdays and the headline for each."
- **Audience framing:** "Rewrite this ad for (a) new guests, (b) lapsed guests, (c) bridal."

### Email campaigns
- **Full draft in one prompt:** "Write a re-engagement email to guests who haven't rebooked in 90 days —
  subject line options, preview text, body, and a clear CTA. Warm, premium, not pushy."
- **Send it:** email goes out through **Resend** from `notifications@rop2020.com` (verified domain) — the
  assistant can hand you ready-to-send HTML, or trigger the send via our wrapper.
- **A/B subject lines:** "Give me 6 subject lines, then predict which two will perform best and why."

### Landing pages
- **Page from scratch:** "Write a landing page for a summer color package — hero headline, 3 benefit
  blocks, social proof section, FAQ, and CTA button copy."
- **Conversion polish:** paste an existing page → "Tighten this for conversions; make the CTA stronger."

### Facebook ads
- **Creative sets:** "Give me 3 Facebook ad variations (primary text, headline, description) for a
  new-guest offer, plus the image concept for each."
- **Compliance + clarity:** "Rewrite to avoid before/after policy issues while keeping it compelling."

### Google Ads
- **Search copy:** "Write 10 responsive search ad headlines (≤30 chars) and 4 descriptions (≤90 chars)
  for 'balayage Naples FL' and 'luxury salon Bonita.'"
- **Keyword + negatives:** "Suggest keyword groups and a negative-keyword list for a color-services campaign."

### Canva
- **Design briefs the assistant writes for you:** "Give me a Canva brief for a birthday-offer graphic —
  layout, text hierarchy, our navy/gold brand, and the exact copy to drop in."
- **Copy that fits the frame:** "I have a square post with room for a 4-word headline + 8-word subhead —
  write 5 options." *(If the Canva connector is authorized, the assistant can go further and help
  generate/edit designs directly.)*

### Content creation
- **Batch a month:** "Give me 20 content ideas for the next month across education, social proof, promos,
  and team culture — with a one-line hook for each."
- **Long-form:** "Turn this 5-bullet outline into a 600-word blog post on maintaining color between visits."

### Image generation
- **Concepts + prompts:** "Write 5 image-generation prompts for a luxury-salon summer campaign (mood,
  lighting, composition)." Use these in your image tool of choice.
- **Brand consistency:** keep a saved "brand look" description and prepend it to every image prompt.

### Brainstorming
- **Rapid divergence:** "Give me 15 promo concepts for a slow August, ranked by likely ROI, with a
  one-line reason for the top 3."
- **Devil's advocate:** "Poke holes in this campaign idea before we spend money on it."

### Copywriting
- **Voice lock:** paste 2–3 pieces of our best past copy → "This is our voice. Match it for everything I
  give you today."
- **Tighten/expand on command:** "Make this 30% shorter," "make this warmer," "make this more premium."

### Campaign planning
- **End-to-end plan:** "Plan a 4-week 'welcome back' campaign for lapsed guests: goals, audience,
  channels (email + SMS + social), a week-by-week calendar, the copy for each touch, and how we'll
  measure it." Then push the plan into `#marketing` so the team can see it.

**Two things that make all of this real for us specifically:**
- The assistant can **read our live data** (scorecard, victories, bookings) through the secure gateway, so
  campaigns are grounded in what's actually happening by salon and stylist.
- The assistant can **send** through **Resend (email)** and **Twilio (SMS)** — already verified and
  documented — so "draft it" and "send it" are the same afternoon.

---

# SECTION 3 — STATE OF AI AT ROBERT OF PHILADELPHIA

*Written for a marketing leader stepping in fresh: where things stand, why it matters, and where we're headed.*

**Where we stand.** Over the past several months, Robert of Philadelphia has quietly built a modern,
AI-powered technology backbone — without hiring an engineering team, by directing AI to do the building.
The centerpiece, **ROP Chat**, is a private, salon-specific team app that replaced paid Slack and now
runs in production on every staff member's phone. On top of it sits a genuinely differentiated layer:
**the business now reports on itself.** Numbers that used to require someone to pull them — sales, guests,
new clients, prebooks, retail-per-guest, quality metrics, who's booking — post themselves automatically,
throughout the day, straight from our booking system (Boulevard) and analytics warehouse (Snowflake),
into the channels leadership already reads. Guest wins are celebrated the moment they happen. A daily AI
briefing summarizes the last 24 hours in plain English. Staff can ask an always-on AI assistant a
question and get an answer in seconds.

**Why it matters.** Three reasons a marketing leader should care immediately. First, **we have a live,
structured picture of the business** — by location, by stylist, by booker, by time window — which is the
raw material for smart, targeted marketing instead of guesswork. Second, **we have a content engine hiding
in plain sight**: the Victories feed is a daily stream of real, specific guest wins that can become social
proof, testimonials and campaigns. Third, **the "draft it" and "send it" gap is already closed** — email
(Resend, on our verified domain) and SMS (Twilio, from our number) are set up and documented, so a campaign
conceived in the morning can reach guests the same day. And it's all built on a **security-first
foundation**: AI operates under named identities, explicit permissions, a full audit trail, and a single
kill-switch — so we can move fast without losing control.

**What's still in motion.** The companion **Command Center** project is bringing deeper dashboards online
— Retention, Cancellations, Guest Experience, On The Clock — on the same trusted data spine. Inside ROP
Chat, we're closing the last gaps with Slack (quick-switcher, typing indicators, scheduled send) and, more
importantly, **closing the adoption gap**: the app's value compounds as the last ~40 staff come on board.
The next real frontier is making AI *proactive* — not just answering when asked, but noticing when
something happens (a complaint, a spike in cancellations, a low-prebook day) and kicking off the right
response automatically.

**Where we're headed over the next year.** The direction is a business that increasingly runs on a loop:
**Boulevard captures what happens → Snowflake organizes it → ROP Chat surfaces it → AI acts on it →
guests hear from us at the right moment.** For marketing specifically, that means always-on, data-grounded,
on-brand campaigns produced in a fraction of the time and cost — birthday and anniversary touches, win-back
flows for lapsed guests, prebook-gap nudges, and a steady drumbeat of authentic social proof — with a human
(Alexi) directing taste, judgment and brand, and AI doing the volume. We've built the hard part: the data,
the plumbing, the security, and the send capability. The next year is about **pointing it at growth.**

---

*Prepared by your AI project system for Robert of Philadelphia. ROP Chat items are verified against the
live codebase; Command Center items reflect our shared design and are maintained in a separate project.*
