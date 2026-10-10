-- Run with psql as postgres against the schema after the migration.
-- Synthetic fixtures only; every change rolls back. No invitations or messages.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

create function pg_temp.test_id(value text) returns uuid language sql immutable
as $$select md5('stableflow-db-guards-20261001-' || value)::uuid$$;
create temporary table guard_test_results(label text primary key);
grant select, insert on pg_temp.guard_test_results to authenticated;
create function pg_temp.test_assert(label text, predicate boolean) returns text language plpgsql as $$
begin
  if predicate is distinct from true then raise exception 'FAIL %', label; end if;
  insert into pg_temp.guard_test_results values (label);
  return 'PASS ' || label;
end;
$$;
create function pg_temp.test_error(label text, statement text, expected_code text, expected_message text) returns text language plpgsql as $$
declare actual_code text; actual_message text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics actual_code = returned_sqlstate, actual_message = message_text;
  end;
  if actual_code is distinct from expected_code or position(expected_message in coalesce(actual_message, '')) = 0 then
    raise exception 'FAIL %: expected %, got % (%)', label, expected_code, coalesce(actual_code, 'success'), coalesce(actual_message, '');
  end if;
  insert into pg_temp.guard_test_results values (label);
  return 'PASS ' || label;
end;
$$;

insert into auth.users(id) select pg_temp.test_id(x) from unnest(array['owner', 'next-owner', 'staff', 'admin-view', 'rider-owner']) x;
insert into public.profiles(id) select pg_temp.test_id(x) from unnest(array['owner', 'next-owner', 'staff', 'admin-view', 'rider-owner']) x on conflict(id) do nothing;
-- Live created_by is NOT NULL with ON DELETE SET NULL. Keep a different creator
-- so the last-owner cascade checks reach the guard rather than that constraint.
insert into public.stables(id, name, created_by, join_code) values
  (pg_temp.test_id('stable'), 'Transient guard tests', pg_temp.test_id('next-owner'), 'GUARD20261001A'),
  (pg_temp.test_id('other-stable'), 'Transient guard tests B', pg_temp.test_id('next-owner'), 'GUARD20261001B'),
  (pg_temp.test_id('ownerless'), 'Transient historical fixture', pg_temp.test_id('next-owner'), 'GUARD20261001C');
insert into public.stable_members(stable_id, user_id, role, access) values
  (pg_temp.test_id('stable'), pg_temp.test_id('owner'), 'admin', 'owner'),
  (pg_temp.test_id('stable'), pg_temp.test_id('next-owner'), 'staff', 'edit'),
  (pg_temp.test_id('stable'), pg_temp.test_id('staff'), 'staff', 'view'),
  (pg_temp.test_id('stable'), pg_temp.test_id('admin-view'), 'admin', 'view'),
  (pg_temp.test_id('stable'), pg_temp.test_id('rider-owner'), 'rider', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.test_id('staff')::text, true);
insert into public.arena_bookings(id, stable_id, date, start_time, end_time, purpose) values
  (pg_temp.test_id('booking'), pg_temp.test_id('stable'), '2026-10-01', '10:00', '11:00', 'QA');
select pg_temp.test_error('overlapping insert denied', $$insert into public.arena_bookings(stable_id, date, start_time, end_time, purpose) values(pg_temp.test_id('stable'), '2026-10-01', '10:30', '11:30', 'QA')$$, '23P01', '[arena overlap]');
insert into public.arena_bookings(id, stable_id, date, start_time, end_time, purpose) values
  (pg_temp.test_id('adjacent'), pg_temp.test_id('stable'), '2026-10-01', '11:00:00', '12:00:00', 'QA'),
  (pg_temp.test_id('other-date'), pg_temp.test_id('stable'), '2026-10-02', '10:00', '11:00', 'QA');
