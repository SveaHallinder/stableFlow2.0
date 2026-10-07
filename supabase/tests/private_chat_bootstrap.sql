-- Synthetic fixtures only. Execute as postgres; every change rolls back.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '30s';

create function pg_temp.chat_id(value text) returns uuid language sql immutable
as $$select md5('stableflow-private-chat-20261007-' || value)::uuid$$;
create temporary table chat_test_results(label text primary key);
grant select, insert on pg_temp.chat_test_results to authenticated, anon;
create function pg_temp.chat_assert(label text, predicate boolean) returns text language plpgsql as $$
begin
  if predicate is distinct from true then raise exception 'FAIL %', label; end if;
  insert into pg_temp.chat_test_results values (label);
  return 'PASS ' || label;
end;
$$;
create function pg_temp.chat_denied(label text, statement text) returns text language plpgsql as $$
declare actual_code text;
begin
  begin execute statement;
  exception when others then get stacked diagnostics actual_code = returned_sqlstate;
  end;
  if actual_code is distinct from '42501' then
    raise exception 'FAIL %: expected 42501, got %', label, coalesce(actual_code, 'success');
  end if;
  insert into pg_temp.chat_test_results values (label);
  return 'PASS ' || label;
end;
$$;

insert into auth.users(id) select pg_temp.chat_id(x) from unnest(array['creator', 'peer', 'outsider', 'other-owner']) x;
insert into public.stables(id, name, created_by) values
  (pg_temp.chat_id('stable'), 'Synthetic private chat', pg_temp.chat_id('creator')),
  (pg_temp.chat_id('other-stable'), 'Synthetic other chat', pg_temp.chat_id('other-owner'));
insert into public.stable_members(stable_id, user_id, role, access) values
  (pg_temp.chat_id('stable'), pg_temp.chat_id('creator'), 'admin', 'owner'),
  (pg_temp.chat_id('stable'), pg_temp.chat_id('peer'), 'rider', 'view'),
  (pg_temp.chat_id('stable'), pg_temp.chat_id('outsider'), 'rider', 'view'),
  (pg_temp.chat_id('other-stable'), pg_temp.chat_id('other-owner'), 'admin', 'owner');
grant select on public.conversations, public.conversation_members, public.messages to anon;

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.chat_id('creator')::text, true);
with created as (
  insert into public.conversations(id, stable_id, is_group, created_by_user_id)
    values(pg_temp.chat_id('private'), null, false, pg_temp.chat_id('creator')) returning id
)
select pg_temp.chat_assert('creator receives private conversation receipt', (select id = pg_temp.chat_id('private') from created));
insert into public.conversation_members(conversation_id, user_id) values
  (pg_temp.chat_id('private'), pg_temp.chat_id('creator')),
  (pg_temp.chat_id('private'), pg_temp.chat_id('peer'));
select pg_temp.chat_assert('separate member receipt confirms both participants', (select count(*) = 2 from public.conversation_members where conversation_id = pg_temp.chat_id('private')));
insert into public.messages(conversation_id, author_id, text) values(pg_temp.chat_id('private'), pg_temp.chat_id('creator'), 'Synthetic private message');
select pg_temp.chat_denied('cross-stable member insertion denied', $$insert into public.conversation_members(conversation_id, user_id) values(pg_temp.chat_id('private'), pg_temp.chat_id('other-owner'))$$);

select set_config('request.jwt.claim.sub', pg_temp.chat_id('peer')::text, true);
select pg_temp.chat_assert('peer reads private conversation', (select count(*) = 1 from public.conversations where id = pg_temp.chat_id('private')));
select pg_temp.chat_assert('peer reads private message', (select count(*) = 1 from public.messages where conversation_id = pg_temp.chat_id('private')));
select pg_temp.chat_denied('forged creator rejected without RETURNING', $$insert into public.conversations(stable_id, is_group, created_by_user_id) values(null, false, pg_temp.chat_id('creator'))$$);

select set_config('request.jwt.claim.sub', pg_temp.chat_id('outsider')::text, true);
select pg_temp.chat_assert('same-stable outsider cannot read private conversation', (select count(*) = 0 from public.conversations where id = pg_temp.chat_id('private')));
select pg_temp.chat_assert('same-stable outsider cannot read private message', (select count(*) = 0 from public.messages where conversation_id = pg_temp.chat_id('private')));
select set_config('request.jwt.claim.sub', pg_temp.chat_id('other-owner')::text, true);
select pg_temp.chat_assert('other-stable outsider cannot read private conversation', (select count(*) = 0 from public.conversations where id = pg_temp.chat_id('private')));
select pg_temp.chat_assert('other-stable outsider cannot read private message', (select count(*) = 0 from public.messages where conversation_id = pg_temp.chat_id('private')));

select set_config('request.jwt.claim.sub', pg_temp.chat_id('creator')::text, true);
insert into public.conversations(id, stable_id, is_group, created_by_user_id)
  values(pg_temp.chat_id('group'), pg_temp.chat_id('stable'), true, pg_temp.chat_id('creator'));
select set_config('request.jwt.claim.sub', pg_temp.chat_id('peer')::text, true);
select pg_temp.chat_assert('existing stable group remains readable', (select count(*) = 1 from public.conversations where id = pg_temp.chat_id('group')));

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.chat_assert('anonymous cannot read private conversation', (select count(*) = 0 from public.conversations where id = pg_temp.chat_id('private')));
select pg_temp.chat_assert('anonymous cannot read private message', (select count(*) = 0 from public.messages where conversation_id = pg_temp.chat_id('private')));
reset role;
select pg_temp.chat_assert('both private policies retained', (select count(*) = 2 from pg_policies where schemaname = 'public' and tablename = 'conversations' and policyname in ('conversations_private_creator_select', 'conversations_private_insert_self')));
select count(*) || ' private chat checks passed' from pg_temp.chat_test_results;
rollback;
