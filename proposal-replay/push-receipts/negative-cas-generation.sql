-- NEGATIVE CONTROL ONLY: explicit isolated fixture marker required.
-- Deliberately ignores generation. Old-DNR/fresh-registration tests must FAIL.
do $$begin
  if current_setting('stableflow.test_fixture',true) is distinct from 'push_receipts' then
    raise exception '[push receipts fixture] Isolated fixture required.';
  end if;
end$$;
create or replace function private.retire_push_registration(p_token_id uuid,p_user_id uuid,p_generation uuid,p_deadline timestamptz)
returns integer language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare v_deleted integer;
begin
  perform 1 from public.push_tokens where id=p_token_id and user_id=p_user_id for update;
  if p_deadline is not null and clock_timestamp() >= p_deadline then
    raise exception using errcode='40001',message='[push receipts] Lease deadline expired before token cleanup.';
  end if;
  delete from public.push_tokens where id=p_token_id and user_id=p_user_id;
  get diagnostics v_deleted=row_count;
  return v_deleted;
end;
$$;
