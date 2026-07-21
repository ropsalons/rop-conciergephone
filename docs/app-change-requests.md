# Requesting ROP Chat changes / bug fixes from chat

Rob wanted to be able to say, right inside ROP Chat, *"hey — why does ROP Chat do this?"* or *"change
this / fix this bug,"* and have it actually happen. Here's how that works, and where the guardrails are.

## Why it isn't a one-step magic edit

The always-on assistant in **#ask-ai** is a small server function that talks to Claude. It can **read**
ROP Chat and take a few safe actions — but it **cannot edit the app's own code**. Real code changes
need a full coding agent with the repository, git, and a deploy. And #ask-ai is a **public channel with
the whole team in it** — so we must never let "anyone types a message → production code changes" happen.

So the flow is: **capture the request → a coding agent implements it on a branch → open a change (PR)
for Rob to approve → it deploys.** A human gate on production, with Rob driving from chat.

## The flow

1. **You ask** (owner only). In #ask-ai (or a DM to the assistant) say what's wrong or what to change —
   e.g. *"the sign-out button doesn't work on my Pixel"* or *"make the notify menu easier to read."*
2. **The assistant captures it.** It recognizes an app-change/bug request from the owner and files it via
   its `log_app_change_request` tool. That creates a tracked task (`ai_tasks`, tagged `external_ref =
   'app-change'`) and replies to confirm it's queued — it does **not** pretend it changed the app.
3. **The coding agent picks it up.** A Claude Code session (with the repo + git + deploy) reads open
   `app-change` tasks, implements the change on the dev branch, and opens a Pull Request describing it.
4. **Rob approves.** The PR is the approval gate. Merging it deploys via Netlify. The assistant can post
   the PR link back into the channel so you can review from your phone.

## Guardrails

- **Owner-only intake.** Only Rob's account can file an app-change request. If anyone else asks for an
  app change, the assistant escalates it to Rob instead.
- **No unreviewed production edits.** Changes land on a branch and go through a PR, never straight to the
  live app.
- **Scope check.** Large or risky changes (auth, billing, data deletion, permissions) get called out in
  the PR for explicit sign-off.

## Where requests live
Open app-change requests: `select id, title, body, created_at from public.ai_tasks where external_ref =
'app-change' and status = 'open' order by created_at desc;`

## Turning on automatic pickup (optional)
Today a coding session picks these up when Rob's working with the assistant. If Rob wants it to be
hands-off — requests picked up and turned into PRs on a schedule without him kicking it off — we can arm
a recurring coding session (a self-binding Routine) that polls the `app-change` queue, opens PRs, and
reports back in chat. Left off by default so nothing touches the codebase unprompted.
