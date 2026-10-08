-- Launch only after B is observed on advisory 8071002. A must finish successfully
-- while B remains blocked; driver must not release B until A has exited.
\set ON_ERROR_STOP on
begin;
set local application_name='sf_push_skip_a';
set local statement_timeout='5s';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$declare claim jsonb;
begin
  claim:=public.push_receipts_claim_due(push_fixture.pid('skip-worker-a'),1);
  if jsonb_array_length(claim->'items')<>1 or claim->'items'->0->>'ticket_id'<>'fiction-skip-ticket-1' then
    raise exception '[push receipts fixture] FAIL SKIP LOCKED did not claim the remaining due row.';
  end if;
end;
$$;
commit;
