-- Driver holds advisory 8071003. This real authenticated backend only locks
-- its existing token row; it must not UPDATE or rotate the generation.
\set ON_ERROR_STOP on
begin;
set local application_name='sf_push_expiry_b';
set local statement_timeout='15s';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',push_fixture.pid('owner')::text,true);
select id from public.push_tokens where id=push_fixture.pid('cas-token') for update;
select pg_advisory_lock(8071003);
select pg_advisory_unlock(8071003);
commit;
