-- Enable pg_net for async HTTP calls from database triggers
create extension if not exists pg_net with schema net;

-- Helper: invoke the send-push-notification edge function
create or replace function public.notify_push(
  p_type text,
  p_record jsonb,
  p_old_record jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
  v_payload jsonb;
begin
  v_url := current_setting('app.settings.supabase_url', true)
    || '/functions/v1/send-push-notification';
  v_key := current_setting('app.settings.service_role_key', true);

  if v_url is null or v_key is null then
    raise warning 'Push notification settings not configured';
    return;
  end if;

  v_payload := jsonb_build_object(
    'type', p_type,
    'record', p_record,
    'old_record', p_old_record
  );

  perform net.http_post(
    url := v_url,
    body := v_payload,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 5000
  );
end;
$$;

-- Trigger: new chat message
create or replace function public.trigger_push_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_push('message', to_jsonb(NEW));
  return NEW;
end;
$$;

drop trigger if exists on_new_message_push on public.messages;
create trigger on_new_message_push
  after insert on public.messages
  for each row
  execute function public.trigger_push_new_message();

-- Trigger: assignment updated (assignee changed)
create or replace function public.trigger_push_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only fire when assignee actually changes
  if NEW.assignee_id is distinct from OLD.assignee_id then
    perform public.notify_push('assignment', to_jsonb(NEW), to_jsonb(OLD));
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_assignment_change_push on public.assignments;
create trigger on_assignment_change_push
  after update on public.assignments
  for each row
  execute function public.trigger_push_assignment_change();

-- Trigger: new feed post
create or replace function public.trigger_push_new_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_push('post', to_jsonb(NEW));
  return NEW;
end;
$$;

drop trigger if exists on_new_post_push on public.posts;
create trigger on_new_post_push
  after insert on public.posts
  for each row
  execute function public.trigger_push_new_post();
