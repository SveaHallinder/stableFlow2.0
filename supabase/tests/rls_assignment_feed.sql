-- Run with psql as postgres against the deployed schema after the migration.
-- All fixtures, JWT settings, helper functions and queued pg_net requests roll back.
-- No existing stable, horse, membership or assignment is modified.
-- pg_net sends only on commit: https://supabase.com/docs/guides/database/extensions/pg_net
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
create function pg_temp.test_id(value text) returns uuid language sql immutable
as $$select md5('stableflow-rls-20260908-' || value)::uuid$$;
insert into auth.users(id) select pg_temp.test_id(x) from unnest(array['rider-a','other-a','owner-a','staff-a','admin-a','editor-a','editor-ab','guest-a','rider-b','outsider']) x;
insert into public.profiles(id) select pg_temp.test_id(x) from unnest(array['rider-a','other-a','owner-a','staff-a','admin-a','editor-a','editor-ab','guest-a','rider-b','outsider']) x on conflict(id) do nothing;
insert into stables(id,name,created_by,join_code) values(pg_temp.test_id('stable-a'),'Transient RLS A',pg_temp.test_id('editor-ab'),'RLSA20260908'),(pg_temp.test_id('stable-b'),'Transient RLS B',pg_temp.test_id('editor-ab'),'RLSB20260908');

insert into stable_members(stable_id,user_id,role,access) values
 (pg_temp.test_id('stable-a'),pg_temp.test_id('rider-a'),'rider','view'),
 (pg_temp.test_id('stable-a'),pg_temp.test_id('other-a'),'rider','view'),
 (pg_temp.test_id('stable-a'),pg_temp.test_id('owner-a'),'guest','view'),
 (pg_temp.test_id('stable-a'),pg_temp.test_id('staff-a'),'staff','view'),
 (pg_temp.test_id('stable-a'),pg_temp.test_id('admin-a'),'admin','view'),
 (pg_temp.test_id('stable-a'),pg_temp.test_id('editor-a'),'rider','edit'),
 (pg_temp.test_id('stable-a'),pg_temp.test_id('editor-ab'),'rider','edit'),
 (pg_temp.test_id('stable-b'),pg_temp.test_id('editor-ab'),'rider','edit'),
 (pg_temp.test_id('stable-a'),pg_temp.test_id('guest-a'),'guest','view'),
 (pg_temp.test_id('stable-b'),pg_temp.test_id('rider-b'),'rider','view');
insert into horses(id,stable_id,owner_user_id,name) values(pg_temp.test_id('horse-owner-a'),pg_temp.test_id('stable-a'),pg_temp.test_id('owner-a'),'Transient horse-owner-a'),(pg_temp.test_id('horse-other-a'),pg_temp.test_id('stable-a'),pg_temp.test_id('other-a'),'Transient horse-other-a'),(pg_temp.test_id('horse-b'),pg_temp.test_id('stable-b'),pg_temp.test_id('rider-b'),'Transient horse-b');
insert into assignments(id,stable_id,date,slot,label,icon,time,status) select pg_temp.test_id(x),pg_temp.test_id('stable-a'),'2026-09-08','Morning','Morgonpass','sun','07:00','open' from unnest(array['claim','release','edit-own','steal','editor','move-no','move-yes','default-other','no-membership','guest','staff','admin','trusted','service']) x;
update assignments set status='assigned',assignee_id=pg_temp.test_id('other-a'),assigned_via='manual' where id=pg_temp.test_id('steal');
update assignments set status='assigned',assignee_id=pg_temp.test_id('rider-a'),assigned_via='manual' where id=pg_temp.test_id('edit-own');
update assignments set declined_by_user_ids=array[pg_temp.test_id('rider-a'),pg_temp.test_id('other-a')] where id=pg_temp.test_id('claim');
insert into assignments(id,stable_id,date,slot,label,icon,time,status) values(pg_temp.test_id('foreign'),pg_temp.test_id('stable-b'),'2026-09-08','Morning','Morgonpass','sun','07:00','open');

