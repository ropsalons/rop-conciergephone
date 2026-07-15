# Sending messages to ROP Chat by email

ROP Chat (our internal Slack-style app) can receive a message from **any outside system**
— another AI/agent, a script, a workflow, a webhook — simply by **sending an email** to a
special address. No API keys, no SDK. If your project can send email, it can post to ROP Chat.

The domain for the bridge is **`chat.rop2020.com`**. Whatever you put in the **email body
becomes the message**, and the **sender's name becomes the author** shown in ROP Chat.

---

## 1. Where the message goes (the address)

Encode the destination in the **To** address:

| You want to… | Send the email to | Example |
| --- | --- | --- |
| Post in a **channel** | `channel-<slug>@chat.rop2020.com` | `channel-victories@chat.rop2020.com` |
| **DM** a person | `dm-<name>@chat.rop2020.com` | `dm-zach@chat.rop2020.com` |

- **`<slug>`** = the channel's name (lowercase, hyphens for spaces). **Either the slug or the
  display name works** — e.g. `channel-daily-numbers@…` and `channel-ROP-Scorecard@…` both post
  to the ROP Scorecard channel.
- **`<name>`** = the person's **first name** (e.g. `zach`, `gustavo`, `jenn`). If two people
  share a first name, use the **part before the `@` in their email** instead
  (e.g. `dm-robd` for robd@rop2020.com).

**Subject-line alternative (optional):** send to `chat@chat.rop2020.com` and put the target in
the **Subject**: start it with `#channel-slug` (channel) or `@firstname` (person).
Encoding it in the To address is preferred — it's unambiguous.

---

## 2. What the message says (the body)

**Plain text (default).** The email body is posted as the message. Light formatting works:

- `**bold**`, `*italic*`, `` `code` `` , and links (`https://…`) render nicely.
- Quoted reply history and signatures are stripped automatically — send just the new content.

**Rich HTML card (optional).** To post a styled card (headings, tables, colors, mini-dashboards),
begin the **Subject** with **`[html]`**. Then the email's HTML body is rendered as a card, and the
rest of the subject becomes the **card title**. HTML runs in a locked sandbox, so it's safe.

> Example subject: `[html] Weekly Report` → a card titled "Weekly Report" rendered from your HTML.

---

## 3. Examples

**A) Plain message to a channel**
```
To:      channel-victories@chat.rop2020.com
From:    Sales Bot <bot@yourproject.com>
Subject: (anything or blank)
Body:    🎉 Big win — the Q3 numbers just came in and we beat target by 12%!
```

**B) Direct message to a person**
```
To:      dm-zach@chat.rop2020.com
From:    Scheduler <bot@yourproject.com>
Body:    Heads up Zach — your 2pm tomorrow rescheduled to 3pm.
```

**C) Rich HTML card to a channel**
```
To:      channel-daily-numbers@chat.rop2020.com
From:    Reports <bot@yourproject.com>
Subject: [html] Yesterday at Bayfront
Body (HTML):
  <h2 style="margin:0">Bayfront — Mon</h2>
  <table>
    <tr><th>Sales</th><td>$4,210</td></tr>
    <tr><th>New guests</th><td>7</td></tr>
    <tr><th>Prebook %</th><td>63%</td></tr>
  </table>
```

---

## 4. Reference — common channels & people

**Channels** (use the slug on the left):

| Slug (`channel-<slug>@`) | Channel |
| --- | --- |
| `announcements` | Announcements (company-wide) |
| `victories` | Victories (guest wins) |
| `daily-numbers` | ROP Scorecard |
| `wins-and-shoutouts` | Wins & Shoutouts |
| `guest-experience` | Guest Experience |
| `scheduling` | Scheduling |
| `marketing` | Marketing |
| `how-to-operations` | How-To / Help |
| `bookings-by-booker` | Bookings by booker |
| `rop-calendar` | Company calendar |

_Any channel works — use its slug. To find a slug, open the channel in ROP Chat; the slug is in
the URL, or it's the name lowercased with hyphens._

**People** (use first name; or email prefix if the name isn't unique):

| DM address | Person |
| --- | --- |
| `dm-robd@chat.rop2020.com` | Rob (owner) |
| `dm-zach@chat.rop2020.com` | Zach |
| `dm-gustavo@chat.rop2020.com` | Gustavo |
| `dm-jenn@chat.rop2020.com` | Jenn |
| `dm-alexi@chat.rop2020.com` | Alexi |

---

## 5. Good to know (gotchas)

- **One email = one message.** Send separate emails for separate posts.
- **Attachments aren't supported yet** — put content in the body (or link to a file).
- **`@Name` mentions** render highlighted but don't yet trigger a mention notification.
  To make sure someone sees it, DM them (`dm-<name>@`) or post in a channel they follow.
- **Anyone who knows the address can post** — there's a shared secret behind the scenes, but the
  email addresses themselves aren't secret, so **keep them internal**.
- **Delivery** goes email → SendGrid → ROP Chat, usually within a few seconds.
- If a channel slug or person name doesn't match anything, the email is rejected (nothing posts).

---

## 6. Copy‑paste prompt for an AI project

> **How to send a message into ROP Chat (our team app):** send an email via `chat.rop2020.com`.
> - To post in a channel, email **`channel-<name>@chat.rop2020.com`** using the channel's name,
>   lowercase with hyphens (the slug or the display name both work) — e.g.
>   `channel-victories@chat.rop2020.com`, `channel-announcements@chat.rop2020.com`,
>   `channel-ROP-Scorecard@chat.rop2020.com`.
> - To direct-message a person, email **`dm-<firstname>@chat.rop2020.com`**
>   (e.g. `dm-zach@chat.rop2020.com`, `dm-robd@chat.rop2020.com`). If a first name isn't unique,
>   use the part before the `@` in their work email.
> - The **email body is the message**; light markdown (`**bold**`, `*italic*`, links) works.
>   The **From name** shows as the author, so set a clear sender name.
> - For a **styled HTML card**, start the **Subject** with `[html]` and put HTML in the body;
>   the rest of the subject becomes the card title.
> - Send one email per message. No attachments. Keep these addresses internal.
