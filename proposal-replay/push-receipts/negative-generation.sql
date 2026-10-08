-- NEGATIVE CONTROL ONLY: explicit isolated fixture marker required.
-- Run after the candidate in a disposable DB; the regression must FAIL.
do $$begin
  if current_setting('stableflow.test_fixture',true) is distinct from 'push_receipts' then
    raise exception '[push receipts fixture] Isolated fixture required.';
  end if;
end$$;
create or replace function public.rotate_push_registration_generation()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  new.registration_generation:=coalesce(new.registration_generation,gen_random_uuid());
  return new;
end;
$$;
