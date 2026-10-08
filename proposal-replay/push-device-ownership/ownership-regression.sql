-- SYNTHETIC ISOLATED FIXTURE ONLY. Run after prior receipt fixture/full schema/
-- schema-append and 20261008_push_device_ownership.sql. Entire proof rolls back.
\set ON_ERROR_STOP on
begin;
set local statement_timeout='30s';
do $$begin
  if current_setting('stableflow.test_fixture',true) is distinct from 'push_receipts' then
    raise exception '[push device fixture] Explicit isolated fixture required.';
  end if;
end$$;
create function pg_temp.pid(v text) returns uuid language sql immutable as $$select md5('fiction-push-device-'||v)::uuid$$;
create temporary table device_results(label text primary key);
create temporary table device_receipts(label text primary key,receipt jsonb);
grant select,insert,update on pg_temp.device_results,pg_temp.device_receipts to authenticated,anon,service_role;
create function pg_temp.ok(label text,predicate boolean) returns text language plpgsql as $$begin
  if predicate is distinct from true then raise exception 'FAIL %',label; end if;
  insert into pg_temp.device_results values(label); return 'PASS '||label;
end$$;
create function pg_temp.err(label text,statement text,code text,prefix text default '[push device]') returns text language plpgsql as $$
declare actual text; message text;
begin
  begin execute statement; exception when others then
    get stacked diagnostics actual=returned_sqlstate,message=message_text;
  end;
  if actual is distinct from code or position(prefix in coalesce(message,''))=0 then
    raise exception 'FAIL %: expected %, got %',label,code,coalesce(actual,'success');
  end if;
  insert into pg_temp.device_results values(label); return 'PASS '||label;
end$$;
create function pg_temp.tuples(names text[]) returns jsonb language sql as $$
 select coalesce(jsonb_agg(jsonb_build_object('token_id',id,'user_id',user_id,'registration_generation',registration_generation) order by id),'[]'::jsonb)
 from public.push_tokens where id=any(array(select (receipt->>'token_id')::uuid from pg_temp.device_receipts where label=any(names)))
$$;
create function pg_temp.reservations(names text[]) returns jsonb language sql as $$
 select coalesce(jsonb_agg(jsonb_build_object('position',ordinality-1,'token_id',r.receipt->>'token_id',
   'user_id',r.receipt->>'user_id','registration_generation',r.receipt->>'registration_generation') order by ordinality),'[]'::jsonb)
 from unnest(names) with ordinality n(label,ordinality) join pg_temp.device_receipts r using(label)
$$;
grant select,insert,update,delete on public.push_tokens to authenticated;
grant select on public.push_tokens to service_role;
select push_fixture.synthetic_auth_user(pg_temp.pid('A'));
select push_fixture.synthetic_auth_user(pg_temp.pid('B'));
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.err('anon cannot read a device epoch',$$select public.push_device_state('fiction-shared-token',pg_temp.pid('A'))$$,'42501','');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',pg_temp.pid('A')::text,true);
select pg_temp.err('expected UID is a fence and not caller identity',
 $$select public.push_device_state('fiction-shared-token',pg_temp.pid('B'))$$,'42501');
insert into pg_temp.device_receipts values('empty',public.push_device_state('fiction-shared-token',pg_temp.pid('A')));
select pg_temp.ok('state exposes only a UUID epoch and no peer identity',
 (select receipt-array['binding_generation']='{}'::jsonb and (receipt->>'binding_generation')::uuid is not null from pg_temp.device_receipts where label='empty'));
select pg_temp.ok('state cachemiss never rotates an existing epoch',
 public.push_device_state('fiction-shared-token',pg_temp.pid('A'))=(select receipt from pg_temp.device_receipts where label='empty'));
insert into pg_temp.device_receipts values('A1',public.push_device_claim('fiction-shared-token','ios',
 (select (receipt->>'binding_generation')::uuid from pg_temp.device_receipts where label='empty'),pg_temp.pid('A')));
