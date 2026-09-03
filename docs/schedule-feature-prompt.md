# ROP Chat — Concierge Schedule Feature (build prompt)

Paste the prompt block below into Fable 5 (or Claude) to build the Schedule tab.
Requirements were gathered with Rob in Sept 2026. Default weekly hours per person
are **data entered once in-app** (or seeded from the real time system at
`time.ropsalons.com`) — they are intentionally **not** hardcoded here, and are
**not** to be pulled from Boulevard (Boulevard's shift data is not accurate for
concierge).

---

```
Build a "Schedule" feature for ROP Chat — our internal Slack-like PWA for Robert of Philadelphia salons.

CONTEXT — MATCH THE EXISTING APP, DON'T REINVENT IT
- Stack: React + Vite PWA, HashRouter, Zustand stores (authStore, chatStore, directoryStore, uiStore), lucide-react icons, Tailwind. Backend is Supabase (Postgres + RLS + Deno edge functions). TypeScript throughout.
- This is a NEW TAB in the left sidebar, exactly like the existing "Events" and "Training Log" tabs. Reuse the same page shell/PageHeader component, the same table/list styling, and the same admin gating helpers (canManage / isAdmin reading profiles.access_level, which is 'admin' or 'member'). Match the look of the current app — do not introduce a new design language.
- Existing tables you'll join to: profiles (id, full_name, access_level, location_id, department_id, is_active), locations (Bayfront, "Village on Venetian Bay", Promenade), departments (e.g. "Concierge"), messages + the existing notification/push pipeline.
- Notifications: ROP Chat already sends in-app notifications and push by inserting rows the notification triggers pick up. Reuse that same mechanism — do not build a new notification system.
- Add a changelog entry to src/lib/version.ts and bump the version, like other features do.

WHO IT'S FOR
- Phase 1: the Concierge department (desk coordinators). Build it DEPARTMENT-SCOPED, not hardcoded to concierge, so we can turn it on for "Associates" later just by enabling another department. Never hardcode the concierge list in code.

CORE MODEL — "fixed default week + exceptions"
Most people work the same week every week, so:
1. Each person has a DEFAULT WEEKLY SCHEDULE (a repeating template) — a set of shifts by weekday.
2. A shift has: role = 'desk' or 'phones'; if 'desk', a salon (location); real start and end times (use a simple time picker in 15-minute steps — e.g. 8:30, 9:00 — not free-typed minutes).
3. The actual schedule for any given week = each person's default template, MINUS approved time off, PLUS any coverage/overrides for that week. Build a resolver that computes this.
4. Editing a week never edits the template unless you explicitly choose "change their normal schedule."

Special real-world roles to support (these are examples of what the model must allow, set as data, not hardcoded):
- Carolyn: dual role — works a salon DESK and answers PHONES on-site at the same time. One person can hold a desk shift AND be flagged on-phones simultaneously.
- Mickey: always REMOTE phones, no salon.
- Marina: remote + in-salon desk, but NOT phones.

COVERAGE SLOTS & TARGETS
- Slots per day: a desk at each salon (Bayfront, Village, Promenade) + Phones.
- Headcount varies: a salon or phones may need 2 people during busy hours and 1 otherwise. Let a manager set a target headcount per slot (optionally per time block / part of day), and show when a slot is UNDER its target (e.g. "Phones: 1 of 2, 11a–2p").

QUALIFICATIONS (who can work / cover what)
- Each coordinator is flagged for which slots they're qualified for: Phones, and which salon desks. When picking a cover person, only show ELIGIBLE people.

TIME-OFF REQUESTS  (needs approval)
- A coordinator requests time off: date or date range + optional reason.
- They either (a) name who's covering them, or (b) flag "NEEDS COVERAGE."
- Status flow: pending → approved / denied. ANY manager/admin (access_level = 'admin') can approve or deny.
- Approved time off removes that person from their default shifts for those dates.

FINDING COVERAGE  (both self-serve and assigned)
- If no cover named, the shift shows as "NEEDS COVERAGE." Any ELIGIBLE coordinator can claim it (self-serve open call), AND a manager can directly assign someone. Manager has final say.
- When someone is covering (i.e. not the usual person for that slot), the week view must show a BOLD flag like "Jess covering for Carolyn — Bayfront desk," plus an optional NOTE field the cover person sees (e.g. "also watch phones till noon").

WEEK VIEW  (this is the main screen — keep it simple and readable)
- Opens on THIS WEEK, EVERYONE, all salons + phones, in one clean grid (people/slots × the 7 days). Prev/next week navigation.
- At a glance you can see who is ON, who is OFF, and who is COVERING. Exceptions (time off, coverage, one-off changes) are visually obvious. Normal weeks look calm; exceptions stand out.
- Group or filter by salon + phones. It should be obvious, per day, whether each salon desk and phones are fully covered vs under target.

NOTIFICATIONS  (all four, via the existing ROP Chat notification pipeline)
1. Time-off request submitted → notify the approvers (managers/admins).
2. Approved or denied → notify the requester.
3. "Needs coverage" → notify eligible coordinators so they can claim it.
4. Coverage claimed → notify a manager.

PERMISSIONS
- Every concierge member can SEE the schedule and submit their own time-off/coverage requests.
- Managers/admins can approve/deny, set default templates, set headcount targets, set qualifications, and assign coverage.

SEED DATA (Concierge roster — set salons/qualifications as data, let managers fill default hours in-app)
- Bayfront: Gustavo Marinelli (admin), Lisa Denove, Marina Murphy (remote + desk, no phones), Robert DiLella III (admin)
- Village on Venetian Bay: Alexi DiLella (admin), Sophia Spector
- Promenade: Alexa Spector, Carolyn Warnkin (desk + on-site phones), Leana Amaya
- Remote phones: Micksuane "Mickey" Velazquez
- Default weekly hours for each person will be entered in-app by a manager (or imported from the time system). Do NOT hardcode hours and do NOT import them from Boulevard.

KEEP IT SIMPLE
- This is NOT a Walmart-style shift scheduler. Optimize for "most weeks are the same, I just log the exceptions." Minimize clicks. A manager should be able to set up a normal week once and then only touch it for time off and coverage.

DELIVERABLES
- Supabase migration(s) for the new tables + RLS (department-scoped, admin-write, member-read-own).
- The Schedule tab (sidebar link + route), the week grid, the default-template editor, the time-off request + approval flow, the coverage claim/assign flow, qualifications & headcount-target admin, and the four notifications.
- A version.ts changelog bump.
```

