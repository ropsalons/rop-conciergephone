# ROP Chat — Events API

ROP Chat is the **single source of truth for company events**. A separate app (the ROP Team App)
reads events from here and displays them. **ROP Chat owns the event record; the consuming app owns
registrations** and writes them back via this API.

- **Base URL:** `https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/events-api`
- **Timestamps:** ISO 8601 with timezone (e.g. `2026-08-22T17:00:00+00:00`). Server logic runs in
  `America/New_York`; each event also carries its own `timezone`.
- **Content type:** `application/json`

## Authentication

Same scheme as every other ROP Chat integration: an **`ai_agents` bearer token**. Send it as:

```
Authorization: Bearer rop_ai_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

The token is hashed (SHA-256) and matched against `ai_agents.token_hash`; the plaintext is never
stored. The agent must be **active** and carry the right capability in `allowed_actions`:

| Endpoint                     | Required capability   |
| ---------------------------- | --------------------- |
| `GET`  (read events)         | `read_events`         |
| `POST` (registration write)  | `write_registration`  |

Requests with no/invalid/disabled token get `401`. A valid token missing the capability gets `403`.
**Events are never exposed to unauthenticated requests.** No PII is returned beyond what ROP Chat
already exposes internally (registration replies show a person's display name only).

---

## 1. Read events — `GET /events-api`

Returns upcoming or past events with all structured fields.

**Query parameters** (all optional):

| Param           | Values / format                          | Default    | Meaning                                             |
| --------------- | ---------------------------------------- | ---------- | --------------------------------------------------- |
| `scope`         | `upcoming` \| `past` \| `all`            | `upcoming` | Upcoming = start ≥ now; past = start < now          |
| `from`          | ISO 8601                                 | —          | Only events starting **on/after** this instant      |
| `to`            | ISO 8601                                 | —          | Only events starting **on/before** this instant     |
| `location`      | string                                   | —          | Case-insensitive substring match on `location`      |
| `updated_since` | ISO 8601                                 | —          | Only events changed **after** this instant (polling fallback for change notifications) |
| `limit`         | 1–500                                    | `100`      | Max rows                                            |

Results are ordered by `start` ascending (descending for `scope=past`).

### Response

```json
{
  "ok": true,
  "count": 1,
  "events": [
    {
      "id": "b02ad208-0bd7-4437-b5cc-215baf31f4d6",
      "title": "Behind The Chair Show 2026",
      "description": "…rich text / free text body…",
      "start": "2026-08-22T17:00:00+00:00",
      "end": "2026-08-22T20:00:00+00:00",
      "timezone": "America/New_York",
      "location": "Omni Fort Lauderdale Hotel, …",
      "location_id": null,
      "capacity": 40,
      "cost": "Covered by ROP",
      "registration_open": true,
      "registration_count": 12,
      "spots_remaining": 28,
      "cover_image": "https://…/cover.jpg",
      "category": "workshop",
      "format": "in_person",
      "audience": "all",
      "is_cancelled": false,
      "created_by": "6cd61125-…",
      "created_at": "2026-07-10T14:03:00+00:00",
      "updated_at": "2026-07-31T18:20:00+00:00",
      "thread_images": ["https://…signed-url-1", "https://…signed-url-2"]
    }
  ]
}
```

Field notes:
- `cost` maps to the event's price string (`"Covered by ROP"`, `"$45"`, or `null`).
- `capacity` is `null` for unlimited. `spots_remaining = capacity - registration_count`, or `null`
  when capacity is `null`.
- `registration_count` is maintained by ROP Chat from the write-back endpoint below.
- `thread_images` are image URLs from replies on the event's chat thread. Private-bucket images are
  returned as **short-lived signed URLs (1 hour)** — re-fetch to refresh.

### curl

```bash
curl -s "https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/events-api?scope=upcoming&location=Bayfront&limit=50" \
  -H "Authorization: Bearer $ROP_EVENTS_TOKEN"
```

Poll for changes since your last sync:

```bash
curl -s "https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/events-api?scope=all&updated_since=2026-07-31T00:00:00Z" \
  -H "Authorization: Bearer $ROP_EVENTS_TOKEN"
