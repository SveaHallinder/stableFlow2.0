-- NEGATIVE CONTROL ONLY: explicit isolated fixture marker required.
-- Direct authenticated notify_push rejection in the regression must FAIL.
do $$begin
  if current_setting('stableflow.test_fixture',true) is distinct from 'push_receipts' then
    raise exception '[push receipts fixture] Isolated fixture required.';
  end if;
end$$;
grant execute on function public.notify_push(text,jsonb,jsonb) to public;
