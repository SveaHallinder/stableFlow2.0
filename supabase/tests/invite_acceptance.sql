-- Rollback-only acceptance checks against the deployed functions and RLS.
-- All users, profiles, stables, memberships and invitations are transient fixtures.
-- No existing record is changed. pg_net dispatches only after commit, so the
-- final ROLLBACK also discards any queued invite delivery requests.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

create function pg_temp.invite_test_id(value text) returns uuid language sql immutable
as $$select md5('stableflow-invite-acceptance-20261001-' || value)::uuid$$;
create temporary table invite_test_results(label text primary key, actor text, passed boolean not null);
grant select, insert on pg_temp.invite_test_results to authenticated;
create function pg_temp.invite_assert(label text, predicate boolean) returns text language plpgsql as $$
begin
  if predicate is distinct from true then raise exception 'FAIL %', label; end if;
  insert into pg_temp.invite_test_results values(label, current_user, true);
  return 'PASS ' || label;
end;
$$;

insert into auth.users(id, email)
select pg_temp.invite_test_id(value), value || '-invite-20261001@example.test'
from unnest(array['owner', 'recipient', 'outsider']) value;
insert into public.profiles(id)
select pg_temp.invite_test_id(value) from unnest(array['owner', 'recipient', 'outsider']) value
on conflict(id) do nothing;

insert into public.stables(id, name, created_by, join_code) values
  (pg_temp.invite_test_id('stable-valid'), 'Transient invite valid', pg_temp.invite_test_id('owner'), 'QAJOIN20261001'),
  (pg_temp.invite_test_id('stable-expired'), 'Transient invite expired', pg_temp.invite_test_id('owner'), 'QAEXPJOIN20261001'),
  (pg_temp.invite_test_id('stable-used'), 'Transient invite used', pg_temp.invite_test_id('owner'), 'QAUSEDJOIN20261001');
insert into public.stable_members(stable_id, user_id, role, access)
select pg_temp.invite_test_id(value), pg_temp.invite_test_id('owner'), 'admin', 'owner'
from unnest(array['stable-valid', 'stable-expired', 'stable-used']) value;
insert into public.stable_invites(id, stable_id, email, code, role, custom_role, access, expires_at, accepted_at) values
  (pg_temp.invite_test_id('invite-valid'), pg_temp.invite_test_id('stable-valid'), 'recipient-invite-20261001@example.test', 'QAINV20261001', 'staff', 'QA assigned staff', 'edit', now() + interval '1 day', null),
  (pg_temp.invite_test_id('invite-expired'), pg_temp.invite_test_id('stable-expired'), 'recipient-invite-20261001@example.test', 'QAEXP20261001', 'guest', 'QA expired guest', 'view', now() - interval '1 second', null),
  (pg_temp.invite_test_id('invite-used'), pg_temp.invite_test_id('stable-used'), 'recipient-invite-20261001@example.test', 'QAUSED20261001', 'guest', 'QA used guest', 'view', now() + interval '1 day', now());

select pg_temp.invite_assert('email-only recipient validates', public.validate_invite(' Recipient-invite-20261001@Example.Test ', null));
select pg_temp.invite_assert('uninvited email does not validate without code', not public.validate_invite('outsider-invite-20261001@example.test', null));
select pg_temp.invite_assert('valid invitation code is case insensitive', public.validate_invite('recipient-invite-20261001@example.test', ' qainv20261001 '));
select pg_temp.invite_assert('expired invitation code is rejected', not public.validate_invite('recipient-invite-20261001@example.test', 'QAEXP20261001'));
select pg_temp.invite_assert('used invitation code is rejected', not public.validate_invite('recipient-invite-20261001@example.test', 'QAUSED20261001'));
select pg_temp.invite_assert('incorrect supplied code is rejected despite matching email', not public.validate_invite('recipient-invite-20261001@example.test', 'UNKNOWN20261001'));

set role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.invite_test_id('outsider')::text, true);
select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.invite_test_id('outsider'), 'role', 'authenticated', 'email', 'outsider-invite-20261001@example.test')::text, true);
select pg_temp.invite_assert('RLS test role cannot bypass', current_user = 'authenticated' and not (select rolbypassrls or rolsuper from pg_roles where rolname = current_user));
-- validate_invite currently treats a code as a signup precondition. It is not an
-- acceptance grant: the actual claim below must still match the authenticated email.
select pg_temp.invite_assert('foreign invite code alone does not grant email acceptance', public.accept_pending_invites() = 0);
select pg_temp.invite_assert('outsider receives no foreign membership', not exists(select 1 from public.stable_members where user_id = auth.uid()));

select set_config('request.jwt.claim.sub', pg_temp.invite_test_id('recipient')::text, true);
select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.invite_test_id('recipient'), 'role', 'authenticated', 'email', 'RECIPIENT-INVITE-20261001@EXAMPLE.TEST')::text, true);
select pg_temp.invite_assert('matching verified identity accepts exactly one live invite', public.accept_pending_invites() = 1);
select pg_temp.invite_assert('assigned role and access survive acceptance', exists(
  select 1 from public.stable_members where stable_id = pg_temp.invite_test_id('stable-valid') and user_id = auth.uid()
    and role = 'staff' and access = 'edit' and custom_role = 'QA assigned staff'));
select pg_temp.invite_assert('valid invite is marked accepted', exists(select 1 from public.stable_invites where id = pg_temp.invite_test_id('invite-valid') and accepted_at is not null));
select pg_temp.invite_assert('expired invite remains unaccepted', exists(select 1 from public.stable_invites where id = pg_temp.invite_test_id('invite-expired') and accepted_at is null));
select pg_temp.invite_assert('expired and previously used invites create no membership', not exists(
  select 1 from public.stable_members where user_id = auth.uid() and stable_id in (pg_temp.invite_test_id('stable-expired'), pg_temp.invite_test_id('stable-used'))));
select pg_temp.invite_assert('repeated acceptance returns zero', public.accept_pending_invites() = 0);
select pg_temp.invite_assert('used invitation no longer validates', not public.validate_invite('recipient-invite-20261001@example.test', 'QAINV20261001'));
select pg_temp.invite_assert('generic code returns the exact stable', public.accept_join_code(' qajoin20261001 ') = pg_temp.invite_test_id('stable-valid'));
select pg_temp.invite_assert('generic code cannot downgrade the assigned role', exists(
  select 1 from public.stable_members where stable_id = pg_temp.invite_test_id('stable-valid') and user_id = auth.uid() and role = 'staff' and access = 'edit'));

reset role;
delete from public.stable_members where stable_id = pg_temp.invite_test_id('stable-valid') and user_id = pg_temp.invite_test_id('recipient');
set role authenticated;
select pg_temp.invite_assert('removed member cannot reuse an already accepted email invite', public.accept_pending_invites() = 0);
select pg_temp.invite_assert('single-use invite does not restore removed membership', not exists(select 1 from public.stable_members where user_id = auth.uid()));
select pg_temp.invite_assert('generic stall code is intentionally reusable', public.accept_join_code('QAJOIN20261001') = pg_temp.invite_test_id('stable-valid'));
select pg_temp.invite_assert('generic code only grants rider view rights', exists(
  select 1 from public.stable_members where stable_id = pg_temp.invite_test_id('stable-valid') and user_id = auth.uid()
    and role = 'rider' and access = 'view' and rider_role = 'medryttare'));
reset role;
select count(*) || ' invite acceptance SQL checks passed' from pg_temp.invite_test_results;
rollback;
