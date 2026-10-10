-- REVIEW PROPOSAL ONLY. NOT APPROVED, NOT RUN, NEVER AUTO-RUN FROM BUILD/TEST.
-- Requires integrated care UI/source + exact green CI, approved/applied care delta,
-- deployed reviewed care-reminders worker, separately approved pg_cron installation,
-- existing pg_net/Vault, and separately approved public supabase_url configuration.
-- Does not create extensions/keys/URLs/accounts/plans or replace an existing job.
begin;
do $configuration$
declare
  v_url text;
begin
  if not exists(select 1 from pg_extension where extname='pg_cron')
    or not exists(select 1 from pg_extension where extname='pg_net') then
    raise exception using errcode='55000',message='[care reminder] Required scheduler extensions are missing';
  end if;
  if to_regprocedure('public.care_reminder_claim_due(integer)') is null
    or to_regprocedure('public.care_reminder_finish(uuid,uuid,uuid,text)') is null then
    raise exception using errcode='55000',message='[care reminder] Reviewed care RPCs are missing';
  end if;
  if (select count(*) from vault.secrets where name='supabase_url')<>1
    or (select count(*) from vault.secrets where name='service_role_key')<>1 then
    raise exception using errcode='55000',message='[care reminder] Exactly one reviewed URL and service key reference are required';
  end if;
  v_url := (select decrypted_secret from vault.decrypted_secrets where name='supabase_url');
  if v_url is distinct from 'https://zbcghmpjslasnxqcodqa.supabase.co' then
    raise exception using errcode='55000',message='[care reminder] Project URL differs from the reviewed project';
  end if;
  if exists(select 1 from cron.job where jobname='stableflow-care-reminders-09-stockholm') then
    raise exception using errcode='55000',message='[care reminder] Review existing job before replacement';
  end if;
end;
$configuration$;
-- Every minute checks due_at (09 Europe/Stockholm, including DST) on the DB.
-- Persist only names and the fixed public URL in the job; no service-key value.
select cron.schedule('stableflow-care-reminders-09-stockholm','* * * * *',$job$
  do $care_invocation$
  declare
    v_url text;
    v_key text;
  begin
    if (select count(*) from vault.secrets where name='supabase_url')<>1
      or (select count(*) from vault.secrets where name='service_role_key')<>1 then
      raise exception using errcode='55000',message='[care reminder] Reviewed Vault references are missing or duplicated';
    end if;
    v_url := (select decrypted_secret from vault.decrypted_secrets where name='supabase_url');
    if v_url is distinct from 'https://zbcghmpjslasnxqcodqa.supabase.co' then
      raise exception using errcode='55000',message='[care reminder] Project URL differs from the reviewed project';
    end if;
    v_key := (select decrypted_secret from vault.decrypted_secrets where name='service_role_key');
    if nullif(btrim(v_key),'') is null then
      raise exception using errcode='55000',message='[care reminder] Service key is unavailable';
    end if;
    perform net.http_post(
      url := v_url || '/functions/v1/care-reminders',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  end;
  $care_invocation$;
$job$);
commit;