select pg_temp.test_assert('adjacent and other date allowed', (select count(*) = 3 from public.arena_bookings where stable_id = pg_temp.test_id('stable')));
select pg_temp.test_error('overlapping update denied', $$update public.arena_bookings set start_time = '10:45' where id = pg_temp.test_id('adjacent')$$, '23P01', '[arena overlap]');
select pg_temp.test_assert('failed update preserves booking', (select start_time = '11:00:00' from public.arena_bookings where id = pg_temp.test_id('adjacent')));
select pg_temp.test_error('invalid clock denied', $$insert into public.arena_bookings(stable_id, date, start_time, end_time, purpose) values(pg_temp.test_id('stable'), '2026-10-01', '25:00', '26:00', 'QA')$$, '23514', '[arena overlap]');
select pg_temp.test_error('overnight denied', $$insert into public.arena_bookings(stable_id, date, start_time, end_time, purpose) values(pg_temp.test_id('stable'), '2026-10-01', '23:00', '01:00', 'QA')$$, '23514', '[arena overlap]');
reset role;
insert into public.arena_bookings(stable_id, date, start_time, end_time, purpose) values(pg_temp.test_id('other-stable'), '2026-10-01', '10:00', '11:00', 'QA');
select pg_temp.test_assert('same interval other stable allowed', (select count(*) = 1 from public.arena_bookings where stable_id = pg_temp.test_id('other-stable')));
select pg_temp.test_error('null stable denied', $$insert into public.arena_bookings(date, start_time, end_time, purpose) values('2026-10-01', '14:00', '15:00', 'QA')$$, '23514', '[arena overlap]');

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.test_id('owner')::text, true);
select pg_temp.test_error('last owner delete denied despite nonowner memberships', $$delete from public.stable_members where stable_id = pg_temp.test_id('stable') and user_id = pg_temp.test_id('owner')$$, '23514', '[last owner]');
select pg_temp.test_error('last owner null access denied', $$update public.stable_members set access = null where stable_id = pg_temp.test_id('stable') and user_id = pg_temp.test_id('owner')$$, '23514', '[last owner]');
select pg_temp.test_error('last owner demotion denied', $$update public.stable_members set role = 'staff' where stable_id = pg_temp.test_id('stable') and user_id = pg_temp.test_id('owner')$$, '23514', '[last owner]');
reset role;
select pg_temp.test_error('last owner profile cascade denied', $$delete from public.profiles where id = pg_temp.test_id('owner')$$, 'P0001', '[account delete] auth_cascade_required');
select pg_temp.test_error('last owner auth cascade denied', $$delete from auth.users where id = pg_temp.test_id('owner')$$, 'P0001', '[account delete] preparation_required');
select pg_temp.test_assert('failed cascades preserve profile', exists(select 1 from public.profiles where id = pg_temp.test_id('owner')));

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.test_id('owner')::text, true);
update public.stable_members set role = 'admin', access = 'owner' where stable_id = pg_temp.test_id('stable') and user_id = pg_temp.test_id('next-owner');
delete from public.stable_members where stable_id = pg_temp.test_id('stable') and user_id = pg_temp.test_id('owner');
reset role;
select pg_temp.test_assert('promote before removal transfers ownership', (select count(*) = 1 from public.stable_members where stable_id = pg_temp.test_id('stable') and role = 'admin' and access = 'owner'));
delete from public.stables where id = pg_temp.test_id('stable');
select pg_temp.test_assert('stable cascade deletes memberships and bookings', not exists(select 1 from public.stable_members where stable_id = pg_temp.test_id('stable')) and not exists(select 1 from public.arena_bookings where stable_id = pg_temp.test_id('stable')));
select pg_temp.test_assert('historical ownerless stable unchanged', (select name = 'Transient historical fixture' from public.stables where id = pg_temp.test_id('ownerless')));
select pg_temp.test_assert('join code is volatile', (select provolatile = 'v' from pg_proc where oid = 'public.generate_join_code()'::regprocedure));
select pg_temp.test_assert('trigger functions deny direct API execution', not exists(select 1 from unnest(array['anon', 'authenticated', 'service_role']) r, unnest(array['public.guard_arena_booking_overlap()', 'public.guard_last_stable_owner()']) f where has_function_privilege(r, f, 'execute')));
select pg_temp.test_assert('trigger functions have trusted fixed context', (select count(*) = 2 from pg_proc p join pg_roles r on r.oid = p.proowner where p.oid in ('public.guard_arena_booking_overlap()'::regprocedure, 'public.guard_last_stable_owner()'::regprocedure) and r.rolname = 'postgres' and p.prosecdef and p.provolatile = 'v' and p.proconfig @> array['search_path=pg_catalog', 'row_security=off']));
select count(*) || ' schema guard tests passed' from pg_temp.guard_test_results;
rollback;
