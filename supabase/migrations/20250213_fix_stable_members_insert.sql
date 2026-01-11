-- Allow first owner to insert themselves into stable_members after creating a stable.

drop policy if exists "stable_members_insert" on public.stable_members;
create policy "stable_members_insert" on public.stable_members
  for insert with check (
    public.is_stable_owner(stable_id)
    or (
      (select auth.uid()) = user_id
      and exists (
        select 1
        from public.stables s
        where s.id = stable_id
          and s.created_by = (select auth.uid())
      )
    )
  );
