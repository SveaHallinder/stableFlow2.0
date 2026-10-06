-- Synthetic fixtures only. Run locally as postgres; every change rolls back.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
create function pg_temp.pid(value text) returns uuid language sql immutable
as $$select md5('stableflow-paddock-ids-20261006-' || value)::uuid$$;
create temporary table paddock_test_results(label text primary key);
create temporary table paddock_receipts(label text primary key, receipt jsonb);
grant select, insert on pg_temp.paddock_test_results, pg_temp.paddock_receipts to authenticated, anon;
create function pg_temp.check_ok(label text, predicate boolean) returns text language plpgsql as $$
begin
  if predicate is distinct from true then raise exception 'FAIL %', label; end if;
  insert into pg_temp.paddock_test_results values(label);
  return 'PASS ' || label;
end;
$$;
create function pg_temp.check_error(label text, statement text, expected_code text, expected_message text) returns text language plpgsql as $$
declare actual_code text; actual_message text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics actual_code = returned_sqlstate, actual_message = message_text;
  end;
  if actual_code is distinct from expected_code or position(expected_message in coalesce(actual_message, '')) = 0 then
    raise exception 'FAIL %: expected %, got % (%)', label, expected_code, coalesce(actual_code, 'success'), coalesce(actual_message, '');
  end if;
  insert into pg_temp.paddock_test_results values(label);
  return 'PASS ' || label;
end;
$$;
insert into auth.users(id) select pg_temp.pid(x) from unnest(array['owner','editor','staff-view','guest','rider','outside']) x;
insert into public.stables(id, name, created_by) values
  (pg_temp.pid('stable'), 'ID fixture', pg_temp.pid('owner')),
  (pg_temp.pid('other-stable'), 'ID fixture other', pg_temp.pid('outside'));
insert into public.stable_members(stable_id, user_id, role, access) values
  (pg_temp.pid('stable'),pg_temp.pid('owner'),'admin','owner'),
  (pg_temp.pid('stable'),pg_temp.pid('editor'),'staff','edit'),
  (pg_temp.pid('stable'),pg_temp.pid('staff-view'),'staff','view'),
  (pg_temp.pid('stable'),pg_temp.pid('guest'),'guest','view'),
  (pg_temp.pid('stable'),pg_temp.pid('rider'),'rider','view'),
  (pg_temp.pid('other-stable'),pg_temp.pid('outside'),'admin','owner');
insert into public.horses(id, stable_id, name) values
  (pg_temp.pid('horse-a'),pg_temp.pid('stable'),'Saga'),
  (pg_temp.pid('horse-b'),pg_temp.pid('stable'),'Mira'),
  (pg_temp.pid('horse-c'),pg_temp.pid('stable'),'Saga'),
  (pg_temp.pid('horse-outside'),pg_temp.pid('other-stable'),'Saga');
