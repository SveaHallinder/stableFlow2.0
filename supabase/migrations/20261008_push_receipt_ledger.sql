-- PREPARE-ONLY: no Hosted approval or runtime acceptance is implied.
-- Base b0b5ee71a9577d3ae2b7605874befc76f55efc7f. Requires the existing
-- 20250313_push_notifications.sql tables and auth.users/auth.role().
-- No provider configuration, scheduler, extension, token text or message storage.
-- Root's fresh Hosted catalog-only preflight reported: actor postgres,
-- auth.users SELECT=true/REFERENCES=true; authenticated and anon both currently
-- have notify_push EXECUTE=true. No user rows/Vault secrets/function calls read.
-- The notify EXECUTE revoke below fixes that concrete permission gap; this
-- entire migration still requires separate exact schema approval and replay.
begin;

do $preflight$
begin
  if to_regclass('public.push_tokens') is null
    or to_regclass('public.notification_preferences') is null then
    raise exception using errcode = '23514', message = '[push receipts] Existing push schema is required.';
  end if;
end
$preflight$;

alter table public.push_tokens
  add column if not exists registration_generation uuid not null default gen_random_uuid();

create or replace function public.rotate_push_registration_generation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  -- Every registration write gets a fresh DB value, including a client trying
  -- to restore an old generation or an ON CONFLICT upsert of the same token.
  new.registration_generation := gen_random_uuid();
  return new;
end;
$$;
revoke all on function public.rotate_push_registration_generation() from public, anon, authenticated, service_role;
drop trigger if exists rotate_push_registration_generation on public.push_tokens;
create trigger rotate_push_registration_generation
  before insert or update on public.push_tokens
  for each row execute function public.rotate_push_registration_generation();

create schema if not exists private;
create table if not exists private.push_delivery_attempts (
  attempt_id uuid primary key,
  created_at timestamptz not null,
  target_count integer not null check (target_count between 0 and 10000)
);
create table if not exists private.push_delivery_tickets (
  attempt_id uuid not null references private.push_delivery_attempts(attempt_id) on delete cascade,
  position integer not null check (position between 0 and 9999),
  token_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  registration_generation uuid not null,
  ticket_status text not null default 'unknown' check (ticket_status in ('unknown', 'accepted', 'ticket_error')),
  ticket_id text unique check (ticket_id is null or (length(btrim(ticket_id)) > 0 and length(ticket_id) <= 512)),
  ticket_error_code text check (ticket_error_code is null or ticket_error_code in
    ('DeviceNotRegistered', 'MessageTooBig', 'MessageRateExceeded', 'MismatchSenderId', 'InvalidCredentials', 'Unknown')),
  ticket_recorded_at timestamptz,
  receipt_status text check (receipt_status in ('pending', 'receipt_ok', 'receipt_error', 'expired_unknown')),
  receipt_error_code text check (receipt_error_code is null or receipt_error_code in
    ('DeviceNotRegistered', 'MessageTooBig', 'MessageRateExceeded', 'MismatchSenderId', 'InvalidCredentials', 'Unknown')),
  receipt_checked_at timestamptz,
  next_check_at timestamptz,
  expires_at timestamptz not null,
  lease_id uuid,
  lease_worker_id uuid,
  lease_expires_at timestamptz,
  primary key (attempt_id, position),
  unique (attempt_id, token_id, registration_generation),
  check ((ticket_status = 'accepted') = (ticket_id is not null)),
  check (ticket_status = 'unknown' or ticket_recorded_at is not null),
  check (ticket_status = 'ticket_error' or ticket_error_code is null),
  check ((ticket_status = 'accepted' and receipt_status is not null)
    or (ticket_status = 'unknown' and (receipt_status is null or receipt_status = 'expired_unknown'))
    or (ticket_status = 'ticket_error' and receipt_status is null)),
  check (receipt_error_code is null or receipt_status is not distinct from 'receipt_error'),
  check ((receipt_status is not distinct from 'pending') = (next_check_at is not null)),
  check ((lease_id is null and lease_worker_id is null and lease_expires_at is null)
    or (lease_id is not null and lease_worker_id is not null and lease_expires_at is not null
      and receipt_status = 'pending' and lease_expires_at <= expires_at))
);
create index if not exists push_delivery_tickets_due on private.push_delivery_tickets(next_check_at, attempt_id, position)
  where ticket_status = 'accepted' and receipt_status = 'pending';
