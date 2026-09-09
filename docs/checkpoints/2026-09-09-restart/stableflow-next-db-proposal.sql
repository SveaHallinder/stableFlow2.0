-- REVIEW PROPOSAL ONLY. Not applied. No new extension, table, or column.
-- Assumes trusted migration owner postgres owns the SECURITY DEFINER functions.
-- Read companion /tmp/stableflow-next-db-proposal.md before scheduling deployment.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Keep preflight and trigger installation atomic with respect to ordinary writers.
lock table public.stables, public.stable_members, public.arena_bookings in share row exclusive mode;

do $preflight$
declare
  ownerless_count bigint;
begin
  if exists (
    select 1 from public.arena_bookings b
    where b.stable_id is null
      or b.start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
      or b.end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
  ) then
    raise exception '[arena overlap] Befintliga bokningar har ogiltigt stall eller klockslag. Granska innan migrering.';
  end if;
  if exists (select 1 from public.arena_bookings b where b.start_time::time >= b.end_time::time) then
    raise exception '[arena overlap] Befintliga bokningar har ogiltigt tidsintervall. Granska innan migrering.';
  end if;
  if exists (
    select 1 from public.arena_bookings a join public.arena_bookings b
      on a.stable_id = b.stable_id and a.date = b.date and a.id < b.id
    where a.start_time::time < b.end_time::time and b.start_time::time < a.end_time::time
  ) then
    raise exception '[arena overlap] Befintliga bokningar överlappar. Granska innan migrering.';
  end if;
  select count(*) into ownerless_count from public.stables s where not exists (
    select 1 from public.stable_members m
    where m.stable_id = s.id and m.role = 'admin' and m.access = 'owner'
  );
  if ownerless_count > 0 then
    raise notice '[last owner] % befintliga stall saknar ägare. Historiska rader lämnas orörda; triggern skyddar endast mot förlust av etablerad ägare.', ownerless_count;
  end if;
end
$preflight$;

-- Alter only the incorrect planner promise; preserve the installed function body.
alter function public.generate_join_code() volatile;

create or replace function public.guard_arena_booking_overlap()
returns trigger language plpgsql volatile security definer
set search_path = pg_catalog
set row_security = off
as $function$
declare
  parent_id uuid;
  previous_stable_id uuid;
  start_at time;
  end_at time;
begin
  if new.stable_id is null
    or new.start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
    or new.end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
  then
    raise exception using errcode = '23514', message = '[arena overlap] Ange stall och giltiga klockslag.';
  end if;
  start_at := new.start_time::time;
  end_at := new.end_time::time;
  if start_at >= end_at then
    raise exception using errcode = '23514', message = '[arena overlap] Sluttiden måste vara efter starttiden samma dag.';
  end if;
  if tg_op = 'UPDATE' then previous_stable_id := old.stable_id; end if;

  -- Real parent-row UPDATE is intentional, not just an advisory/row lock.
  -- It serializes same-stable writers and forces stale RR/Serializable snapshots
  -- to fail with 40001 instead of checking against an obsolete booking snapshot.
  for parent_id in
    select distinct v from unnest(array[previous_stable_id, new.stable_id]) as ids(v)
    where v is not null order by v
  loop
    update public.stables set created_at = created_at where id = parent_id;
    if not found then
      raise exception using errcode = '23503', message = '[arena overlap] Stallet finns inte längre.';
    end if;
  end loop;

  -- Separate statement in a VOLATILE function: fresh READ COMMITTED snapshot
  -- after the preceding parent update acquired its lock and any writer committed.
  if exists (
    select 1 from public.arena_bookings b
    where b.stable_id = new.stable_id and b.date = new.date
      and b.id <> new.id
      and b.start_time::time < end_at and start_at < b.end_time::time
  ) then
    raise exception using errcode = '23P01', message = '[arena overlap] Tiden är redan bokad. Välj en annan tid.';
  end if;
  return new;
end
$function$;
alter function public.guard_arena_booking_overlap() owner to postgres;
revoke all on function public.guard_arena_booking_overlap() from public, anon, authenticated, service_role;
drop trigger if exists guard_arena_booking_overlap on public.arena_bookings;
create trigger guard_arena_booking_overlap
before insert or update on public.arena_bookings
for each row execute function public.guard_arena_booking_overlap();

create or replace function public.guard_last_stable_owner()
returns trigger language plpgsql volatile security definer
set search_path = pg_catalog
set row_security = off
as $function$
begin
  -- Precisely the existing client/RLS owner definition; NULL access is not owner.
  if old.role is distinct from 'admin' or old.access is distinct from 'owner' or old.stable_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.stable_id is not distinct from old.stable_id
      and new.role = 'admin' and new.access = 'owner' then return new; end if;
  end if;

  -- Serialize removal/demotion of owners on the same parent and invalidate
  -- pre-existing RR/Serializable snapshots. A lock without a write is insufficient.
  update public.stables set created_at = created_at where id = old.stable_id;
  if not found then
    if exists (select 1 from public.stables where id = old.stable_id) then
      raise exception using errcode = '55000', message = '[last owner] Stallåset kunde inte tas. Försök igen.';
    end if;
    -- Parent DELETE already removed the stable; allow its ON DELETE CASCADE.
    -- Deleting an auth/profile row while its stable remains is NOT exempt.
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if not exists (
    select 1 from public.stable_members m
    where m.stable_id = old.stable_id and m.id <> old.id
      and m.role = 'admin' and m.access = 'owner'
  ) then
    raise exception using errcode = '23514', message = '[last owner] Stallet måste ha minst en ägare. Utse en ny ägare först.';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end
$function$;
alter function public.guard_last_stable_owner() owner to postgres;
revoke all on function public.guard_last_stable_owner() from public, anon, authenticated, service_role;
drop trigger if exists guard_last_stable_owner on public.stable_members;
create trigger guard_last_stable_owner
before update or delete on public.stable_members
for each row execute function public.guard_last_stable_owner();

commit;
