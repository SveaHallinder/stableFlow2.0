-- PROPOSED ONLY. Requires explicit approval for this exact schema/RLS scope.
-- Keeps auth.admin.deleteUser; no direct Auth writes and no Storage blob deletion.
begin;

-- Read managed Auth status fields only after their reviewed shape is present.
-- No Auth column/schema is created or changed by this proposal.
do $auth_shape$
begin
  if (select count(*) from pg_catalog.pg_attribute
      where attrelid='auth.users'::regclass and attname in ('deleted_at','banned_until')
        and not attisdropped and atttypid='timestamptz'::regtype) <> 2 then
    raise exception using errcode='55000', message='[account delete] Auth status columns saknas eller avviker; avbryt.';
  end if;
end
$auth_shape$;

-- Validate the missing live creator FK instead of accepting dangling farms.
do $farm_fk$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.farms'::regclass and conname='farms_account_owner_fkey') then
    alter table public.farms add constraint farms_account_owner_fkey
      foreign key (created_by) references public.profiles(id) on delete restrict not valid;
  elsif not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid='public.farms'::regclass and conname='farms_account_owner_fkey'
      and contype='f' and confrelid='public.profiles'::regclass and confdeltype='r'
      and conkey=array[(select attnum from pg_catalog.pg_attribute where attrelid='public.farms'::regclass and attname='created_by')]::smallint[]
      and confkey=array[(select attnum from pg_catalog.pg_attribute where attrelid='public.profiles'::regclass and attname='id')]::smallint[]
  ) then
    raise exception using errcode='55000', message='[account delete] farms_account_owner_fkey avviker; avbryt.';
  end if;
end
$farm_fk$;
alter table public.farms validate constraint farms_account_owner_fkey;

-- One immutable selected owner per pending deletion. A delayed Auth request
-- must never consume a different owner's replacement plan. No automatic expiry.
create table if not exists public.account_deletion_intents (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  replacement_user_id uuid,
  created_at timestamptz not null default now()
);
alter table public.account_deletion_intents enable row level security;
revoke all on public.account_deletion_intents from public, anon, authenticated, service_role;

-- This is a targeted stale-UID gate, not JWT revocation. Existing permissive
-- Storage/invite policies remain in place. Public buckets remain public.
create or replace function public.account_is_active()
returns boolean language sql stable security definer
set search_path=pg_catalog set row_security=off
as $function$
  select exists(select 1 from public.profiles where id=auth.uid())
    and not exists(select 1 from public.account_deletion_intents where user_id=auth.uid());
$function$;
alter function public.account_is_active() owner to postgres;
revoke all on function public.account_is_active() from public, anon, authenticated, service_role;
grant execute on function public.account_is_active() to authenticated;

-- Serialize Storage INSERT with preparation's profile FOR UPDATE lock. A write
-- already in flight completes first and is then seen by the ownership check;
-- a subsequent write sees the committed deletion intent and is denied.
create or replace function public.account_can_upload()
returns boolean language plpgsql volatile security definer
set search_path=pg_catalog set row_security=off
as $function$
begin
  perform 1 from public.profiles where id=auth.uid() for key share;
  if not found then return false; end if;
  return not exists(select 1 from public.account_deletion_intents where user_id=auth.uid());
end
$function$;
alter function public.account_can_upload() owner to postgres;
revoke all on function public.account_can_upload() from public, anon, authenticated, service_role;
grant execute on function public.account_can_upload() to authenticated;

drop policy if exists account_active_gate on storage.objects;
create policy account_active_gate on storage.objects as restrictive for all to authenticated
  using (public.account_is_active()) with check (public.account_is_active());
drop policy if exists account_upload_gate on storage.objects;
create policy account_upload_gate on storage.objects as restrictive for insert to authenticated
  with check (public.account_can_upload());
drop policy if exists account_active_gate on public.stable_invites;
create policy account_active_gate on public.stable_invites as restrictive for all to authenticated
  using (public.account_is_active()) with check (public.account_is_active());