insert into public.paddocks(id, stable_id, name, horse_names) values
  (pg_temp.pid('legacy'),pg_temp.pid('stable'),'Archive fixture',array['Original unmatched text',chr(9)]);

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid('owner')::text,true);
insert into pg_temp.paddock_receipts values('create',public.save_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),'A',array[pg_temp.pid('horse-b'),pg_temp.pid('horse-a')],'summer',null,null,pg_temp.pid('request-create')));
select pg_temp.check_ok('create has canonical full row and revision one', (select receipt ?& array['id','stable_id','name','horse_names','season','image_url','created_at','updated_at','revision','last_save_request_id','horse_ids','request_id'] and (receipt->>'revision')::bigint=1 and receipt->>'request_id'=pg_temp.pid('request-create')::text from pg_temp.paddock_receipts where label='create'));
select pg_temp.check_ok('canonical UUID set is sorted', (select receipt->'horse_ids'=to_jsonb(array(select id from public.horses where id=any(array[pg_temp.pid('horse-a'),pg_temp.pid('horse-b')]) order by id)) from pg_temp.paddock_receipts where label='create'));
select pg_temp.check_ok('same request retry returns original exact receipt', public.save_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),'A',array[pg_temp.pid('horse-a'),pg_temp.pid('horse-b')],'summer',null,null,pg_temp.pid('request-create'))=(select receipt from pg_temp.paddock_receipts where label='create'));
select pg_temp.check_error('same request different name denied', $$select public.save_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),'Different',array[pg_temp.pid('horse-a'),pg_temp.pid('horse-b')],'summer',null,1,pg_temp.pid('request-create'))$$,'22023','[paddock save]');
select pg_temp.check_error('same request different links denied', $$select public.save_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),'A',array[pg_temp.pid('horse-a')],'summer',null,1,pg_temp.pid('request-create'))$$,'22023','[paddock save]');
select pg_temp.check_error('same request different season denied', $$select public.save_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),'A',array[pg_temp.pid('horse-a'),pg_temp.pid('horse-b')],'winter',null,1,pg_temp.pid('request-create'))$$,'22023','[paddock save]');
select pg_temp.check_error('same request different image denied', $$select public.save_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),'A',array[pg_temp.pid('horse-a'),pg_temp.pid('horse-b')],'summer','https://fixture.test/new',1,pg_temp.pid('request-create'))$$,'22023','[paddock save]');
select pg_temp.check_error('same create request changed expected revision denied', $$select public.save_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),'A',array[pg_temp.pid('horse-a'),pg_temp.pid('horse-b')],'summer',null,1,pg_temp.pid('request-create'))$$,'22023','[paddock save]');
select pg_temp.check_error('same request maximal expected revision rejected without overflow', $$select public.save_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),'A',array[pg_temp.pid('horse-a'),pg_temp.pid('horse-b')],'summer',null,9223372036854775807,pg_temp.pid('request-create'))$$,'22023','[paddock save]');
select pg_temp.check_error('duplicate IDs denied atomically', $$select public.save_paddock(pg_temp.pid('bad-duplicate'),pg_temp.pid('stable'),'Bad',array[pg_temp.pid('horse-a'),pg_temp.pid('horse-a')],'summer',null,null,pg_temp.pid('bad-request'))$$,'22023','[paddock save]');
select pg_temp.check_error('null ID denied atomically', $$select public.save_paddock(pg_temp.pid('bad-null'),pg_temp.pid('stable'),'Bad',array[null::uuid],'summer',null,null,pg_temp.pid('bad-request'))$$,'22023','[paddock save]');
select pg_temp.check_error('cross stable ID denied atomically', $$select public.save_paddock(pg_temp.pid('bad-cross'),pg_temp.pid('stable'),'Bad',array[pg_temp.pid('horse-outside')],'summer',null,null,pg_temp.pid('bad-request'))$$,'23503','[paddock save]');
select pg_temp.check_ok('failed create leaves no parent row', not exists(select 1 from public.paddocks where id=any(array[pg_temp.pid('bad-cross'),pg_temp.pid('bad-null'),pg_temp.pid('bad-duplicate')])));
select pg_temp.check_error('legacy unchanged array update denied', $$update public.paddocks set horse_names=horse_names where id=pg_temp.pid('paddock-a')$$,'42501','permission denied');
select pg_temp.check_error('direct paddock insert denied', $$insert into public.paddocks(stable_id,name) values(pg_temp.pid('stable'),'Bypass')$$,'42501','permission denied');
select pg_temp.check_error('direct paddock delete denied', $$delete from public.paddocks where id=pg_temp.pid('paddock-a')$$,'42501','permission denied');
select pg_temp.check_error('direct canonical insert denied', $$insert into public.paddock_horses values(pg_temp.pid('stable'),pg_temp.pid('paddock-a'),pg_temp.pid('horse-c'))$$,'42501','permission denied');

select set_config('request.jwt.claim.sub',pg_temp.pid('editor')::text,true);
insert into pg_temp.paddock_receipts values('update',public.save_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),'A changed',array[pg_temp.pid('horse-c'),pg_temp.pid('horse-a')],'winter','https://fixture.test/image',1,pg_temp.pid('request-update')));
select pg_temp.check_ok('staff edit updates fields and links in one revision', (select receipt->>'name'='A changed' and (receipt->>'revision')::bigint=2 and receipt->>'image_url'='https://fixture.test/image' and jsonb_array_length(receipt->'horse_ids')=2 from pg_temp.paddock_receipts where label='update'));
select pg_temp.check_error('same update request changed expected revision denied', $$select public.save_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),'A changed',array[pg_temp.pid('horse-a'),pg_temp.pid('horse-c')],'winter','https://fixture.test/image',null,pg_temp.pid('request-update'))$$,'22023','[paddock save]');
select pg_temp.check_error('stale draft denied', $$select public.save_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),'Stale',array[pg_temp.pid('horse-b')],'summer',null,1,pg_temp.pid('request-stale'))$$,'40001','[paddock save]');
select pg_temp.check_ok('stale save preserves current exact receipt', public.save_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),'A changed',array[pg_temp.pid('horse-a'),pg_temp.pid('horse-c')],'winter','https://fixture.test/image',1,pg_temp.pid('request-update'))=(select receipt from pg_temp.paddock_receipts where label='update'));
select public.save_paddock(pg_temp.pid('paddock-b'),pg_temp.pid('stable'),'B',array[pg_temp.pid('horse-a')],'yearRound',null,null,pg_temp.pid('request-b'));
select pg_temp.check_ok('same horse retains two paddock links', (select count(*)=2 from public.paddock_horses where horse_id=pg_temp.pid('horse-a')));
select public.save_paddock(pg_temp.pid('legacy'),pg_temp.pid('stable'),'Archive updated',array[pg_temp.pid('horse-b')],'yearRound',null,1,pg_temp.pid('request-legacy'));
select pg_temp.check_ok('save never rewrites raw legacy names', (select horse_names=array['Original unmatched text',chr(9)] from public.paddocks where id=pg_temp.pid('legacy')));
update public.horses set name='Saga renamed' where id=pg_temp.pid('horse-a');
select pg_temp.check_ok('rename preserves both canonical links', (select count(*)=2 from public.paddock_horses where horse_id=pg_temp.pid('horse-a')));