select pg_temp.ok('claim binds actual caller and rotates both protected generations',
 (select receipt->>'user_id'=pg_temp.pid('A')::text and receipt->>'binding_generation'<>
 (select receipt->>'binding_generation' from pg_temp.device_receipts where label='empty')
 and (receipt->>'token_id')::uuid is not null and (receipt->>'registration_generation')::uuid is not null
 and receipt-array['user_id','token_id','registration_generation','binding_generation']='{}'::jsonb
 from pg_temp.device_receipts where label='A1'));
select pg_temp.err('lost claim acknowledgement cannot replay the old epoch',
 $$select public.push_device_claim('fiction-shared-token','ios',(select (receipt->>'binding_generation')::uuid from pg_temp.device_receipts where label='empty'),pg_temp.pid('A'))$$,'40001');
insert into pg_temp.device_receipts values('A-other',public.push_device_claim('fiction-other-device','android',
 (public.push_device_state('fiction-other-device',pg_temp.pid('A'))->>'binding_generation')::uuid,pg_temp.pid('A')));
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into pg_temp.device_receipts values('A-eligible',public.push_device_active_registrations(pg_temp.tuples(array['A1'])));
select public.push_receipts_prepare(pg_temp.pid('A-reserved-before-B'),pg_temp.reservations(array['A1']));
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',pg_temp.pid('B')::text,true);
insert into pg_temp.device_receipts values('B1',public.push_device_claim('fiction-shared-token','ios',
 (public.push_device_state('fiction-shared-token',pg_temp.pid('B'))->>'binding_generation')::uuid,pg_temp.pid('B')));
reset role;
select pg_temp.ok('claim transfers active ownership without deleting or inferring legacy owners',
 (select count(*)=2 from public.push_tokens where token='fiction-shared-token')
 and (select count(*)=1 from private.push_device_bindings where token_hash=sha256(convert_to('fiction-shared-token','UTF8')) and current_user_id=pg_temp.pid('B')));
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.ok('active eligibility excludes old account on the shared device',
 public.push_device_active_registrations(pg_temp.tuples(array['A1','B1']))->'registrations'=
 (select jsonb_build_array(jsonb_build_object('token_id',receipt->>'token_id','user_id',receipt->>'user_id',
 'registration_generation',receipt->>'registration_generation')) from pg_temp.device_receipts where label='B1'));
select pg_temp.err('prepare rejects a formerly eligible inactive tuple under binding lock',
 $$select public.push_receipts_prepare(pg_temp.pid('stale-prepare'),pg_temp.reservations(array['A1']))$$,'23514','[push receipts]');
reset role;
select pg_temp.ok('failed stale reservation leaves no partial attempt',not exists(select 1 from private.push_delivery_attempts where attempt_id=pg_temp.pid('stale-prepare')));
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',pg_temp.pid('A')::text,true);
select pg_temp.err('dispatched stale A claim cannot override B',
 $$select public.push_device_claim('fiction-shared-token','ios',(select (receipt->>'binding_generation')::uuid from pg_temp.device_receipts where label='A1'),pg_temp.pid('A'))$$,'40001');
select pg_temp.ok('stale A release confirms only its own UID and changes no peer',
 public.push_device_release('fiction-shared-token',(select (receipt->>'token_id')::uuid from pg_temp.device_receipts where label='A1'),
 (select (receipt->>'registration_generation')::uuid from pg_temp.device_receipts where label='A1'),
 (select (receipt->>'binding_generation')::uuid from pg_temp.device_receipts where label='A1'),pg_temp.pid('A'))=jsonb_build_object('user_id',pg_temp.pid('A'),'released',false));
