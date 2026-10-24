-- Approved custom member chats. No new tables, no FK rewrite, no historical ID rewrite.
begin;
lock table public.conversations, public.conversation_members in share row exclusive mode;
do $$
begin
  if to_regprocedure('public.trigger_push_new_message()') is not null and exists(
    select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.trigger_push_new_message()')
      and lower(regexp_replace(prosrc,'[[:space:]]','','g'))<>'beginperformpublic.notify_push(''message'',to_jsonb(new));returnnew;end;') then
    raise exception using errcode='55000',message='[chat group] Pushtriggern har ändrats. Granska aktuell funktion före migrering.';
  end if;
  if exists(select 1 from public.conversations where not coalesce(is_group,false) and stable_id is not null)
    or exists(select 1 from public.conversations where is_group and stable_id is not null group by stable_id having count(*)>1)
    or exists(select 1 from pg_catalog.pg_policy where polrelid in ('public.conversations'::regclass,'public.conversation_members'::regclass,'public.messages'::regclass)
      and polpermissive and polname not in ('conversations_select','conversations_private_creator_select','conversations_insert','conversations_update',
        'conversation_members_select','conversation_members_insert','conversation_members_delete','messages_select','messages_insert','messages_update','messages_delete'))
    or to_regprocedure('public.own_chat_read_state(uuid,uuid,uuid[])') is null
    or to_regclass('public.account_deletion_intents') is null then
    raise exception using errcode='55000',message='[chat group] Befintligt schema eller historik behöver granskas före migrering.';
  end if;
end $$;

alter table public.conversations add column chat_kind text;
update public.conversations set chat_kind=case when coalesce(is_group,false) then 'stable' else 'direct' end;
alter table public.conversations alter column chat_kind set not null;
alter table public.conversations add constraint conversations_chat_kind_check check(chat_kind in ('direct','stable','custom'));
alter table public.conversations add constraint conversations_kind_shape_check check(
  (chat_kind='direct' and not coalesce(is_group,false) and stable_id is null) or (chat_kind in ('stable','custom') and is_group is true));
alter table public.conversation_members add column member_role text not null default 'member';
alter table public.conversation_members add constraint conversation_members_role_check check(member_role in ('owner','member'));
drop index public.conversations_group_unique;
create unique index conversations_group_unique on public.conversations(stable_id) where chat_kind='stable' and stable_id is not null;
create unique index conversation_members_one_owner on public.conversation_members(conversation_id) where member_role='owner';

create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;
create function private.default_chat_kind() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if new.chat_kind is null then new.chat_kind:=case when coalesce(new.is_group,false) then 'stable' else 'direct' end; end if;
  return new;
end $$;
revoke all on function private.default_chat_kind() from public,anon,authenticated,service_role;
create trigger conversations_default_chat_kind before insert on public.conversations for each row execute function private.default_chat_kind();

-- Only trusted helpers call this parameterized account lookup. It reveals no client data.
create function private.chat_account_active(target_user uuid) returns boolean language sql stable security definer
set search_path=pg_catalog set row_security=off as $$
  select exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=target_user
    and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
    and not exists(select 1 from public.account_deletion_intents d where d.user_id=p.id));
$$;
revoke all on function private.chat_account_active(uuid) from public,anon,authenticated,service_role;
create function private.chat_caller_active() returns boolean language sql stable security definer
set search_path=pg_catalog set row_security=off as $$ select private.chat_account_active(auth.uid()); $$;
revoke all on function private.chat_caller_active() from public,anon,authenticated,service_role;
grant execute on function private.chat_caller_active() to authenticated;
create function private.can_access_chat(target_id uuid) returns boolean language sql stable security definer
set search_path=pg_catalog set row_security=off as $$
  select auth.uid() is not null and private.chat_account_active(auth.uid()) and exists(
    select 1 from public.conversations c where c.id=target_id and (
      (c.chat_kind='stable' and exists(select 1 from public.stable_members s where s.stable_id=c.stable_id and s.user_id=auth.uid()))
      or (c.chat_kind='direct' and exists(select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=auth.uid()))
      or (c.chat_kind='custom' and exists(select 1 from public.conversation_members m join public.stable_members s
        on s.user_id=m.user_id and s.stable_id=c.stable_id where m.conversation_id=c.id and m.user_id=auth.uid()))));
