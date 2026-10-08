\set ON_ERROR_STOP on
\set VERBOSITY verbose
begin;
set local application_name='sf_device_auth_prepare';
set local statement_timeout='20s';
select set_config('request.jwt.claim.role','service_role',true);
do $$declare code text; message text;
begin
  begin
    perform public.push_receipts_prepare(push_fixture.pid('auth-delete-attempt'),
      (select jsonb_build_array(jsonb_build_object('position',0,'token_id',receipt->>'token_id',
        'user_id',receipt->>'user_id','registration_generation',receipt->>'registration_generation'))
       from push_fixture.race_state where label='initial'));
  exception when others then get stacked diagnostics code=returned_sqlstate,message=message_text;
  end;
  -- The observer must also prove the actual two-way backend wait graph;
  -- this FAIL marker alone never establishes the intended sensitivity.
  raise exception 'FAIL missing Auth-parent fence produced child-before-parent cycle (%)',coalesce(code,'started');
end$$;
commit;
