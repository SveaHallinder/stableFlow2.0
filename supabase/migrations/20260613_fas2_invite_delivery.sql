-- Fas 2 — invite-leverans: maila inbjudan när en rad skapas i stable_invites.
--
-- Mirror av notify_push: läser supabase_url (GUC) + service-role-nyckel (Vault, med
-- GUC-fallback i transition) och POST:ar inbjudningsraden till send-invite-edge-
-- funktionen. Edge-funktionen är säker att deploya utan RESEND_API_KEY (no-op + 200),
-- så invite-skapande aldrig faltar bara för att e-post inte är konfigurerat än.

create or replace function public.notify_invite(p_record jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  v_url := current_setting('app.settings.supabase_url', true)
    || '/functions/v1/send-invite';

  begin
    select decrypted_secret
      into v_key
      from vault.decrypted_secrets
      where name = 'service_role_key'
      limit 1;
  exception when others then
    v_key := null;
  end;

  if v_key is null then
    v_key := current_setting('app.settings.service_role_key', true);
  end if;

  if v_url is null or v_key is null then
    raise warning 'Invite delivery not configured (missing supabase_url or service_role_key)';
    return;
  end if;

  -- Aldrig låta en leverans-/enqueue-miss abortera själva invite-inserten.
  begin
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('type', 'invite', 'record', p_record),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type', 'application/json'
      ),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'notify_invite: kunde inte köa e-post (%).', sqlerrm;
  end;
end;
$$;

create or replace function public.trigger_invite_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skicka bara för inbjudningar med e-post som ännu inte accepterats.
  if NEW.email is not null and NEW.accepted_at is null then
    perform public.notify_invite(to_jsonb(NEW));
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_invite_created on public.stable_invites;
create trigger on_invite_created
  after insert on public.stable_invites
  for each row
  execute function public.trigger_invite_created();