$$;
revoke all on function private.can_access_chat(uuid) from public,anon,authenticated,service_role;
grant execute on function private.can_access_chat(uuid) to authenticated;

drop policy conversations_select on public.conversations;
drop policy conversations_private_creator_select on public.conversations;
drop policy conversations_insert on public.conversations;
drop policy conversations_update on public.conversations;
-- Row-bound stable branch also admits INSERT ... RETURNING from legacy clients:
-- a STABLE helper re-reading conversations cannot see that statement's new row yet.
create policy conversations_select on public.conversations for select to authenticated using(private.chat_caller_active() and (
  (chat_kind='stable' and public.is_stable_member(stable_id)) or private.can_access_chat(id)));
create policy conversations_private_creator_select on public.conversations for select to authenticated using(
  chat_kind='direct' and stable_id is null and created_by_user_id=auth.uid() and private.chat_caller_active());
create policy conversations_insert on public.conversations for insert to authenticated with check(
  created_by_user_id=auth.uid() and private.chat_caller_active() and (
    (chat_kind='direct' and stable_id is null and not coalesce(is_group,false)) or
    (chat_kind='stable' and is_group is true and stable_id is not null and (public.is_stable_member(stable_id)
      or exists(select 1 from public.stables s where s.id=stable_id and s.created_by=auth.uid())))));
-- Keep conversations_private_insert_self restrictive bootstrap policy unchanged.
create policy conversations_update on public.conversations for update to authenticated using(
  (chat_kind='stable' and public.is_stable_owner(stable_id)) or (chat_kind='direct' and created_by_user_id=auth.uid())) with check(
  (chat_kind='stable' and public.is_stable_owner(stable_id)) or (chat_kind='direct' and created_by_user_id=auth.uid()));

drop policy conversation_members_select on public.conversation_members;
drop policy conversation_members_insert on public.conversation_members;
drop policy conversation_members_delete on public.conversation_members;
create policy conversation_members_select on public.conversation_members for select to authenticated using(private.can_access_chat(conversation_id));
create policy conversation_members_insert on public.conversation_members for insert to authenticated with check(
  member_role='member' and exists(select 1 from public.conversations c where c.id=conversation_id and c.chat_kind='direct' and c.created_by_user_id=auth.uid())
  and (user_id=auth.uid() or public.shares_stable_with(user_id)));
create policy conversation_members_delete on public.conversation_members for delete to authenticated using(
  user_id=auth.uid() and exists(select 1 from public.conversations c where c.id=conversation_id and c.chat_kind='direct'));

drop policy messages_select on public.messages;
drop policy messages_insert on public.messages;
drop policy messages_update on public.messages;
drop policy messages_delete on public.messages;
create policy messages_select on public.messages for select to authenticated using(private.can_access_chat(conversation_id));
create policy messages_insert on public.messages for insert to authenticated with check(author_id=auth.uid() and private.can_access_chat(conversation_id));
create policy messages_update on public.messages for update to authenticated using(author_id=auth.uid() and private.can_access_chat(conversation_id))
  with check(author_id=auth.uid() and private.can_access_chat(conversation_id));
create policy messages_delete on public.messages for delete to authenticated using(
  (author_id=auth.uid() and private.can_access_chat(conversation_id)) or exists(select 1 from public.conversations c
    where c.id=conversation_id and c.chat_kind='stable' and public.is_stable_owner(c.stable_id)));

-- Table grants can override column revokes; revoke both before allowing only text/title edits.
revoke update on public.conversations,public.conversation_members,public.messages from public,anon,authenticated;
revoke update(id,stable_id,title,is_group,created_by_user_id,created_at,chat_kind) on public.conversations from public,anon,authenticated;
revoke update(id,conversation_id,user_id,joined_at,member_role) on public.conversation_members from public,anon,authenticated;
revoke update(id,conversation_id,author_id,text,status,created_at) on public.messages from public,anon,authenticated;
grant update(title) on public.conversations to authenticated;
grant update(text) on public.messages to authenticated;
revoke all on public.chat_message_reads from public,anon,authenticated,service_role;