insert into public.push_tokens(user_id,token,platform) values(pg_temp.pid('A'),'fiction-shared-token','ios')
 on conflict(user_id,token) do update set updated_at=clock_timestamp();
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.ok('late authenticated legacy A upsert remains inactive while B stays active',
 public.push_device_active_registrations(pg_temp.tuples(array['A1','B1']))->'registrations'=
 (select jsonb_build_array(jsonb_build_object('token_id',receipt->>'token_id','user_id',receipt->>'user_id',
 'registration_generation',receipt->>'registration_generation')) from pg_temp.device_receipts where label='B1'));
select pg_temp.ok('old A DNR never clears the B binding',
 public.push_receipts_record_tickets(pg_temp.pid('A-reserved-before-B'),
 '[{"position":0,"status":"ticket_error","ticket_id":null,"error_code":"DeviceNotRegistered"}]')->'recorded_count'='1'::jsonb);
reset role;
select pg_temp.ok('old A DNR preserves B registration and device epoch',
 exists(select 1 from public.push_tokens where id=(select (receipt->>'token_id')::uuid from pg_temp.device_receipts where label='B1'))
 and (select binding_generation=(select (receipt->>'binding_generation')::uuid from pg_temp.device_receipts where label='B1')
 from private.push_device_bindings where token_hash=sha256(convert_to('fiction-shared-token','UTF8'))));
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',pg_temp.pid('A')::text,true);
insert into pg_temp.device_receipts values('A2',public.push_device_claim('fiction-shared-token','ios',
 (public.push_device_state('fiction-shared-token',pg_temp.pid('A'))->>'binding_generation')::uuid,pg_temp.pid('A')));
select pg_temp.err('A-B-A cannot reuse first A epoch',
 $$select public.push_device_claim('fiction-shared-token','ios',(select (receipt->>'binding_generation')::uuid from pg_temp.device_receipts where label='A1'),pg_temp.pid('A'))$$,'40001');
select pg_temp.ok('current release removes only captured device binding',
 public.push_device_release('fiction-shared-token',(select (receipt->>'token_id')::uuid from pg_temp.device_receipts where label='A2'),
 (select (receipt->>'registration_generation')::uuid from pg_temp.device_receipts where label='A2'),
 (select (receipt->>'binding_generation')::uuid from pg_temp.device_receipts where label='A2'),pg_temp.pid('A'))->'released'='true'::jsonb);
select pg_temp.err('pre-release claim cannot resurrect released device',
 $$select public.push_device_claim('fiction-shared-token','ios',(select (receipt->>'binding_generation')::uuid from pg_temp.device_receipts where label='A2'),pg_temp.pid('A'))$$,'40001');
reset role;
select pg_temp.ok('release retains detached epoch tombstone and other own device',
 exists(select 1 from private.push_device_bindings where token_hash=sha256(convert_to('fiction-shared-token','UTF8')) and current_user_id is null
 and binding_generation<>(select (receipt->>'binding_generation')::uuid from pg_temp.device_receipts where label='A2'))
 and exists(select 1 from public.push_tokens where id=(select (receipt->>'token_id')::uuid from pg_temp.device_receipts where label='A-other')));
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',pg_temp.pid('A')::text,true);
insert into pg_temp.device_receipts values('A3',public.push_device_claim('fiction-shared-token','ios',
 (public.push_device_state('fiction-shared-token',pg_temp.pid('A'))->>'binding_generation')::uuid,pg_temp.pid('A')));
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.push_receipts_prepare(pg_temp.pid('current-DNR'),pg_temp.reservations(array['A3']));
select public.push_receipts_record_tickets(pg_temp.pid('current-DNR'),
 '[{"position":0,"status":"ticket_error","ticket_id":null,"error_code":"DeviceNotRegistered"}]');
