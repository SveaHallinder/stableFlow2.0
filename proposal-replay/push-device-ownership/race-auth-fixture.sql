-- Synthetic Auth admin only; install as sf_fixture_admin in isolated seed DB.
-- No Hosted/Auth API call. The ordinary worker invokes this narrow stand-in.
create function push_fixture.synthetic_auth_delete_paused(p_user_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
  if current_setting('stableflow.test_fixture',true) is distinct from 'push_receipts' then
    raise exception '[push device fixture] Isolated fixture required.';
  end if;
  perform set_config('deadlock_timeout','5s',true);
  perform 1 from auth.users where id=p_user_id for update;
  if not found then raise exception 'FAIL Auth-delete parent missing'; end if;
  -- Controller owns this barrier before launch. Parent is locked, but no
  -- child DELETE/cascade has started. Observer establishes the actual wait.
  perform pg_advisory_lock(8072002);
  perform pg_advisory_unlock(8072002);
  delete from auth.users where id=p_user_id;
end;
$$;
revoke all on function push_fixture.synthetic_auth_delete_paused(uuid) from public,anon,authenticated,service_role;
grant execute on function push_fixture.synthetic_auth_delete_paused(uuid) to postgres;
