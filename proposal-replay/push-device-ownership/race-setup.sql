\set ON_ERROR_STOP on
begin;
do $$begin if current_setting('stableflow.test_fixture',true) is distinct from 'push_receipts' then raise exception '[push device fixture] Isolated fixture required.'; end if; end$$;
create function push_fixture.pid(v text) returns uuid language sql immutable as $$select md5('fiction-push-device-race-'||v)::uuid$$;
grant execute on function push_fixture.pid(text) to authenticated,service_role;
grant select,insert,update,delete on public.push_tokens to authenticated;
grant select on public.push_tokens to service_role;
select push_fixture.synthetic_auth_user(push_fixture.pid('A'));
select push_fixture.synthetic_auth_user(push_fixture.pid('B'));
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',push_fixture.pid('A')::text,true);
reset role;
select set_config('request.jwt.claim.role','authenticated',true);
insert into push_fixture.race_state values('initial',public.push_device_claim('fiction-race-shared','ios',
 (public.push_device_state('fiction-race-shared',push_fixture.pid('A'))->>'binding_generation')::uuid,push_fixture.pid('A')));
commit;
