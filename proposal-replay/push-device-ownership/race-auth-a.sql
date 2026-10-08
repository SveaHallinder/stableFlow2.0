\set ON_ERROR_STOP on
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
  if code is distinct from '40001' or message is distinct from '[push device] Account changed; read fresh state.' then
    raise exception 'FAIL Auth-parent-first prepare did not reject deleted account';
  end if;
end$$;
commit;
