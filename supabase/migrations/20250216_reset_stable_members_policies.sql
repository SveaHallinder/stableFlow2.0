-- Remove legacy bootstrap policies and re-create stable_members policies.

drop policy if exists "stable_members_select" on public.stable_members;
drop policy if exists "stable_members_insert" on public.stable_members;
drop policy if exists "stable_members_insert_owner_bootstrap" on public.stable_members;
drop policy if exists "stable_members_update" on public.stable_members;
drop policy if exists "stable_members_update_owner_bootstrap" on public.stable_members;
drop policy if exists "stable_members_delete" on public.stable_members;

create policy "stable_members_select" on public.stable_members
  for select using (public.is_stable_member(stable_id));

create policy "stable_members_insert" on public.stable_members
  for insert with check (
    public.is_stable_owner(stable_id)
    or (
      (select auth.uid()) = user_id
      and public.is_stable_creator(stable_id)
    )
  );

create policy "stable_members_update" on public.stable_members
  for update using (public.is_stable_owner(stable_id));

create policy "stable_members_delete" on public.stable_members
  for delete using (public.is_stable_owner(stable_id));
