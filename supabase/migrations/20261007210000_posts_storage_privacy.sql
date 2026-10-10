-- PROPOSED ONLY. Requires its own exact schema approval; no live application performed.
-- Two additive restrictive Storage policies. Existing policies, buckets, ACL,
-- owner, role membership, UPDATE/DELETE rules and public.posts RLS are preserved.
begin;

do $$
declare
  delegated boolean := false;
  storage_owner oid;
  postgres_admin boolean;
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null
     or to_regclass('public.posts') is null or to_regclass('public.profiles') is null then
    raise exception using errcode = '55000', message = '[posts storage] Required tables are missing.';
  end if;
  if not exists (select 1 from pg_catalog.pg_class where oid = 'storage.objects'::regclass and relrowsecurity)
     or not exists (select 1 from pg_catalog.pg_class where oid = 'public.posts'::regclass and relrowsecurity) then
    raise exception using errcode = '55000', message = '[posts storage] Required row security is disabled.';
  end if;
  if not exists (select 1 from storage.buckets where id = 'posts' and public = false) then
    raise exception using errcode = '55000', message = '[posts storage] An existing private posts bucket is required.';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'storage.objects'::regclass and attname = 'owner' and atttypid = 'uuid'::regtype and not attisdropped)
     or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'storage.objects'::regclass and attname = 'owner_id' and atttypid = 'text'::regtype and not attisdropped) then
    raise exception using errcode = '55000', message = '[posts storage] Storage ownership columns differ from the reviewed catalog.';
  end if;

  select relowner into storage_owner from pg_catalog.pg_class where oid = 'storage.objects'::regclass;
  select rolsuper into postgres_admin from pg_catalog.pg_roles where rolname = current_user;
  if not (postgres_admin or pg_has_role(current_user, storage_owner, 'USAGE')) then
    begin
      if 'supautils' = any(string_to_array(replace(coalesce(current_setting('session_preload_libraries', true), ''), ' ', ''), ',')) then
        delegated := coalesce((nullif(current_setting('supautils.policy_grants', true), '')::jsonb -> current_user) ? 'storage.objects', false);
      end if;
    exception when insufficient_privilege then
      delegated := false;
    end;
  end if;
  if not (postgres_admin or pg_has_role(current_user, storage_owner, 'USAGE') or delegated) then
    raise exception using errcode = '42501', message = '[posts storage] Current role cannot administer Storage policies; an existing authorized policy channel is required.';
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    raise exception using errcode = '42501', message = '[posts storage] Draft-check function owner must have reviewed RLS bypass.';
  end if;
end;
$$;

-- This only parses the actual uploader format; it never queries content.
create or replace function public.stableflow_post_image_parts(p_name text)
returns uuid[]
language plpgsql
immutable strict
set search_path = pg_catalog
as $$
declare
  parts text[] := string_to_array(p_name, '/');
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if coalesce(array_length(parts, 1), 0) <> 4 or parts[1] !~ uuid_pattern or parts[2] !~ uuid_pattern
     or parts[3] !~ uuid_pattern
     or parts[4] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$' then
    return null;
  end if;
  return array[parts[1]::uuid, parts[2]::uuid, parts[3]::uuid];
end;
$$;

-- 0 = blocked, 1 = fresh draft with no post-ID collision, 2 = the caller's
-- existing post in this stable. Only an own-prefix boolean/state is exposed.
-- A global reference/collision check must not confuse an RLS-hidden post with
-- an absent post. Public image reads themselves remain SECURITY INVOKER.
create or replace function public.stableflow_post_image_draft_state(p_name text)
returns integer
language plpgsql
stable
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare
  parts uuid[] := public.stableflow_post_image_parts(p_name);
  caller uuid := auth.uid();
begin
  if parts is null or caller is null or caller <> parts[2]
     or not exists (select 1 from public.profiles where id = caller)
     or not public.is_stable_member(parts[1]) then
    return 0;
  end if;
  if exists (select 1 from public.posts where image_url = p_name) then
    return 0;
  end if;
  if not exists (select 1 from public.posts where id = parts[3]) then
    return 1;
  end if;
  if exists (select 1 from public.posts where id = parts[3] and stable_id = parts[1] and user_id = caller) then
    return 2;
  end if;
  return 0;
end;
$$;

revoke all on function public.stableflow_post_image_parts(text) from public, anon;
revoke all on function public.stableflow_post_image_draft_state(text) from public, anon;
grant execute on function public.stableflow_post_image_parts(text) to authenticated;
grant execute on function public.stableflow_post_image_draft_state(text) to authenticated;

drop policy if exists stableflow_posts_read_gate on storage.objects;
create policy stableflow_posts_read_gate on storage.objects
as restrictive for select to authenticated
using (
  bucket_id <> 'posts' or (
    bucket_id = 'posts'
    and public.stableflow_post_image_parts(name) is not null
    and exists (select 1 from public.profiles where id = (select auth.uid()))
    and public.is_stable_member((public.stableflow_post_image_parts(name))[1])
    and (
      (nullif(owner_id, '') = (public.stableflow_post_image_parts(name))[2]::text
        and (owner is null or owner = (public.stableflow_post_image_parts(name))[2]))
      or (owner = (public.stableflow_post_image_parts(name))[2] and nullif(owner_id, '') is null)
    )
    and (
      exists (
        select 1 from public.posts p
        where p.id = (public.stableflow_post_image_parts(name))[3]
          and p.stable_id = (public.stableflow_post_image_parts(name))[1]
          and p.user_id = (public.stableflow_post_image_parts(name))[2]
          and p.image_url = storage.objects.name
      )
      or case public.stableflow_post_image_draft_state(name)
        when 1 then true
        when 2 then exists (
          select 1 from public.posts p
          where p.id = (public.stableflow_post_image_parts(name))[3]
            and p.stable_id = (public.stableflow_post_image_parts(name))[1]
            and p.user_id = (select auth.uid())
        )
        else false
      end
    )
  )
);

drop policy if exists stableflow_posts_insert_gate on storage.objects;
create policy stableflow_posts_insert_gate on storage.objects
as restrictive for insert to authenticated
with check (
  bucket_id <> 'posts' or (
    bucket_id = 'posts'
    and public.stableflow_post_image_parts(name) is not null
    and (public.stableflow_post_image_parts(name))[2] = (select auth.uid())
    and exists (select 1 from public.profiles where id = (select auth.uid()))
    and public.is_stable_member((public.stableflow_post_image_parts(name))[1])
    and (
      (nullif(owner_id, '') = (select auth.uid())::text and (owner is null or owner = (select auth.uid())))
      or (owner = (select auth.uid()) and nullif(owner_id, '') is null)
    )
    and case public.stableflow_post_image_draft_state(name)
      when 1 then true
      when 2 then exists (
        select 1 from public.posts p
        where p.id = (public.stableflow_post_image_parts(name))[3]
          and p.stable_id = (public.stableflow_post_image_parts(name))[1]
          and p.user_id = (select auth.uid())
      )
      else false
    end
  )
);

commit;
