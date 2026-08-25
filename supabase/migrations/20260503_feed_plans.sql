-- Phase 3: Feed plans and feed checks.
-- Stable defaults plus per-horse overrides for foderplan, with per-day check log.

create table if not exists public.feed_plans (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade not null,
  horse_id uuid references public.horses(id) on delete cascade,
  slot text not null,
  label text not null,
  amount text,
  note text,
  is_stable_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.feed_plans enable row level security;

create table if not exists public.feed_checks (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade not null,
  horse_id uuid references public.horses(id) on delete cascade not null,
  date date not null,
  slot text not null,
  checked_by_user_id uuid references public.profiles(id) on delete set null,
  checked_at timestamptz,
  deviation_note text,
  created_at timestamptz default now(),
  unique (horse_id, date, slot)
);
alter table public.feed_checks enable row level security;

create index if not exists feed_plans_stable_id_idx on public.feed_plans(stable_id);
create index if not exists feed_plans_horse_id_idx on public.feed_plans(horse_id);
create index if not exists feed_checks_stable_id_idx on public.feed_checks(stable_id);
create index if not exists feed_checks_horse_id_date_idx on public.feed_checks(horse_id, date);

drop policy if exists "feed_plans_select" on public.feed_plans;
create policy "feed_plans_select" on public.feed_plans
  for select using (public.is_stable_member(stable_id));
drop policy if exists "feed_plans_insert" on public.feed_plans;
create policy "feed_plans_insert" on public.feed_plans
  for insert with check (
    public.can_edit_stable(stable_id)
    or (
      horse_id is not null
      and exists (
        select 1
        from public.horses h
        where h.id = feed_plans.horse_id
          and h.owner_user_id = (select auth.uid())
      )
    )
  );
drop policy if exists "feed_plans_update" on public.feed_plans;
create policy "feed_plans_update" on public.feed_plans
  for update using (
    public.can_edit_stable(stable_id)
    or (
      horse_id is not null
      and exists (
        select 1
        from public.horses h
        where h.id = feed_plans.horse_id
          and h.owner_user_id = (select auth.uid())
      )
    )
  );
drop policy if exists "feed_plans_delete" on public.feed_plans;
create policy "feed_plans_delete" on public.feed_plans
  for delete using (
    public.can_edit_stable(stable_id)
    or (
      horse_id is not null
      and exists (
        select 1
        from public.horses h
        where h.id = feed_plans.horse_id
          and h.owner_user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "feed_checks_select" on public.feed_checks;
create policy "feed_checks_select" on public.feed_checks
  for select using (public.is_stable_member(stable_id));
drop policy if exists "feed_checks_insert" on public.feed_checks;
create policy "feed_checks_insert" on public.feed_checks
  for insert with check (public.can_update_horse_status(stable_id));
drop policy if exists "feed_checks_update" on public.feed_checks;
create policy "feed_checks_update" on public.feed_checks
  for update using (public.can_update_horse_status(stable_id));
drop policy if exists "feed_checks_delete" on public.feed_checks;
create policy "feed_checks_delete" on public.feed_checks
  for delete using (public.can_update_horse_status(stable_id));
