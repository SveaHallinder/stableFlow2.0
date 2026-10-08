-- ISOLATED SYNTHETIC FIXTURE ONLY. Never run this against Hosted.
-- Runner must set stableflow.test_fixture=push_receipts, create an empty owned
-- database, and run this before the complete baseline schema + schema-append.
\set ON_ERROR_STOP on
do $guard$
begin
  if current_setting('stableflow.test_fixture',true) is distinct from 'push_receipts'
    or current_database() in ('postgres','template0','template1')
    or to_regnamespace('auth') is not null or to_regnamespace('net') is not null then
    raise exception '[push receipts fixture] Empty explicitly marked isolated database is required.';
  end if;
end
$guard$;
do $$begin
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end$$;
create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role',true),'')
$$;
create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
grant usage on schema auth,public to authenticated,anon,service_role;

create schema vault;
create table vault.decrypted_secrets(name text,decrypted_secret text);
insert into vault.decrypted_secrets values('service_role_key','fixture-only-not-a-credential');
create schema net;
create table net.fixture_http_calls(id bigserial primary key,url text,body jsonb,headers jsonb,timeout_milliseconds integer);
create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint
language sql as $$
  insert into net.fixture_http_calls(url,body,headers,timeout_milliseconds)
  values(url,body,headers,timeout_milliseconds) returning id
$$;
create schema push_fixture;
create table push_fixture.race_state(label text primary key,receipt jsonb);
-- Explicitly private fixture state; workers receive only SELECT to coordinate
-- their own fictional backends, never production private-ledger permissions.
grant usage on schema push_fixture to authenticated,service_role;
grant select on push_fixture.race_state to authenticated,service_role;

-- Admin-owned stand-ins for fixture seeding/cascade only. The harness transfers
-- auth.users and these two helpers to sf_fixture_admin and grants postgres
-- SELECT+REFERENCES on auth.users, with no INSERT/UPDATE/DELETE privilege.
create function push_fixture.synthetic_auth_user(p_id uuid) returns integer
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare changed integer;
begin
  if current_setting('stableflow.test_fixture',true) is distinct from 'push_receipts' then
    raise exception '[push receipts fixture] Explicit isolated fixture required.';
  end if;
  insert into auth.users(id) values(p_id) on conflict(id) do nothing;
  get diagnostics changed=row_count;
  return changed;
end;
$$;
create function push_fixture.synthetic_auth_delete(p_id uuid) returns integer
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare changed integer;
begin
  if current_setting('stableflow.test_fixture',true) is distinct from 'push_receipts' then
    raise exception '[push receipts fixture] Explicit isolated fixture required.';
  end if;
  delete from auth.users where id=p_id;
  get diagnostics changed=row_count;
  return changed;
end;
$$;
revoke all on function push_fixture.synthetic_auth_user(uuid),push_fixture.synthetic_auth_delete(uuid)
  from public,authenticated,anon,service_role;
grant execute on function push_fixture.synthetic_auth_user(uuid),push_fixture.synthetic_auth_delete(uuid) to postgres;
