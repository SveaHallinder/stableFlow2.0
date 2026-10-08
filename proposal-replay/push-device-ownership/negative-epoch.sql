-- NEGATIVE ONLY: remove claim epoch predicate, retain Auth fences.
create or replace function public.push_device_claim(
  p_token text,p_platform text,p_expected_binding_generation uuid,p_expected_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare caller uuid; hashed bytea; binding private.push_device_bindings%rowtype;
  registration public.push_tokens%rowtype; generation uuid; auth_users uuid[];
begin
  caller:=private.push_device_caller(p_expected_user_id,true);
  hashed:=private.push_device_hash(p_token);
  if p_platform is null or p_platform not in ('ios','android') or p_expected_binding_generation is null then
    raise exception using errcode='22023',message='[push device] Platform and observed binding generation are required.';
  end if;
  auth_users:=private.push_device_auth_scope(array[caller],null,hashed);
  perform private.lock_push_auth_users(auth_users);
  select * into binding from private.push_device_bindings where token_hash=hashed for update;
  if binding.token_hash is not null and binding.current_user_id is not null and not (binding.current_user_id=any(auth_users)) then
    raise exception using errcode='40001',message='[push device] Account scope changed; read fresh state.';
  end if;
  if binding.token_hash is null then
    raise exception using errcode='40001',message='[push device] Device ownership changed; read fresh state.';
  end if;
  -- Check again after a binding-lock wait. expected UID never supplies identity.
  perform private.push_device_caller(p_expected_user_id,true);
  insert into public.push_tokens(user_id,token,platform,updated_at)
    values(caller,p_token,p_platform,clock_timestamp())
    on conflict(user_id,token) do update set platform=excluded.platform,updated_at=excluded.updated_at
    returning * into registration;
  generation:=gen_random_uuid();
  update private.push_device_bindings set current_user_id=caller,token_id=registration.id,
    registration_generation=registration.registration_generation,binding_generation=generation,updated_at=clock_timestamp()
    where token_hash=hashed;
  return jsonb_build_object('user_id',caller,'token_id',registration.id,
    'registration_generation',registration.registration_generation,'binding_generation',generation);
exception when foreign_key_violation then
  raise exception using errcode='40001',message='[push device] Account changed during device registration.';
when deadlock_detected then
  raise exception using errcode='40001',message='[push device] Concurrent ownership change; read fresh state.';
end;
$$;
