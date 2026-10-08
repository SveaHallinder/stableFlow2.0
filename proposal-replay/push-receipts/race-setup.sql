-- ISOLATED TWO-BACKEND FIXTURE ONLY. Run after fixture-auth-net + full schema
-- + candidate append. Each race family requires a fresh disposable DB copy.
-- Driver must hold advisory barrier 8071001 (CAS) / 8071002 (SKIP LOCKED) in
-- an open control connection BEFORE launching its B backend. Observe B waiting
-- on that exact advisory lock through pg_stat_activity/pg_locks, not a sleep.
\set ON_ERROR_STOP on
begin;
do $$begin
  if current_setting('stableflow.test_fixture',true) is distinct from 'push_receipts' then
    raise exception '[push receipts fixture] Explicit isolated fixture required.';
  end if;
end$$;
create function push_fixture.pid(value text) returns uuid language sql immutable
as $$select md5('stableflow-push-receipts-race-'||value)::uuid$$;
grant execute on function push_fixture.pid(text) to authenticated,service_role;
grant select,insert,update on public.push_tokens to authenticated;
grant select on public.push_tokens to service_role;
select push_fixture.synthetic_auth_user(push_fixture.pid('owner'));
insert into public.push_tokens(id,user_id,token,platform) values
  (push_fixture.pid('cas-token'),push_fixture.pid('owner'),'fiction-cas-token','ios'),
  (push_fixture.pid('skip-token-0'),push_fixture.pid('owner'),'fiction-skip-token-0','ios'),
  (push_fixture.pid('skip-token-1'),push_fixture.pid('owner'),'fiction-skip-token-1','ios');
select set_config('request.jwt.claim.role','service_role',true);
select public.push_receipts_prepare(push_fixture.pid('cas-attempt'),
  (select jsonb_build_array(jsonb_build_object('position',0,'token_id',id,'user_id',user_id,
    'registration_generation',registration_generation)) from public.push_tokens where id=push_fixture.pid('cas-token')));
select public.push_receipts_record_tickets(push_fixture.pid('cas-attempt'),
  '[{"position":0,"status":"accepted","ticket_id":"fiction-cas-ticket","error_code":null}]');
update private.push_delivery_tickets set next_check_at=statement_timestamp()-interval '1 second'
  where attempt_id=push_fixture.pid('cas-attempt');
insert into push_fixture.race_state values('cas-claim',public.push_receipts_claim_due(push_fixture.pid('cas-worker'),1));
select public.push_receipts_prepare(push_fixture.pid('skip-attempt'),
  (select jsonb_agg(jsonb_build_object('position',n,'token_id',t.id,'user_id',t.user_id,
    'registration_generation',t.registration_generation) order by n)
    from generate_series(0,1) n join public.push_tokens t on t.id=push_fixture.pid('skip-token-'||n)));
select public.push_receipts_record_tickets(push_fixture.pid('skip-attempt'),
  '[{"position":0,"status":"accepted","ticket_id":"fiction-skip-ticket-0","error_code":null},
    {"position":1,"status":"accepted","ticket_id":"fiction-skip-ticket-1","error_code":null}]');
update private.push_delivery_tickets set next_check_at=statement_timestamp()-interval '1 second'
  where attempt_id=push_fixture.pid('skip-attempt');
commit;