create function private.assert_chat_actor(expected_user_id uuid) returns uuid language plpgsql security definer
set search_path=pg_catalog set row_security=off as $$
declare caller uuid:=auth.uid();
begin
  if caller is null or caller is distinct from expected_user_id or auth.role() is distinct from 'authenticated' then
    raise exception using errcode='42501',message='[chat group] Verifierat eget konto krävs.';
  end if;
  perform p.id from public.profiles p where p.id=caller for key share nowait;
  if not found or not private.chat_account_active(caller) then
    raise exception using errcode='42501',message='[chat group] Aktivt eget konto krävs.';
  end if;
  return caller;
end $$;
revoke all on function private.assert_chat_actor(uuid) from public,anon,authenticated,service_role;

create function private.lock_chat_participants(target_stable_id uuid, target_users uuid[]) returns void language plpgsql security definer
set search_path=pg_catalog set row_security=off as $$
begin
  -- NOWAIT fails safely rather than deadlocking a simultaneous Auth/profile/member cascade.
  perform p.id from public.profiles p where p.id=any(target_users) order by p.id for key share nowait;
  perform u.id from auth.users u where u.id=any(target_users) order by u.id for share nowait;
  perform s.id from public.stable_members s where s.stable_id=target_stable_id and s.user_id=any(target_users) order by s.user_id for key share nowait;
  if exists(select 1 from unnest(target_users) u(id) where not private.chat_account_active(u.id)
    or not exists(select 1 from public.stable_members s where s.stable_id=target_stable_id and s.user_id=u.id)) then
    raise exception using errcode='42501',message='[chat group] En vald person är inte längre aktiv medlem i stallet.';
  end if;
end $$;
revoke all on function private.lock_chat_participants(uuid,uuid[]) from public,anon,authenticated,service_role;

create function private.member_group_receipt(target_id uuid) returns jsonb language sql stable security definer
set search_path=pg_catalog set row_security=off as $$
  select jsonb_build_object('id',c.id,'chatKind',c.chat_kind,'stableId',c.stable_id,'title',c.title,'createdByUserId',c.created_by_user_id,
    'participantIds',coalesce((select jsonb_agg(m.user_id order by m.user_id) from public.conversation_members m where m.conversation_id=c.id),'[]'::jsonb),
    'participantRoles',coalesce((select jsonb_object_agg(m.user_id::text,m.member_role) from public.conversation_members m where m.conversation_id=c.id),'{}'::jsonb))
  from public.conversations c where c.id=target_id;
$$;
revoke all on function private.member_group_receipt(uuid) from public,anon,authenticated,service_role;

create function private.create_member_group(expected_user_id uuid,request_id uuid,target_stable_id uuid,group_title text,participant_ids uuid[]) returns jsonb
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare caller uuid; wanted uuid[]; clean_title text:=btrim(group_title); existing public.conversations%rowtype; actual uuid[];
begin
  caller:=private.assert_chat_actor(expected_user_id);
  if request_id is null or target_stable_id is null or participant_ids is null or array_position(participant_ids,null) is not null
    or clean_title is null or char_length(clean_title) not between 2 and 80 then
    raise exception using errcode='22023',message='[chat group] Ange ett gruppnamn på 2–80 tecken och giltiga deltagare.';
  end if;
  select array_agg(u.id order by u.id) into wanted from(select distinct unnest(participant_ids||array[caller]) id) u;
  if cardinality(wanted) not between 3 and 50 then
    raise exception using errcode='22023',message='[chat group] Välj minst två andra medlemmar och högst 50 deltagare totalt.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(request_id::text,24102026));
  select c.* into existing from public.conversations c where c.id=request_id for update;
  perform private.lock_chat_participants(target_stable_id,wanted);
  if exists(select 1 from public.blocked_users b where
    (b.blocker_user_id=caller and b.blocked_user_id=any(wanted)) or (b.blocked_user_id=caller and b.blocker_user_id=any(wanted))) then
    raise exception using errcode='42501',message='[chat group] En blockerad person kan inte läggas till.';
  end if;
  if existing.id is not null then
    select array_agg(m.user_id order by m.user_id) into actual from public.conversation_members m where m.conversation_id=request_id;
    if existing.chat_kind<>'custom' or existing.created_by_user_id is distinct from caller or existing.stable_id is distinct from target_stable_id
      or existing.title is distinct from clean_title or actual is distinct from wanted or not private.can_access_chat(request_id) then
      raise exception using errcode='40001',message='[chat group] Försöket skiljer sig från en redan sparad grupp. Använd ett nytt försök.';
    end if;
    return private.member_group_receipt(request_id);
  end if;
  insert into public.conversations(id,stable_id,title,is_group,chat_kind,created_by_user_id)
    values(request_id,target_stable_id,clean_title,true,'custom',caller);
  insert into public.conversation_members(conversation_id,user_id,member_role)
    select request_id,u.id,case when u.id=caller then 'owner' else 'member' end from unnest(wanted) u(id);
  return private.member_group_receipt(request_id);
