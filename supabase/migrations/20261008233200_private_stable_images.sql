-- Proposal only. Create private horse/paddock buckets and narrow existing Storage access.
begin;
do $preflight$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null
    or to_regprocedure('public.account_is_active()') is null
    or to_regprocedure('public.is_stable_member(uuid)') is null
    or to_regprocedure('public.can_edit_stable(uuid)') is null then
    raise exception using errcode='P0001',message='[private images] required Storage or account scope is missing';
  end if;
  if exists(select 1 from storage.buckets where id in ('avatars','paddocks')
    and (public is distinct from false or name is distinct from id)) then
    raise exception using errcode='P0001',message='[private images] existing bucket configuration differs';
  end if;
end
$preflight$;

insert into storage.buckets(id,name,public) values('avatars','avatars',false),('paddocks','paddocks',false)
  on conflict(id) do nothing;

create or replace function public.stable_image_scope(p_bucket text,p_path text,p_edit boolean)
returns boolean language plpgsql stable security definer
set search_path=pg_catalog set row_security=off
as $function$
declare stable_id uuid;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated' or not public.account_is_active()
    or not exists(select 1 from auth.users u where u.id=auth.uid() and u.deleted_at is null
      and coalesce(u.banned_until,'-infinity'::timestamptz)<=now())
    or p_bucket is null or p_bucket not in ('avatars','paddocks') or p_path is null
    or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][a-zA-Z0-9]+$'
    or p_edit is null then return false; end if;
  stable_id:=split_part(p_path,'/',1)::uuid;
  if p_edit then return public.can_edit_stable(stable_id); end if;
  return public.is_stable_member(stable_id);
end
$function$;
alter function public.stable_image_scope(text,text,boolean) owner to postgres;
revoke all on function public.stable_image_scope(text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.stable_image_scope(text,text,boolean) to authenticated;

-- All other bucket rows retain their existing policies, including legacy NULL bucket values.
drop policy if exists stable_images_read_gate on storage.objects;
create policy stable_images_read_gate on storage.objects as restrictive for select to authenticated
  using ((bucket_id is distinct from 'avatars' and bucket_id is distinct from 'paddocks')
    or public.stable_image_scope(bucket_id,name,false));
drop policy if exists stable_images_insert_gate on storage.objects;
create policy stable_images_insert_gate on storage.objects as restrictive for insert to authenticated
  with check ((bucket_id is distinct from 'avatars' and bucket_id is distinct from 'paddocks')
    or (public.stable_image_scope(bucket_id,name,true) and owner_id=auth.uid()::text and (owner is null or owner=auth.uid())));
drop policy if exists stable_images_delete_gate on storage.objects;
create policy stable_images_delete_gate on storage.objects as restrictive for delete to authenticated
  using ((bucket_id is distinct from 'avatars' and bucket_id is distinct from 'paddocks')
    or (public.stable_image_scope(bucket_id,name,true)
      and (owner_id=auth.uid()::text or owner_id is null and owner=auth.uid()) and (owner is null or owner=auth.uid())));

-- Preserve all permissive grants and account/media restrictives. No new UPDATE or DELETE grant.
-- New files use upsert:false. Modern owner_id-only deletion in the account plan uses service-role Storage SDK.
commit;
