\set ON_ERROR_STOP on
begin;
set local application_name='sf_device_b';
set local statement_timeout='15s';
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',push_fixture.pid('B')::text,true);
select public.push_device_claim('fiction-race-shared','ios',
 (select (receipt->>'binding_generation')::uuid from push_fixture.race_state where label='initial'),push_fixture.pid('B'));
select pg_advisory_lock(8072001);
select pg_advisory_unlock(8072001);
commit;
