\set ON_ERROR_STOP on
begin;
set local application_name='sf_device_a';
set local statement_timeout='15s';
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',push_fixture.pid('A')::text,true);
do $$declare code text; message text;
begin
 begin
  perform public.push_device_claim('fiction-race-shared','ios',
   (select (receipt->>'binding_generation')::uuid from push_fixture.race_state where label='initial'),push_fixture.pid('A'));
 exception when others then get stacked diagnostics code=returned_sqlstate,message=message_text;
 end;
 if code is distinct from '40001' or position('[push device] Device ownership changed' in coalesce(message,''))=0 then
  raise exception 'FAIL dispatched old A claim replaced committed B ownership';
 end if;
end$$;
commit;
