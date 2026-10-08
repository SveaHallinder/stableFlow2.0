"""Deterministic REV2 overlay; original frozen REV1 is only read, never edited."""
from pathlib import Path
import hashlib
ROOT=Path(__file__).resolve().parent
BASE=Path('/tmp/stableflow-push-device-ownership-proposal-20261008/sql/20261008_push_device_ownership.sql')
assert hashlib.sha256(BASE.read_bytes()).hexdigest()=='cebf477de17ac141ca67698e4a42505dd6db021ced02f43393b5208fcd1d4267'
text=BASE.read_text()
def replace(old,new,count=1):
 global text
 assert text.count(old)==count,(old,text.count(old),count)
 text=text.replace(old,new)

helpers=r'''-- Auth parents are the first row-lock namespace. Discovery has no locks;
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

'''
replace('create or replace function public.push_device_state(',helpers+'create or replace function public.push_device_state(')
replace('declare hashed bytea; generation uuid;','declare hashed bytea; generation uuid; caller uuid; auth_users uuid[];')
replace('  perform private.push_device_caller(p_expected_user_id,true);\n  hashed:=private.push_device_hash(p_token);',
'''  caller:=private.push_device_caller(p_expected_user_id,true);
  hashed:=private.push_device_hash(p_token);
  auth_users:=private.push_device_auth_scope(array[caller],null,hashed);
  perform private.lock_push_auth_users(auth_users);''')
replace("  return jsonb_build_object('binding_generation',generation);\nend;", "  return jsonb_build_object('binding_generation',generation);\nexception when deadlock_detected then\n  raise exception using errcode='40001',message='[push device] Concurrent ownership change; read fresh state.';\nend;")
replace('  registration public.push_tokens%rowtype; generation uuid;', '  registration public.push_tokens%rowtype; generation uuid; auth_users uuid[];')
replace('declare caller uuid; hashed bytea; binding private.push_device_bindings%rowtype;\nbegin', 'declare caller uuid; hashed bytea; binding private.push_device_bindings%rowtype; auth_users uuid[];\nbegin')
replace('\n  select * into binding from private.push_device_bindings where token_hash=hashed for update;',
'''\n  auth_users:=private.push_device_auth_scope(array[caller],null,hashed);
  perform private.lock_push_auth_users(auth_users);
  select * into binding from private.push_device_bindings where token_hash=hashed for update;
  if binding.token_hash is not null and binding.current_user_id is not null and not (binding.current_user_id=any(auth_users)) then
    raise exception using errcode='40001',message='[push device] Account scope changed; read fresh state.';
  end if;''',2)
replace('  if not found or binding.binding_generation is distinct from p_expected_binding_generation then',
'  if binding.token_hash is null or binding.binding_generation is distinct from p_expected_binding_generation then')
replace('  if not found or binding.current_user_id is distinct from caller or binding.token_id is distinct from p_token_id',
'  if binding.token_hash is null or binding.current_user_id is distinct from caller or binding.token_id is distinct from p_token_id')
replace('-- Shared canonical binding lock order before token locks. Existing parent and\n-- ticket locks are acquired first in the receipt RPCs.',
'-- Auth parents precede ledger locks; canonical bindings precede token locks.\n-- Discovery of an owner outside the already locked set rolls back.')
replace('private.lock_push_device_bindings(p_token_ids uuid[],p_write boolean)',
'private.lock_push_device_bindings(p_token_ids uuid[],p_write boolean,p_auth_users uuid[])')
replace('declare hashed bytea;\nbegin\n  for hashed', 'declare hashed bytea; owner_uid uuid;\nbegin\n  for hashed')
replace('    end if;\n  end loop;\nend;\n$$;\nrevoke all on function private.lock_push_device_bindings(uuid[],boolean)',
'''    end if;
    select current_user_id into owner_uid from private.push_device_bindings where token_hash=hashed;
    if owner_uid is not null and not (owner_uid=any(p_auth_users)) then
      raise exception using errcode='40001',message='[push receipts] Account scope changed; reservation unconfirmed.';
    end if;
  end loop;
end;
$$;
revoke all on function private.lock_push_device_bindings(uuid[],boolean,uuid[])''')
replace('declare v_count integer; v_inserted integer; v_now timestamptz; v_item jsonb; v_registration record;',
'declare v_count integer; v_inserted integer; v_now timestamptz; v_item jsonb; v_registration record; auth_users uuid[]; token_ids uuid[];')
start=text.index('  -- The unique parent insert also consumes concurrent retries before looking');end=text.index('  if p_registrations is null',start)
insert=text[start:end];text=text[:start]+text[end:]
insert=insert.replace('  -- The unique parent insert also consumes concurrent retries before looking\n  -- at changed payloads. An invalid NEW reservation rolls back atomically.',
'  -- The unique identity remains consumed; a failed new reservation rolls back.\n  -- Auth locks precede this first ledger lock. A concurrent malformed duplicate\n  -- may fail validation but can never start or rearm a send.')
replace('  update private.push_delivery_attempts set target_count=v_count where attempt_id=p_attempt_id;',
'''  token_ids:=array(select token_id from jsonb_to_recordset(p_registrations)
    as r(position integer,token_id uuid,user_id uuid,registration_generation uuid));
  auth_users:=private.push_device_auth_scope(array(select user_id from jsonb_to_recordset(p_registrations)
    as r(position integer,token_id uuid,user_id uuid,registration_generation uuid)),token_ids,null);
  perform private.lock_push_auth_users(auth_users);
'''+insert+'  update private.push_delivery_attempts set target_count=v_count where attempt_id=p_attempt_id;')
replace('      as r(position integer,token_id uuid,user_id uuid,registration_generation uuid)),false);',
'      as r(position integer,token_id uuid,user_id uuid,registration_generation uuid)),false,auth_users);')
replace('declare v_count integer; v_item jsonb; v_result record; v_ticket private.push_delivery_tickets%rowtype; v_now timestamptz;',
'declare v_count integer; v_item jsonb; v_result record; v_ticket private.push_delivery_tickets%rowtype; v_now timestamptz; auth_users uuid[]; token_ids uuid[];')
replace('  perform 1 from private.push_delivery_attempts where attempt_id = p_attempt_id for update;',
'''  -- Nonlocking discovery precedes all ledger row locks.
  select array_agg(token_id),array_agg(user_id) into token_ids,auth_users from private.push_delivery_tickets
    where attempt_id=p_attempt_id and position=any(array(select position from jsonb_to_recordset(p_results)
      as r(position integer,status text,ticket_id text,error_code text)));
  auth_users:=private.push_device_auth_scope(auth_users,token_ids,null);
  perform private.lock_push_auth_users(auth_users);
  perform 1 from private.push_delivery_attempts where attempt_id = p_attempt_id for update;''')
