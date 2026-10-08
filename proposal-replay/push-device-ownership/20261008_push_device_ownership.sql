-- REV2 PREPARE-ONLY: separate approval required; no Hosted or provider acceptance.
-- Main ef793f472f6be14d7909219216a5f9bc3c7e4e00; additive to receipt draft
-- SHA052bcb979a86d4c41247ab059049fe99efa121991f86b425be9d5ba32ffd5f68.
-- Built-in sha256(bytea): https://www.postgresql.org/docs/16/functions-binarystring.html
-- Raw token remains only in existing push_tokens. This private table retains
-- opaque token hashes/epochs after Auth deletion to prevent tombstone ABA.
-- No legacy owner inference, mass deletion, provider revocation or scheduler.
begin;
do $$begin
  if to_regprocedure('pg_catalog.sha256(bytea)') is null
    or to_regprocedure('public.push_receipts_prepare(uuid,jsonb)') is null
    or to_regprocedure('public.push_receipts_record_tickets(uuid,jsonb)') is null
    or to_regprocedure('public.push_receipts_apply(uuid,jsonb)') is null
    or to_regprocedure('private.retire_push_registration(uuid,uuid,uuid,timestamptz)') is null
    or not exists(select 1 from pg_attribute where attrelid=to_regclass('public.push_tokens')
      and attname='registration_generation' and atttypid='uuid'::regtype and not attisdropped) then
    raise exception using errcode='23514',message='[push device] Prior receipt ledger and built-in SHA256 are required.';
  end if;
end$$;
create table if not exists private.push_device_bindings (
  token_hash bytea primary key check(octet_length(token_hash)=32),
  binding_generation uuid not null default gen_random_uuid(),
  current_user_id uuid references auth.users(id) on delete set null,
  token_id uuid,
  registration_generation uuid,
  updated_at timestamptz not null default clock_timestamp(),
  check((current_user_id is null and token_id is null and registration_generation is null)
    or (current_user_id is not null and token_id is not null and registration_generation is not null))
);
-- Deliberately no token-row FK: raw legacy token DELETE must not create the
-- inverse token->binding lock order. Such dangling tuples are always inactive.
alter table private.push_device_bindings enable row level security;
revoke all on private.push_device_bindings from public,anon,authenticated,service_role;
create index if not exists push_device_bindings_user on private.push_device_bindings(current_user_id)
  where current_user_id is not null;

create or replace function private.detach_push_device_owner()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if old.current_user_id is not null and new.current_user_id is null then
    new.token_id:=null;
    new.registration_generation:=null;
    new.binding_generation:=gen_random_uuid();
    new.updated_at:=clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function private.detach_push_device_owner() from public,anon,authenticated,service_role;
drop trigger if exists detach_push_device_owner on private.push_device_bindings;
create trigger detach_push_device_owner before update on private.push_device_bindings
  for each row execute function private.detach_push_device_owner();

create or replace function private.push_device_hash(p_token text)
returns bytea language plpgsql immutable set search_path=pg_catalog as $$
begin
  if p_token is null or p_token='' or p_token<>btrim(p_token) or octet_length(p_token)>4096 then
    raise exception using errcode='22023',message='[push device] A bounded nonempty device token is required.';
  end if;
  return sha256(convert_to(p_token,'UTF8'));
end;
$$;
revoke all on function private.push_device_hash(text) from public,anon,authenticated,service_role;

create or replace function private.push_device_caller(p_expected_user_id uuid,p_require_profile boolean)
returns uuid language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare caller uuid;
begin
  caller:=auth.uid();
  if auth.role() is distinct from 'authenticated' or caller is null
    or p_expected_user_id is distinct from caller then
    raise exception using errcode='42501',message='[push device] Current authenticated account is required.';
  end if;
  if p_require_profile and not exists(select 1 from public.profiles where id=caller) then
    raise exception using errcode='42501',message='[push device] Active own profile is required.';
  end if;
  return caller;
end;
$$;
revoke all on function private.push_device_caller(uuid,boolean) from public,anon,authenticated,service_role;