reset role;
select pg_temp.ok('current DNR deletes exact row and rotates retained tombstone',
 not exists(select 1 from public.push_tokens where id=(select (receipt->>'token_id')::uuid from pg_temp.device_receipts where label='A3'))
 and exists(select 1 from private.push_device_bindings where token_hash=sha256(convert_to('fiction-shared-token','UTF8')) and current_user_id is null
 and binding_generation<>(select (receipt->>'binding_generation')::uuid from pg_temp.device_receipts where label='A3')));
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',pg_temp.pid('A')::text,true);
select pg_temp.err('pre-DNR claim cannot recreate retired registration',
 $$select public.push_device_claim('fiction-shared-token','ios',(select (receipt->>'binding_generation')::uuid from pg_temp.device_receipts where label='A3'),pg_temp.pid('A'))$$,'40001');
insert into pg_temp.device_receipts values('A4',public.push_device_claim('fiction-shared-token','ios',
 (public.push_device_state('fiction-shared-token',pg_temp.pid('A'))->>'binding_generation')::uuid,pg_temp.pid('A')));
-- Exercise the NEW ownership overlays, not only the old receipt fixture.
select set_config('request.jwt.claim.sub',pg_temp.pid('B')::text,true);
insert into pg_temp.device_receipts values('B-receipt',public.push_device_claim('fiction-receipt-device','ios',
 (public.push_device_state('fiction-receipt-device',pg_temp.pid('B'))->>'binding_generation')::uuid,pg_temp.pid('B')));
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.push_receipts_prepare(pg_temp.pid('receipt-overlay'),pg_temp.reservations(array['B-receipt']));
select public.push_receipts_record_tickets(pg_temp.pid('receipt-overlay'),
 '[{"position":0,"status":"accepted","ticket_id":"fiction-overlay-ticket","error_code":null}]');
reset role;
update private.push_delivery_tickets set next_check_at=clock_timestamp()-interval '1 second' where attempt_id=pg_temp.pid('receipt-overlay');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into pg_temp.device_receipts values('overlay-claim',public.push_receipts_claim_due(pg_temp.pid('collector'),1));
select pg_temp.ok('new receipt overlay applies missing only to its exact active lease',
 public.push_receipts_apply((select (receipt->>'lease_id')::uuid from pg_temp.device_receipts where label='overlay-claim'),
 jsonb_build_array(jsonb_build_object('attempt_id',pg_temp.pid('receipt-overlay'),'position',0,'ticket_id','fiction-overlay-ticket',
 'status','missing','error_code',null)))->'missing_count'='1'::jsonb);
reset role;
select pg_temp.ok('missing keeps active registration and DB fifteen-minute schedule',
 exists(select 1 from private.push_delivery_tickets where attempt_id=pg_temp.pid('receipt-overlay')
 and receipt_status='pending' and next_check_at=receipt_checked_at+interval '15 minutes' and lease_id is null)
 and exists(select 1 from public.push_tokens where id=(select (receipt->>'token_id')::uuid from pg_temp.device_receipts where label='B-receipt')));
update private.push_delivery_tickets set next_check_at=clock_timestamp()-interval '1 second' where attempt_id=pg_temp.pid('receipt-overlay');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into pg_temp.device_receipts values('overlay-claim-2',public.push_receipts_claim_due(pg_temp.pid('collector'),1));
select pg_temp.err('new overlay rejects mismatched receipt ticket without cleanup',
 $$select public.push_receipts_apply((select (receipt->>'lease_id')::uuid from pg_temp.device_receipts where label='overlay-claim-2'),
 jsonb_build_array(jsonb_build_object('attempt_id',pg_temp.pid('receipt-overlay'),'position',0,'ticket_id','fiction-wrong-ticket',
 'status','receipt_error','error_code','DeviceNotRegistered')))$$,'40001','[push receipts]');
select pg_temp.ok('new overlay success receipt never retires device registration',
 public.push_receipts_apply((select (receipt->>'lease_id')::uuid from pg_temp.device_receipts where label='overlay-claim-2'),
 jsonb_build_array(jsonb_build_object('attempt_id',pg_temp.pid('receipt-overlay'),'position',0,'ticket_id','fiction-overlay-ticket',
 'status','receipt_ok','error_code',null)))->'deleted_token_count'='0'::jsonb);
