-- Operator-reviewed rollback-only smoke. Synthetic accounts/stables only.
-- No messages are INSERTed: this test never invokes message push webhooks.
-- Run as postgres AFTER the approved migration; do not remove ROLLBACK.
\set ON_ERROR_STOP on
begin;
set local statement_timeout='30s';
create temporary table group_fixture_ids(label text primary key,id uuid not null default gen_random_uuid());
insert into group_fixture_ids(label) select unnest(array['a','b','e','c','d','stable','other','group','shared']);
grant select on pg_temp.group_fixture_ids to authenticated,anon;
create function pg_temp.group_id(value text) returns uuid language sql stable as $$select id from pg_temp.group_fixture_ids where label=value$$;
create temporary table group_test_results(label text primary key);
grant select,insert on pg_temp.group_test_results to authenticated,anon;
create function pg_temp.group_assert(label text,predicate boolean) returns text language plpgsql as $$
begin
  if predicate is distinct from true then raise exception 'FAIL %',label; end if;
  insert into pg_temp.group_test_results values(label); return 'PASS '||label;
end $$;
create function pg_temp.group_denied(label text,statement text,wanted_code text default '42501') returns text language plpgsql as $$
declare actual_code text;
begin
  begin execute statement; exception when others then get stacked diagnostics actual_code=returned_sqlstate; end;
  if actual_code is distinct from wanted_code then raise exception 'FAIL %: expected %, got %',label,wanted_code,coalesce(actual_code,'success'); end if;
  insert into pg_temp.group_test_results values(label); return 'PASS '||label;
end $$;

insert into auth.users(id) select pg_temp.group_id(x) from unnest(array['a','b','e','c','d']) x;
insert into public.stables(id,name,created_by) values
  (pg_temp.group_id('stable'),'Rollback custom chat',pg_temp.group_id('c')),
  (pg_temp.group_id('other'),'Rollback other chat',pg_temp.group_id('d'));
insert into public.stable_members(stable_id,user_id,role,access) values
  (pg_temp.group_id('stable'),pg_temp.group_id('c'),'admin','owner'),
  (pg_temp.group_id('stable'),pg_temp.group_id('a'),'rider','view'),
  (pg_temp.group_id('stable'),pg_temp.group_id('b'),'staff','edit'),
  (pg_temp.group_id('stable'),pg_temp.group_id('e'),'rider','view'),
  (pg_temp.group_id('other'),pg_temp.group_id('a'),'rider','view'),
  (pg_temp.group_id('other'),pg_temp.group_id('d'),'admin','owner');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',pg_temp.group_id('a')::text,true);
with created as (insert into public.conversations(id,stable_id,is_group,created_by_user_id,title)
  values(pg_temp.group_id('shared'),pg_temp.group_id('stable'),true,pg_temp.group_id('a'),'Rollback stallchatten') returning chat_kind)
select pg_temp.group_assert('legacy shared INSERT derives stable kind',(select chat_kind='stable' from created));
select pg_temp.group_assert('create returns exact custom kind',(
  public.create_member_group(pg_temp.group_id('a'),pg_temp.group_id('group'),pg_temp.group_id('stable'),'Rollback team',array[pg_temp.group_id('b'),pg_temp.group_id('e')])->>'chatKind')='custom');
select pg_temp.group_assert('retry returns same id',(
  public.create_member_group(pg_temp.group_id('a'),pg_temp.group_id('group'),pg_temp.group_id('stable'),'Rollback team',array[pg_temp.group_id('b'),pg_temp.group_id('e')])->>'id')=pg_temp.group_id('group')::text);