-- Auth parents are the first row-lock namespace. Discovery has no locks;
-- distinct caller/target and observed previous-owner UIDs are locked in UUID
-- order before ledger, mapper or token rows. Under-lock scope drift rolls back.
-- Existing Hosted postgres UPDATE permits FOR KEY SHARE; no new grant.
create or replace function private.push_device_auth_scope(p_user_ids uuid[],p_token_ids uuid[],p_hash bytea)
returns uuid[] language sql stable security definer set search_path=pg_catalog set row_security=off as $$
  select coalesce(array_agg(uid order by uid),'{}'::uuid[]) from (
    select distinct uid from (
      select unnest(p_user_ids) uid
      union all select b.current_user_id from private.push_device_bindings b
        where b.token_hash=p_hash or b.token_hash in
          (select sha256(convert_to(t.token,'UTF8')) from public.push_tokens t where t.id=any(p_token_ids))
    ) discovered where uid is not null
  ) ordered
$$;
revoke all on function private.push_device_auth_scope(uuid[],uuid[],bytea) from public,anon,authenticated,service_role;
create or replace function private.lock_push_auth_users(p_user_ids uuid[])
returns void language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare uid uuid;
begin
  for uid in select distinct value from unnest(p_user_ids) value where value is not null order by value loop
    perform 1 from auth.users u where u.id=uid for key share;
    if not found then
      raise exception using errcode='40001',message='[push device] Account changed; read fresh state.';
    end if;
  end loop;
end;
$$;
revoke all on function private.lock_push_auth_users(uuid[]) from public,anon,authenticated,service_role;

create or replace function public.push_device_state(p_token text,p_expected_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare hashed bytea; generation uuid; caller uuid; auth_users uuid[];
begin
  caller:=private.push_device_caller(p_expected_user_id,true);
  hashed:=private.push_device_hash(p_token);
  auth_users:=private.push_device_auth_scope(array[caller],null,hashed);
  perform private.lock_push_auth_users(auth_users);
  insert into private.push_device_bindings(token_hash) values(hashed) on conflict(token_hash) do nothing;
  select binding_generation into generation from private.push_device_bindings where token_hash=hashed;
  return jsonb_build_object('binding_generation',generation);
exception when deadlock_detected then
  raise exception using errcode='40001',message='[push device] Concurrent ownership change; read fresh state.';
end;
$$;

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
  if binding.token_hash is null or binding.binding_generation is distinct from p_expected_binding_generation then
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

create or replace function public.push_device_release(
  p_token text,p_token_id uuid,p_registration_generation uuid,p_binding_generation uuid,p_expected_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare caller uuid; hashed bytea; binding private.push_device_bindings%rowtype; auth_users uuid[];
begin
  -- Cleanup may remain possible after own profile removal while Auth still
  -- verifies the token. It can neither bind nor discover a peer account.
  caller:=private.push_device_caller(p_expected_user_id,false);
  hashed:=private.push_device_hash(p_token);
  if p_token_id is null or p_registration_generation is null or p_binding_generation is null then
    raise exception using errcode='22023',message='[push device] Captured own device registration is required.';
  end if;
  auth_users:=private.push_device_auth_scope(array[caller],null,hashed);
  perform private.lock_push_auth_users(auth_users);
  select * into binding from private.push_device_bindings where token_hash=hashed for update;
  if binding.token_hash is not null and binding.current_user_id is not null and not (binding.current_user_id=any(auth_users)) then
    raise exception using errcode='40001',message='[push device] Account scope changed; read fresh state.';
  end if;
  if binding.token_hash is null or binding.current_user_id is distinct from caller or binding.token_id is distinct from p_token_id
    or binding.registration_generation is distinct from p_registration_generation
    or binding.binding_generation is distinct from p_binding_generation then
    return jsonb_build_object('user_id',caller,'released',false);
  end if;
  perform 1 from public.push_tokens where id=p_token_id and user_id=caller
    and registration_generation=p_registration_generation and token=p_token for update;
  delete from public.push_tokens where id=p_token_id and user_id=caller
    and registration_generation=p_registration_generation and token=p_token;
  update private.push_device_bindings set current_user_id=null,token_id=null,registration_generation=null,
    binding_generation=gen_random_uuid(),updated_at=clock_timestamp() where token_hash=hashed;
  return jsonb_build_object('user_id',caller,'released',true);
exception when deadlock_detected then
  raise exception using errcode='40001',message='[push device] Concurrent ownership change; cleanup unconfirmed.';
end;
$$;

create or replace function public.push_device_active_registrations(p_registrations jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare item jsonb; count_items integer; registrations jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode='42501',message='[push device] Service role is required.';
  end if;
  if p_registrations is null or jsonb_typeof(p_registrations)<>'array' then
    raise exception using errcode='22023',message='[push device] Registration array is required.';
  end if;
  count_items:=jsonb_array_length(p_registrations);
  if count_items>10000 then
    raise exception using errcode='22023',message='[push device] Registration array exceeds its bound.';
  end if;
  for item in select value from jsonb_array_elements(p_registrations) loop
    if jsonb_typeof(item) is distinct from 'object' then
      raise exception using errcode='22023',message='[push device] Registration object is required.';
    end if;
    if item-array['token_id','user_id','registration_generation']<>'{}'::jsonb
      or jsonb_typeof(item->'token_id') is distinct from 'string'
      or jsonb_typeof(item->'user_id') is distinct from 'string'
      or jsonb_typeof(item->'registration_generation') is distinct from 'string' then
      raise exception using errcode='22023',message='[push device] Invalid registration fields.';
    end if;
  end loop;
  if (select count(distinct(token_id,user_id,registration_generation)) from jsonb_to_recordset(p_registrations)
    as r(token_id uuid,user_id uuid,registration_generation uuid))<>count_items then
    raise exception using errcode='22023',message='[push device] Registration tuples must be unique.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('token_id',t.id,'user_id',t.user_id,
    'registration_generation',t.registration_generation) order by t.id),'[]'::jsonb) into registrations
  from jsonb_to_recordset(p_registrations) as r(token_id uuid,user_id uuid,registration_generation uuid)
  join public.push_tokens t on t.id=r.token_id and t.user_id=r.user_id and t.registration_generation=r.registration_generation
  join private.push_device_bindings b on b.token_hash=sha256(convert_to(t.token,'UTF8'))
    and b.current_user_id=t.user_id and b.token_id=t.id and b.registration_generation=t.registration_generation
  where exists(select 1 from public.profiles where id=t.user_id);
  return jsonb_build_object('registrations',registrations);
