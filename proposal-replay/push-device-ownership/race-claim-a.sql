\set ON_ERROR_STOP on
begin;
set local application_name='sf_device_a';
set local statement_timeout='15s';
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',push_fixture.pid('A')::text,true);
do $$declare code text; message text; receipt jsonb;
begin
 begin
  select public.push_device_claim('fiction-race-shared','ios',
   coalesce((select (race_state.receipt->>'binding_generation')::uuid from push_fixture.race_state where label='initial-B'),
    (select (race_state.receipt->>'binding_generation')::uuid from push_fixture.race_state where label='initial')),push_fixture.pid('A')) into receipt;
 exception when others then get stacked diagnostics code=returned_sqlstate,message=message_text;
 end;
 raise notice '%',jsonb_build_object('push_fixture_outcome','claim','code',code,'message',message,'receipt',receipt);
 if code is distinct from '40001' or coalesce(message,'') not in
  ('[push device] Device ownership changed; read fresh state.',
   '[push device] Account scope changed; read fresh state.') then
  raise exception 'FAIL dispatched old A claim replaced committed B ownership (code=%, message=%)',coalesce(code,'none'),coalesce(message,'none');
 end if;
end$$;
commit;