reset role;
select pg_temp.err('ownership CAS preserves post-lock absolute lease deadline',
 $$select private.retire_push_registration((select (receipt->>'token_id')::uuid from pg_temp.device_receipts where label='B-receipt'),
 pg_temp.pid('B'),(select (receipt->>'registration_generation')::uuid from pg_temp.device_receipts where label='B-receipt'),
 clock_timestamp()-interval '1 second')$$,'40001','[push receipts] Lease deadline expired before token cleanup.');
select pg_temp.ok('expired helper rolls back token and binding changes',
 exists(select 1 from public.push_tokens where id=(select (receipt->>'token_id')::uuid from pg_temp.device_receipts where label='B-receipt'))
 and exists(select 1 from private.push_device_bindings where token_hash=sha256(convert_to('fiction-receipt-device','UTF8'))
 and binding_generation=(select (receipt->>'binding_generation')::uuid from pg_temp.device_receipts where label='B-receipt')));
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.push_receipts_prepare(pg_temp.pid('receipt-DNR'),pg_temp.reservations(array['B-receipt']));
select public.push_receipts_record_tickets(pg_temp.pid('receipt-DNR'),
 '[{"position":0,"status":"accepted","ticket_id":"fiction-overlay-DNR-ticket","error_code":null}]');
reset role;
update private.push_delivery_tickets set next_check_at=clock_timestamp()-interval '1 second' where attempt_id=pg_temp.pid('receipt-DNR');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into pg_temp.device_receipts values('overlay-DNR-claim',public.push_receipts_claim_due(pg_temp.pid('collector'),1));
reset role;
update private.push_delivery_tickets set lease_expires_at=clock_timestamp()-interval '1 second',next_check_at=clock_timestamp()-interval '1 second'
 where attempt_id=pg_temp.pid('receipt-DNR');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.err('new ownership overlay rejects expired collector lease before DNR',
 $$select public.push_receipts_apply((select (receipt->>'lease_id')::uuid from pg_temp.device_receipts where label='overlay-DNR-claim'),
 jsonb_build_array(jsonb_build_object('attempt_id',pg_temp.pid('receipt-DNR'),'position',0,'ticket_id','fiction-overlay-DNR-ticket',
 'status','receipt_error','error_code','DeviceNotRegistered')))$$,'40001','[push receipts]');
reset role;
select pg_temp.ok('expired collector leaves exact binding and token intact',
 exists(select 1 from public.push_tokens where id=(select (receipt->>'token_id')::uuid from pg_temp.device_receipts where label='B-receipt'))
 and exists(select 1 from private.push_device_bindings where token_hash=sha256(convert_to('fiction-receipt-device','UTF8'))
 and binding_generation=(select (receipt->>'binding_generation')::uuid from pg_temp.device_receipts where label='B-receipt')));
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
update pg_temp.device_receipts set receipt=public.push_receipts_claim_due(pg_temp.pid('collector-new'),1) where label='overlay-DNR-claim';
select pg_temp.ok('new overlay verified receipt DNR retires exactly one current registration',
 public.push_receipts_apply((select (receipt->>'lease_id')::uuid from pg_temp.device_receipts where label='overlay-DNR-claim'),
 jsonb_build_array(jsonb_build_object('attempt_id',pg_temp.pid('receipt-DNR'),'position',0,'ticket_id','fiction-overlay-DNR-ticket',
 'status','receipt_error','error_code','DeviceNotRegistered')))->'deleted_token_count'='1'::jsonb);