create index if not exists push_delivery_tickets_expiry on private.push_delivery_tickets(expires_at)
  where ticket_status = 'unknown' and receipt_status is null or receipt_status = 'pending';
create index if not exists push_delivery_tickets_lease on private.push_delivery_tickets(lease_id)
  where lease_id is not null;
create index if not exists push_delivery_tickets_user on private.push_delivery_tickets(user_id);

alter table private.push_delivery_attempts enable row level security;
alter table private.push_delivery_tickets enable row level security;
-- Service workers also use RPC only; no direct raw-table grant is introduced.
revoke all on table private.push_delivery_attempts, private.push_delivery_tickets from public, anon, authenticated, service_role;

create or replace function private.retire_push_registration(
  p_token_id uuid, p_user_id uuid, p_generation uuid, p_deadline timestamptz)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare v_deleted integer; v_matched boolean;
begin
  -- Wait for the exact snapshot row before checking a collector's deadline.
  -- The row may be locked without being re-registered; generation alone would
  -- not stop an expired collector from deleting it after that wait.
  perform 1 from public.push_tokens
    where id = p_token_id and user_id = p_user_id and registration_generation = p_generation for update;
  v_matched := found;
  if p_deadline is not null and clock_timestamp() >= p_deadline then
    raise exception using errcode = '40001', message = '[push receipts] Lease deadline expired before token cleanup.';
  end if;
  if not v_matched then return 0; end if;
  delete from public.push_tokens
  where id = p_token_id and user_id = p_user_id and registration_generation = p_generation;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function private.retire_push_registration(uuid, uuid, uuid, timestamptz) from public, anon, authenticated, service_role;

