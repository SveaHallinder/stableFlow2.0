-- Security fix: the horse-owner branch of the feed_plans and planned_rides RLS
-- policies proved the caller owns feed_plans.horse_id / planned_rides.horse_id
-- but did NOT require that horse to belong to the row's stable_id. A horse owner
-- who knows another stable's UUID could therefore write feed-plan / planned-ride
-- rows scoped to that other stable using a horse from their own stable.
--
-- Add `h.stable_id = <table>.stable_id` to every owner branch so an owner can only
-- write rows for stables their horse actually belongs to. Staff/admin branches
-- (can_edit_stable / can_manage_ride_logs) are unchanged.

-- ── feed_plans ──────────────────────────────────────────────────────────────
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
          and h.stable_id = feed_plans.stable_id
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
          and h.stable_id = feed_plans.stable_id
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
          and h.stable_id = feed_plans.stable_id
      )
    )
  );

-- ── planned_rides ───────────────────────────────────────────────────────────
drop policy if exists "planned_rides_insert" on public.planned_rides;
create policy "planned_rides_insert" on public.planned_rides
  for insert with check (
    public.can_manage_ride_logs(stable_id)
    or exists (
      select 1
      from public.horses h
      where h.id = planned_rides.horse_id
        and h.owner_user_id = (select auth.uid())
        and h.stable_id = planned_rides.stable_id
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
        and h.stable_id = planned_rides.stable_id
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
        and h.stable_id = planned_rides.stable_id
    )
  );
