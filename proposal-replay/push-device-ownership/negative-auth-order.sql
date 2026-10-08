-- NEGATIVE ONLY: remove Auth-parent-first fence from prepare.
create or replace function public.push_receipts_prepare(p_attempt_id uuid, p_registrations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare v_count integer; v_inserted integer; v_now timestamptz; v_item jsonb; v_registration record; auth_users uuid[]; token_ids uuid[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = '[push receipts] Service role is required.';
  end if;
  if p_attempt_id is null then
    raise exception using errcode = '22023', message = '[push receipts] Attempt ID is required.';
  end if;
  -- A persisted request identity is permanently consumed, even if recipients,
  -- ordering or registration generations have since changed. Never rearm it.
  if exists(select 1 from private.push_delivery_attempts where attempt_id = p_attempt_id) then
    return jsonb_build_object('attempt_id', p_attempt_id, 'started', false);
  end if;
  if p_registrations is null or jsonb_typeof(p_registrations) <> 'array' then
    raise exception using errcode = '22023', message = '[push receipts] Registrations must be an array.';
  end if;
  v_count := jsonb_array_length(p_registrations);
  if v_count > 10000 then
    raise exception using errcode = '22023', message = '[push receipts] Registration batch exceeds its bound.';
  end if;
  for v_item in select value from jsonb_array_elements(p_registrations) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using errcode = '22023', message = '[push receipts] Invalid registration object.';
    end if;
    if v_item - array['position','token_id','user_id','registration_generation'] <> '{}'::jsonb
      or jsonb_typeof(v_item->'position') is distinct from 'number'
      or jsonb_typeof(v_item->'token_id') is distinct from 'string'
      or jsonb_typeof(v_item->'user_id') is distinct from 'string'
      or jsonb_typeof(v_item->'registration_generation') is distinct from 'string' then
      raise exception using errcode = '22023', message = '[push receipts] Invalid registration fields.';
    end if;
  end loop;
  if (select count(distinct r.position) from jsonb_to_recordset(p_registrations)
      as r(position integer, token_id uuid, user_id uuid, registration_generation uuid)) <> v_count
    or exists(select 1 from jsonb_to_recordset(p_registrations)
      as r(position integer, token_id uuid, user_id uuid, registration_generation uuid)
      where r.position < 0 or r.position >= v_count)
    or (select count(distinct (r.token_id,r.registration_generation)) from jsonb_to_recordset(p_registrations)
      as r(position integer, token_id uuid, user_id uuid, registration_generation uuid)) <> v_count then
    raise exception using errcode = '22023', message = '[push receipts] Positions and registrations must be exact and unique.';
  end if;
  -- The unique identity remains consumed; a failed new reservation rolls back.
  -- Auth locks precede this first ledger lock. A concurrent malformed duplicate
  -- may fail validation but can never start or rearm a send.
  v_now := clock_timestamp();
  insert into private.push_delivery_attempts(attempt_id,created_at,target_count)
  values(p_attempt_id,v_now,0) on conflict (attempt_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('attempt_id', p_attempt_id, 'started', false);
  end if;
  update private.push_delivery_attempts set target_count=v_count where attempt_id=p_attempt_id;
  perform private.lock_push_device_bindings(
    array(select token_id from jsonb_to_recordset(p_registrations)
      as r(position integer,token_id uuid,user_id uuid,registration_generation uuid)),false,array(select id from auth.users));
  -- Canonical token lock order avoids swapped-input reservation deadlocks.
  for v_registration in select * from jsonb_to_recordset(p_registrations)
    as r(position integer, token_id uuid, user_id uuid, registration_generation uuid)
    order by r.token_id, r.registration_generation loop
    perform 1 from public.push_tokens t where t.id = v_registration.token_id
      and t.user_id = v_registration.user_id and t.registration_generation = v_registration.registration_generation
      for share;
    if not found then
      raise exception using errcode = '23514', message = '[push receipts] Registration snapshot no longer matches.';
    end if;
    if not exists(select 1 from private.push_device_bindings b join public.push_tokens t
      on b.token_hash=sha256(convert_to(t.token,'UTF8'))
      where t.id=v_registration.token_id and b.token_id=t.id and b.current_user_id=v_registration.user_id
        and b.registration_generation=v_registration.registration_generation
        and exists(select 1 from public.profiles where id=v_registration.user_id)) then
      raise exception using errcode='23514',message='[push receipts] Registration is not the active device owner.';
    end if;
    insert into private.push_delivery_tickets(attempt_id,position,token_id,user_id,registration_generation,expires_at)
    values(p_attempt_id,v_registration.position,v_registration.token_id,v_registration.user_id,
      v_registration.registration_generation,v_now + interval '24 hours');
  end loop;
  return jsonb_build_object('attempt_id', p_attempt_id, 'started', true);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = '[push receipts] Invalid registration value.';
when deadlock_detected then
  raise exception using errcode='40001',message='[push receipts] Concurrent registration change; acknowledgement unconfirmed.';
end;
$$;
