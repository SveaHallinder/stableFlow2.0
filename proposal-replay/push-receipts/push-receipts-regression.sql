-- Rollback-only actual RPC/ACL/CAS tests; all identifiers and strings fictional.
-- Prerequisites: fixture-auth-net.sql, complete b0b5ee71 schema.sql, then the
-- exact schema-append.sql. Runner owns the isolated DB; never Hosted/provider.
\set ON_ERROR_STOP on
begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
do $$begin
  if current_setting('stableflow.test_fixture',true) is distinct from 'push_receipts' then
    raise exception '[push receipts fixture] Explicit isolated fixture marker is required.';
  end if;
end$$;
create function pg_temp.pid(value text) returns uuid language sql immutable
as $$select md5('stableflow-push-receipts-fiction-' || value)::uuid$$;
create temporary table push_test_results(label text primary key);
create temporary table push_test_receipts(label text primary key,receipt jsonb);
grant select,insert,update on pg_temp.push_test_results,pg_temp.push_test_receipts to authenticated,anon,service_role;
create function pg_temp.check_ok(label text,predicate boolean) returns text language plpgsql as $$
begin
  if predicate is distinct from true then raise exception 'FAIL %',label; end if;
  insert into pg_temp.push_test_results values(label);
  return 'PASS ' || label;
end;
$$;
create function pg_temp.check_error(label text,statement text,expected_code text,expected_message text default '')
returns text language plpgsql as $$
declare actual_code text; actual_message text;
begin
  begin execute statement;
  exception when others then get stacked diagnostics actual_code=returned_sqlstate,actual_message=message_text;
  end;
  if actual_code is distinct from expected_code or position(expected_message in coalesce(actual_message,''))=0 then
    raise exception 'FAIL %: expected %, got %',label,expected_code,coalesce(actual_code,'success');
  end if;
  insert into pg_temp.push_test_results values(label);
  return 'PASS ' || label;
end;
$$;
-- Deliberately uses SELECT-only public token privileges; no private table grant.
create function pg_temp.registrations(names text[]) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('position',u.ordinality-1,'token_id',t.id,
    'user_id',t.user_id,'registration_generation',t.registration_generation) order by u.ordinality),'[]'::jsonb)
  from unnest(names) with ordinality u(name,ordinality)
  join public.push_tokens t on t.id=pg_temp.pid(u.name)
$$;
grant select,insert,update,delete on public.push_tokens to authenticated;
grant select on public.push_tokens to service_role;
select push_fixture.synthetic_auth_user(pg_temp.pid('owner-a'));
select push_fixture.synthetic_auth_user(pg_temp.pid('owner-b'));
insert into public.push_tokens(id,user_id,token,platform,registration_generation) values
  (pg_temp.pid('a1'),pg_temp.pid('owner-a'),'fiction-shared-device-token','ios',pg_temp.pid('untrusted-old-generation')),
  (pg_temp.pid('a2'),pg_temp.pid('owner-a'),'fiction-other-device-token','android',pg_temp.pid('untrusted-old-generation')),
  (pg_temp.pid('b1'),pg_temp.pid('owner-b'),'fiction-shared-device-token','ios',pg_temp.pid('untrusted-old-generation'));
insert into public.push_tokens(id,user_id,token,platform)
  select pg_temp.pid(n),pg_temp.pid('owner-a'),'fiction-token-'||n,'ios' from unnest(array['a4','a5','a6','a7','a8','a9','a10']) n;
select pg_temp.check_ok('DB ignores supplied generation on INSERT',not exists(select 1 from public.push_tokens
  where registration_generation=pg_temp.pid('untrusted-old-generation')));
insert into pg_temp.push_test_receipts values('original-a2-generation',
  (select to_jsonb(registration_generation) from public.push_tokens where id=pg_temp.pid('a2')));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid('owner-a')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into public.push_tokens(user_id,token,platform,updated_at,registration_generation)
  values(pg_temp.pid('owner-a'),'fiction-other-device-token','android','2000-01-01',pg_temp.pid('untrusted-old-generation'))
  on conflict(user_id,token) do update set platform=excluded.platform,updated_at=excluded.updated_at,
    registration_generation=excluded.registration_generation;