exception when invalid_text_representation then
  raise exception using errcode='22023',message='[push device] Invalid registration UUID.';
end;
$$;
revoke all on function public.push_device_state(text,uuid),public.push_device_claim(text,text,uuid,uuid),
  public.push_device_release(text,uuid,uuid,uuid,uuid),public.push_device_active_registrations(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.push_device_state(text,uuid),public.push_device_claim(text,text,uuid,uuid),
  public.push_device_release(text,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.push_device_active_registrations(jsonb) to service_role;

-- Auth parents precede ledger locks; canonical bindings precede token locks.
-- Discovery of an owner outside the already locked set rolls back. A raw legacy token write
-- cannot change bindings; its new registration_generation makes it inactive.
create or replace function private.lock_push_device_bindings(p_token_ids uuid[],p_write boolean,p_auth_users uuid[])
returns void language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare hashed bytea; owner_uid uuid;
begin
  for hashed in select distinct sha256(convert_to(token,'UTF8')) from public.push_tokens
    where id=any(p_token_ids) order by 1 loop
    if p_write then perform 1 from private.push_device_bindings where token_hash=hashed for update;
    else perform 1 from private.push_device_bindings where token_hash=hashed for share;
    end if;
    select current_user_id into owner_uid from private.push_device_bindings where token_hash=hashed;
    if owner_uid is not null and not (owner_uid=any(p_auth_users)) then
      raise exception using errcode='40001',message='[push receipts] Account scope changed; reservation unconfirmed.';
    end if;
  end loop;
end;
$$;
revoke all on function private.lock_push_device_bindings(uuid[],boolean,uuid[]) from public,anon,authenticated,service_role;

-- REV2: Auth-parent-first overlays; public API unchanged.
-- Exact additive receipt-function overlays; REV1 source hash is checked by builder.
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
  token_ids:=array(select token_id from jsonb_to_recordset(p_registrations)
    as r(position integer,token_id uuid,user_id uuid,registration_generation uuid));
  auth_users:=private.push_device_auth_scope(array(select user_id from jsonb_to_recordset(p_registrations)
    as r(position integer,token_id uuid,user_id uuid,registration_generation uuid)),token_ids,null);
  perform private.lock_push_auth_users(auth_users);
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
      as r(position integer,token_id uuid,user_id uuid,registration_generation uuid)),false,auth_users);
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

