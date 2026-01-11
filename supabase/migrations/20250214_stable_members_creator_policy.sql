-- Allow creator to self-join stable_members without relying on stables RLS.

create or replace function public.is_stable_creator(p_stable_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.stables s
    where s.id = p_stable_id
      and s.created_by = auth.uid()
  );
$$;

drop policy if exists "stable_members_insert" on public.stable_members;
create policy "stable_members_insert" on public.stable_members
  for insert with check (
    public.is_stable_owner(stable_id)
    or (
      (select auth.uid()) = user_id
      and public.is_stable_creator(stable_id)
    )
  );
