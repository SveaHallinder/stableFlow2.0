-- Run as actual LOGIN authenticated. Captured old A receipt remains separate.
\set ON_ERROR_STOP on
begin;
do $$begin if session_user is distinct from 'authenticated' then raise exception 'FAIL B setup requires actual authenticated LOGIN'; end if; end$$;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',push_fixture.pid('B')::text,true);
insert into push_fixture.race_state(label,receipt)
select 'initial-B',public.push_device_claim('fiction-race-shared','ios',
 (select (receipt->>'binding_generation')::uuid from push_fixture.race_state where label='initial'),push_fixture.pid('B'));
commit;
