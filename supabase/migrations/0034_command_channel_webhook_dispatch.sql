-- Two-way command channels: deliver messages typed in a project's command channel to that project's
-- registered webhook (e.g. HyperAgent). register_webhook already stores the url/secret and creates the
-- command channel; this is the missing outbound half — when a PERSON posts in that channel, POST the
-- message to the project's URL so the external agent can act and reply back (via the gateway).
--
-- Loop-safe: skips posts by the Integrations bot account (that's the agent's own replies), so an
-- agent answering in its command channel never re-triggers itself.

create index if not exists project_webhooks_command_channel_active
  on public.project_webhooks (command_channel_id) where is_active;

create or replace function public.dispatch_command_to_project()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  hook   record;
  author text;
begin
  -- Only human posts in a channel (not DMs, not the bot's own replies).
  if new.channel_id is null or new.user_id = '00000000-0000-4000-8000-00000000b010'::uuid then
    return new;
  end if;

  select pw.id, pw.project_name, pw.url, pw.secret, c.slug as channel_slug
    into hook
  from public.project_webhooks pw
  join public.channels c on c.id = pw.command_channel_id
  where pw.command_channel_id = new.channel_id and pw.is_active
  limit 1;

  if hook.id is null or coalesce(hook.url, '') !~ '^https://' then
    return new;
  end if;

  select coalesce(nullif(display_name, ''), full_name, 'Someone') into author
  from public.profiles where id = new.user_id;

  perform net.http_post(
    url := hook.url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-ROP-Webhook-Secret', coalesce(hook.secret, ''),
      'X-ROP-Project', hook.project_name
    ),
    body := jsonb_build_object(
      'type', 'message.created',
      'project', hook.project_name,
      'command_channel_id', new.channel_id,
      'channel_slug', hook.channel_slug,
      'message_id', new.id,
      'user_id', new.user_id,
      'author', author,
      'text', new.body,
      'created_at', new.created_at
    )
  );

  update public.project_webhooks set last_delivery_at = now() where id = hook.id;
  return new;
end;
$$;

drop trigger if exists dispatch_command_to_project_aiu on public.messages;
create trigger dispatch_command_to_project_aiu
  after insert on public.messages
  for each row execute function public.dispatch_command_to_project();
