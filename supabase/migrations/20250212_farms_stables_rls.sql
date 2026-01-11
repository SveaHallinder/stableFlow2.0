-- Add farm ownership and tighten RLS for farms/stables.

alter table public.farms add column if not exists created_by uuid references public.profiles(id) on delete set null;

update public.farms f
set created_by = s.created_by
from public.stables s
where f.created_by is null
  and s.farm_id = f.id
  and s.created_by is not null;

update public.farms f
set created_by = m.user_id
from public.stables s
join public.stable_members m on m.stable_id = s.id
where f.created_by is null
  and s.farm_id = f.id
  and m.role = 'admin'
  and coalesce(m.access, 'view') = 'owner';

alter table public.farms alter column created_by set default auth.uid();

alter table public.farms enable row level security;
alter table public.stables enable row level security;

drop policy if exists "farms_select" on public.farms;
drop policy if exists "farms_insert" on public.farms;
drop policy if exists "farms_update" on public.farms;
drop policy if exists "farms_delete" on public.farms;

create policy "farms_select" on public.farms
  for select using (created_by = auth.uid());
create policy "farms_insert" on public.farms
  for insert with check (created_by = auth.uid());
create policy "farms_update" on public.farms
  for update using (created_by = auth.uid());
create policy "farms_delete" on public.farms
  for delete using (created_by = auth.uid());

drop policy if exists "stables_select" on public.stables;
drop policy if exists "stables_insert" on public.stables;
drop policy if exists "stables_update" on public.stables;
drop policy if exists "stables_delete" on public.stables;

create policy "stables_select" on public.stables
  for select using (
    created_by = auth.uid()
    or exists (
      select 1
      from public.stable_members m
      where m.stable_id = stables.id
        and m.user_id = auth.uid()
    )
  );
create policy "stables_insert" on public.stables
  for insert with check (created_by = auth.uid());
create policy "stables_update" on public.stables
  for update using (
    created_by = auth.uid()
    or exists (
      select 1
      from public.stable_members m
      where m.stable_id = stables.id
        and m.user_id = auth.uid()
    )
  );
create policy "stables_delete" on public.stables
  for delete using (created_by = auth.uid());

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
