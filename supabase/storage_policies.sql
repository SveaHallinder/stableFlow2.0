-- Storage policies require supabase_admin (storage.objects owned by supabase_storage_admin).
-- Run this block in SQL Editor with role = supabase_admin.

alter table storage.objects enable row level security;

insert into storage.buckets (id, name, public)
values ('posts', 'posts', false)
on conflict (id) do update set public = false;

drop policy if exists "posts_storage_read" on storage.objects;
create policy "posts_storage_read" on storage.objects
  for select using (
    bucket_id = 'posts'
    and public.is_stable_member(public.storage_stable_id(name))
  );

drop policy if exists "posts_storage_insert" on storage.objects;
create policy "posts_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'posts'
    and owner = (select auth.uid())
    and public.is_stable_member(public.storage_stable_id(name))
  );

drop policy if exists "posts_storage_update" on storage.objects;
create policy "posts_storage_update" on storage.objects
  for update
  using (
    bucket_id = 'posts'
    and public.is_stable_member(public.storage_stable_id(name))
    and (
      owner = (select auth.uid())
      or public.is_stable_owner(public.storage_stable_id(name))
    )
  )
  with check (
    bucket_id = 'posts'
    and public.is_stable_member(public.storage_stable_id(name))
    and (
      owner = (select auth.uid())
      or public.is_stable_owner(public.storage_stable_id(name))
    )
  );

drop policy if exists "posts_storage_delete" on storage.objects;
create policy "posts_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'posts'
    and public.is_stable_member(public.storage_stable_id(name))
    and (
      owner = (select auth.uid())
      or public.is_stable_owner(public.storage_stable_id(name))
    )
  );