select set_config('request.jwt.claim.sub',pg_temp.pid('staff-view')::text,true);
select pg_temp.check_ok('member view reads row and links', (select count(*)=3 from public.paddocks where stable_id=pg_temp.pid('stable')) and (select count(*)=4 from public.paddock_horses where stable_id=pg_temp.pid('stable')));
select pg_temp.check_error('staff view cannot save', $$select public.save_paddock(pg_temp.pid('denied'),pg_temp.pid('stable'),'Denied','{}'::uuid[],'yearRound',null,null,pg_temp.pid('denied-request'))$$,'42501','[paddock save]');
select pg_temp.check_error('staff view cannot delete', $$select public.delete_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),2)$$,'42501','[paddock delete]');
select set_config('request.jwt.claim.sub',pg_temp.pid('guest')::text,true);
select pg_temp.check_error('guest cannot save', $$select public.save_paddock(pg_temp.pid('denied'),pg_temp.pid('stable'),'Denied','{}'::uuid[],'yearRound',null,null,pg_temp.pid('denied-request'))$$,'42501','[paddock save]');
select set_config('request.jwt.claim.sub',pg_temp.pid('rider')::text,true);
select pg_temp.check_error('rider view cannot save', $$select public.save_paddock(pg_temp.pid('denied'),pg_temp.pid('stable'),'Denied','{}'::uuid[],'yearRound',null,null,pg_temp.pid('denied-request'))$$,'42501','[paddock save]');
select set_config('request.jwt.claim.sub',pg_temp.pid('outside')::text,true);
select pg_temp.check_ok('other stable cannot read rows or links', not exists(select 1 from public.paddocks where stable_id=pg_temp.pid('stable')) and not exists(select 1 from public.paddock_horses where stable_id=pg_temp.pid('stable')));
select pg_temp.check_error('other stable editor cannot save', $$select public.save_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),'Denied','{}'::uuid[],'yearRound',null,2,pg_temp.pid('denied-request'))$$,'42501','[paddock save]');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.check_error('missing caller cannot save', $$select public.save_paddock(pg_temp.pid('denied'),pg_temp.pid('stable'),'Denied','{}'::uuid[],'yearRound',null,null,pg_temp.pid('denied-request'))$$,'42501','[paddock save]');
reset role;
select pg_temp.check_ok('helpers deny API execute and use fixed trusted context', not exists(select 1 from unnest(array['anon','authenticated','service_role']) r, unnest(array['public.paddock_snapshot(uuid)','public.bump_paddock_link_revision()']) f where has_function_privilege(r,f,'execute')) and (select count(*)=4 from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=any(array['public.paddock_snapshot(uuid)'::regprocedure,'public.bump_paddock_link_revision()'::regprocedure,'public.save_paddock(uuid,uuid,text,uuid[],text,text,bigint,uuid)'::regprocedure,'public.delete_paddock(uuid,uuid,bigint)'::regprocedure]) and r.rolname='postgres' and p.prosecdef and p.provolatile='v' and p.proconfig @> array['search_path=pg_catalog','row_security=off']));
select pg_temp.check_ok('only authenticated has intended RPC execute', has_function_privilege('authenticated','public.save_paddock(uuid,uuid,text,uuid[],text,text,bigint,uuid)','execute') and not has_function_privilege('anon','public.save_paddock(uuid,uuid,text,uuid[],text,text,bigint,uuid)','execute') and not has_function_privilege('service_role','public.delete_paddock(uuid,uuid,bigint)','execute'));
select pg_temp.check_ok('deleted ID receipts have no public client or service grants', not exists(select 1 from unnest(array['anon','authenticated','service_role']) r where has_table_privilege(r,'public.paddock_deleted_ids','SELECT') or has_table_privilege(r,'public.paddock_deleted_ids','INSERT') or has_table_privilege(r,'public.paddock_deleted_ids','UPDATE') or has_table_privilege(r,'public.paddock_deleted_ids','DELETE')));
select pg_temp.check_error('native FK blocks cross stable owner insert', $$insert into public.paddock_horses values(pg_temp.pid('stable'),pg_temp.pid('paddock-a'),pg_temp.pid('horse-outside'))$$,'23503','foreign key');

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pid('editor')::text,true);
delete from public.horses where id=pg_temp.pid('horse-a');
select pg_temp.check_ok('passive horse deletion invalidates both receipts', (select revision=3 and last_save_request_id is null from public.paddocks where id=pg_temp.pid('paddock-a')) and (select revision=2 and last_save_request_id is null from public.paddocks where id=pg_temp.pid('paddock-b')) and not exists(select 1 from public.paddock_horses where horse_id=pg_temp.pid('horse-a')));
select pg_temp.check_error('save retry after passive delete cannot replay old receipt', $$select public.save_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),'A changed',array[pg_temp.pid('horse-a'),pg_temp.pid('horse-c')],'winter','https://fixture.test/image',1,pg_temp.pid('request-update'))$$,'40001','[paddock save]');
select pg_temp.check_error('create retry after passive delete cannot replay old receipt', $$select public.save_paddock(pg_temp.pid('paddock-b'),pg_temp.pid('stable'),'B',array[pg_temp.pid('horse-a')],'yearRound',null,null,pg_temp.pid('request-b'))$$,'40001','[paddock save]');
select pg_temp.check_error('stale deletion denied', $$select public.delete_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),2)$$,'40001','[paddock delete]');
select pg_temp.check_ok('fresh CAS deletion returns explicit acknowledgement', public.delete_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),3)=jsonb_build_object('id',pg_temp.pid('paddock-a'),'stable_id',pg_temp.pid('stable'),'deleted',true,'revision',3));
select pg_temp.check_ok('paddock deletion cascades links without parent resurrection', not exists(select 1 from public.paddocks where id=pg_temp.pid('paddock-a')) and not exists(select 1 from public.paddock_horses where paddock_id=pg_temp.pid('paddock-a')) and exists(select 1 from public.horses where id=pg_temp.pid('horse-c')));
select pg_temp.check_error('missing deletion is not a false acknowledgement', $$select public.delete_paddock(pg_temp.pid('paddock-a'),pg_temp.pid('stable'),3)$$,'P0002','[paddock delete]');
select pg_temp.check_error('deleted ID receipts cannot be read by clients', $$select * from public.paddock_deleted_ids$$,'42501','permission denied');
select public.save_paddock(pg_temp.pid('lost-ack'),pg_temp.pid('stable'),'Lost ack',array[pg_temp.pid('horse-b')],'yearRound',null,null,pg_temp.pid('lost-ack-request'));
select public.delete_paddock(pg_temp.pid('lost-ack'),pg_temp.pid('stable'),1);
select pg_temp.check_error('lost create receipt retry cannot resurrect deleted row', $$select public.save_paddock(pg_temp.pid('lost-ack'),pg_temp.pid('stable'),'Lost ack',array[pg_temp.pid('horse-b')],'yearRound',null,null,pg_temp.pid('lost-ack-request'))$$,'P0002','[paddock save]');
select pg_temp.check_ok('refused create retry leaves deleted parent and links absent', not exists(select 1 from public.paddocks where id=pg_temp.pid('lost-ack')) and not exists(select 1 from public.paddock_horses where paddock_id=pg_temp.pid('lost-ack')));
reset role;
delete from public.stables where id=pg_temp.pid('stable');
select pg_temp.check_ok('stable parent cascade removes rows and links safely', not exists(select 1 from public.paddocks where stable_id=pg_temp.pid('stable')) and not exists(select 1 from public.paddock_horses where stable_id=pg_temp.pid('stable')) and exists(select 1 from public.stables where id=pg_temp.pid('other-stable')));
select pg_temp.check_ok('stable cascade cleans private deleted ID receipts', not exists(select 1 from public.paddock_deleted_ids where stable_id=pg_temp.pid('stable')));
select count(*) || ' canonical paddock ID tests passed' from pg_temp.paddock_test_results;
rollback;