create or replace function public.assert_account_deletion(p_user_id uuid, p_replacement_user_id uuid)
returns void language plpgsql volatile security definer
set search_path=pg_catalog set row_security=off
as $function$
declare affected record;
begin
  -- Never delete Storage metadata or pretend its bytes were deleted. Unknown
  -- legacy media attribution also fails closed pending a reviewed file plan.
  if exists(select 1 from storage.objects where owner=p_user_id or owner_id=p_user_id::text)
    or exists(select 1 from public.profiles where id=p_user_id and nullif(avatar_url,'') is not null)
    or exists(select 1 from public.posts where user_id=p_user_id and nullif(image_url,'') is not null) then
    raise exception using errcode='P0001', message='[account delete] storage_blocked';
  end if;
  if p_replacement_user_id=p_user_id then
    raise exception using errcode='P0001', message='[account delete] owner_invalid';
  end if;
  if p_replacement_user_id is not null then
    perform 1 from auth.users where id=p_replacement_user_id
      and deleted_at is null and coalesce(banned_until,'-infinity'::timestamptz) <= now() for share;
    if not found then raise exception using errcode='P0001', message='[account delete] owner_invalid'; end if;
    perform 1 from public.profiles where id=p_replacement_user_id for key share;
    if not found or exists(select 1 from public.account_deletion_intents where user_id=p_replacement_user_id) then
      raise exception using errcode='P0001', message='[account delete] owner_invalid';
    end if;
  end if;

  -- Lock farms first: no concurrent FK link can add another stable to their
  -- management scope while the selected owner's permissions are being checked.
  perform 1 from public.farms where created_by=p_user_id order by id for update;
  if found and p_replacement_user_id is null then
    raise exception using errcode='P0001', message='[account delete] owner_required';
  end if;
  for affected in
    select s.id from public.stables s
    where s.created_by=p_user_id
      or exists(select 1 from public.stable_members m where m.stable_id=s.id and m.user_id=p_user_id and m.role='admin' and m.access='owner')
      or exists(select 1 from public.farms f where f.id=s.farm_id and f.created_by=p_user_id)
    order by s.id
  loop
    if p_replacement_user_id is null then
      raise exception using errcode='P0001', message='[account delete] owner_required';
    end if;
    -- Same serialization write as the existing last-owner guard; a stale
    -- Repeatable Read snapshot fails instead of accepting old owner metadata.
    update public.stables set created_at=created_at where id=affected.id;
    perform 1 from public.stable_members
      where stable_id=affected.id and user_id=p_replacement_user_id and role='admin' and access='owner'
      for update;
    if not found then
      raise exception using errcode='P0001', message='[account delete] owner_invalid';
    end if;
  end loop;
end
$function$;
alter function public.assert_account_deletion(uuid,uuid) owner to postgres;
revoke all on function public.assert_account_deletion(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function public.prepare_account_deletion(p_user_id uuid, p_replacement_user_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog set row_security=off
as $function$
declare existing_owner uuid;
begin
  -- Service-role endpoint supplies a getUser-verified UID, never raw client UID.
  perform 1 from auth.users where id=p_user_id for key share;
  if not found then raise exception using errcode='P0001', message='[account delete] account_changed'; end if;
  perform 1 from public.profiles where id=p_user_id for update;
  if not found then raise exception using errcode='P0001', message='[account delete] account_changed'; end if;
  select replacement_user_id into existing_owner from public.account_deletion_intents where user_id=p_user_id;
  if found and existing_owner is distinct from p_replacement_user_id then
    raise exception using errcode='P0001', message='[account delete] deletion_in_progress';
  end if;
  perform public.assert_account_deletion(p_user_id,p_replacement_user_id);
  insert into public.account_deletion_intents(user_id,replacement_user_id)
    values(p_user_id,p_replacement_user_id) on conflict(user_id) do nothing;
  return jsonb_build_object('prepared',true,'user_id',p_user_id,'replacement_user_id',p_replacement_user_id);
end
$function$;
alter function public.prepare_account_deletion(uuid,uuid) owner to postgres;
revoke all on function public.prepare_account_deletion(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.prepare_account_deletion(uuid,uuid) to service_role;

create or replace function public.apply_account_deletion()
returns trigger language plpgsql volatile security definer
set search_path=pg_catalog set row_security=off
as $function$
declare replacement_id uuid;
begin
  -- Direct profile-only deletion cannot masquerade as an Auth account deletion.
  if exists(select 1 from auth.users where id=old.id) then
    raise exception using errcode='P0001', message='[account delete] auth_cascade_required';
  end if;
  select replacement_user_id into replacement_id from public.account_deletion_intents where user_id=old.id;
  if not found then raise exception using errcode='P0001', message='[account delete] preparation_required'; end if;
  perform public.assert_account_deletion(old.id,replacement_id);
  update public.stables set created_by=replacement_id where created_by=old.id;
  update public.farms set created_by=replacement_id where created_by=old.id;

  -- Leave the thread ID and everyone else's replies/likes intact. Remove the
  -- author's text/media references BEFORE deployed user_id CASCADE executes.
  update public.posts set user_id=null,caption=null,content=null,image_url=null where user_id=old.id;
  delete from public.comments where user_id=old.id;
  delete from public.messages where author_id=old.id;
  return old;
end
$function$;
alter function public.apply_account_deletion() owner to postgres;
revoke all on function public.apply_account_deletion() from public, anon, authenticated, service_role;
drop trigger if exists apply_account_deletion on public.profiles;
create trigger apply_account_deletion before delete on public.profiles
  for each row execute function public.apply_account_deletion();
commit;