---

## Requirements captured (source of truth for the prompt above)

- **Schedule model:** fixed default weekly template per person that repeats; only exceptions are entered.
- **Time off:** needs approval; any manager/admin can approve/deny.
- **Coverage:** both self-serve (eligible people claim) and manager-assigned; manager has final say.
- **Slots:** a desk per salon + phones; headcount can vary (a salon or phones may need 2 during busy hours).
- **Phones:** single "phones covered" status, but some hours need 2; managers set a target headcount per slot/time block. Track remote (Mickey) vs on-site phone-answering (Carolyn) clearly.
- **Covering flag:** bold "X covering for Y" + a note field the cover person sees.
- **Shift detail:** real start/end times, kept simple (15-min steps like 8:30, 9:00).
- **Default view:** this week, everyone, all salons + phones.
- **Eligibility:** role/skill limits — only qualified people shown as cover options.
- **Notifications:** request→approver, approved/denied→requester, needs-coverage→eligible team, claimed→manager.
- **Extensibility:** department-scoped so Associates can be added later.

## Open item — real default schedules

Seed the real default hours from `time.ropsalons.com` (the accurate source).
Not yet imported because that domain is blocked by the build environment's egress
proxy; get it allowlisted + an API key, or export the schedule and import it.
Boulevard shift data is **not** to be used.
