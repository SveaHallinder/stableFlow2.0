-- GRANSKNINGSFÖRSLAG: inte godkänt eller installerat.
-- Kräver uttryckligt godkännande enligt användarens AGENTS.md.
-- Ersätter INTE drift automatiskt. Installera inte den äldre leveransmigrationen.
-- Vault-hemligheten invite_service_role_key konfigureras separat.
-- Ingen nyckel ska sparas i en databas-GUC eller i Git.
-- Det separata Vault-namnet aktiverar inte befintliga pushutskick.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.stable_invites in share row exclusive mode;

do $$
begin
  if to_regprocedure('public.notify_invite(jsonb)') is not null
    or to_regprocedure('public.trigger_invite_created()') is not null
    or exists (select 1 from pg_trigger where tgrelid = 'public.stable_invites'::regclass
      and tgname = 'on_invite_created' and not tgisinternal) then
    raise exception '[invite email] Leveransfunktion finns redan; granska driftdefinitionen innan installation.';
  end if;
end;
$$;

create function public.notify_invite(p_record jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_url text;
  v_key text;
begin
  -- Privilegierad Authorization får aldrig skickas till en anroparstyrd URL.
  -- Förslaget gäller endast detta verifierade Supabaseprojekt.
  v_url := 'https://zbcghmpjslasnxqcodqa.supabase.co/functions/v1/send-invite';
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets
      where name = 'invite_service_role_key' limit 1;
  exception when others then
    v_key := null;
  end;
  if v_url is null or nullif(v_key, '') is null then
    raise warning '[invite email] Leverans saknar Vault-konfiguration.';
    return;
  end if;
  begin
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('type', 'invite', 'record', p_record),
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key,
        'Content-Type', 'application/json'),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning '[invite email] Kunde inte köa leverans (SQLSTATE %).', sqlstate;
  end;
end;
$$;

create function public.trigger_invite_created()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if NEW.email is not null and NEW.accepted_at is null then
    perform public.notify_invite(to_jsonb(NEW));
  end if;
  return NEW;
end;
$$;

alter function public.notify_invite(jsonb) owner to postgres;
alter function public.trigger_invite_created() owner to postgres;
revoke all on function public.notify_invite(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.trigger_invite_created() from public, anon, authenticated, service_role;

create trigger on_invite_created after insert on public.stable_invites
  for each row execute function public.trigger_invite_created();
commit;
