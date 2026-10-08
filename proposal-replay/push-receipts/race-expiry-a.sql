-- Driver must first observe B holding the unchanged token row, then give this
-- collector a still-valid absolute DB lease deadline. A must block on B before
-- the driver observes clock_timestamp() >= that deadline and releases B.
\set ON_ERROR_STOP on
begin;
set local application_name='sf_push_expiry_a';
set local statement_timeout='15s';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$declare actual_code text; actual_message text; ack jsonb;
begin
  begin
    ack:=public.push_receipts_apply(
      (select (receipt->>'lease_id')::uuid from push_fixture.race_state where label='cas-claim'),
      jsonb_build_array(jsonb_build_object('attempt_id',push_fixture.pid('cas-attempt'),'position',0,
        'ticket_id','fiction-cas-ticket','status','receipt_error','error_code','DeviceNotRegistered')));
  exception when others then
    get stacked diagnostics actual_code=returned_sqlstate,actual_message=message_text;
  end;
  if actual_code is distinct from '40001'
    or position('[push receipts] Lease deadline expired before token cleanup.' in coalesce(actual_message,''))=0 then
    raise exception '[push receipts fixture] FAIL expired collector finalized unchanged registration after lock wait.';
  end if;
end;
$$;
commit;
