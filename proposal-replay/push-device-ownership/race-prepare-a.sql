\set ON_ERROR_STOP on
begin;
set local application_name='sf_device_a';
set local statement_timeout='15s';
select set_config('request.jwt.claim.role','service_role',true);
do $$declare code text; message text;
begin
 begin
  perform public.push_receipts_prepare(push_fixture.pid('stale-attempt'),
   (select jsonb_build_array(jsonb_build_object('position',0,'token_id',receipt->>'token_id','user_id',receipt->>'user_id',
    'registration_generation',receipt->>'registration_generation')) from push_fixture.race_state where label='initial'));
 exception when others then get stacked diagnostics code=returned_sqlstate,message=message_text;
 end;
 raise notice '%',jsonb_build_object('push_fixture_outcome','prepare','code',code,'message',message);
 if (code='23514' and message='[push receipts] Registration is not the active device owner.'
   or code='40001' and message='[push receipts] Account scope changed; reservation unconfirmed.') is distinct from true then
  raise exception 'FAIL receipt prepare reserved stale inactive owner after binding transfer (code=%, message=%)',coalesce(code,'none'),coalesce(message,'none');
 end if;
end$$;
commit;
