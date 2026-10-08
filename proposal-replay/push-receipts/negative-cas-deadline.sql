-- NEGATIVE CONTROL ONLY: preserve exact generation CAS but remove the
-- post-lock deadline fence. Unchanged-row/expired-collector tests must FAIL.
do $$begin
  if current_setting('stableflow.test_fixture',true) is distinct from 'push_receipts' then
    raise exception '[push receipts fixture] Isolated fixture required.';
  end if;
end$$;
create or replace function private.retire_push_registration(
  p_token_id uuid,p_user_id uuid,p_generation uuid,p_deadline timestamptz)
returns integer language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare v_deleted integer; v_matched boolean;
begin
  perform 1 from public.push_tokens
    where id=p_token_id and user_id=p_user_id and registration_generation=p_generation for update;
  v_matched:=found;
  -- Deliberately missing the deadline check after the row-lock wait.
  if not v_matched then return 0; end if;
  delete from public.push_tokens
    where id=p_token_id and user_id=p_user_id and registration_generation=p_generation;
  get diagnostics v_deleted=row_count;
  return v_deleted;
end;
$$;