```

---

## 2. Registration write-back — `POST /events-api`

The consuming app tells ROP Chat that someone registered or cancelled. ROP Chat records it
**idempotently**, updates `registration_count`, and posts a message into the event's chat thread so
the room sees who's coming.

### Request body

```json
{ "action": "register", "event_id": "b02ad208-…", "user_id": "6cd61125-…", "source": "team-app" }
```

| Field      | Required | Notes                                                        |
| ---------- | -------- | ------------------------------------------------------------ |
| `action`   | yes      | `"register"` or `"cancel"`                                   |
| `event_id` | yes      | ROP Chat event UUID                                          |
| `user_id`  | yes      | ROP Chat profile UUID (get these from `list_users` on the ai-gateway) |
| `source`   | no       | Free label for where the registration came from             |

### Response

```json
{
  "ok": true,
  "action": "register",
  "event_id": "b02ad208-…",
  "user_id": "6cd61125-…",
  "posted": true,
  "already": false,
  "registration_count": 12,
  "spots_remaining": 28
}
```

- **Idempotent:** submitting the same `register` (or `cancel`) twice does not double-count and does
  not re-post to the thread — the repeat returns `"already": true, "posted": false` with the count
  unchanged.
- Registering when `registration_open` is `false` returns `409`.
- Unknown `event_id` → `404`; unknown `user_id` → `404`.

### curl

```bash
# Register
curl -s -X POST "https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/events-api" \
  -H "Authorization: Bearer $ROP_EVENTS_TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"register","event_id":"b02ad208-0bd7-4437-b5cc-215baf31f4d6","user_id":"6cd61125-689a-4889-82ab-fb5835acf59c","source":"team-app"}'

# Cancel
curl -s -X POST "https://qrigzwactbwbpuufehxo.supabase.co/functions/v1/events-api" \
  -H "Authorization: Bearer $ROP_EVENTS_TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"cancel","event_id":"b02ad208-0bd7-4437-b5cc-215baf31f4d6","user_id":"6cd61125-689a-4889-82ab-fb5835acf59c"}'
```

---

## 3. Change notifications

When an event's **start time**, **location**, or **cancellation status** changes, ROP Chat fires a
webhook to every active URL in `public.event_webhooks`:

```json
{
  "type": "event.changed",
  "event_id": "b02ad208-…",
  "changed": ["start", "location"],
  "event": {
    "id": "b02ad208-…", "title": "…", "start": "…", "end": "…",
    "location": "…", "is_cancelled": false, "updated_at": "…"
  }
}
```

If a webhook secret is configured, it is sent as the `X-ROP-Webhook-Secret` header — verify it on
receipt. Register a webhook URL (admin, one row per consumer):

```sql
insert into public.event_webhooks (url, secret) values ('https://team-app.example.com/hooks/rop-events', 'your-shared-secret');
```

**Pull-based fallback:** if you can't receive webhooks, poll `GET /events-api?updated_since=<last_sync>`
on an interval — it returns exactly the events changed since that instant.

---

## Field reference (event record)

| API field            | Storage (`public.events`) | Type / notes                                  |
| -------------------- | ------------------------- | --------------------------------------------- |
| `title`              | `title`                   | text, required                                |
| `start`              | `starts_at`               | timestamptz, required                         |
| `end`                | `ends_at`                 | timestamptz, nullable                         |
| `timezone`           | `timezone`                | text (default `America/New_York`)             |
| `location`           | `location`                | text, required (a salon name or free text)    |
| `capacity`           | `capacity`                | integer, nullable (null = unlimited)          |
| `cost`               | `price`                   | text, nullable (`"Covered by ROP"`, `"$45"`)  |
| `registration_open`  | `registration_open`       | boolean, default true                         |
| `description`        | `description`             | text, nullable                                |
| `cover_image`        | `cover_url`               | text (image URL), nullable                    |
| `registration_count` | `registration_count`      | integer (maintained via write-back)           |
| `is_cancelled`       | `is_cancelled`            | boolean                                       |

Existing free-text/other fields (`category`, `format`, `audience`, `organizer`, `location_url`, …)
are preserved and returned where applicable.
