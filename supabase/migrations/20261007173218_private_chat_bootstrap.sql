-- User-approved 2026-10-07; applied as private_chat_bootstrap.
-- Två privata policyer: bootstrap för skaparen och caller-bound INSERT.
-- Befintliga medlems- och meddelandepolicyer ändras inte.
begin;
drop policy if exists "conversations_private_creator_select" on public.conversations;
create policy "conversations_private_creator_select" on public.conversations
  for select to authenticated
  using (
    stable_id is null
    and not coalesce(is_group, false)
    and created_by_user_id = (select auth.uid())
  );

drop policy if exists "conversations_private_insert_self" on public.conversations;
create policy "conversations_private_insert_self" on public.conversations
  as restrictive for insert to authenticated
  with check (
    stable_id is not null
    or coalesce(is_group, false)
    or created_by_user_id = (select auth.uid())
  );
commit;
