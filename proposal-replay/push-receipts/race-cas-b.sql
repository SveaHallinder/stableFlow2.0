-- Driver already holds advisory 8071001; observe this backend waiting on it.
-- It keeps the real token row UPDATE lock until the driver releases the barrier.
\set ON_ERROR_STOP on
begin;
set local application_name='sf_push_cas_b';
set local statement_timeout='15s';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',push_fixture.pid('owner')::text,true);
update public.push_tokens set updated_at=clock_timestamp() where id=push_fixture.pid('cas-token');
select pg_advisory_lock(8071001);
select pg_advisory_unlock(8071001);
commit;
