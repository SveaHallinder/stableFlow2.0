-- Phase 4: Planned rides — schedule rides ahead, link completion to ride_logs.

create table if not exists public.planned_rides (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade not null,
  horse_id uuid references public.horses(id) on delete cascade not null,
  rider_user_id uuid references public.profiles(id) on delete set null,
  date date not null,
  time text,
  ride_type_id text,
  note text,
  status text not null default 'planned',
  completed_ride_log_id uuid references public.ride_logs(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.planned_rides enable row level security;

create index if not exists planned_rides_stable_id_idx on public.planned_rides(stable_id);
create index if not exists planned_rides_horse_id_idx on public.planned_rides(horse_id);
create index if not exists planned_rides_stable_id_date_idx on public.planned_rides(stable_id, date);

drop policy if exists "planned_rides_select" on public.planned_rides;
create policy "planned_rides_select" on public.planned_rides
  for select using (public.is_stable_member(stable_id));

-- Insert/update/delete uses can_manage_ride_logs (matches ride_logs).
-- Horse owners can also manage their own horse's planned rides.
drop policy if exists "planned_rides_insert" on public.planned_rides;
create policy "planned_rides_insert" on public.planned_rides
  for insert with check (
    public.can_manage_ride_logs(stable_id)
    or exists (
      select 1
      from public.horses h
      where h.id = planned_rides.horse_id
        and h.owner_user_id = (select auth.uid())
    )
  );
drop policy if exists "planned_rides_update" on public.planned_rides;
create policy "planned_rides_update" on public.planned_rides
  for update using (
    public.can_manage_ride_logs(stable_id)
    or exists (
      select 1
      from public.horses h
      where h.id = planned_rides.horse_id
        and h.owner_user_id = (select auth.uid())
    )
  );
drop policy if exists "planned_rides_delete" on public.planned_rides;
create policy "planned_rides_delete" on public.planned_rides
  for delete using (
    public.can_manage_ride_logs(stable_id)
    or exists (
      select 1
      from public.horses h
      where h.id = planned_rides.horse_id
        and h.owner_user_id = (select auth.uid())
    )
  );