replace('      as r(position integer,status text,ticket_id text,error_code text)))),true);',
'      as r(position integer,status text,ticket_id text,error_code text)))),true,auth_users);')
replace('  v_now timestamptz; v_ok integer:=0; v_error integer:=0; v_missing integer:=0; v_deleted integer:=0;',
'  v_now timestamptz; v_ok integer:=0; v_error integer:=0; v_missing integer:=0; v_deleted integer:=0; auth_users uuid[]; token_ids uuid[];')
replace('  perform 1 from private.push_delivery_tickets where lease_id=p_lease_id order by attempt_id,position for update;',
'''  -- Lease discovery is nonlocking. A missing Auth parent fails before
  -- acquiring any ledger, mapper or token row lock.
  select array_agg(token_id),array_agg(user_id) into token_ids,auth_users
    from private.push_delivery_tickets where lease_id=p_lease_id;
  auth_users:=private.push_device_auth_scope(auth_users,token_ids,null);
  perform private.lock_push_auth_users(auth_users);
  perform 1 from private.push_delivery_tickets where lease_id=p_lease_id order by attempt_id,position for update;''')
replace('    where lease_id=p_lease_id),true);','    where lease_id=p_lease_id),true,auth_users);')
for message in ('Invalid registration value.','Ticket ID conflicts with an existing acknowledgement.','Invalid receipt value.'):
 old="  raise exception using errcode = '"+('40001' if message.startswith('Ticket ID') else '22023')+"', message = '[push receipts] "+message+"';\nend;"
 replace(old,old[:-len('end;')]+"when deadlock_detected then\n  raise exception using errcode='40001',message='[push receipts] Concurrent registration change; acknowledgement unconfirmed.';\nend;")
replace('-- Exact additive receipt-function overlays; base source hash is checked by builder.',
'-- REV2: Auth-parent-first overlays; public API unchanged.\n-- Exact additive receipt-function overlays; REV1 source hash is checked by builder.')
text=text.replace('-- PREPARE-ONLY: separate approval required;', '-- REV2 PREPARE-ONLY: separate approval required;',1)
(ROOT/'20261008_push_device_ownership.sql').write_text(text)
def function(name):
 start=text.index('create or replace function '+name+'(');end=text.index('$$;',start)+3
 return text[start:end]+'\n'
claim=function('public.push_device_claim').replace('binding.token_hash is null or binding.binding_generation is distinct from p_expected_binding_generation','binding.token_hash is null')
(ROOT/'negative-epoch.sql').write_text('-- NEGATIVE ONLY: remove claim epoch predicate, retain Auth fences.\n'+claim)
prepare=function('public.push_receipts_prepare');begin=prepare.index('    if not exists(select 1 from private.push_device_bindings b join public.push_tokens t');end=prepare.index('    insert into private.push_delivery_tickets',begin)
(ROOT/'negative-prepare-active.sql').write_text('-- NEGATIVE ONLY: omit active-binding predicate, retain Auth fences.\n'+prepare[:begin]+prepare[end:])
negative=function('public.push_receipts_prepare');begin=negative.index('  token_ids:=array(');end=negative.index('  -- The unique identity',begin)
negative=negative[:begin]+negative[end:]
negative=negative.replace(')),false,auth_users);',')),false,array(select id from auth.users));')
(ROOT/'negative-auth-order.sql').write_text('-- NEGATIVE ONLY: remove Auth-parent-first fence from prepare.\n'+negative)
print(hashlib.sha256((ROOT/'20261008_push_device_ownership.sql').read_bytes()).hexdigest())