create or replace function public.push_receipts_prepare(p_attempt_id uuid, p_registrations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare v_count integer; v_inserted integer; v_now timestamptz; v_item jsonb; v_registration record;
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
  -- The unique parent insert also consumes concurrent retries before looking
  -- at changed payloads. An invalid NEW reservation rolls back atomically.
  v_now := clock_timestamp();
  insert into private.push_delivery_attempts(attempt_id,created_at,target_count)
  values(p_attempt_id,v_now,0) on conflict (attempt_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
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
  update private.push_delivery_attempts set target_count=v_count where attempt_id=p_attempt_id;
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
    insert into private.push_delivery_tickets(attempt_id,position,token_id,user_id,registration_generation,expires_at)
    values(p_attempt_id,v_registration.position,v_registration.token_id,v_registration.user_id,
      v_registration.registration_generation,v_now + interval '24 hours');
  end loop;
  return jsonb_build_object('attempt_id', p_attempt_id, 'started', true);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = '[push receipts] Invalid registration value.';
end;
$$;

create or replace function public.push_receipts_record_tickets(p_attempt_id uuid, p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare v_count integer; v_item jsonb; v_result record; v_ticket private.push_delivery_tickets%rowtype; v_now timestamptz;
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
  perform 1 from private.push_delivery_attempts where attempt_id = p_attempt_id for update;
  if not found then
    raise exception using errcode = '23514', message = '[push receipts] Attempt was not reserved.';
  end if;
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
end;
$$;

create or replace function public.push_receipts_claim_due(p_worker_id uuid, p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare v_lease_id uuid; v_now timestamptz; v_items jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = '[push receipts] Service role is required.';
  end if;
  if p_worker_id is null or p_limit is null or p_limit not between 1 and 1000 then
    raise exception using errcode = '22023', message = '[push receipts] Worker and limit from 1 to 1000 are required.';
  end if;
  v_lease_id := gen_random_uuid();
  v_now := clock_timestamp();
  -- Bound expiry maintenance too; locked rows remain for a later collector.
  with expired as (
    select attempt_id,position from private.push_delivery_tickets
    where expires_at <= v_now and (ticket_status='unknown' and receipt_status is null or receipt_status='pending')
    order by expires_at,attempt_id,position limit 1000 for update skip locked
  ) update private.push_delivery_tickets t set receipt_status='expired_unknown',next_check_at=null,
    lease_id=null,lease_worker_id=null,lease_expires_at=null
    from expired e where t.attempt_id=e.attempt_id and t.position=e.position;
  with due as (
    select attempt_id,position from private.push_delivery_tickets
    where ticket_status='accepted' and receipt_status='pending' and next_check_at <= v_now and expires_at > v_now
      and (lease_id is null or lease_expires_at <= v_now)
    order by next_check_at,attempt_id,position limit p_limit for update skip locked
  ), claimed as (
    update private.push_delivery_tickets t set lease_id=v_lease_id,lease_worker_id=p_worker_id,
      lease_expires_at=least(v_now+interval '2 minutes',t.expires_at),
      next_check_at=least(v_now+interval '15 minutes',t.expires_at)
    from due d where t.attempt_id=d.attempt_id and t.position=d.position
    returning t.attempt_id,t.position,t.ticket_id
  ) select coalesce(jsonb_agg(jsonb_build_object('attempt_id',attempt_id,'position',position,'ticket_id',ticket_id)
    order by attempt_id,position),'[]'::jsonb) into v_items from claimed;
  return jsonb_build_object('lease_id',v_lease_id,'items',v_items);
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
  v_now timestamptz; v_ok integer:=0; v_error integer:=0; v_missing integer:=0; v_deleted integer:=0;
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
  perform 1 from private.push_delivery_tickets where lease_id=p_lease_id order by attempt_id,position for update;
  get diagnostics v_locked=row_count;
  v_now:=clock_timestamp();
  if v_locked=0 or v_locked<>v_count or exists(select 1 from private.push_delivery_tickets where lease_id=p_lease_id
    and (lease_expires_at <= v_now or expires_at <= v_now)) then
    raise exception using errcode = '40001', message = '[push receipts] Lease is stale, expired or incomplete.';
  end if;
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
end;
$$;

revoke all on function public.push_receipts_prepare(uuid,jsonb), public.push_receipts_record_tickets(uuid,jsonb),
  public.push_receipts_claim_due(uuid,integer), public.push_receipts_apply(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.push_receipts_prepare(uuid,jsonb), public.push_receipts_record_tickets(uuid,jsonb),
  public.push_receipts_claim_due(uuid,integer), public.push_receipts_apply(uuid,jsonb) to service_role;

-- notify_push body below is the existing Vault/fallback implementation with
-- only the DB-generated request_id entry added to its JSON payload.
create or replace function public.notify_push(
  p_type text,
  p_record jsonb,
  p_old_record jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
  v_payload jsonb;
begin
  v_url := current_setting('app.settings.supabase_url', true)
    || '/functions/v1/send-push-notification';

  -- Primärt: läs ur Vault.
  begin
    select decrypted_secret
      into v_key
      from vault.decrypted_secrets
      where name = 'service_role_key'
      limit 1;
  exception when others then
    v_key := null;
  end;

  -- Transitions-fallback: gamla plaintext-GUC:en (tas bort efter verifiering).
  if v_key is null then
    v_key := current_setting('app.settings.service_role_key', true);
  end if;

  if v_url is null or v_key is null then
    raise warning 'Push notification settings not configured (no vault secret named service_role_key and no app.settings.service_role_key GUC)';
    return;
  end if;

  v_payload := jsonb_build_object(
    'request_id', gen_random_uuid(),
    'type', p_type,
    'record', p_record,
    'old_record', p_old_record
  );

  perform net.http_post(
    url := v_url,
    body := v_payload,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 5000
  );
end;
$$;

-- Existing SECURITY DEFINER notify_push otherwise exposes service-key push
-- dispatch to callers with PostgreSQL's default PUBLIC function EXECUTE.
revoke all on function public.notify_push(text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.notify_push(text,jsonb,jsonb) to service_role;

commit;