create or replace function public.push_receipts_record_tickets(p_attempt_id uuid, p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare v_count integer; v_item jsonb; v_result record; v_ticket private.push_delivery_tickets%rowtype; v_now timestamptz; auth_users uuid[]; token_ids uuid[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = '[push receipts] Service role is required.';
  end if;
  if p_attempt_id is null or p_results is null or jsonb_typeof(p_results) <> 'array' then
    raise exception using errcode = '22023', message = '[push receipts] Attempt and ticket array are required.';
  end if;
  v_count := jsonb_array_length(p_results);
  if v_count not between 1 and 100 then
    raise exception using errcode = '22023', message = '[push receipts] Ticket batch must contain 1 to 100 results.';
  end if;
  for v_item in select value from jsonb_array_elements(p_results) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using errcode = '22023', message = '[push receipts] Invalid ticket object.';
    end if;
    if v_item - array['position','status','ticket_id','error_code'] <> '{}'::jsonb
      or jsonb_typeof(v_item->'position') is distinct from 'number'
      or jsonb_typeof(v_item->'status') is distinct from 'string'
      or coalesce(jsonb_typeof(v_item->'ticket_id'),'null') not in ('null','string')
      or coalesce(jsonb_typeof(v_item->'error_code'),'null') not in ('null','string') then
      raise exception using errcode = '22023', message = '[push receipts] Invalid ticket fields.';
    end if;
  end loop;
  if (select count(distinct position) from jsonb_to_recordset(p_results)
    as r(position integer,status text,ticket_id text,error_code text)) <> v_count then
    raise exception using errcode = '22023', message = '[push receipts] Ticket positions must be unique.';
  end if;
  -- Nonlocking discovery precedes all ledger row locks.
  select array_agg(token_id),array_agg(user_id) into token_ids,auth_users from private.push_delivery_tickets
    where attempt_id=p_attempt_id and position=any(array(select position from jsonb_to_recordset(p_results)
      as r(position integer,status text,ticket_id text,error_code text)));
  auth_users:=private.push_device_auth_scope(auth_users,token_ids,null);
  perform private.lock_push_auth_users(auth_users);
  perform 1 from private.push_delivery_attempts where attempt_id = p_attempt_id for update;
  if not found then
    raise exception using errcode = '23514', message = '[push receipts] Attempt was not reserved.';
  end if;
  perform 1 from private.push_delivery_tickets where attempt_id=p_attempt_id
    and position=any(array(select position from jsonb_to_recordset(p_results)
      as r(position integer,status text,ticket_id text,error_code text))) order by position for update;
  perform private.lock_push_device_bindings(array(select token_id from private.push_delivery_tickets
    where attempt_id=p_attempt_id and position=any(array(select position from jsonb_to_recordset(p_results)
      as r(position integer,status text,ticket_id text,error_code text)))),true,auth_users);
  for v_result in select * from jsonb_to_recordset(p_results)
    as r(position integer,status text,ticket_id text,error_code text) order by position loop
    if v_result.status is null or v_result.status not in ('accepted','ticket_error','unknown')
      or v_result.error_code is not null and v_result.error_code not in
        ('DeviceNotRegistered','MessageTooBig','MessageRateExceeded','MismatchSenderId','InvalidCredentials','Unknown')
      or v_result.status = 'accepted' and (v_result.ticket_id is null or length(btrim(v_result.ticket_id)) = 0
        or length(v_result.ticket_id) > 512 or v_result.error_code is not null)
      or v_result.status <> 'accepted' and v_result.ticket_id is not null
      or v_result.status = 'unknown' and v_result.error_code is not null then
      raise exception using errcode = '22023', message = '[push receipts] Invalid ticket outcome.';
    end if;
    select * into v_ticket from private.push_delivery_tickets
      where attempt_id = p_attempt_id and position = v_result.position for update;
    if not found then
      raise exception using errcode = '23514', message = '[push receipts] Ticket position was not reserved.';
    end if;
    if v_ticket.ticket_recorded_at is not null then
      if v_ticket.ticket_status is distinct from v_result.status or v_ticket.ticket_id is distinct from v_result.ticket_id
        or v_ticket.ticket_error_code is distinct from v_result.error_code then
        raise exception using errcode = '40001', message = '[push receipts] Ticket outcome conflicts with its frozen acknowledgement.';
      end if;
      continue;
    end if;
    v_now := clock_timestamp();
    update private.push_delivery_tickets set ticket_status=v_result.status,ticket_id=v_result.ticket_id,
      ticket_error_code=v_result.error_code,ticket_recorded_at=v_now,
      receipt_status=case when v_result.status='ticket_error' then null
        when v_now >= expires_at then 'expired_unknown'
        when v_result.status='accepted' then case when v_now+interval '15 minutes' < expires_at
          then 'pending' else 'expired_unknown' end else null end,
      next_check_at=case when v_result.status='accepted' and v_now + interval '15 minutes' < expires_at
        then v_now + interval '15 minutes' else null end
    where attempt_id=p_attempt_id and position=v_result.position;
    if v_result.status='ticket_error' and v_result.error_code='DeviceNotRegistered' then
      -- A terminal send ticket has no collector lease. NULL is intentional;
      -- cleanup still requires the exact original registration generation.
      perform private.retire_push_registration(v_ticket.token_id,v_ticket.user_id,v_ticket.registration_generation,null);
    end if;
  end loop;
  return jsonb_build_object('attempt_id',p_attempt_id,'recorded_count',v_count);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = '[push receipts] Invalid ticket value.';
when unique_violation then
  raise exception using errcode = '40001', message = '[push receipts] Ticket ID conflicts with an existing acknowledgement.';
when deadlock_detected then
  raise exception using errcode='40001',message='[push receipts] Concurrent registration change; acknowledgement unconfirmed.';
end;
$$;

create or replace function public.push_receipts_apply(p_lease_id uuid, p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare v_count integer; v_locked integer; v_item jsonb; v_result record; v_ticket private.push_delivery_tickets%rowtype;
  v_now timestamptz; v_ok integer:=0; v_error integer:=0; v_missing integer:=0; v_deleted integer:=0; auth_users uuid[]; token_ids uuid[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = '[push receipts] Service role is required.';
  end if;
  if p_lease_id is null or p_results is null or jsonb_typeof(p_results) <> 'array' then
    raise exception using errcode = '22023', message = '[push receipts] Lease and receipt array are required.';
  end if;
  v_count := jsonb_array_length(p_results);
  if v_count not between 1 and 1000 then
    raise exception using errcode = '22023', message = '[push receipts] Receipt batch must contain 1 to 1000 results.';
  end if;
  for v_item in select value from jsonb_array_elements(p_results) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using errcode = '22023', message = '[push receipts] Invalid receipt object.';
    end if;
    if v_item - array['attempt_id','position','ticket_id','status','error_code'] <> '{}'::jsonb
      or jsonb_typeof(v_item->'attempt_id') is distinct from 'string'
      or jsonb_typeof(v_item->'position') is distinct from 'number'
      or jsonb_typeof(v_item->'ticket_id') is distinct from 'string'
      or jsonb_typeof(v_item->'status') is distinct from 'string'
      or coalesce(jsonb_typeof(v_item->'error_code'),'null') not in ('null','string') then
      raise exception using errcode = '22023', message = '[push receipts] Invalid receipt fields.';
    end if;
  end loop;
  if (select count(distinct (attempt_id,position)) from jsonb_to_recordset(p_results)
    as r(attempt_id uuid,position integer,ticket_id text,status text,error_code text)) <> v_count then
    raise exception using errcode = '22023', message = '[push receipts] Receipt positions must be unique.';
  end if;
  -- Lease discovery is nonlocking. A missing Auth parent fails before
  -- acquiring any ledger, mapper or token row lock.
  select array_agg(token_id),array_agg(user_id) into token_ids,auth_users
    from private.push_delivery_tickets where lease_id=p_lease_id;
  auth_users:=private.push_device_auth_scope(auth_users,token_ids,null);
  perform private.lock_push_auth_users(auth_users);
  perform 1 from private.push_delivery_tickets where lease_id=p_lease_id order by attempt_id,position for update;
  get diagnostics v_locked=row_count;
  v_now:=clock_timestamp();
  if v_locked=0 or v_locked<>v_count or exists(select 1 from private.push_delivery_tickets where lease_id=p_lease_id
    and (lease_expires_at <= v_now or expires_at <= v_now)) then
    raise exception using errcode = '40001', message = '[push receipts] Lease is stale, expired or incomplete.';
  end if;
  perform private.lock_push_device_bindings(array(select token_id from private.push_delivery_tickets
    where lease_id=p_lease_id),true,auth_users);
  for v_result in select * from jsonb_to_recordset(p_results)
    as r(attempt_id uuid,position integer,ticket_id text,status text,error_code text) order by attempt_id,position loop
    if v_result.status is null or v_result.status not in ('receipt_ok','receipt_error','missing')
      or length(btrim(v_result.ticket_id))=0 or length(v_result.ticket_id)>512
      or v_result.error_code is not null and v_result.error_code not in
        ('DeviceNotRegistered','MessageTooBig','MessageRateExceeded','MismatchSenderId','InvalidCredentials','Unknown')
      or v_result.status <> 'receipt_error' and v_result.error_code is not null then
      raise exception using errcode = '22023', message = '[push receipts] Invalid receipt outcome.';
    end if;
    select * into v_ticket from private.push_delivery_tickets where attempt_id=v_result.attempt_id
      and position=v_result.position and lease_id=p_lease_id for update;
    v_now:=clock_timestamp();
    if not found or v_ticket.ticket_id is distinct from v_result.ticket_id or v_ticket.ticket_status<>'accepted'
      or v_ticket.receipt_status<>'pending' or v_ticket.lease_expires_at <= v_now or v_ticket.expires_at <= v_now then
      raise exception using errcode = '40001', message = '[push receipts] Receipt does not match its current claim.';
    end if;
    update private.push_delivery_tickets set receipt_status=case when v_result.status='missing'
        then case when v_now+interval '15 minutes' < expires_at then 'pending' else 'expired_unknown' end
        else v_result.status end,
      receipt_error_code=v_result.error_code,receipt_checked_at=v_now,
      next_check_at=case when v_result.status='missing' and v_now+interval '15 minutes' < expires_at
        then v_now+interval '15 minutes' else null end,
      lease_id=null,lease_worker_id=null,lease_expires_at=null
    where attempt_id=v_result.attempt_id and position=v_result.position;
    if v_result.status='receipt_ok' then v_ok:=v_ok+1;
    elsif v_result.status='receipt_error' then
      v_error:=v_error+1;
      if v_result.error_code='DeviceNotRegistered' then
        v_deleted:=v_deleted+private.retire_push_registration(v_ticket.token_id,v_ticket.user_id,
          v_ticket.registration_generation,v_ticket.lease_expires_at);
      end if;
    else v_missing:=v_missing+1;
    end if;
  end loop;
  return jsonb_build_object('lease_id',p_lease_id,'applied_count',v_count,'receipt_ok_count',v_ok,
    'receipt_error_count',v_error,'missing_count',v_missing,'deleted_token_count',v_deleted);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = '[push receipts] Invalid receipt value.';
when deadlock_detected then
  raise exception using errcode='40001',message='[push receipts] Concurrent registration change; acknowledgement unconfirmed.';
end;
$$;

create or replace function private.retire_push_registration(
  p_token_id uuid,p_user_id uuid,p_generation uuid,p_deadline timestamptz)
returns integer language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare hashed bytea; binding private.push_device_bindings%rowtype; matched boolean:=false; deleted integer;
begin
  select sha256(convert_to(token,'UTF8')) into hashed from public.push_tokens
    where id=p_token_id and user_id=p_user_id and registration_generation=p_generation;
  if found then
    select * into binding from private.push_device_bindings where token_hash=hashed for update;
    matched:=found and binding.current_user_id is not distinct from p_user_id
      and binding.token_id is not distinct from p_token_id and binding.registration_generation is not distinct from p_generation;
    if matched then
      perform 1 from public.push_tokens where id=p_token_id and user_id=p_user_id and registration_generation=p_generation for update;
      matched:=found;
    end if;
  end if;
  if p_deadline is not null and clock_timestamp()>=p_deadline then
    raise exception using errcode='40001',message='[push receipts] Lease deadline expired before token cleanup.';
  end if;
  if not matched then return 0; end if;
  delete from public.push_tokens where id=p_token_id and user_id=p_user_id and registration_generation=p_generation;
  get diagnostics deleted=row_count;
  if deleted=1 then
    update private.push_device_bindings set current_user_id=null,token_id=null,registration_generation=null,
      binding_generation=gen_random_uuid(),updated_at=clock_timestamp() where token_hash=hashed;
  end if;
  return deleted;
end;
$$;
revoke all on function private.retire_push_registration(uuid,uuid,uuid,timestamptz) from public,anon,authenticated,service_role;

commit;
