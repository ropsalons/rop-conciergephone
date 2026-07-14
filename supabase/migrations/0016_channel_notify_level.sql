-- ROP Chat — per-channel notification level (Slack-style).
-- Each membership gets notify_level: 'all' (buzz on every post), 'mentions' (default —
-- only @mentions/DMs/announcements), or 'mute' (nothing). handle_new_message() fans a
-- 'channel' notification out to 'all' subscribers on every post; push_on_notification()
-- pushes 'channel' notifications (gated by the user's global "channels" pref) and treats
-- 'mute' as silence for that channel. is_muted is kept in sync ('mute' => true) by the app.
-- NOTE: the deployed handle_new_message() / push_on_notification() bodies are the source of
-- truth (push_on_notification carries the live x-cron-secret, redacted here).

alter table public.channel_members
  add column if not exists notify_level text not null default 'mentions'
  check (notify_level in ('all','mentions','mute'));

update public.channel_members set notify_level = 'mute' where is_muted = true and notify_level <> 'mute';

-- handle_new_message(): add a fan-out to channel_members with notify_level='all'
--   -> inserts a 'channel' notification per subscriber (skipping the author and anyone
--      already @mentioned). See deployed function for the full body.

-- push_on_notification(): allow type 'channel' (gated by prefs.channels); the per-channel
--   mute check now reads channel_members.notify_level = 'mute'. See deployed function.