reset role;
select pg_temp.ok('receipt DNR retains detached epoch tombstone and preserves other device',
 exists(select 1 from private.push_device_bindings where token_hash=sha256(convert_to('fiction-receipt-device','UTF8'))
 and current_user_id is null and token_id is null
 and binding_generation<>(select (receipt->>'binding_generation')::uuid from pg_temp.device_receipts where label='B-receipt'))
 and exists(select 1 from public.push_tokens where id=(select (receipt->>'token_id')::uuid from pg_temp.device_receipts where label='A-other')));
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',pg_temp.pid('A')::text,true);
reset role;
select push_fixture.synthetic_auth_delete(pg_temp.pid('A'));
select pg_temp.err('missing Auth parent aborts before child locks',
 $$select private.lock_push_auth_users(array[pg_temp.pid('A')])$$,'40001');
select pg_temp.ok('Auth deletion detaches owner while preserving opaque epoch tombstones',
 (select count(*)=2 and bool_and(current_user_id is null and token_id is null and registration_generation is null)
 from private.push_device_bindings where token_hash=any(array[sha256(convert_to('fiction-shared-token','UTF8')),sha256(convert_to('fiction-other-device','UTF8'))])));
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',pg_temp.pid('A')::text,true);
select pg_temp.err('old valid claim identity without profile cannot register',
 $$select public.push_device_state('fiction-shared-token',pg_temp.pid('A'))$$,'42501');
reset role;
select push_fixture.synthetic_auth_user(pg_temp.pid('A'));
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',pg_temp.pid('A')::text,true);
select pg_temp.err('even synthetic same-UID recreation cannot reuse pre-delete epoch',
 $$select public.push_device_claim('fiction-shared-token','ios',(select (receipt->>'binding_generation')::uuid from pg_temp.device_receipts where label='A4'),pg_temp.pid('A'))$$,'40001');
select pg_temp.err('authenticated cannot read raw tokenhash binding ledger',
 $$select * from private.push_device_bindings$$,'42501','');
select pg_temp.err('authenticated cannot call active-registration service API',
 $$select public.push_device_active_registrations('[]')$$,'42501','');
reset role;
select pg_temp.ok('ordinary migration actor has existing Auth KEY SHARE privileges without Auth insert or delete',
 has_table_privilege(current_user,'auth.users','SELECT') and has_table_privilege(current_user,'auth.users','UPDATE')
 and has_column_privilege(current_user,'auth.users','id','UPDATE')
 and not has_table_privilege(current_user,'auth.users','INSERT,DELETE'));
select pg_temp.ok('Auth scope canonicalizes duplicate targets in UUID order',
 private.push_device_auth_scope(array[pg_temp.pid('B'),pg_temp.pid('A'),pg_temp.pid('B')],null,null)
 =array(select distinct uid from unnest(array[pg_temp.pid('B'),pg_temp.pid('A')]) uid order by uid));
select pg_temp.ok('new Auth discovery and row-lock helpers deny every API role',
 not has_function_privilege('authenticated','private.lock_push_auth_users(uuid[])','EXECUTE')
 and not has_function_privilege('service_role','private.lock_push_auth_users(uuid[])','EXECUTE')
 and not has_function_privilege('anon','private.push_device_auth_scope(uuid[],uuid[],bytea)','EXECUTE')
 and not has_function_privilege('authenticated','private.push_device_auth_scope(uuid[],uuid[],bytea)','EXECUTE'));
select pg_temp.ok('new binding ledger stores no raw token or profile payload',not exists(select 1 from information_schema.columns
 where table_schema='private' and table_name='push_device_bindings' and column_name in ('token','message','body','profile','email')));
select pg_temp.ok('three auth APIs and one service API deny PUBLIC and opposite API roles',
 not has_function_privilege('anon','public.push_device_state(text,uuid)','EXECUTE')
 and not has_function_privilege('service_role','public.push_device_claim(text,text,uuid,uuid)','EXECUTE')
 and not has_function_privilege('authenticated','public.push_device_active_registrations(jsonb)','EXECUTE')
 and not has_table_privilege('service_role','private.push_device_bindings','SELECT,INSERT,UPDATE,DELETE'));
select count(*)::text||' ownership checks passed (synthetic only)' from pg_temp.device_results;
rollback;
