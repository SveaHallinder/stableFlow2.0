-- Driver already holds advisory 8071002. This legitimate worker locks the first
-- due ledger row and waits without a timing/sleep assumption before commit.
\set ON_ERROR_STOP on
begin;
set local application_name='sf_push_skip_b';
set local statement_timeout='15s';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$declare claim jsonb;
begin
  claim:=public.push_receipts_claim_due(push_fixture.pid('skip-worker-b'),1);
  if jsonb_array_length(claim->'items')<>1 or claim->'items'->0->>'ticket_id'<>'fiction-skip-ticket-0' then
    raise exception '[push receipts fixture] FAIL initial ordered claim is not the first due row.';
  end if;
end;
$$;
select pg_advisory_lock(8071002);
select pg_advisory_unlock(8071002);
commit;
