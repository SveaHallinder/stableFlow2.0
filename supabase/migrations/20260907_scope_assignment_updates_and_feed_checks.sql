-- Approved for application on 2026-09-08. Assignment and feed-check access.
-- Client prerequisite: restrict automatic default-pass assignment to editors and
-- preserve/filter default_passes.stable_id before enabling it for multiple stables.
-- No table/column changes. Existing assignment INSERT/DELETE rights stay intact.
begin;

-- Match the client: admin/staff may check any horse in their stable; a member
-- who owns a horse may check that horse. The horse must belong to the row's stable.
create or replace function public.can_check_horse_feed(p_stable_id uuid, p_horse_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.is_stable_member(p_stable_id)
    and exists (
      select 1 from public.horses h
      where h.id = p_horse_id
        and h.stable_id = p_stable_id
        and (
          public.can_update_horse_status(p_stable_id)
          or h.owner_user_id = (select auth.uid())
        )
    );
$$;

drop policy if exists "feed_checks_insert" on public.feed_checks;
create policy "feed_checks_insert" on public.feed_checks
  for insert with check (public.can_check_horse_feed(stable_id, horse_id));

drop policy if exists "feed_checks_update" on public.feed_checks;
create policy "feed_checks_update" on public.feed_checks
  for update using (public.can_check_horse_feed(stable_id, horse_id))
  with check (public.can_check_horse_feed(stable_id, horse_id));

-- Delete remains admin/staff-only: the client exposes no feed-check delete action.
-- RLS selects eligible rows. A trigger below validates OLD -> NEW and the exact
-- columns allowed for users with claim rights but without edit/owner access.
drop policy if exists "assignments_update" on public.assignments;
create policy "assignments_update" on public.assignments
  for update using (
    public.can_edit_stable(stable_id)
    or (
      public.can_claim_assignments(stable_id)
      and (status = 'open' or assignee_id = (select auth.uid()))
    )
  )
  with check (
    public.can_edit_stable(stable_id)
    or (
      public.can_claim_assignments(stable_id)
      and (
        (status = 'open' and assignee_id is null)
        or assignee_id = (select auth.uid())
      )
    )
  );

create or replace function public.guard_assignment_member_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  previous_declines uuid[] := coalesce(old.declined_by_user_ids, '{}'::uuid[]);
  expected_declines uuid[];
begin
  -- SQL dashboard/seed maintenance and service-role jobs retain their trusted access.
  -- This function is SECURITY INVOKER: authenticated callers keep their own role.
  if current_user in ('postgres', 'supabase_admin') or auth.role() = 'service_role' then
    return new;
  end if;

  if caller_id is null then
    raise exception '[assignment update] Inloggning krävs.' using errcode = '42501';
  end if;

  -- A profile UUID alone does not establish membership in this stable.
  if new.assignee_id is not null and not exists (
    select 1 from public.stable_members m
    where m.stable_id = new.stable_id and m.user_id = new.assignee_id
  ) then
    raise exception '[assignment update] Ansvarig måste tillhöra passets stall.' using errcode = '42501';
  end if;

  if public.can_edit_stable(old.stable_id) and public.can_edit_stable(new.stable_id) then
    return new;
  end if;

  if not public.can_claim_assignments(old.stable_id)
    or (to_jsonb(new) - array['status', 'assignee_id', 'assigned_via',
                            'declined_by_user_ids', 'completed_at', 'updated_at'])
       is distinct from
       (to_jsonb(old) - array['status', 'assignee_id', 'assigned_via',
                            'declined_by_user_ids', 'completed_at', 'updated_at']) then
    raise exception '[assignment update] Du får endast ta ett öppet pass eller hantera ditt eget pass.' using errcode = '42501';
  end if;

  -- Claim: only an open, unassigned row; only assign the caller; remove only
  -- the caller from the decline list. Conditional client UPDATE still handles races.
  if old.status = 'open' and old.assignee_id is null
    and new.status = 'assigned' and new.assignee_id = caller_id
    and new.assigned_via = 'manual'
    and new.completed_at is not distinct from old.completed_at
    and coalesce(new.declined_by_user_ids, '{}'::uuid[]) = array_remove(previous_declines, caller_id) then
    return new;
  end if;

  if old.status = 'assigned' and old.assignee_id = caller_id then
    -- Complete own pass without changing ownership, defaults, or decline history.
    if new.status = 'completed' and new.completed_at is not null
      and new.assignee_id is not distinct from old.assignee_id
      and new.assigned_via is not distinct from old.assigned_via
      and new.declined_by_user_ids is not distinct from old.declined_by_user_ids then
      return new;
    end if;

    expected_declines := case when caller_id = any(previous_declines)
      then previous_declines else array_append(previous_declines, caller_id) end;
    -- Release own pass and record only the caller's decline.
    if new.status = 'open' and new.assignee_id is null and new.assigned_via is null
      and new.completed_at is not distinct from old.completed_at
      and coalesce(new.declined_by_user_ids, '{}'::uuid[]) = expected_declines then
      return new;
    end if;
  end if;

  raise exception '[assignment update] Passet har ändrats eller står inte på dig. Uppdatera schemat.' using errcode = '42501';
end;
$$;

drop trigger if exists guard_assignment_member_update on public.assignments;
create trigger guard_assignment_member_update
  before update on public.assignments
  for each row execute function public.guard_assignment_member_update();

commit;
