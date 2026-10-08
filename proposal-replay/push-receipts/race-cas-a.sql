-- Launch only after B is observed on the held advisory barrier. Driver must
-- observe A's blocking PID includes B before releasing barrier 8071001.
-- Positive candidate: zero deleted. Negative-CAS copy: explicit FAIL.
\set ON_ERROR_STOP on
begin;
set local application_name='sf_push_cas_a';
set local statement_timeout='15s';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$declare ack jsonb;
begin
  ack:=public.push_receipts_apply(
    (select (receipt->>'lease_id')::uuid from push_fixture.race_state where label='cas-claim'),
    jsonb_build_array(jsonb_build_object('attempt_id',push_fixture.pid('cas-attempt'),'position',0,
      'ticket_id','fiction-cas-ticket','status','receipt_error','error_code','DeviceNotRegistered')));
  if ack->>'deleted_token_count' is distinct from '0' then
    raise exception '[push receipts fixture] FAIL old DNR deleted a concurrent fresh registration.';
  end if;
end;
$$;
commit;
