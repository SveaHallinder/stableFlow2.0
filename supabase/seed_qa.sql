-- StableFlow staging QA seed.
-- Run this only after creating confirmed auth users in Supabase Auth.
--
-- Required confirmed auth users:
-- - qa_admin_email: owner/admin access
-- - qa_staff_email: staff edit access
-- - qa_owner_email: horse owner view access
-- - qa_rider_email: medryttare/responsible rider view access
-- - qa_guest_email: guest view access
--
-- Replace the email constants below with users that exist in auth.users.
-- This file does not create passwords and does not bypass email confirmation.

do $$
declare
  qa_admin_email constant text := 'stableflow-admin@example.test';
  qa_staff_email constant text := 'stableflow-staff@example.test';
  qa_owner_email constant text := 'stableflow-owner@example.test';
  qa_rider_email constant text := 'stableflow-rider@example.test';
  qa_guest_email constant text := 'stableflow-guest@example.test';

  v_admin_id uuid;
  v_staff_id uuid;
  v_owner_id uuid;
  v_rider_id uuid;
  v_guest_id uuid;
  v_stable_id uuid;
  v_horse_id uuid;
begin
  select id into v_admin_id from auth.users where lower(email) = lower(qa_admin_email);
  select id into v_staff_id from auth.users where lower(email) = lower(qa_staff_email);
  select id into v_owner_id from auth.users where lower(email) = lower(qa_owner_email);
  select id into v_rider_id from auth.users where lower(email) = lower(qa_rider_email);
  select id into v_guest_id from auth.users where lower(email) = lower(qa_guest_email);

  if v_admin_id is null
    or v_staff_id is null
    or v_owner_id is null
    or v_rider_id is null
    or v_guest_id is null
  then
    raise exception 'Create all confirmed auth users before running supabase/seed_qa.sql.';
  end if;

  insert into public.profiles (id, username, full_name)
  values
    (v_admin_id, 'qa-admin', 'QA Admin'),
    (v_staff_id, 'qa-staff', 'QA Staff'),
    (v_owner_id, 'qa-owner', 'QA Horse Owner'),
    (v_rider_id, 'qa-rider', 'QA Medryttare'),
    (v_guest_id, 'qa-guest', 'QA Guest')
  on conflict (id) do update
    set username = excluded.username,
        full_name = excluded.full_name;

  select id into v_stable_id
  from public.stables
  where name = 'StableFlow QA Stable'
  order by created_at asc
  limit 1;

  if v_stable_id is null then
    insert into public.stables (name, location, created_by, settings, ride_types)
    values (
      'StableFlow QA Stable',
      'Stockholm',
      v_admin_id,
      '{"dayLogic":"box","eventVisibility":{"feeding":true,"cleaning":true,"riderAway":true,"farrierAway":true,"vetAway":true,"evening":true}}'::jsonb,
      '[{"id":"qa-dressage","code":"dressage","label":"Dressyr"},{"id":"qa-trail","code":"trail","label":"Uteritt"}]'::jsonb
    )
    returning id into v_stable_id;
  end if;

  select id into v_horse_id
  from public.horses
  where stable_id = v_stable_id and name = 'StableFlow QA Horse'
  order by created_at asc
  limit 1;

  if v_horse_id is null then
    insert into public.horses (
      stable_id,
      owner_user_id,
      name,
      gender,
      age,
      box_number,
      can_sleep_inside,
      note
    )
    values (
      v_stable_id,
      v_owner_id,
      'StableFlow QA Horse',
      'unknown',
      10,
      'QA-1',
      true,
      'QA seed horse'
    )
    returning id into v_horse_id;
  else
    update public.horses
    set owner_user_id = v_owner_id
    where id = v_horse_id;
  end if;

  insert into public.stable_members (
    stable_id,
    user_id,
    role,
    access,
    rider_role,
    horse_ids
  )
  values
    (v_stable_id, v_admin_id, 'admin', 'owner', null, array[v_horse_id]),
    (v_stable_id, v_staff_id, 'staff', 'edit', null, array[v_horse_id]),
    (v_stable_id, v_owner_id, 'rider', 'view', 'owner', array[v_horse_id]),
    (v_stable_id, v_rider_id, 'rider', 'view', 'medryttare', array[v_horse_id]),
    (v_stable_id, v_guest_id, 'guest', 'view', null, array[]::uuid[])
  on conflict (stable_id, user_id) do update
    set role = excluded.role,
        access = excluded.access,
        rider_role = excluded.rider_role,
        horse_ids = excluded.horse_ids;

  insert into public.default_passes (user_id, stable_id, weekday, slot)
  values
    (v_staff_id, v_stable_id, extract(isodow from current_date)::integer - 1, 'Morning'),
    (v_rider_id, v_stable_id, extract(isodow from current_date)::integer - 1, 'Evening')
  on conflict (user_id, stable_id, weekday, slot) do nothing;

  -- Mark onboarding complete and ensure arena/onboarding flags exist so admin
  -- lands on Idag and not on the onboarding setup screen.
  update public.stables
  set settings = coalesce(settings, '{}'::jsonb)
    || jsonb_build_object(
      'arena', jsonb_build_object(
        'hasArena', true,
        'hasRoundPen', true,
        'hasSchedule', true,
        'bookingMode', 'open',
        'rules', 'QA seed: standard ridhusregler.'
      ),
      'onboarding', jsonb_build_object(
        'resourcesComplete', true,
        'membersComplete', true
      )
    )
  where id = v_stable_id;

  -- Ensure at least one assignment exists today so onboardingHasAssignment is true.
  if not exists (
    select 1 from public.assignments
    where stable_id = v_stable_id and date = current_date
  ) then
    insert into public.assignments (
      stable_id, date, slot, label, icon, time, status
    )
    values
      (v_stable_id, current_date, 'Morning', 'QA Morgonfodring', 'sun', '07:00', 'open'),
      (v_stable_id, current_date, 'Evening', 'QA Kvällsfodring', 'moon', '19:00', 'open');
  end if;

  -- Seed a paddock so paddocks-listan har något att visa direkt
  if not exists (
    select 1 from public.paddocks where stable_id = v_stable_id
  ) then
    insert into public.paddocks (stable_id, name, horse_names, season)
    values (v_stable_id, 'QA Vinterhagen', array['StableFlow QA Horse'], 'winter');
  end if;
end;
$$;