select pg_temp.group_assert('three actual members and one owner',(select count(*)=3 and count(*) filter(where member_role='owner')=1 from public.conversation_members where conversation_id=pg_temp.group_id('group')));
select pg_temp.group_denied('same id changed payload denied',$$select public.create_member_group(pg_temp.group_id('a'),pg_temp.group_id('group'),pg_temp.group_id('stable'),'Changed',array[pg_temp.group_id('b'),pg_temp.group_id('e')])$$,'40001');
select pg_temp.group_denied('shared other stable is not enough',$$select public.manage_member_group(pg_temp.group_id('a'),pg_temp.group_id('group'),null,array[pg_temp.group_id('d')])$$);
select pg_temp.group_denied('custom REST self insert denied',$$insert into public.conversation_members(conversation_id,user_id) values(pg_temp.group_id('group'),pg_temp.group_id('c'))$$);
select pg_temp.group_denied('identity type UPDATE denied',$$update public.conversations set chat_kind='stable' where id=pg_temp.group_id('group')$$);
select pg_temp.group_denied('roster role UPDATE denied',$$update public.conversation_members set member_role='owner' where conversation_id=pg_temp.group_id('group') and user_id=pg_temp.group_id('b')$$);
select pg_temp.group_denied('shared stable chat cannot be left',$$select public.leave_member_group(pg_temp.group_id('a'),pg_temp.group_id('shared'))$$);

select set_config('request.jwt.claim.sub',pg_temp.group_id('c')::text,true);
select pg_temp.group_assert('same-stable owner outside group sees no conversation',(select count(*)=0 from public.conversations where id=pg_temp.group_id('group')));
select pg_temp.group_assert('same-stable owner outside group sees no roster',(select count(*)=0 from public.conversation_members where conversation_id=pg_temp.group_id('group')));
select pg_temp.group_denied('same-stable outsider read receipt denied',$$select public.own_chat_read_state(pg_temp.group_id('c'),pg_temp.group_id('group'),'{}')$$);
select set_config('request.jwt.claim.sub',pg_temp.group_id('d')::text,true);
select pg_temp.group_assert('foreign stable sees no conversation',(select count(*)=0 from public.conversations where id=pg_temp.group_id('group')));
select set_config('request.jwt.claim.sub',pg_temp.group_id('b')::text,true);
select pg_temp.group_denied('ordinary member cannot rename',$$select public.manage_member_group(pg_temp.group_id('b'),pg_temp.group_id('group'),'Denied')$$);

select set_config('request.jwt.claim.sub',pg_temp.group_id('a')::text,true);
select pg_temp.group_assert('transfer returns confirmed owner',(
  public.manage_member_group(pg_temp.group_id('a'),pg_temp.group_id('group'),'Rollback team 2',array[pg_temp.group_id('c')],array[pg_temp.group_id('e')],pg_temp.group_id('b'))->'participantRoles'->>pg_temp.group_id('b')::text)='owner');
select set_config('request.jwt.claim.sub',pg_temp.group_id('e')::text,true);
select pg_temp.group_assert('removed participant loses conversation',(select count(*)=0 from public.conversations where id=pg_temp.group_id('group')));
select pg_temp.group_denied('removed participant loses read receipts',$$select public.own_chat_read_state(pg_temp.group_id('e'),pg_temp.group_id('group'),'{}')$$);
select set_config('request.jwt.claim.sub',pg_temp.group_id('a')::text,true);
select pg_temp.group_assert('ordinary leave succeeds',(public.leave_member_group(pg_temp.group_id('a'),pg_temp.group_id('group'))->>'left')::boolean);
select set_config('request.jwt.claim.sub',pg_temp.group_id('b')::text,true);
select pg_temp.group_assert('owner leave with successor succeeds',(public.leave_member_group(pg_temp.group_id('b'),pg_temp.group_id('group'),pg_temp.group_id('c'))->>'left')::boolean);
select set_config('request.jwt.claim.sub',pg_temp.group_id('c')::text,true);
select pg_temp.group_denied('last member requires delete confirmation',$$select public.leave_member_group(pg_temp.group_id('c'),pg_temp.group_id('group'))$$,'40001');
select pg_temp.group_assert('confirmed last leave deletes',(public.leave_member_group(pg_temp.group_id('c'),pg_temp.group_id('group'),null,true)->>'deleted')::boolean);
select pg_temp.group_assert('leave retry is idempotent',(public.leave_member_group(pg_temp.group_id('c'),pg_temp.group_id('group'))->>'left')::boolean);
reset role;
select pg_temp.group_assert('group removed and shared stable chat preserved',not exists(select 1 from public.conversations where id=pg_temp.group_id('group')) and exists(select 1 from public.conversations where id=pg_temp.group_id('shared')));
select count(*)||' custom member group rollback checks passed' from pg_temp.group_test_results;
rollback;
