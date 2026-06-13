-- Fas 0A #6 — flytta service-role-nyckeln från plaintext-GUC till Supabase Vault.
--
-- Före: notify_push läste current_setting('app.settings.service_role_key') (en
-- plaintext database-GUC, läsbar i pg_settings och loggar) och skickade den i
-- payload-headern. Ett DB/log-läckage = full service-role-access.
--
-- Efter: notify_push läser nyckeln ur vault.decrypted_secrets. En transitions-
-- fallback till den gamla GUC:en behålls TILLFÄLLIGT så push inte slutar funka
-- mellan migration och att Vault-secreten är satt. Ta bort fallbacken (och
-- reset:a GUC:en) när staging/prod verifierats:
--
--   alter database postgres reset "app.settings.service_role_key";
--
-- Sätt secreten en gång per miljö (staging_setup.sql gör detta för fresh staging):
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key',
--                              'Used by notify_push to authenticate the edge function');
--
-- OBS: edge-funktionen (supabase/functions/send-push-notification/index.ts:208)
-- sträng-jämför inkommande Bearer-token mot SUPABASE_SERVICE_ROLE_KEY. Vault-
-- secreten MÅSTE därför matcha edge-env exakt, annars returnerar funktionen 401
-- och ALL push tystnar utan användarsynligt fel. Verifiera push end-to-end på
-- staging efter att secreten satts.

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

  -- Primärt: läs ur Vault.
  begin
    select decrypted_secret
      into v_key
      from vault.decrypted_secrets
      where name = 'service_role_key'
      limit 1;
  exception when others then
    v_key := null;
  end;

  -- Transitions-fallback: gamla plaintext-GUC:en (tas bort efter verifiering).
  if v_key is null then
    v_key := current_setting('app.settings.service_role_key', true);
  end if;

  if v_url is null or v_key is null then
    raise warning 'Push notification settings not configured (no vault secret named service_role_key and no app.settings.service_role_key GUC)';
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