create temporary table test_results(label text primary key,actor text,passed boolean not null);
grant select,insert on pg_temp.test_results to authenticated,service_role,supabase_admin;
create function pg_temp.test_write(label text, statement text, allowed boolean) returns text language plpgsql as $$
declare affected bigint := 0; denied boolean := false;
begin
 begin execute statement; get diagnostics affected = row_count;
 exception when insufficient_privilege then denied := true;
 end;
 if allowed and (denied or affected <> 1) then raise exception 'FAIL %: expected one write, rows=%, denied=%',label,affected,denied; end if;
 if not allowed and not denied and affected <> 0 then raise exception 'FAIL %: unauthorized write succeeded (% rows)',label,affected; end if;
 insert into pg_temp.test_results values(label,current_user,true);
 return 'PASS ' || label;
end;
$$;
create function pg_temp.test_assert(label text, predicate boolean) returns text language plpgsql as $$
begin
 if predicate is distinct from true then raise exception 'FAIL %',label; end if;
 insert into pg_temp.test_results values(label,current_user,true);
 return 'PASS ' || label;
end;
$$;
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub',pg_temp.test_id('rider-a')::text,false);
select pg_temp.test_assert('non-bypass authenticated role',current_user='authenticated' and not (select rolbypassrls or rolsuper from pg_roles where rolname=current_user));
select pg_temp.test_write('rider claims open pass', $$update assignments set status='assigned',assignee_id=auth.uid(),assigned_via='manual',declined_by_user_ids=array[pg_temp.test_id('other-a')] where id=pg_temp.test_id('claim') and status='open'$$,true);
select pg_temp.test_assert('claim preserves others declines', (select declined_by_user_ids=array[pg_temp.test_id('other-a')] from assignments where id=pg_temp.test_id('claim')));
select pg_temp.test_write('rider cannot edit own label', $$update assignments set label='Forged' where id=pg_temp.test_id('claim')$$,false);
select pg_temp.test_write('rider cannot edit own date', $$update assignments set date='2027-01-01' where id=pg_temp.test_id('claim')$$,false);
select pg_temp.test_write('rider cannot edit own stable', $$update assignments set stable_id=pg_temp.test_id('stable-b') where id=pg_temp.test_id('claim')$$,false);
select pg_temp.test_write('rider cannot assign another member', $$update assignments set status='assigned',assignee_id=pg_temp.test_id('other-a'),assigned_via='manual' where id=pg_temp.test_id('release')$$,false);
select pg_temp.test_write('rider cannot autoassign another member', $$update assignments set status='assigned',assignee_id=pg_temp.test_id('other-a'),assigned_via='default' where id=pg_temp.test_id('default-other')$$,false);
select pg_temp.test_write('rider cannot steal another pass', $$update assignments set assignee_id=auth.uid() where id=pg_temp.test_id('steal')$$,false);
select pg_temp.test_write('rider cannot complete another pass', $$update assignments set status='completed',completed_at=now() where id=pg_temp.test_id('steal')$$,false);
select pg_temp.test_write('rider cannot release another pass', $$update assignments set status='open',assignee_id=null,assigned_via=null where id=pg_temp.test_id('steal')$$,false);
select pg_temp.test_write('rider cannot claim foreign stable', $$update assignments set status='assigned',assignee_id=auth.uid(),assigned_via='manual' where id=pg_temp.test_id('foreign')$$,false);
select pg_temp.test_write('rider cannot falsify decline history', $$update assignments set status='open',assignee_id=null,assigned_via=null,declined_by_user_ids=array[auth.uid()] where id=pg_temp.test_id('claim')$$,false);
select pg_temp.test_write('rider completes own pass', $$update assignments set status='completed',completed_at=now() where id=pg_temp.test_id('claim')$$,true);
select pg_temp.test_write('rider cannot reopen completed pass', $$update assignments set status='open',assignee_id=null,assigned_via=null,declined_by_user_ids=array[pg_temp.test_id('other-a'),auth.uid()] where id=pg_temp.test_id('claim')$$,false);
select pg_temp.test_write('rider claims release fixture', $$update assignments set status='assigned',assignee_id=auth.uid(),assigned_via='manual' where id=pg_temp.test_id('release')$$,true);
select pg_temp.test_write('rider releases own pass', $$update assignments set status='open',assignee_id=null,assigned_via=null,declined_by_user_ids=array[auth.uid()] where id=pg_temp.test_id('release')$$,true);
select pg_temp.test_write('rider reclaims declined pass', $$update assignments set status='assigned',assignee_id=auth.uid(),assigned_via='manual',declined_by_user_ids='{}'::uuid[] where id=pg_temp.test_id('release') and status='open'$$,true);
select pg_temp.test_write('second claimant cannot take claimed pass', $$update assignments set status='assigned',assignee_id=auth.uid(),assigned_via='manual' where id=pg_temp.test_id('release') and status='open'$$,false);
select pg_temp.test_write('rider cannot create assignments', $$insert into assignments(id,stable_id,date,slot,label,icon,time,status) values(gen_random_uuid(),pg_temp.test_id('stable-a'),'2026-09-08','Morning','Forged','sun','07:00','open')$$,false);
select pg_temp.test_write('rider cannot delete assignments', $$delete from assignments where id=pg_temp.test_id('release')$$,false);
select set_config('request.jwt.claim.sub',pg_temp.test_id('editor-a')::text,false);
select pg_temp.test_write('editor can edit another pass', $$update assignments set label='Ny titel',date='2026-09-09' where id=pg_temp.test_id('steal')$$,true);
select pg_temp.test_write('editor cannot move to unauthorized stable', $$update assignments set stable_id=pg_temp.test_id('stable-b') where id=pg_temp.test_id('move-no')$$,false);
select pg_temp.test_write('editor cannot assign outsider', $$update assignments set status='assigned',assignee_id=pg_temp.test_id('rider-b'),assigned_via='default' where id=pg_temp.test_id('no-membership')$$,false);
select pg_temp.test_write('editor can autoassign member', $$update assignments set status='assigned',assignee_id=pg_temp.test_id('other-a'),assigned_via='default' where id=pg_temp.test_id('default-other')$$,true);
select set_config('request.jwt.claim.sub',pg_temp.test_id('editor-ab')::text,false);
select pg_temp.test_write('editor in both stables can move pass', $$update assignments set stable_id=pg_temp.test_id('stable-b') where id=pg_temp.test_id('move-yes')$$,true);
select set_config('request.jwt.claim.sub',pg_temp.test_id('staff-a')::text,false);
select pg_temp.test_write('staff view can claim own pass', $$update assignments set status='assigned',assignee_id=auth.uid(),assigned_via='manual' where id=pg_temp.test_id('staff')$$,true);
select pg_temp.test_write('staff view cannot edit another title', $$update assignments set label='Forged' where id=pg_temp.test_id('steal')$$,false);
select set_config('request.jwt.claim.sub',pg_temp.test_id('admin-a')::text,false);
select pg_temp.test_write('admin view can claim own pass', $$update assignments set status='assigned',assignee_id=auth.uid(),assigned_via='manual' where id=pg_temp.test_id('admin')$$,true);
select pg_temp.test_write('admin view cannot edit another title', $$update assignments set label='Forged' where id=pg_temp.test_id('steal')$$,false);
select set_config('request.jwt.claim.sub',pg_temp.test_id('guest-a')::text,false);
select pg_temp.test_write('guest view cannot claim pass', $$update assignments set status='assigned',assignee_id=auth.uid(),assigned_via='manual' where id=pg_temp.test_id('guest')$$,false);
select set_config('request.jwt.claim.sub',pg_temp.test_id('owner-a')::text,false);
select pg_temp.test_write('member owner creates own horse feed check', $$insert into feed_checks(stable_id,horse_id,date,slot,checked_by_user_id,checked_at) values(pg_temp.test_id('stable-a'),pg_temp.test_id('horse-owner-a'),'2026-09-08','morning',auth.uid(),now())$$,true);
select pg_temp.test_write('member owner upserts own horse deviation', $$insert into feed_checks(stable_id,horse_id,date,slot,checked_by_user_id,checked_at,deviation_note) values(pg_temp.test_id('stable-a'),pg_temp.test_id('horse-owner-a'),'2026-09-08','morning',auth.uid(),now(),'Mindre hö') on conflict(horse_id,date,slot) do update set deviation_note=excluded.deviation_note returning *$$,true);
select pg_temp.test_write('owner cannot feed others horse', $$insert into feed_checks(stable_id,horse_id,date,slot,checked_by_user_id,checked_at) values(pg_temp.test_id('stable-a'),pg_temp.test_id('horse-other-a'),'2026-09-08','morning',auth.uid(),now())$$,false);
select pg_temp.test_write('owner cannot scope own horse to foreign stable', $$insert into feed_checks(stable_id,horse_id,date,slot,checked_by_user_id,checked_at) values(pg_temp.test_id('stable-b'),pg_temp.test_id('horse-owner-a'),'2026-09-08','evening',auth.uid(),now())$$,false);
select pg_temp.test_write('owner cannot reassign own check to other horse', $$update feed_checks set horse_id=pg_temp.test_id('horse-other-a') where horse_id=pg_temp.test_id('horse-owner-a')$$,false);
select pg_temp.test_write('owner cannot move own check to foreign stable', $$update feed_checks set stable_id=pg_temp.test_id('stable-b') where horse_id=pg_temp.test_id('horse-owner-a')$$,false);
select pg_temp.test_write('owner has no new feed delete right', $$delete from feed_checks where horse_id=pg_temp.test_id('horse-owner-a')$$,false);
select set_config('request.jwt.claim.sub',pg_temp.test_id('staff-a')::text,false);
select pg_temp.test_write('staff can check any own stable horse', $$insert into feed_checks(stable_id,horse_id,date,slot,checked_by_user_id,checked_at) values(pg_temp.test_id('stable-a'),pg_temp.test_id('horse-other-a'),'2026-09-08','morning',auth.uid(),now())$$,true);
select pg_temp.test_write('staff cannot spoof foreign horse into own stable', $$insert into feed_checks(stable_id,horse_id,date,slot,checked_by_user_id,checked_at) values(pg_temp.test_id('stable-a'),pg_temp.test_id('horse-b'),'2026-09-08','morning',auth.uid(),now())$$,false);
select pg_temp.test_write('staff can update owner deviation', $$update feed_checks set deviation_note='Kontrollerat' where horse_id=pg_temp.test_id('horse-owner-a')$$,true);
select set_config('request.jwt.claim.sub',pg_temp.test_id('editor-a')::text,false);
select pg_temp.test_write('rider edit alone does not grant feed marking', $$insert into feed_checks(stable_id,horse_id,date,slot,checked_by_user_id,checked_at) values(pg_temp.test_id('stable-a'),pg_temp.test_id('horse-other-a'),'2026-09-08','evening',auth.uid(),now())$$,false);
select set_config('request.jwt.claim.sub',pg_temp.test_id('outsider')::text,false);
select pg_temp.test_write('outsider cannot check stable horses', $$insert into feed_checks(stable_id,horse_id,date,slot,checked_by_user_id,checked_at) values(pg_temp.test_id('stable-a'),pg_temp.test_id('horse-other-a'),'2026-09-08','evening',auth.uid(),now())$$,false);
select pg_temp.test_write('outsider cannot claim stable assignment', $$update assignments set status='assigned',assignee_id=auth.uid(),assigned_via='manual' where id=pg_temp.test_id('guest')$$,false);
reset role;
select set_config('request.jwt.claim.sub','',false);
select set_config('request.jwt.claim.role','',false);
select pg_temp.test_write('postgres SQL maintenance works without JWT', $$update assignments set label='SQL seed maintenance' where id=pg_temp.test_id('trusted')$$,true);
set role service_role;
select set_config('request.jwt.claim.role','service_role',false);
select pg_temp.test_write('service role maintenance works without user JWT', $$update assignments set label='service maintenance' where id=pg_temp.test_id('service')$$,true);
reset role;
select count(*) || ' deployed-schema RLS/trigger tests passed' from test_results;
rollback;