select pg_temp.check_ok('existing frontend-shaped upsert rotates generation and retains row identity',
  (select id=pg_temp.pid('a2') and to_jsonb(registration_generation)<>(select receipt from pg_temp.push_test_receipts
    where label='original-a2-generation') and registration_generation<>pg_temp.pid('untrusted-old-generation')
    from public.push_tokens where id=pg_temp.pid('a2')));
insert into pg_temp.push_test_receipts values('upsert-generation',
  (select to_jsonb(registration_generation) from public.push_tokens where id=pg_temp.pid('a2')));
update public.push_tokens set registration_generation=(select (receipt#>>'{}')::uuid from pg_temp.push_test_receipts
  where label='original-a2-generation') where id=pg_temp.pid('a2');
select pg_temp.check_ok('client UPDATE cannot restore an old generation',
  (select to_jsonb(registration_generation)<>(select receipt from pg_temp.push_test_receipts where label='original-a2-generation')
    and to_jsonb(registration_generation)<>(select receipt from pg_temp.push_test_receipts where label='upsert-generation')
    from public.push_tokens where id=pg_temp.pid('a2')));
select pg_temp.check_error('authenticated cannot dispatch notify_push',
  $$select public.notify_push('assignment','{}'::jsonb,null)$$,'42501');
select pg_temp.check_error('authenticated cannot reserve attempts',
  $$select public.push_receipts_prepare(pg_temp.pid('denied'),'[]')$$,'42501');
select pg_temp.check_error('authenticated cannot read ledger',
  $$select * from private.push_delivery_tickets$$,'42501');
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.check_error('anon cannot dispatch notify_push',
  $$select public.notify_push('message','{}'::jsonb,null)$$,'42501');
select pg_temp.check_error('anon cannot finalize receipts',
  $$select public.push_receipts_apply(pg_temp.pid('denied'),'[]')$$,'42501');
reset role;
select pg_temp.check_ok('client dispatch denial happens before synthetic HTTP',
  not exists(select 1 from net.fixture_http_calls));
select pg_temp.check_ok('raw tables deny all API roles',not exists(select 1
  from unnest(array['authenticated','anon','service_role']) r,
       unnest(array['private.push_delivery_attempts','private.push_delivery_tickets']) t
  where has_table_privilege(r,t,'SELECT,INSERT,UPDATE,DELETE')));
select pg_temp.check_ok('exact four service-only RPCs use fixed definer context',
  (select count(*)=4 from pg_proc p where p.oid=any(array[
    'public.push_receipts_prepare(uuid,jsonb)'::regprocedure,'public.push_receipts_record_tickets(uuid,jsonb)'::regprocedure,
    'public.push_receipts_claim_due(uuid,integer)'::regprocedure,'public.push_receipts_apply(uuid,jsonb)'::regprocedure])
    and p.prosecdef and p.proconfig @> array['search_path=pg_catalog','row_security=off'])
  and not exists(select 1 from unnest(array['authenticated','anon']) r,
    unnest(array['public.push_receipts_prepare(uuid,jsonb)','public.push_receipts_record_tickets(uuid,jsonb)',
      'public.push_receipts_claim_due(uuid,integer)','public.push_receipts_apply(uuid,jsonb)']) f
    where has_function_privilege(r,f,'EXECUTE'))
  and not has_function_privilege('service_role','private.retire_push_registration(uuid,uuid,uuid,timestamptz)','EXECUTE'));
select pg_temp.check_ok('ledger contains no raw token/message/profile columns',not exists(select 1 from information_schema.columns
  where table_schema='private' and table_name in ('push_delivery_attempts','push_delivery_tickets')
    and column_name in ('token','body','title','profile','full_name','email')));

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.check_error('service cannot read raw ledger',
  $$select * from private.push_delivery_attempts$$,'42501');
select pg_temp.check_error('missing worker fails closed',
  $$select public.push_receipts_claim_due(null,1000)$$,'22023','[push receipts]');
select pg_temp.check_error('claim limit is bounded',
  $$select public.push_receipts_claim_due(pg_temp.pid('worker'),1001)$$,'22023','[push receipts]');
select pg_temp.check_error('malformed registration object fails with safe category',
  $$select public.push_receipts_prepare(pg_temp.pid('bad-array'),'[1]'::jsonb)$$,'22023','[push receipts]');
select pg_temp.check_error('noncontiguous reservation positions fail closed',
  $$select public.push_receipts_prepare(pg_temp.pid('bad-positions'),jsonb_set(pg_temp.registrations(array['a1']),'{0,position}','2'))$$,
  '22023','[push receipts]');
select pg_temp.check_error('wrong owner snapshot fails closed',
  $$select public.push_receipts_prepare(pg_temp.pid('bad-owner'),jsonb_set(pg_temp.registrations(array['a1']),
    '{0,user_id}',to_jsonb(pg_temp.pid('owner-b')::text)))$$,'23514','[push receipts]');
select pg_temp.check_error('old generation snapshot fails closed',
  $$select public.push_receipts_prepare(pg_temp.pid('bad-generation'),jsonb_set(pg_temp.registrations(array['a1']),
    '{0,registration_generation}',to_jsonb(pg_temp.pid('untrusted-old-generation')::text)))$$,'23514','[push receipts]');

select pg_temp.check_error('prepare recipient array is bounded',
  $$select public.push_receipts_prepare(pg_temp.pid('overbound'),
    (select jsonb_agg(jsonb_build_object('position',i,'token_id',pg_temp.pid('a1'),'user_id',pg_temp.pid('owner-a'),
      'registration_generation',pg_temp.pid('placeholder'))) from generate_series(0,10000) i))$$,
  '22023','[push receipts]');
select pg_temp.check_error('ticket batch is bounded',
  $$select public.push_receipts_record_tickets(pg_temp.pid('unreserved'),
    (select jsonb_agg(jsonb_build_object('position',i,'status','unknown','ticket_id',null,'error_code',null))
      from generate_series(0,100) i))$$,'22023','[push receipts]');

insert into pg_temp.push_test_receipts values('main-prepare',
  public.push_receipts_prepare(pg_temp.pid('main'),pg_temp.registrations(array['a1','a2','b1'])));
select pg_temp.check_ok('new request consumes all targets before dispatch',
  (select receipt=jsonb_build_object('attempt_id',pg_temp.pid('main'),'started',true) from pg_temp.push_test_receipts where label='main-prepare'));
select pg_temp.check_ok('duplicate changed input never rearms request',
  public.push_receipts_prepare(pg_temp.pid('main'),null)=jsonb_build_object('attempt_id',pg_temp.pid('main'),'started',false));
insert into pg_temp.push_test_receipts values('empty-prepare',public.push_receipts_prepare(pg_temp.pid('empty'),'[]'));
select pg_temp.check_ok('empty target set is also permanently reserved',
  (select (receipt->>'started')::boolean from pg_temp.push_test_receipts where label='empty-prepare')
  and public.push_receipts_prepare(pg_temp.pid('empty'),pg_temp.registrations(array['a1']))->'started'='false'::jsonb);
reset role;
select pg_temp.check_ok('prepare stores only frozen unknown slots and no partial invalid attempts',
  (select count(*)=3 and bool_and(ticket_status='unknown' and ticket_id is null and ticket_recorded_at is null)
    from private.push_delivery_tickets where attempt_id=pg_temp.pid('main'))
  and not exists(select 1 from private.push_delivery_attempts where attempt_id=any(array[
    pg_temp.pid('bad-owner'),pg_temp.pid('bad-generation'),pg_temp.pid('bad-positions')])));

insert into pg_temp.push_test_receipts values('mixed-results','[
 {"position":0,"status":"ticket_error","ticket_id":null,"error_code":"DeviceNotRegistered"},
 {"position":1,"status":"accepted","ticket_id":"fiction-main-ticket","error_code":null},
 {"position":2,"status":"unknown","ticket_id":null,"error_code":null}]'::jsonb);
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.check_ok('mixed outcomes persist together',public.push_receipts_record_tickets(pg_temp.pid('main'),
  (select receipt from pg_temp.push_test_receipts where label='mixed-results'))=jsonb_build_object('attempt_id',pg_temp.pid('main'),'recorded_count',3));
select pg_temp.check_ok('same final ticket outcomes replay idempotently',public.push_receipts_record_tickets(pg_temp.pid('main'),
  (select receipt from pg_temp.push_test_receipts where label='mixed-results'))=jsonb_build_object('attempt_id',pg_temp.pid('main'),'recorded_count',3));
select pg_temp.check_error('changed acknowledgement cannot replace accepted ticket',
  $$select public.push_receipts_record_tickets(pg_temp.pid('main'),
    '[{"position":1,"status":"accepted","ticket_id":"changed-fiction-ticket","error_code":null}]')$$,
  '40001','[push receipts]');
select pg_temp.check_error('unknown can never request DNR deletion',
  $$select public.push_receipts_record_tickets(pg_temp.pid('main'),
    '[{"position":2,"status":"unknown","ticket_id":null,"error_code":"DeviceNotRegistered"}]')$$,
  '22023','[push receipts]');
select pg_temp.check_ok('first receipt check waits fifteen minutes',
  public.push_receipts_claim_due(pg_temp.pid('worker'),1000)->'items'='[]'::jsonb);
reset role;
select pg_temp.check_ok('direct DNR deletes exact registration and preserves shared-string peer/other device',
  not exists(select 1 from public.push_tokens where id=pg_temp.pid('a1'))
  and (select count(*)=2 from public.push_tokens where id=any(array[pg_temp.pid('a2'),pg_temp.pid('b1')])));
select pg_temp.check_ok('DB clock binds check and conservative expiry',exists(select 1
  from private.push_delivery_tickets t join private.push_delivery_attempts a using(attempt_id)
  where t.attempt_id=pg_temp.pid('main') and t.position=1
    and next_check_at=ticket_recorded_at+interval '15 minutes' and expires_at=a.created_at+interval '24 hours'));

-- Both immediate and receipt DNR must preserve a same-ID fresh registration.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.push_receipts_prepare(pg_temp.pid('reregister-direct'),pg_temp.registrations(array['a4']));
select public.push_receipts_prepare(pg_temp.pid('reregister-receipt'),pg_temp.registrations(array['a5']));
select public.push_receipts_record_tickets(pg_temp.pid('reregister-receipt'),
  '[{"position":0,"status":"accepted","ticket_id":"fiction-reregister-ticket","error_code":null}]');
reset role;
update public.push_tokens set updated_at=clock_timestamp() where id=any(array[pg_temp.pid('a4'),pg_temp.pid('a5')]);
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.push_receipts_record_tickets(pg_temp.pid('reregister-direct'),
  '[{"position":0,"status":"ticket_error","ticket_id":null,"error_code":"DeviceNotRegistered"}]');
reset role;
select pg_temp.check_ok('old direct DNR cannot remove new registration',exists(select 1 from public.push_tokens where id=pg_temp.pid('a4')));
select pg_temp.check_error('expired internal deadline fails before token deletion',
  $$select private.retire_push_registration(pg_temp.pid('a4'),pg_temp.pid('owner-a'),
    (select registration_generation from public.push_tokens where id=pg_temp.pid('a4')),clock_timestamp()-interval '1 second')$$,
  '40001','[push receipts] Lease deadline expired before token cleanup.');
select pg_temp.check_ok('expired internal deadline preserves exact registration',
  exists(select 1 from public.push_tokens where id=pg_temp.pid('a4')));
update private.push_delivery_tickets set next_check_at=clock_timestamp()-interval '1 second' where attempt_id=pg_temp.pid('reregister-receipt');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into pg_temp.push_test_receipts values('reregister-claim',public.push_receipts_claim_due(pg_temp.pid('worker'),1000));
select pg_temp.check_ok('old receipt DNR acknowledges error but deletes zero fresh tokens',
  public.push_receipts_apply((select (receipt->>'lease_id')::uuid from pg_temp.push_test_receipts where label='reregister-claim'),
    jsonb_build_array(jsonb_build_object('attempt_id',pg_temp.pid('reregister-receipt'),'position',0,'ticket_id','fiction-reregister-ticket',
      'status','receipt_error','error_code','DeviceNotRegistered')))->'deleted_token_count'='0'::jsonb);
reset role;
select pg_temp.check_ok('same token row remains after old receipt DNR',exists(select 1 from public.push_tokens where id=pg_temp.pid('a5')));

-- Successful and non-DNR provider receipts keep token registrations.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.push_receipts_prepare(pg_temp.pid('terminal'),pg_temp.registrations(array['a6','a7']));
select public.push_receipts_record_tickets(pg_temp.pid('terminal'),
  '[{"position":0,"status":"accepted","ticket_id":"fiction-ok-ticket","error_code":null},
    {"position":1,"status":"accepted","ticket_id":"fiction-other-error-ticket","error_code":null}]');
reset role;
update private.push_delivery_tickets set next_check_at=clock_timestamp()-interval '1 second' where attempt_id=pg_temp.pid('terminal');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into pg_temp.push_test_receipts values('terminal-claim',public.push_receipts_claim_due(pg_temp.pid('worker'),1000));
select pg_temp.check_error('partial collector cannot consume its lease',
  $$select public.push_receipts_apply((select (receipt->>'lease_id')::uuid from pg_temp.push_test_receipts where label='terminal-claim'),
    jsonb_build_array(jsonb_build_object('attempt_id',pg_temp.pid('terminal'),'position',0,'ticket_id','fiction-ok-ticket',
      'status','receipt_ok','error_code',null)))$$,
  '40001','[push receipts]');
insert into pg_temp.push_test_receipts values('terminal-ack',public.push_receipts_apply(
  (select (receipt->>'lease_id')::uuid from pg_temp.push_test_receipts where label='terminal-claim'),
  jsonb_build_array(jsonb_build_object('attempt_id',pg_temp.pid('terminal'),'position',0,'ticket_id','fiction-ok-ticket','status','receipt_ok','error_code',null),
    jsonb_build_object('attempt_id',pg_temp.pid('terminal'),'position',1,'ticket_id','fiction-other-error-ticket','status','receipt_error','error_code','InvalidCredentials'))));
select pg_temp.check_ok('terminal summary exposes only exact counts',
  (select (receipt->>'applied_count')::integer=2 and (receipt->>'receipt_ok_count')::integer=1
    and (receipt->>'receipt_error_count')::integer=1 and (receipt->>'deleted_token_count')::integer=0
    and receipt - array['lease_id','applied_count','receipt_ok_count','receipt_error_count','missing_count','deleted_token_count']='{}'::jsonb
    from pg_temp.push_test_receipts where label='terminal-ack'));
select pg_temp.check_ok('ticket acknowledgement replay remains valid after final receipt',
  public.push_receipts_record_tickets(pg_temp.pid('terminal'),
  '[{"position":0,"status":"accepted","ticket_id":"fiction-ok-ticket","error_code":null},
    {"position":1,"status":"accepted","ticket_id":"fiction-other-error-ticket","error_code":null}]')->'recorded_count'='2'::jsonb);
reset role;
select pg_temp.check_ok('receipt ok and non-DNR error preserve both devices',
  (select count(*)=2 from public.push_tokens where id=any(array[pg_temp.pid('a6'),pg_temp.pid('a7')])));

-- Missing receipts, expired/replaced leases and exact tuple binding.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.push_receipts_prepare(pg_temp.pid('missing'),pg_temp.registrations(array['a8']));
select public.push_receipts_record_tickets(pg_temp.pid('missing'),
  '[{"position":0,"status":"accepted","ticket_id":"fiction-missing-ticket","error_code":null}]');
reset role;
update private.push_delivery_tickets set next_check_at=clock_timestamp()-interval '1 second' where attempt_id=pg_temp.pid('missing');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into pg_temp.push_test_receipts values('missing-claim',public.push_receipts_claim_due(pg_temp.pid('worker'),1000));
select pg_temp.check_error('mismatched ticket cannot finalize or delete',
  $$select public.push_receipts_apply((select (receipt->>'lease_id')::uuid from pg_temp.push_test_receipts where label='missing-claim'),
    jsonb_build_array(jsonb_build_object('attempt_id',pg_temp.pid('missing'),'position',0,'ticket_id','fiction-wrong-ticket',
      'status','receipt_error','error_code','DeviceNotRegistered')))$$,'40001','[push receipts]');
select pg_temp.check_ok('missing receipt is explicit and never a successful delivery',
  public.push_receipts_apply((select (receipt->>'lease_id')::uuid from pg_temp.push_test_receipts where label='missing-claim'),
    jsonb_build_array(jsonb_build_object('attempt_id',pg_temp.pid('missing'),'position',0,'ticket_id','fiction-missing-ticket',
      'status','missing','error_code',null)))->'missing_count'='1'::jsonb);
reset role;
select pg_temp.check_ok('missing receipt reschedules fifteen minutes without clearing token',
  exists(select 1 from private.push_delivery_tickets where attempt_id=pg_temp.pid('missing')
    and receipt_status='pending' and next_check_at=receipt_checked_at+interval '15 minutes' and lease_id is null)
  and exists(select 1 from public.push_tokens where id=pg_temp.pid('a8')));
update private.push_delivery_tickets set next_check_at=clock_timestamp()-interval '1 second' where attempt_id=pg_temp.pid('missing');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into pg_temp.push_test_receipts values('old-lease',public.push_receipts_claim_due(pg_temp.pid('worker-a'),1000));
reset role;
update private.push_delivery_tickets set lease_expires_at=clock_timestamp()-interval '1 second',
  next_check_at=clock_timestamp()-interval '1 second' where attempt_id=pg_temp.pid('missing');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into pg_temp.push_test_receipts values('new-lease',public.push_receipts_claim_due(pg_temp.pid('worker-b'),1000));
select pg_temp.check_error('expired replaced collector cannot delete',
  $$select public.push_receipts_apply((select (receipt->>'lease_id')::uuid from pg_temp.push_test_receipts where label='old-lease'),
    jsonb_build_array(jsonb_build_object('attempt_id',pg_temp.pid('missing'),'position',0,'ticket_id','fiction-missing-ticket',
      'status','receipt_error','error_code','DeviceNotRegistered')))$$,'40001','[push receipts]');
select pg_temp.check_ok('current exact lease DNR deletes precisely one registration',
  public.push_receipts_apply((select (receipt->>'lease_id')::uuid from pg_temp.push_test_receipts where label='new-lease'),
    jsonb_build_array(jsonb_build_object('attempt_id',pg_temp.pid('missing'),'position',0,'ticket_id','fiction-missing-ticket',
      'status','receipt_error','error_code','DeviceNotRegistered')))->'deleted_token_count'='1'::jsonb);
reset role;
select pg_temp.check_ok('exact receipt deletion preserves other user and devices',
  not exists(select 1 from public.push_tokens where id=pg_temp.pid('a8'))
  and (select count(*)=3 from public.push_tokens where id=any(array[pg_temp.pid('b1'),pg_temp.pid('a6'),pg_temp.pid('a7')])));

-- Unknown provider/persist outcome and never-sent later slots expire without
-- resend or token cleanup. Owner-only timestamp rewrites simulate elapsed time.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.push_receipts_prepare(pg_temp.pid('expiry'),pg_temp.registrations(array['a9','a10']));
select public.push_receipts_record_tickets(pg_temp.pid('expiry'),
  '[{"position":0,"status":"accepted","ticket_id":"fiction-expiry-ticket","error_code":null}]');
reset role;
update private.push_delivery_tickets set expires_at=clock_timestamp()-interval '1 second',
  next_check_at=case when ticket_status='accepted' then clock_timestamp()-interval '1 second' else null end
  where attempt_id=pg_temp.pid('expiry');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.check_ok('expired unknowns are not sent to provider by collector',
  public.push_receipts_claim_due(pg_temp.pid('worker'),1000)->'items'='[]'::jsonb);
select pg_temp.check_ok('expiry never rearms original request',
  public.push_receipts_prepare(pg_temp.pid('expiry'),pg_temp.registrations(array['a9','a10']))->'started'='false'::jsonb);
reset role;
select pg_temp.check_ok('unknown expiry preserves registrations and records uncertainty',
  (select count(*)=2 and bool_and(receipt_status='expired_unknown') from private.push_delivery_tickets where attempt_id=pg_temp.pid('expiry'))
  and (select count(*)=2 from public.push_tokens where id=any(array[pg_temp.pid('a9'),pg_temp.pid('a10')])));

-- Service dispatch and owner-definer trigger calls preserve the old payload,
-- auth header, URL and timeout contract, adding only a DB-generated request_id.
select set_config('app.settings.supabase_url','https://push-fixture.invalid',true);
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select public.notify_push('assignment','{"id":"fiction-record"}'::jsonb,'{"assignee_id":null}'::jsonb);
reset role;
select pg_temp.check_ok('service notify_push adds only UUID request identity',
  (select count(*)=1 and bool_and(body - 'request_id'=jsonb_build_object('type','assignment','record','{"id":"fiction-record"}'::jsonb,
    'old_record','{"assignee_id":null}'::jsonb) and (body->>'request_id')::uuid is not null
    and url='https://push-fixture.invalid/functions/v1/send-push-notification'
    and timeout_milliseconds=5000 and headers=jsonb_build_object('Authorization','Bearer fixture-only-not-a-credential','Content-Type','application/json'))
  from net.fixture_http_calls));
create function push_fixture.owner_trigger_dispatch() returns void language plpgsql security definer set search_path=pg_catalog as $$
begin perform public.notify_push('message','{"id":"fiction-owner-trigger"}'::jsonb,null); end;
$$;
grant execute on function push_fixture.owner_trigger_dispatch() to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select push_fixture.owner_trigger_dispatch();
reset role;
select pg_temp.check_ok('same owner definer path can still dispatch after client execute revocation',
  (select count(*)=2 and count(distinct(body->>'request_id'))=2 from net.fixture_http_calls));
-- This tests PG grants/definer semantics with net.http_post stub, not real
-- Supabase JWT verification, Vault permissions, pg_net delivery or Hosted DDL.

select push_fixture.synthetic_auth_delete(pg_temp.pid('owner-a'));
select pg_temp.check_ok('user FK cascade removes own ledger slots and preserves peer state',
  not exists(select 1 from private.push_delivery_tickets where user_id=pg_temp.pid('owner-a'))
  and exists(select 1 from private.push_delivery_tickets where user_id=pg_temp.pid('owner-b'))
  and exists(select 1 from public.push_tokens where id=pg_temp.pid('b1')));
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.check_ok('account cascade cannot rearm consumed request identity',
  public.push_receipts_prepare(pg_temp.pid('main'),'[]')->'started'='false'::jsonb);
reset role;
select count(*)::text || ' push receipt SQL checks passed (synthetic fixture only)' from pg_temp.push_test_results;
rollback;
