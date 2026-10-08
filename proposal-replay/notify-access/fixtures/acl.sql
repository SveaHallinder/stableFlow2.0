-- Restrict existing server push dispatch; no function body or user rows change.
-- Preflight metadata verified in StableFlow on 2026-10-08. Recheck in transaction.
begin;
do $preflight$
declare target oid := to_regprocedure('public.notify_push(text,jsonb,jsonb)');
begin
  if target is null or not exists (
    select 1 from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid=target and p.prosecdef and r.rolname='postgres'
  ) then
    raise exception '[push access] Expected postgres-owned SECURITY DEFINER notify_push function is missing.';
  end if;
  if (select count(*) from pg_proc p join pg_roles r on r.oid=p.proowner
      where p.pronamespace='public'::regnamespace
        and p.proname in ('trigger_push_assignment_change','trigger_push_new_message','trigger_push_new_post','trigger_push_new_stable_alert')
        and p.prosecdef and r.rolname='postgres'
        and strpos(pg_get_functiondef(p.oid),'notify_push')>0) <> 4 then
    raise exception '[push access] Expected four owner-run push triggers are missing or changed.';
  end if;
end
$preflight$;
revoke execute on function public.notify_push(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.notify_push(text,jsonb,jsonb) to service_role;
do $verify$
begin
  if has_function_privilege('anon','public.notify_push(text,jsonb,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.notify_push(text,jsonb,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.notify_push(text,jsonb,jsonb)','EXECUTE')
     or not has_function_privilege('postgres','public.notify_push(text,jsonb,jsonb)','EXECUTE') then
    raise exception '[push access] Push dispatch permissions failed verification.';
  end if;
end
$verify$;
commit;
