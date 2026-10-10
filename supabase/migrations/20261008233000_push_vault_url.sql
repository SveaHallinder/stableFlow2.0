-- PROPOSED ONLY. Same notify_push contract and ACL; adds a Vault project-URL fallback.
begin;

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
  v_url := nullif(current_setting('app.settings.supabase_url', true), '');
  if v_url is null then
    begin
      select nullif(decrypted_secret, '') into v_url
      from vault.decrypted_secrets where name = 'supabase_url' limit 1;
    exception when others then
      v_url := null;
    end;
  end if;
  if v_url is not null then
    v_url := v_url || '/functions/v1/send-push-notification';
  end if;

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
    raise warning '[push notify] Project URL or service key is missing; no push request was queued';
    return;
  end if;

  v_payload := jsonb_build_object(
    'request_id', gen_random_uuid(),
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

revoke all on function public.notify_push(text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.notify_push(text,jsonb,jsonb) to service_role;

commit;