exception when lock_not_available then
  raise log '[chat group] create conflict';
  raise exception using errcode='40001',message='[chat group] Medlemskapet ändras samtidigt. Försök igen med samma utkast.';
when others then raise log '[chat group] create rejected (%)',sqlstate; raise;
end $$;

create function private.manage_member_group(expected_user_id uuid,target_conversation_id uuid,group_title text default null,
  add_user_ids uuid[] default '{}',remove_user_ids uuid[] default '{}',transfer_owner_to uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare caller uuid; chat public.conversations%rowtype; additions uuid[]; removals uuid[]; needed uuid[]; remaining uuid[];
begin
  caller:=private.assert_chat_actor(expected_user_id);
  select c.* into chat from public.conversations c where c.id=target_conversation_id for update;
  if not found or chat.chat_kind<>'custom' or not private.can_access_chat(chat.id)
    or not exists(select 1 from public.conversation_members m where m.conversation_id=chat.id and m.user_id=caller and m.member_role='owner') then
    raise exception using errcode='42501',message='[chat group] Bara gruppansvarig kan ändra den här gruppen.';
  end if;
  if add_user_ids is null or remove_user_ids is null or array_position(add_user_ids,null) is not null or array_position(remove_user_ids,null) is not null
    or (group_title is not null and char_length(btrim(group_title)) not between 2 and 80)
    or caller=any(remove_user_ids) or add_user_ids&&remove_user_ids then
    raise exception using errcode='22023',message='[chat group] Kontrollera namn och deltagarval. Använd Lämna grupp för dig själv.';
  end if;
  select coalesce(array_agg(distinct u order by u),'{}'::uuid[]) into additions from unnest(add_user_ids) u;
  select coalesce(array_agg(distinct u order by u),'{}'::uuid[]) into removals from unnest(remove_user_ids) u;
  select array_agg(distinct u order by u) into needed from unnest(additions||array[caller]||case when transfer_owner_to is null then '{}'::uuid[] else array[transfer_owner_to] end) u;
  perform private.lock_chat_participants(chat.stable_id,needed);
  if exists(select 1 from public.blocked_users b where (b.blocker_user_id=caller and b.blocked_user_id=any(additions)) or (b.blocked_user_id=caller and b.blocker_user_id=any(additions))) then
    raise exception using errcode='42501',message='[chat group] En blockerad person kan inte läggas till.';
  end if;
  select array_agg(u.id order by u.id) into remaining from(
    select m.user_id id from public.conversation_members m where m.conversation_id=chat.id and not m.user_id=any(removals)
    union select unnest(additions)) u;
  if cardinality(remaining) not between 1 and 50 or (transfer_owner_to is not null and not transfer_owner_to=any(remaining)) then
    raise exception using errcode='22023',message='[chat group] Gruppen får ha högst 50 deltagare. Ny ansvarig måste vara kvar i gruppen.';
  end if;
  -- A real row version also fences stale REPEATABLE READ membership snapshots.
  update public.conversations set title=coalesce(btrim(group_title),title) where id=chat.id;
  delete from public.conversation_members where conversation_id=chat.id and user_id=any(removals);
  insert into public.conversation_members(conversation_id,user_id,member_role) select chat.id,u,'member' from unnest(additions) u
    on conflict(conversation_id,user_id) do nothing;
  if transfer_owner_to is not null and transfer_owner_to<>caller then
    update public.conversation_members set member_role='member' where conversation_id=chat.id and user_id=caller;
    update public.conversation_members set member_role='owner' where conversation_id=chat.id and user_id=transfer_owner_to;
  end if;
  return private.member_group_receipt(chat.id);
exception when lock_not_available then
  raise log '[chat group] manage conflict';
  raise exception using errcode='40001',message='[chat group] Medlemskapet ändras samtidigt. Försök igen med samma utkast.';
when others then raise log '[chat group] manage rejected (%)',sqlstate; raise;
end $$;

create function private.leave_member_group(expected_user_id uuid,target_conversation_id uuid,transfer_owner_to uuid default null,confirm_delete boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare caller uuid; chat public.conversations%rowtype; owner_role text; successor uuid; receipt jsonb;
begin
  caller:=private.assert_chat_actor(expected_user_id);
  select c.* into chat from public.conversations c where c.id=target_conversation_id for update;
  if not found or not private.can_access_chat(chat.id) then
    -- Idempotence discloses no metadata for guessed or previously departed groups.
    return jsonb_build_object('id',target_conversation_id,'chatKind','custom','stableId',null,'title',null,'createdByUserId',null,
      'participantIds','[]'::jsonb,'participantRoles','{}'::jsonb,'left',true,'deleted',false);
  end if;
  if chat.chat_kind<>'custom' then
    raise exception using errcode='42501',message='[chat group] Stallchatten kan inte lämnas separat. Aktuellt gruppmedlemskap krävs.';
  end if;
  perform private.lock_chat_participants(chat.stable_id,array[caller]);
  select member_role into owner_role from public.conversation_members where conversation_id=chat.id and user_id=caller;
  select m.user_id into successor from public.conversation_members m join public.stable_members s on s.user_id=m.user_id and s.stable_id=chat.stable_id
    where m.conversation_id=chat.id and m.user_id<>caller and private.chat_account_active(m.user_id) order by m.joined_at nulls last,m.user_id limit 1;
  if owner_role='owner' and successor is not null then
    if transfer_owner_to is null or transfer_owner_to=caller or not exists(select 1 from public.conversation_members m where m.conversation_id=chat.id and m.user_id=transfer_owner_to) then
      raise exception using errcode='22023',message='[chat group] Välj en kvarvarande deltagare som ny gruppansvarig innan du lämnar.';
    end if;
    perform private.lock_chat_participants(chat.stable_id,array[transfer_owner_to]);
    update public.conversation_members set member_role='member' where conversation_id=chat.id and user_id=caller;
    update public.conversation_members set member_role='owner' where conversation_id=chat.id and user_id=transfer_owner_to;
  elsif owner_role<>'owner' and transfer_owner_to is not null then
    raise exception using errcode='42501',message='[chat group] Bara gruppansvarig kan överlåta ansvaret.';
  end if;
  update public.conversations set title=title where id=chat.id;
  if successor is null then
    if confirm_delete is distinct from true then
      raise exception using errcode='40001',message='[chat group] Du är nu sista deltagaren. Bekräfta att gruppen och meddelandena ska raderas.',
        detail='{"requiresDeletionConfirmation":true}';
    end if;
    receipt:=private.member_group_receipt(chat.id)||jsonb_build_object('participantIds','[]'::jsonb,'participantRoles','{}'::jsonb);
    delete from public.conversations where id=chat.id;
    return receipt||jsonb_build_object('left',true,'deleted',true);
  end if;
  delete from public.conversation_members where conversation_id=chat.id and user_id=caller;
  return private.member_group_receipt(chat.id)||jsonb_build_object('left',true,'deleted',false);
exception when lock_not_available then
  raise log '[chat group] leave conflict';
  raise exception using errcode='40001',message='[chat group] Medlemskapet ändras samtidigt. Försök igen.';
when others then raise log '[chat group] leave rejected (%)',sqlstate; raise;
end $$;

create function public.create_member_group(expected_user_id uuid,request_id uuid,target_stable_id uuid,group_title text,participant_ids uuid[]) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select private.create_member_group(expected_user_id,request_id,target_stable_id,group_title,participant_ids); $$;
create function public.manage_member_group(expected_user_id uuid,target_conversation_id uuid,group_title text default null,add_user_ids uuid[] default '{}',remove_user_ids uuid[] default '{}',transfer_owner_to uuid default null) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select private.manage_member_group(expected_user_id,target_conversation_id,group_title,add_user_ids,remove_user_ids,transfer_owner_to); $$;
create function public.leave_member_group(expected_user_id uuid,target_conversation_id uuid,transfer_owner_to uuid default null,confirm_delete boolean default false) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select private.leave_member_group(expected_user_id,target_conversation_id,transfer_owner_to,confirm_delete); $$;
revoke all on function private.create_member_group(uuid,uuid,uuid,text,uuid[]),private.manage_member_group(uuid,uuid,text,uuid[],uuid[],uuid),private.leave_member_group(uuid,uuid,uuid,boolean),
  public.create_member_group(uuid,uuid,uuid,text,uuid[]),public.manage_member_group(uuid,uuid,text,uuid[],uuid[],uuid),public.leave_member_group(uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function private.create_member_group(uuid,uuid,uuid,text,uuid[]),private.manage_member_group(uuid,uuid,text,uuid[],uuid[],uuid),private.leave_member_group(uuid,uuid,uuid,boolean),
  public.create_member_group(uuid,uuid,uuid,text,uuid[]),public.manage_member_group(uuid,uuid,text,uuid[],uuid[],uuid),public.leave_member_group(uuid,uuid,uuid,boolean) to authenticated;

-- Trusted FK/profile/stable-membership cleanup, including clients outside the app.
create function private.reconcile_member_group() returns trigger language plpgsql security definer
set search_path=pg_catalog set row_security=off as $$
declare chat public.conversations%rowtype; successor uuid;
begin
  select c.* into chat from public.conversations c where c.id=old.conversation_id and c.chat_kind='custom' for update;
  if not found then return old; end if;
  update public.conversations set title=title where id=chat.id;
  select m.user_id into successor from public.conversation_members m join public.stable_members s on s.user_id=m.user_id and s.stable_id=chat.stable_id
    where m.conversation_id=chat.id and private.chat_account_active(m.user_id) order by m.joined_at nulls last,m.user_id limit 1;
  if successor is null then delete from public.conversations where id=chat.id;
  elsif not exists(select 1 from public.conversation_members m where m.conversation_id=chat.id and m.member_role='owner'
    and private.chat_account_active(m.user_id) and exists(select 1 from public.stable_members s where s.user_id=m.user_id and s.stable_id=chat.stable_id)) then
    update public.conversation_members set member_role='member' where conversation_id=chat.id and member_role='owner';
    update public.conversation_members set member_role='owner' where conversation_id=chat.id and user_id=successor;
  end if;
  return old;
end $$;
revoke all on function private.reconcile_member_group() from public,anon,authenticated,service_role;
create trigger reconcile_member_group after delete on public.conversation_members for each row execute function private.reconcile_member_group();

create function private.cleanup_member_group_membership() returns trigger language plpgsql security definer
set search_path=pg_catalog set row_security=off as $$
declare target record;
begin
  if tg_op='UPDATE' and new.user_id is not distinct from old.user_id and new.stable_id is not distinct from old.stable_id then return new; end if;
  for target in select c.id from public.conversations c join public.conversation_members m on m.conversation_id=c.id
    where c.chat_kind='custom' and c.stable_id=old.stable_id and m.user_id=old.user_id order by c.id for update of c loop
    delete from public.conversation_members where conversation_id=target.id and user_id=old.user_id;
  end loop;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.cleanup_member_group_membership() from public,anon,authenticated,service_role;
create trigger cleanup_member_group_membership after delete or update of user_id,stable_id on public.stable_members
  for each row execute function private.cleanup_member_group_membership();

create function private.cleanup_member_group_profile() returns trigger language plpgsql security definer
set search_path=pg_catalog set row_security=off as $$
declare target record;
begin
  for target in select c.id from public.conversations c join public.conversation_members m on m.conversation_id=c.id
    where c.chat_kind='custom' and m.user_id=old.id order by c.id for update of c loop
    delete from public.conversation_members where conversation_id=target.id and user_id=old.id;
  end loop;
  return old;
end $$;
revoke all on function private.cleanup_member_group_profile() from public,anon,authenticated,service_role;
-- Run after the existing account/media guards; never bypass or replace them.
create trigger z_cleanup_member_group_profile before delete on public.profiles for each row execute function private.cleanup_member_group_profile();

-- Push workers use the same current-account and exact-stable boundaries. A
-- queued message is insufficient authority once its sender/member was removed.
create function private.chat_push_recipients(target_conversation_id uuid,target_author_id uuid) returns uuid[]
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
declare chat public.conversations%rowtype; recipients uuid[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode='42501',message='[chat group] Serverbehörighet krävs för pushkontroll.';
  end if;
  select c.* into chat from public.conversations c where c.id=target_conversation_id;
  if not found or not private.chat_account_active(target_author_id) then return '{}'::uuid[]; end if;
  if chat.chat_kind in ('stable','custom') and not exists(select 1 from public.stable_members s where s.stable_id=chat.stable_id and s.user_id=target_author_id) then return '{}'::uuid[]; end if;
  if chat.chat_kind in ('direct','custom') and not exists(select 1 from public.conversation_members m where m.conversation_id=chat.id and m.user_id=target_author_id) then return '{}'::uuid[]; end if;
  select coalesce(array_agg(distinct candidate.user_id order by candidate.user_id),'{}'::uuid[]) into recipients from(
    select s.user_id from public.stable_members s where chat.chat_kind='stable' and s.stable_id=chat.stable_id
    union
    select m.user_id from public.conversation_members m where chat.chat_kind in ('direct','custom') and m.conversation_id=chat.id
      and (chat.chat_kind='direct' or exists(select 1 from public.stable_members s where s.user_id=m.user_id and s.stable_id=chat.stable_id))) candidate
  where candidate.user_id<>target_author_id and private.chat_account_active(candidate.user_id)
    and not exists(select 1 from public.blocked_users b where
      (b.blocker_user_id=candidate.user_id and b.blocked_user_id=target_author_id)
      or (b.blocker_user_id=target_author_id and b.blocked_user_id=candidate.user_id));
  return recipients;
end $$;
create function public.chat_push_recipients(target_conversation_id uuid,target_author_id uuid) returns uuid[]
language sql stable security invoker set search_path=pg_catalog as $$ select private.chat_push_recipients(target_conversation_id,target_author_id); $$;
revoke all on function private.chat_push_recipients(uuid,uuid),public.chat_push_recipients(uuid,uuid) from public,anon,authenticated,service_role;
grant usage on schema private to service_role;
grant execute on function private.chat_push_recipients(uuid,uuid),public.chat_push_recipients(uuid,uuid) to service_role;

-- TEMPORARY CUSTOM-GROUP PUSH GUARD, 2026-10-24.
-- Hosted Edge cannot yet be updated. Custom messages stay in-app and MUST NOT
-- reach the old whole-stable push handler. The deployed legacy body, attributes
-- and existing on_new_message_push trigger binding are otherwise unchanged.
create or replace function public.trigger_push_new_message()
returns trigger language plpgsql security definer set search_path=public as $function$
begin
  if exists(select 1 from public.conversations c where c.id=NEW.conversation_id and c.chat_kind='custom') then
    return NEW;
  end if;
  perform public.notify_push('message', to_jsonb(NEW));
  return NEW;
end;
$function$;

-- SAFE REVERSAL: after deploying and separately verifying custom-recipient
-- authorization in send-push-notification, use a new reviewed migration to
-- remove ONLY the IF/RETURN guard above. Restore this exact captured body:
--   begin
--     perform public.notify_push('message', to_jsonb(NEW));
--     return NEW;
--   end;
-- Keep this function's existing trigger binding and all chat RLS/RPC checks.

-- Existing exact-ID and blocked-sender read receipt checks remain intact.
create or replace function public.own_chat_read_state(
  expected_user_id uuid,
  target_conversation_id uuid,
  message_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare
  caller uuid := auth.uid();
  chat public.conversations%rowtype;
  requested uuid[];
  confirmed jsonb;
  known_read jsonb;
  unread jsonb;
begin
  -- PostgREST verifies the token. expected_user_id is only a client session fence.
  if caller is null or auth.role() is distinct from 'authenticated' or caller is distinct from expected_user_id then
    raise exception using errcode = '42501', message = '[chat read] Verifierat eget konto krävs.';
  end if;
  perform p.id from public.profiles p where p.id = caller for key share nowait;
  if not found or not exists (
    select 1 from auth.users u where u.id = caller and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
  ) then
    raise exception using errcode = '42501', message = '[chat read] Aktivt eget konto krävs.';
  end if;
  select c.* into chat from public.conversations c where c.id = target_conversation_id for share;
  if not found then
    raise exception using errcode = '42501', message = '[chat read] Aktuell chattåtkomst krävs.';
  end if;
  if not private.can_access_chat(chat.id) then
    raise exception using errcode = '42501', message = '[chat read] Aktuell chattåtkomst krävs.';
  end if;
  if chat.chat_kind in ('stable','custom') then
    perform sm.id from public.stable_members sm
      where sm.stable_id=chat.stable_id and sm.user_id=caller for key share nowait;
    if not found then raise exception using errcode='42501',message='[chat read] Aktuell chattåtkomst krävs.'; end if;
  end if;
  if chat.chat_kind in ('direct','custom') then
    perform cm.id from public.conversation_members cm
      where cm.conversation_id=chat.id and cm.user_id=caller for key share nowait;
    if not found then raise exception using errcode='42501',message='[chat read] Aktuell chattåtkomst krävs.'; end if;
  end if;
  if message_ids is null or array_position(message_ids, null) is not null then
    raise exception using errcode = '22023', message = '[chat read] Exakta meddelande-ID:n krävs.';
  end if;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into requested
    from (select distinct unnest(message_ids) as id) ids;
  perform m.id from public.messages m
    where m.id = any(requested) and m.conversation_id = chat.id
      and m.author_id is distinct from caller
      and not exists (select 1 from public.blocked_users b where b.blocker_user_id = caller and b.blocked_user_id = m.author_id)
    order by m.id for share;
  if exists (
    select 1 from unnest(requested) ids(id)
    where not exists (
      select 1 from public.messages m where m.id = ids.id and m.conversation_id = chat.id
        and m.author_id is distinct from caller
        and not exists (select 1 from public.blocked_users b where b.blocker_user_id = caller and b.blocked_user_id = m.author_id)
    )
  ) then
    raise exception using errcode = '42501', message = '[chat read] Meddelandena kunde inte verifieras i den här chatten.';
  end if;
  -- One statement/snapshot and one JSON value: no partial sets or REST row cap.
  -- Complete own read IDs classify delayed INSERTs outside loaded history too.
  select
    coalesce(jsonb_agg(m.id order by m.id) filter (where r.message_id is not null and m.id = any(requested)), '[]'::jsonb),
    coalesce(jsonb_agg(m.id order by m.id) filter (where r.message_id is not null), '[]'::jsonb),
    coalesce(jsonb_agg(m.id order by m.id) filter (where r.message_id is null), '[]'::jsonb)
    into confirmed, known_read, unread
    from public.messages m
    left join public.chat_message_reads r on r.user_id = caller and r.message_id = m.id
    where m.conversation_id = chat.id and m.author_id is distinct from caller
      and not exists (select 1 from public.blocked_users b where b.blocker_user_id = caller and b.blocked_user_id = m.author_id);
  return jsonb_build_object(
    'user_id', caller, 'conversation_id', chat.id, 'complete', true,
    'requested_message_ids', to_jsonb(requested), 'read_message_ids', confirmed,
    'known_read_message_ids', known_read, 'unread_message_ids', unread
  );
exception when lock_not_available then
  raise exception using errcode='40001',message='[chat read] Chattåtkomsten ändras samtidigt. Försök igen.';
end;
$$;

commit;
