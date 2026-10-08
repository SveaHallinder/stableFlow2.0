-- Bootstrap only: existing name-array data needs the explicitly mapped migration.
begin;
do $bootstrap$
declare invalid_scope bigint := 0;
begin
  if to_regclass('public.horses') is not null then
    lock table public.horses in share mode;
    select count(*) into invalid_scope from public.horses where stable_id is null;
  end if;
  if to_regclass('public.paddocks') is not null then
    lock table public.paddocks in share mode;
    invalid_scope := invalid_scope + (select count(*) from public.paddocks where stable_id is null);
    if exists(select 1 from public.paddocks where cardinality(horse_names) > 0) then
      raise exception using errcode = '23514', message = '[paddock migration] Befintliga namnposter kräver den uttryckligen mappade migrationen.';
    end if;
  end if;
  if invalid_scope > 0 then
    raise exception using errcode = '23514', message = '[paddock migration] Befintliga rader saknar stable_id; gissa inte stall.';
  end if;
end
$bootstrap$;

-- Core schema for StableFlow (Supabase)
-- Apply in Supabase SQL editor.

create extension if not exists "pgcrypto";

-- Helpers
create or replace function public.generate_join_code()
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
$$;

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  avatar_url text,
  created_at timestamptz default now()
);
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists location text;
alter table public.profiles add column if not exists responsibilities text[] default '{}'::text[];
alter table public.profiles add column if not exists onboarding_dismissed boolean default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'username', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Farms
create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  location text,
  has_indoor_arena boolean default false,
  arena_note text
);
alter table public.farms add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.farms alter column created_by set default auth.uid();
alter table public.farms enable row level security;

-- Stables
create table if not exists public.stables (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  description text,
  location text,
  farm_id uuid references public.farms(id) on delete set null,
  settings jsonb default '{}'::jsonb,
  ride_types jsonb default '[]'::jsonb,
  join_code text unique default public.generate_join_code(),
  created_by uuid references public.profiles(id) on delete set null
);
alter table public.stables enable row level security;

-- Stable members
create table if not exists public.stable_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  stable_id uuid references public.stables(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null default 'rider',
  custom_role text,
  access text default 'view',
  rider_role text,
  horse_ids uuid[] default '{}'::uuid[],
  unique (stable_id, user_id)
);
alter table public.stable_members enable row level security;

-- Default passes
create table if not exists public.default_passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  stable_id uuid references public.stables(id) on delete cascade,
  weekday integer not null,
  slot text not null,
  unique (user_id, stable_id, weekday, slot)
);
alter table public.default_passes enable row level security;

-- Away notices
create table if not exists public.away_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  stable_id uuid references public.stables(id) on delete cascade,
  start date not null,
  "end" date not null,
  note text,
  created_at timestamptz default now()
);
alter table public.away_notices enable row level security;

-- Invites
create table if not exists public.stable_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  stable_id uuid references public.stables(id) on delete cascade,
  email text not null,
  role text not null default 'rider',
  custom_role text,
  access text default 'view',
  rider_role text,
  horse_ids uuid[] default '{}'::uuid[],
  code text,
  expires_at timestamptz,
  accepted_at timestamptz
);
alter table public.stable_invites add column if not exists custom_role text;
create unique index if not exists stable_invites_code_unique
  on public.stable_invites(code)
  where code is not null;
alter table public.stable_invites enable row level security;

-- Access helpers
create or replace function public.is_stable_member(p_stable_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.stable_members m
    where m.stable_id = p_stable_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_stable(p_stable_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.stable_members m
    where m.stable_id = p_stable_id
      and m.user_id = auth.uid()
      and coalesce(m.access, 'view') in ('edit', 'owner')
  );
$$;

create or replace function public.can_claim_assignments(p_stable_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.stable_members m
    where m.stable_id = p_stable_id
      and m.user_id = auth.uid()
      and m.role in ('admin', 'staff', 'rider')
  );
$$;

create or replace function public.can_manage_day_events(p_stable_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.stable_members m
    where m.stable_id = p_stable_id
      and m.user_id = auth.uid()
      and m.role in ('admin', 'staff', 'rider', 'farrier', 'vet', 'trainer', 'therapist')
  );
$$;

create or replace function public.can_manage_ride_logs(p_stable_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.stable_members m
    where m.stable_id = p_stable_id
      and m.user_id = auth.uid()
      and m.role in ('admin', 'staff', 'rider')
  );
$$;

create or replace function public.can_manage_arena_bookings(p_stable_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.stable_members m
    where m.stable_id = p_stable_id
      and m.user_id = auth.uid()
      and m.role in ('admin', 'staff')
  );
$$;

create or replace function public.can_manage_arena_status(p_stable_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.stable_members m
    where m.stable_id = p_stable_id
      and m.user_id = auth.uid()
      and m.role in ('admin', 'staff')
  );
$$;

create or replace function public.can_update_horse_status(p_stable_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.stable_members m
    where m.stable_id = p_stable_id
      and m.user_id = auth.uid()
      and m.role in ('admin', 'staff')
  );
$$;

create or replace function public.can_manage_groups(p_stable_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.stable_members m
    where m.stable_id = p_stable_id
      and m.user_id = auth.uid()
      and m.role in ('admin', 'staff')
  );
$$;

create or replace function public.is_stable_owner(p_stable_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.stable_members m
    where m.stable_id = p_stable_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
      and coalesce(m.access, 'view') = 'owner'
  );
$$;

create or replace function public.is_stable_creator(p_stable_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.stables s
    where s.id = p_stable_id
      and s.created_by = auth.uid()
  );
$$;

create or replace function public.shares_stable_with(p_other uuid)
returns boolean
language sql
stable
security definer set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.stable_members a
    join public.stable_members b on a.stable_id = b.stable_id
    where a.user_id = auth.uid()
      and b.user_id = p_other
  );
$$;

create or replace function public.storage_stable_id(path text)
returns uuid
language sql
stable
set search_path = public
as $$
  select case
    when path is null then null
    when split_part(path, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(path, '/', 1)::uuid
    else null
  end;
$$;

-- Invite accept functions
create or replace function public.accept_pending_invites()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text;
  v_count integer := 0;
begin
  v_email := auth.jwt()->>'email';
  if v_email is null then
    return 0;
  end if;

  insert into public.stable_members (stable_id, user_id, role, custom_role, access, rider_role, horse_ids)
  select i.stable_id, auth.uid(), i.role, i.custom_role, i.access, i.rider_role, i.horse_ids
  from public.stable_invites i
  where lower(i.email) = lower(v_email)
    and i.accepted_at is null
    and (i.expires_at is null or i.expires_at > now())
  on conflict (stable_id, user_id) do nothing;

  get diagnostics v_count = row_count;

  update public.stable_invites
    set accepted_at = now()
  where lower(email) = lower(v_email)
    and accepted_at is null
    and (expires_at is null or expires_at > now());

  return v_count;
end;
$$;

create or replace function public.validate_invite(p_email text, p_code text default null)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text;
  v_has_email boolean := false;
  v_has_code boolean := false;
  v_code text;
begin
  v_email := lower(trim(p_email));
  v_code := upper(trim(p_code));

  if v_email is not null and length(v_email) > 0 then
    select exists(
      select 1
      from public.stable_invites i
      where lower(i.email) = v_email
        and i.accepted_at is null
        and (i.expires_at is null or i.expires_at > now())
    ) into v_has_email;
  end if;

  if v_code is not null and length(v_code) > 0 then
    select exists(
      select 1
      from public.stable_invites i
      where upper(i.code) = v_code
        and i.accepted_at is null
        and (i.expires_at is null or i.expires_at > now())
    ) into v_has_code;

    if not v_has_code then
      select exists(
        select 1
        from public.stables s
        where s.join_code = v_code
      ) into v_has_code;
    end if;
  end if;

  if v_code is not null and length(v_code) > 0 then
    return v_has_code;
  end if;

  return v_has_email;
end;
$$;

grant execute on function public.validate_invite(text, text) to anon, authenticated;

create or replace function public.accept_join_code(p_code text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_stable_id uuid;
begin
  select id into v_stable_id
  from public.stables
  where join_code = upper(trim(p_code));

  if v_stable_id is null then
    raise exception 'Invalid join code';
  end if;

  insert into public.stable_members (stable_id, user_id, role, access, rider_role)
  values (v_stable_id, auth.uid(), 'rider', 'view', 'medryttare')
  on conflict (stable_id, user_id) do nothing;

  return v_stable_id;
end;
$$;

-- Horses
create table if not exists public.horses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  stable_id uuid references public.stables(id) on delete cascade,
  name text not null,
  owner_user_id uuid references public.profiles(id) on delete set null,
  box_number text,
  can_sleep_inside boolean,
  gender text,
  age integer,
  note text,
  image_url text
);
alter table public.horses enable row level security;

-- Paddocks
create table if not exists public.paddocks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  stable_id uuid references public.stables(id) on delete cascade,
  name text not null,
  horse_names text[] default '{}'::text[],
  season text default 'yearRound',
  image_url text
);
alter table public.paddocks enable row level security;

-- Horse day status
create table if not exists public.horse_day_statuses (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade,
  horse_id uuid references public.horses(id) on delete cascade,
  date date not null,
  day_status text,
  night_status text,
  checked boolean,
  water boolean,
  hay boolean,
  unique (stable_id, horse_id, date)
);
alter table public.horse_day_statuses enable row level security;

-- Feed plans (stable defaults + per-horse overrides)
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

-- Feed checks (per horse + day + slot)
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

-- Assignments
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade,
  date date not null,
  slot text not null,
  label text not null,
  icon text not null,
  time text not null,
  note text,
  status text not null,
  assignee_id uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  assigned_via text,
  declined_by_user_ids uuid[] default '{}'::uuid[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.assignments enable row level security;

create table if not exists public.assignment_history (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete cascade,
  label text not null,
  action text not null,
  created_at timestamptz default now()
);
alter table public.assignment_history enable row level security;

-- Alerts
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade,
  message text not null,
  type text not null,
  created_at timestamptz default now()
);
alter table public.alerts enable row level security;

-- Stable alerts (important/urgent)
create table if not exists public.stable_alerts (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade not null,
  title text not null,
  body text,
  severity text not null default 'info',
  horse_id uuid references public.horses(id) on delete set null,
  paddock_id uuid references public.paddocks(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete set null,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  resolved_at timestamptz,
  constraint stable_alerts_severity_check check (severity in ('info', 'important', 'urgent'))
);
alter table public.stable_alerts enable row level security;

-- Day events
create table if not exists public.day_events (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade,
  date date not null,
  label text not null,
  tone text not null,
  created_at timestamptz default now()
);
alter table public.day_events enable row level security;

-- Arena bookings/status
create table if not exists public.arena_bookings (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade,
  date date not null,
  start_time text not null,
  end_time text not null,
  purpose text not null,
  note text,
  booked_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);
alter table public.arena_bookings enable row level security;

-- Concurrency guards mirrored from 20261001_guard_arena_and_last_owner.sql.
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

create table if not exists public.arena_statuses (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade,
  date date not null,
  label text not null,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);
alter table public.arena_statuses enable row level security;

-- Ride logs
create table if not exists public.ride_logs (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade,
  horse_id uuid references public.horses(id) on delete cascade,
  date date not null,
  ride_type_id text,
  length text,
  note text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);
alter table public.ride_logs enable row level security;

-- Planned rides
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

-- External contacts (farrier/vet/etc)
create table if not exists public.external_contacts (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade not null,
  name text not null,
  type text not null,
  phone text,
  email text,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.external_contacts enable row level security;

-- Care events (vård/hovslagare/vet etc)
create table if not exists public.care_events (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade not null,
  horse_ids uuid[] not null default '{}'::uuid[],
  type text not null,
  title text not null,
  date date not null,
  time text,
  contact_id uuid references public.external_contacts(id) on delete set null,
  responsible_user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'planned',
  note text,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.care_events enable row level security;

-- Riding schedule + competitions
create table if not exists public.riding_days (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade,
  label text not null,
  upcoming_rides text,
  is_today boolean default false,
  created_at timestamptz default now()
);
alter table public.riding_days enable row level security;

create table if not exists public.competition_events (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade,
  start timestamptz not null,
  "end" timestamptz not null,
  title text not null,
  status text not null,
  created_at timestamptz default now()
);
alter table public.competition_events enable row level security;

-- Groups (custom only)
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade,
  farm_id uuid references public.farms(id) on delete set null,
  horse_id uuid references public.horses(id) on delete set null,
  name text not null,
  type text not null,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);
alter table public.groups enable row level security;

-- Posts
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  caption text,
  image_url text,
  created_at timestamptz default now()
);
alter table public.posts add column if not exists stable_id uuid references public.stables(id) on delete set null;
alter table public.posts add column if not exists group_ids text[] default '{}'::text[];
alter table public.posts alter column group_ids type text[] using group_ids::text[];
alter table public.posts alter column group_ids set default '{}'::text[];
alter table public.posts add column if not exists content text;
alter table public.posts enable row level security;

-- Likes/comments
create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  created_at timestamptz default now()
);
alter table public.likes enable row level security;
create unique index if not exists likes_unique on public.likes(user_id, post_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  post_id uuid references public.posts(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);
alter table public.comments enable row level security;

-- Conversations/messages
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete set null,
  title text,
  is_group boolean default false,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);
create unique index if not exists conversations_group_unique
  on public.conversations(stable_id)
  where is_group and stable_id is not null;
alter table public.conversations enable row level security;

create table if not exists public.conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  unique (conversation_id, user_id)
);
alter table public.conversation_members enable row level security;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  text text not null,
  status text,
  created_at timestamptz default now()
);
alter table public.messages enable row level security;

-- RLS policies
alter table public.profiles enable row level security;

drop policy if exists "profiles_select" on public.profiles;
-- Legacy ad-hoc policy that leaked co-members' full profile row (incl. phone) to any
-- stablemate; only ever existed on remote, never in source. Drop defensively.
drop policy if exists "profiles_select_self_or_shared_stable" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_insert_self" on public.profiles;
-- Fas 0B: self-only. Co-member name/avatar served via get_member_directory() (PII-safe).
create policy "profiles_select" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "profiles_update_self" on public.profiles
  for update using ((select auth.uid()) = id);
create policy "profiles_insert_self" on public.profiles
  for insert with check ((select auth.uid()) = id);

-- PII-safe co-member directory. Definer bypasses profiles-RLS but only exposes
-- non-PII columns; phone is returned only for self or admins of a shared stable.
create or replace function public.get_member_directory()
returns table (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  location text,
  responsibilities text[],
  onboarding_dismissed boolean,
  phone text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    p.location,
    p.responsibilities,
    p.onboarding_dismissed,
    case
      when p.id = (select auth.uid()) then p.phone
      when exists (
        select 1
        from public.stable_members m_self
        join public.stable_members m_other
          on m_self.stable_id = m_other.stable_id
        where m_self.user_id = (select auth.uid())
          and m_other.user_id = p.id
          and m_self.role = 'admin'
      ) then p.phone
      else null
    end as phone
  from public.profiles p
  where p.id = (select auth.uid())
     or exists (
       select 1
       from public.stable_members m_self
       join public.stable_members m_other
         on m_self.stable_id = m_other.stable_id
       where m_self.user_id = (select auth.uid())
         and m_other.user_id = p.id
     );
$$;
revoke all on function public.get_member_directory() from public;
grant execute on function public.get_member_directory() to authenticated;

drop policy if exists "farms_select" on public.farms;
create policy "farms_select" on public.farms
  for select using (created_by = auth.uid());
drop policy if exists "farms_insert" on public.farms;
create policy "farms_insert" on public.farms for insert with check (created_by = auth.uid());
drop policy if exists "farms_update" on public.farms;
create policy "farms_update" on public.farms for update using (created_by = auth.uid());
drop policy if exists "farms_delete" on public.farms;
create policy "farms_delete" on public.farms for delete using (created_by = auth.uid());

drop policy if exists "stables_select" on public.stables;
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
drop policy if exists "stables_insert" on public.stables;
create policy "stables_insert" on public.stables for insert with check (created_by = auth.uid());
drop policy if exists "stables_update" on public.stables;
-- Fas 0A #1: owner-only (behåll creator-fallback mot lockout). join_code ligger på
-- samma rad, så edit-access får inte UPDATE:a stallet.
create policy "stables_update" on public.stables
  for update
  using (created_by = auth.uid() or public.is_stable_owner(id))
  with check (created_by = auth.uid() or public.is_stable_owner(id));
drop policy if exists "stables_delete" on public.stables;
create policy "stables_delete" on public.stables for delete using (created_by = auth.uid());

drop policy if exists "stable_members_select" on public.stable_members;
create policy "stable_members_select" on public.stable_members for select using (public.is_stable_member(stable_id));
drop policy if exists "stable_members_insert" on public.stable_members;
drop policy if exists "stable_members_insert_owner_bootstrap" on public.stable_members;
drop policy if exists "stable_members_insert_bootstrap_creator" on public.stable_members;
create policy "stable_members_insert" on public.stable_members
  for insert with check (
    public.is_stable_owner(stable_id)
    or (
      (select auth.uid()) = user_id
      and public.is_stable_creator(stable_id)
    )
  );
drop policy if exists "stable_members_update" on public.stable_members;
drop policy if exists "stable_members_update_owner_bootstrap" on public.stable_members;
drop policy if exists "stable_members_update_bootstrap_creator" on public.stable_members;
create policy "stable_members_update" on public.stable_members for update using (public.is_stable_owner(stable_id));
drop policy if exists "stable_members_delete" on public.stable_members;
create policy "stable_members_delete" on public.stable_members for delete using (public.is_stable_owner(stable_id));

drop policy if exists "default_passes_select" on public.default_passes;
create policy "default_passes_select" on public.default_passes
  for select using (public.is_stable_member(stable_id));
drop policy if exists "default_passes_insert" on public.default_passes;
create policy "default_passes_insert" on public.default_passes
  for insert with check ((select auth.uid()) = user_id or public.is_stable_owner(stable_id));
drop policy if exists "default_passes_delete" on public.default_passes;
create policy "default_passes_delete" on public.default_passes
  for delete using ((select auth.uid()) = user_id or public.is_stable_owner(stable_id));

drop policy if exists "away_notices_select" on public.away_notices;
create policy "away_notices_select" on public.away_notices
  for select using (public.is_stable_member(stable_id));
drop policy if exists "away_notices_insert" on public.away_notices;
create policy "away_notices_insert" on public.away_notices
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "away_notices_update" on public.away_notices;
create policy "away_notices_update" on public.away_notices
  for update using ((select auth.uid()) = user_id);
drop policy if exists "away_notices_delete" on public.away_notices;
create policy "away_notices_delete" on public.away_notices
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "stable_invites_select" on public.stable_invites;
create policy "stable_invites_select" on public.stable_invites
  for select using (
    public.is_stable_owner(stable_id)
    or lower(email) = lower((select auth.jwt())->>'email')
  );
drop policy if exists "stable_invites_insert" on public.stable_invites;
create policy "stable_invites_insert" on public.stable_invites for insert with check (public.is_stable_owner(stable_id));
drop policy if exists "stable_invites_update" on public.stable_invites;
create policy "stable_invites_update" on public.stable_invites for update using (public.is_stable_owner(stable_id));
drop policy if exists "stable_invites_delete" on public.stable_invites;
create policy "stable_invites_delete" on public.stable_invites for delete using (public.is_stable_owner(stable_id));

drop policy if exists "horses_select" on public.horses;
create policy "horses_select" on public.horses for select using (public.is_stable_member(stable_id));
drop policy if exists "horses_insert" on public.horses;
create policy "horses_insert" on public.horses for insert with check (public.can_edit_stable(stable_id));
drop policy if exists "horses_update" on public.horses;
create policy "horses_update" on public.horses for update using (public.can_edit_stable(stable_id));
drop policy if exists "horses_delete" on public.horses;
create policy "horses_delete" on public.horses for delete using (public.can_edit_stable(stable_id));

drop policy if exists "paddocks_select" on public.paddocks;
create policy "paddocks_select" on public.paddocks for select using (public.is_stable_member(stable_id));
drop policy if exists "paddocks_insert" on public.paddocks;
create policy "paddocks_insert" on public.paddocks for insert with check (public.can_edit_stable(stable_id));
drop policy if exists "paddocks_update" on public.paddocks;
create policy "paddocks_update" on public.paddocks for update using (public.can_edit_stable(stable_id));
drop policy if exists "paddocks_delete" on public.paddocks;
create policy "paddocks_delete" on public.paddocks for delete using (public.can_edit_stable(stable_id));

drop policy if exists "horse_day_statuses_select" on public.horse_day_statuses;
create policy "horse_day_statuses_select" on public.horse_day_statuses for select using (public.is_stable_member(stable_id));
drop policy if exists "horse_day_statuses_insert" on public.horse_day_statuses;
create policy "horse_day_statuses_insert" on public.horse_day_statuses for insert with check (public.can_update_horse_status(stable_id));
drop policy if exists "horse_day_statuses_update" on public.horse_day_statuses;
create policy "horse_day_statuses_update" on public.horse_day_statuses for update using (public.can_update_horse_status(stable_id));
drop policy if exists "horse_day_statuses_delete" on public.horse_day_statuses;
create policy "horse_day_statuses_delete" on public.horse_day_statuses for delete using (public.can_update_horse_status(stable_id));

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
drop policy if exists "feed_checks_delete" on public.feed_checks;
create policy "feed_checks_delete" on public.feed_checks
  for delete using (public.can_update_horse_status(stable_id));

drop policy if exists "assignments_select" on public.assignments;
create policy "assignments_select" on public.assignments for select using (public.is_stable_member(stable_id));
drop policy if exists "assignments_insert" on public.assignments;
create policy "assignments_insert" on public.assignments for insert with check (public.can_edit_stable(stable_id));
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


drop policy if exists "assignments_delete" on public.assignments;
create policy "assignments_delete" on public.assignments for delete using (public.can_edit_stable(stable_id));

drop policy if exists "assignment_history_select" on public.assignment_history;
create policy "assignment_history_select" on public.assignment_history for select using (public.is_stable_member(stable_id));
drop policy if exists "assignment_history_insert" on public.assignment_history;
create policy "assignment_history_insert" on public.assignment_history
  for insert with check (public.can_edit_stable(stable_id) or public.can_claim_assignments(stable_id));

drop policy if exists "alerts_select" on public.alerts;
create policy "alerts_select" on public.alerts for select using (public.is_stable_member(stable_id));
drop policy if exists "alerts_insert" on public.alerts;
create policy "alerts_insert" on public.alerts for insert with check (public.can_manage_day_events(stable_id));
drop policy if exists "alerts_delete" on public.alerts;
create policy "alerts_delete" on public.alerts for delete using (public.can_manage_day_events(stable_id));

drop policy if exists "stable_alerts_select" on public.stable_alerts;
create policy "stable_alerts_select" on public.stable_alerts
  for select using (public.is_stable_member(stable_id));
drop policy if exists "stable_alerts_insert" on public.stable_alerts;
create policy "stable_alerts_insert" on public.stable_alerts
  for insert with check (public.can_edit_stable(stable_id));
drop policy if exists "stable_alerts_update" on public.stable_alerts;
create policy "stable_alerts_update" on public.stable_alerts
  for update using (public.can_edit_stable(stable_id));
drop policy if exists "stable_alerts_delete" on public.stable_alerts;
create policy "stable_alerts_delete" on public.stable_alerts
  for delete using (public.can_edit_stable(stable_id));

drop policy if exists "day_events_select" on public.day_events;
create policy "day_events_select" on public.day_events for select using (public.is_stable_member(stable_id));
drop policy if exists "day_events_insert" on public.day_events;
create policy "day_events_insert" on public.day_events for insert with check (public.can_manage_day_events(stable_id));
drop policy if exists "day_events_delete" on public.day_events;
create policy "day_events_delete" on public.day_events for delete using (public.can_manage_day_events(stable_id));

drop policy if exists "arena_bookings_select" on public.arena_bookings;
create policy "arena_bookings_select" on public.arena_bookings for select using (public.is_stable_member(stable_id));
drop policy if exists "arena_bookings_insert" on public.arena_bookings;
create policy "arena_bookings_insert" on public.arena_bookings for insert with check (public.can_manage_arena_bookings(stable_id));
drop policy if exists "arena_bookings_update" on public.arena_bookings;
create policy "arena_bookings_update" on public.arena_bookings for update using (public.can_manage_arena_bookings(stable_id));
drop policy if exists "arena_bookings_delete" on public.arena_bookings;
create policy "arena_bookings_delete" on public.arena_bookings for delete using (public.can_manage_arena_bookings(stable_id));

drop policy if exists "arena_statuses_select" on public.arena_statuses;
create policy "arena_statuses_select" on public.arena_statuses for select using (public.is_stable_member(stable_id));
drop policy if exists "arena_statuses_insert" on public.arena_statuses;
create policy "arena_statuses_insert" on public.arena_statuses for insert with check (public.can_manage_arena_status(stable_id));
drop policy if exists "arena_statuses_delete" on public.arena_statuses;
create policy "arena_statuses_delete" on public.arena_statuses for delete using (public.can_manage_arena_status(stable_id));

drop policy if exists "ride_logs_select" on public.ride_logs;
create policy "ride_logs_select" on public.ride_logs for select using (public.is_stable_member(stable_id));
drop policy if exists "ride_logs_insert" on public.ride_logs;
create policy "ride_logs_insert" on public.ride_logs for insert with check (public.can_manage_ride_logs(stable_id));
drop policy if exists "ride_logs_delete" on public.ride_logs;
create policy "ride_logs_delete" on public.ride_logs for delete using (public.can_manage_ride_logs(stable_id));

drop policy if exists "planned_rides_select" on public.planned_rides;
create policy "planned_rides_select" on public.planned_rides
  for select using (public.is_stable_member(stable_id));
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

drop policy if exists "external_contacts_select" on public.external_contacts;
create policy "external_contacts_select" on public.external_contacts
  for select using (public.is_stable_member(stable_id));
drop policy if exists "external_contacts_insert" on public.external_contacts;
create policy "external_contacts_insert" on public.external_contacts
  for insert with check (public.can_edit_stable(stable_id));
drop policy if exists "external_contacts_update" on public.external_contacts;
create policy "external_contacts_update" on public.external_contacts
  for update using (public.can_edit_stable(stable_id));
drop policy if exists "external_contacts_delete" on public.external_contacts;
create policy "external_contacts_delete" on public.external_contacts
  for delete using (public.can_edit_stable(stable_id));

drop policy if exists "care_events_select" on public.care_events;
create policy "care_events_select" on public.care_events
  for select using (public.is_stable_member(stable_id));
drop policy if exists "care_events_insert" on public.care_events;
create policy "care_events_insert" on public.care_events
  for insert with check (public.can_edit_stable(stable_id));
drop policy if exists "care_events_update" on public.care_events;
create policy "care_events_update" on public.care_events
  for update using (public.can_edit_stable(stable_id));
drop policy if exists "care_events_delete" on public.care_events;
create policy "care_events_delete" on public.care_events
  for delete using (public.can_edit_stable(stable_id));

drop policy if exists "riding_days_select" on public.riding_days;
create policy "riding_days_select" on public.riding_days for select using (public.is_stable_member(stable_id));
drop policy if exists "riding_days_insert" on public.riding_days;
create policy "riding_days_insert" on public.riding_days for insert with check (public.can_edit_stable(stable_id));
drop policy if exists "riding_days_update" on public.riding_days;
create policy "riding_days_update" on public.riding_days for update using (public.can_edit_stable(stable_id));
drop policy if exists "riding_days_delete" on public.riding_days;
create policy "riding_days_delete" on public.riding_days for delete using (public.can_edit_stable(stable_id));

drop policy if exists "competition_events_select" on public.competition_events;
create policy "competition_events_select" on public.competition_events for select using (public.is_stable_member(stable_id));
drop policy if exists "competition_events_insert" on public.competition_events;
create policy "competition_events_insert" on public.competition_events for insert with check (public.can_edit_stable(stable_id));
drop policy if exists "competition_events_update" on public.competition_events;
create policy "competition_events_update" on public.competition_events for update using (public.can_edit_stable(stable_id));
drop policy if exists "competition_events_delete" on public.competition_events;
create policy "competition_events_delete" on public.competition_events for delete using (public.can_edit_stable(stable_id));

drop policy if exists "groups_select" on public.groups;
create policy "groups_select" on public.groups for select using (public.is_stable_member(stable_id));
drop policy if exists "groups_insert" on public.groups;
create policy "groups_insert" on public.groups for insert with check (public.can_manage_groups(stable_id));
drop policy if exists "groups_update" on public.groups;
create policy "groups_update" on public.groups for update using (public.can_manage_groups(stable_id));
drop policy if exists "groups_delete" on public.groups;
create policy "groups_delete" on public.groups for delete using (public.can_manage_groups(stable_id));

drop policy if exists "posts_select" on public.posts;
drop policy if exists "posts_insert_owner" on public.posts;
drop policy if exists "posts_update_owner" on public.posts;
drop policy if exists "posts_delete_owner" on public.posts;
create policy "posts_select" on public.posts for select using (public.is_stable_member(stable_id));
drop policy if exists "posts_insert" on public.posts;
create policy "posts_insert" on public.posts for insert with check (public.is_stable_member(stable_id) and (select auth.uid()) = user_id);
drop policy if exists "posts_update" on public.posts;
create policy "posts_update" on public.posts for update using ((select auth.uid()) = user_id);
drop policy if exists "posts_delete" on public.posts;
-- Fas 0B #7: författaren eller feed-/gruppansvarig (admin/staff) får radera (moderering).
create policy "posts_delete" on public.posts
  for delete using (
    (select auth.uid()) = user_id
    or public.can_manage_groups(stable_id)
  );

drop policy if exists "likes_select" on public.likes;
drop policy if exists "likes_insert_self" on public.likes;
drop policy if exists "likes_delete_self" on public.likes;
create policy "likes_select" on public.likes
  for select using (
    exists (
      select 1
      from public.posts p
      join public.stable_members m on m.stable_id = p.stable_id
      where p.id = likes.post_id and m.user_id = (select auth.uid())
    )
  );
drop policy if exists "likes_insert" on public.likes;
create policy "likes_insert" on public.likes
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "likes_delete" on public.likes;
create policy "likes_delete" on public.likes
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "comments_select" on public.comments;
drop policy if exists "comments_insert_self" on public.comments;
drop policy if exists "comments_update_self" on public.comments;
drop policy if exists "comments_delete_self" on public.comments;
create policy "comments_select" on public.comments
  for select using (
    exists (
      select 1
      from public.posts p
      join public.stable_members m on m.stable_id = p.stable_id
      where p.id = comments.post_id and m.user_id = (select auth.uid())
    )
  );
drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert" on public.comments
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "comments_update" on public.comments;
create policy "comments_update" on public.comments
  for update using ((select auth.uid()) = user_id);
drop policy if exists "comments_delete" on public.comments;
create policy "comments_delete" on public.comments
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "conversations_select" on public.conversations;
drop policy if exists "conversations_insert" on public.conversations;
drop policy if exists "conversations_update" on public.conversations;
create policy "conversations_select" on public.conversations
  for select using (
    (stable_id is not null and public.is_stable_member(stable_id))
    or exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = conversations.id
        and cm.user_id = (select auth.uid())
    )
  );
-- Private creator bootstrap before membership exists.
drop policy if exists "conversations_private_creator_select" on public.conversations;
create policy "conversations_private_creator_select" on public.conversations
  for select to authenticated
  using (
    stable_id is null
    and not coalesce(is_group, false)
    and created_by_user_id = (select auth.uid())
  );

create policy "conversations_insert" on public.conversations
  for insert with check (
    (select auth.uid()) is not null
    and (
      stable_id is null
      or public.is_stable_member(stable_id)
      or exists (
        select 1
        from public.stables s
        where s.id = stable_id and s.created_by = (select auth.uid())
      )
    )
  );
-- Private creator fields must be bound to the authenticated caller.
drop policy if exists "conversations_private_insert_self" on public.conversations;
create policy "conversations_private_insert_self" on public.conversations
  as restrictive for insert to authenticated
  with check (
    stable_id is not null
    or coalesce(is_group, false)
    or created_by_user_id = (select auth.uid())
  );

create policy "conversations_update" on public.conversations
  for update
  using (
    (stable_id is not null and public.is_stable_owner(stable_id))
    or created_by_user_id = (select auth.uid())
  )
  with check (
    (stable_id is not null and public.is_stable_owner(stable_id))
    or created_by_user_id = (select auth.uid())
  );

-- Fas 0A #4: chatt-helpers (security definer, row_security off → ingen RLS-rekursion).
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = auth.uid()
  );
$$;

drop policy if exists "conversation_members_select" on public.conversation_members;
-- Fas 0A #4: se medlemsrader för konversationer du tillhör (för namn-rendering).
create policy "conversation_members_select" on public.conversation_members
  for select using (public.is_conversation_member(conversation_id));
drop policy if exists "conversation_members_insert" on public.conversation_members;
-- Fas 0A #4: bara i konversationer DU skapat, och bara dig själv eller en stallkamrat
-- (stänger self-insert-i-andras-konversation samt force-chat-på-främling).
create policy "conversation_members_insert" on public.conversation_members
  for insert with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.created_by_user_id = (select auth.uid())
    )
    and (
      user_id = (select auth.uid())
      or public.shares_stable_with(user_id)
    )
  );
drop policy if exists "conversation_members_delete" on public.conversation_members;
create policy "conversation_members_delete" on public.conversation_members
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "messages_select" on public.messages;
drop policy if exists "messages_insert" on public.messages;
create policy "messages_select" on public.messages
  for select using (
    exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and (
          (c.stable_id is not null and public.is_stable_member(c.stable_id))
          or exists (
            select 1
            from public.conversation_members cm
            where cm.conversation_id = c.id and cm.user_id = (select auth.uid())
          )
        )
    )
  );
create policy "messages_insert" on public.messages
  for insert with check (
    (select auth.uid()) = author_id
    and exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and (
          (c.stable_id is not null and public.is_stable_member(c.stable_id))
          or exists (
            select 1
            from public.conversation_members cm
            where cm.conversation_id = c.id and cm.user_id = (select auth.uid())
          )
        )
    )
  );
-- Fas 0A #4: moderering. Författaren äger sina meddelanden; stall-owner får radera.
drop policy if exists "messages_update" on public.messages;
create policy "messages_update" on public.messages
  for update using ((select auth.uid()) = author_id);
drop policy if exists "messages_delete" on public.messages;
create policy "messages_delete" on public.messages
  for delete using (
    (select auth.uid()) = author_id
    or exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.stable_id is not null
        and public.is_stable_owner(c.stable_id)
    )
  );

-- Fas 3: content reports (UGC moderation)
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  stable_id uuid references public.stables(id) on delete cascade,
  reporter_user_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  reason text,
  created_at timestamptz default now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid references public.profiles(id) on delete set null
);
alter table public.content_reports enable row level security;
drop policy if exists "content_reports_insert" on public.content_reports;
create policy "content_reports_insert" on public.content_reports
  for insert with check (
    public.is_stable_member(stable_id) and reporter_user_id = (select auth.uid())
  );
drop policy if exists "content_reports_select" on public.content_reports;
create policy "content_reports_select" on public.content_reports
  for select using (
    reporter_user_id = (select auth.uid()) or public.can_manage_groups(stable_id)
  );
drop policy if exists "content_reports_update" on public.content_reports;
create policy "content_reports_update" on public.content_reports
  for update using (public.can_manage_groups(stable_id));
create index if not exists content_reports_stable_open_idx
  on public.content_reports(stable_id, created_at desc)
  where resolved_at is null;

-- Fas 3: blocked users (UGC — block/mute). Each row owned by the blocker.
create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);
alter table public.blocked_users enable row level security;
drop policy if exists "blocked_users_select" on public.blocked_users;
create policy "blocked_users_select" on public.blocked_users
  for select using (blocker_user_id = (select auth.uid()));
drop policy if exists "blocked_users_insert" on public.blocked_users;
create policy "blocked_users_insert" on public.blocked_users
  for insert with check (
    blocker_user_id = (select auth.uid()) and blocked_user_id <> (select auth.uid())
  );
drop policy if exists "blocked_users_delete" on public.blocked_users;
create policy "blocked_users_delete" on public.blocked_users
  for delete using (blocker_user_id = (select auth.uid()));
create index if not exists blocked_users_blocker_idx
  on public.blocked_users(blocker_user_id);

-- Foreign key indexes for performance
create index if not exists alerts_stable_id_idx on public.alerts(stable_id);
create index if not exists stable_alerts_stable_id_idx on public.stable_alerts(stable_id);
create index if not exists stable_alerts_horse_id_idx on public.stable_alerts(horse_id);
create index if not exists stable_alerts_paddock_id_idx on public.stable_alerts(paddock_id);
create index if not exists stable_alerts_assignment_id_idx on public.stable_alerts(assignment_id);
create index if not exists stable_alerts_active_idx
  on public.stable_alerts(stable_id, severity, created_at desc)
  where resolved_at is null;
create index if not exists arena_bookings_booked_by_user_id_idx on public.arena_bookings(booked_by_user_id);
create index if not exists arena_bookings_stable_id_idx on public.arena_bookings(stable_id);
create index if not exists arena_statuses_created_by_user_id_idx on public.arena_statuses(created_by_user_id);
create index if not exists arena_statuses_stable_id_idx on public.arena_statuses(stable_id);
create index if not exists assignment_history_assignment_id_idx on public.assignment_history(assignment_id);
create index if not exists assignment_history_stable_id_idx on public.assignment_history(stable_id);
create index if not exists assignments_assignee_id_idx on public.assignments(assignee_id);
create index if not exists assignments_stable_id_idx on public.assignments(stable_id);
create index if not exists away_notices_stable_id_idx on public.away_notices(stable_id);
create index if not exists away_notices_user_id_idx on public.away_notices(user_id);
create index if not exists comments_post_id_idx on public.comments(post_id);
create index if not exists comments_user_id_idx on public.comments(user_id);
create index if not exists competition_events_stable_id_idx on public.competition_events(stable_id);
create index if not exists conversation_members_user_id_idx on public.conversation_members(user_id);
create index if not exists conversations_created_by_user_id_idx on public.conversations(created_by_user_id);
create index if not exists conversations_stable_id_idx on public.conversations(stable_id);
create index if not exists day_events_stable_id_idx on public.day_events(stable_id);
create index if not exists day_events_stable_id_date_idx on public.day_events(stable_id, date);
create index if not exists default_passes_stable_id_idx on public.default_passes(stable_id);
create index if not exists groups_created_by_user_id_idx on public.groups(created_by_user_id);
create index if not exists groups_farm_id_idx on public.groups(farm_id);
create index if not exists groups_horse_id_idx on public.groups(horse_id);
create index if not exists groups_stable_id_idx on public.groups(stable_id);
create index if not exists horse_day_statuses_horse_id_idx on public.horse_day_statuses(horse_id);
create index if not exists feed_plans_stable_id_idx on public.feed_plans(stable_id);
create index if not exists feed_plans_horse_id_idx on public.feed_plans(horse_id);
create index if not exists feed_checks_stable_id_idx on public.feed_checks(stable_id);
create index if not exists feed_checks_horse_id_date_idx on public.feed_checks(horse_id, date);
create index if not exists horses_owner_user_id_idx on public.horses(owner_user_id);
create index if not exists horses_stable_id_idx on public.horses(stable_id);
create index if not exists likes_post_id_idx on public.likes(post_id);
create index if not exists messages_author_id_idx on public.messages(author_id);
create index if not exists messages_conversation_id_idx on public.messages(conversation_id);
create index if not exists paddocks_stable_id_idx on public.paddocks(stable_id);
create index if not exists posts_group_ids_gin_idx on public.posts using gin (group_ids);
create index if not exists posts_stable_id_idx on public.posts(stable_id);
create index if not exists posts_stable_id_created_at_idx on public.posts(stable_id, created_at desc);
create index if not exists posts_user_id_idx on public.posts(user_id);
create index if not exists ride_logs_created_by_user_id_idx on public.ride_logs(created_by_user_id);
create index if not exists ride_logs_horse_id_idx on public.ride_logs(horse_id);
create index if not exists assignments_stable_id_date_idx on public.assignments(stable_id, date);
create index if not exists arena_bookings_stable_id_date_idx on public.arena_bookings(stable_id, date);
create index if not exists ride_logs_stable_id_idx on public.ride_logs(stable_id);
create index if not exists planned_rides_stable_id_idx on public.planned_rides(stable_id);
create index if not exists planned_rides_horse_id_idx on public.planned_rides(horse_id);
create index if not exists planned_rides_stable_id_date_idx on public.planned_rides(stable_id, date);
create index if not exists external_contacts_stable_id_idx on public.external_contacts(stable_id);
create index if not exists care_events_stable_id_idx on public.care_events(stable_id);
create index if not exists care_events_stable_id_date_idx on public.care_events(stable_id, date);
create index if not exists care_events_horse_ids_gin_idx on public.care_events using gin (horse_ids);
create index if not exists riding_days_stable_id_idx on public.riding_days(stable_id);
create index if not exists stable_invites_stable_id_idx on public.stable_invites(stable_id);
create index if not exists stable_members_user_id_idx on public.stable_members(user_id);
create index if not exists stables_created_by_idx on public.stables(created_by);
create index if not exists stables_farm_id_idx on public.stables(farm_id);

-- Canonical paddock horse IDs (20261006).
set local search_path = pg_catalog;
-- Canonical ID links; original horse_names stays as an untouched legacy archive.
alter table public.paddocks add column if not exists revision bigint not null default 1 check (revision > 0);
alter table public.paddocks add column if not exists last_save_request_id uuid;
create unique index if not exists horses_id_stable_reference on public.horses (id, stable_id);
create unique index if not exists paddocks_id_stable_reference on public.paddocks (id, stable_id);
create table if not exists public.paddock_horses (
  stable_id uuid not null,
  paddock_id uuid not null,
  horse_id uuid not null,
  primary key (paddock_id, horse_id),
  foreign key (paddock_id, stable_id) references public.paddocks (id, stable_id) on delete cascade,
  foreign key (horse_id, stable_id) references public.horses (id, stable_id) on delete cascade
);
create index if not exists paddock_horses_horse_reference on public.paddock_horses (horse_id, stable_id);
alter table public.paddock_horses enable row level security;
drop policy if exists paddock_horses_select on public.paddock_horses;
create policy paddock_horses_select on public.paddock_horses
  for select to authenticated using (public.is_stable_member(stable_id));

-- Private deleted-ID marker. It lives only as long as its stable.
create table if not exists public.paddock_deleted_ids (
  paddock_id uuid primary key,
  stable_id uuid not null references public.stables(id) on delete cascade,
  deleted_at timestamptz not null default clock_timestamp()
);
alter table public.paddock_deleted_ids owner to postgres;
alter table public.paddock_deleted_ids enable row level security;
revoke all on table public.paddock_deleted_ids from public, anon, authenticated, service_role;
revoke all(paddock_id, stable_id, deleted_at) on public.paddock_deleted_ids from public, anon, authenticated, service_role;

-- Private helpers: all qualified objects, no client/service EXECUTE privilege.
create or replace function public.paddock_snapshot(p_paddock_id uuid)
returns jsonb language sql volatile security definer
set search_path = pg_catalog set row_security = off
as $function$
  select to_jsonb(p) || jsonb_build_object(
    'horse_ids', array(select ph.horse_id from public.paddock_horses ph
      where ph.paddock_id = p.id and ph.stable_id = p.stable_id order by ph.horse_id),
    'request_id', p.last_save_request_id)
  from public.paddocks p where p.id = p_paddock_id;
$function$;
alter function public.paddock_snapshot(uuid) owner to postgres;
revoke all on function public.paddock_snapshot(uuid) from public, anon, authenticated, service_role;

create or replace function public.bump_paddock_link_revision()
returns trigger language plpgsql volatile security definer
set search_path = pg_catalog set row_security = off
as $function$
declare parent_id uuid;
begin
  for parent_id in
    select distinct v from unnest(array[
      case when tg_op <> 'INSERT' then old.paddock_id end,
      case when tg_op <> 'DELETE' then new.paddock_id end
    ]) ids(v) where v is not null order by v
  loop
    -- A horse cascade already holds the horse/link. Do not wait for a saver
    -- holding the paddock and waiting for that horse: reject the entire cascade.
    perform 1 from public.paddocks where id = parent_id for update nowait;
    if found then
      update public.paddocks set revision = revision + 1,
        last_save_request_id = null, updated_at = clock_timestamp() where id = parent_id;
    end if;
  end loop;
  return null;
exception when lock_not_available or serialization_failure or deadlock_detected then
  raise exception using errcode = '40001', message = '[paddock save] Hagkopplingen ändras samtidigt. Ladda om och försök igen.';
end
$function$;
alter function public.bump_paddock_link_revision() owner to postgres;
revoke all on function public.bump_paddock_link_revision() from public, anon, authenticated, service_role;
drop trigger if exists bump_paddock_link_revision on public.paddock_horses;
create trigger bump_paddock_link_revision after insert or update or delete on public.paddock_horses
  for each row execute function public.bump_paddock_link_revision();

create or replace function public.save_paddock(
  p_paddock_id uuid, p_stable_id uuid, p_name text, p_horse_ids uuid[],
  p_season text, p_image_url text, p_expected_revision bigint, p_request_id uuid
)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog set row_security = off
as $function$
declare
  target public.paddocks%rowtype;
  requested_ids uuid[];
  current_ids uuid[];
  reserved_id uuid;
  created boolean := false;
begin
  if auth.uid() is null or not public.can_edit_stable(p_stable_id) then
    raise exception using errcode = '42501', message = '[paddock save] Du saknar redigeringsbehörighet i stallet.';
  end if;
  if p_paddock_id is null or p_stable_id is null or p_request_id is null
    or p_name is null or p_name = '' or p_horse_ids is null
    or (p_expected_revision is not null and p_expected_revision <= 0)
    or exists(select 1 from unnest(p_horse_ids) x where x is null)
    or cardinality(p_horse_ids) <> (select count(distinct x) from unnest(p_horse_ids) x)
  then
    raise exception using errcode = '22023', message = '[paddock save] Ange ID, namn, request-ID och en lista med unika häst-ID utan null.';
  end if;
  requested_ids := array(select x from unnest(p_horse_ids) x order by x);
  -- Parent first: a stable cascade must not deadlock with a locked paddock.
  perform 1 from public.stables where id = p_stable_id for key share nowait;
  if not found then
    raise exception using errcode = '23503', message = '[paddock save] Stallet finns inte längre.';
  end if;
  -- Serialize even absent IDs, so a deleted create cannot race its old retry.
  perform pg_advisory_xact_lock(hashtextextended('paddock:' || p_paddock_id::text, 20261006));
  select * into target from public.paddocks
    where id = p_paddock_id and stable_id = p_stable_id for update;
  if not found then
    if p_expected_revision is not null then
      raise exception using errcode = 'P0002', message = '[paddock save] Hage saknas. Ladda om innan du sparar.';
    end if;
    -- Unique-check the ID even if Repeatable Read cannot see a new tombstone.
    -- Only our new reservation is removed; committed deleted IDs remain blocked.
    insert into public.paddock_deleted_ids(paddock_id, stable_id)
      values(p_paddock_id, p_stable_id) on conflict(paddock_id) do nothing
      returning paddock_id into reserved_id;
    if not found then
      raise exception using errcode = 'P0002', message = '[paddock save] Hage har raderats och kan inte återställas av ett gammalt sparförsök.';
    end if;
    delete from public.paddock_deleted_ids where paddock_id = reserved_id;
    insert into public.paddocks(id, stable_id, name, season, image_url)
      values(p_paddock_id, p_stable_id, p_name, p_season, p_image_url)
      on conflict(id) do nothing returning * into target;
    created := found;
    if not created then
      select * into target from public.paddocks
        where id = p_paddock_id and stable_id = p_stable_id for update;
      if not found then
        raise exception using errcode = '23503', message = '[paddock save] Hagens ID är inte tillgängligt i angivet stall.';
      end if;
    end if;
  end if;
  if not created then
    current_ids := array(select horse_id from public.paddock_horses
      where paddock_id = p_paddock_id and stable_id = p_stable_id order by horse_id);
    if target.last_save_request_id = p_request_id then
      if target.name is not distinct from p_name and target.season is not distinct from p_season
        and target.image_url is not distinct from p_image_url and current_ids = requested_ids
        and target.revision - 1 = coalesce(p_expected_revision, 0)
      then return public.paddock_snapshot(p_paddock_id);
      end if;
      raise exception using errcode = '22023', message = '[paddock save] Request-ID har redan använts med annat innehåll.';
    end if;
    if p_expected_revision is null or target.revision <> p_expected_revision then
      raise exception using errcode = '40001', message = '[paddock save] Hage har ändrats. Ladda om och granska ditt utkast.';
    end if;
  end if;
  if (select count(*) from public.horses where stable_id = p_stable_id and id = any(requested_ids))
    <> cardinality(requested_ids)
  then
    raise exception using errcode = '23503', message = '[paddock save] En vald häst saknas eller tillhör ett annat stall.';
  end if;
  delete from public.paddock_horses where paddock_id = p_paddock_id
    and not (horse_id = any(requested_ids));
  insert into public.paddock_horses(stable_id, paddock_id, horse_id)
    select p_stable_id, p_paddock_id, x from unnest(requested_ids) x
    on conflict(paddock_id, horse_id) do nothing;
  -- Coalesce all of this RPC's link-trigger changes into one visible revision.
  update public.paddocks set name = p_name, season = p_season, image_url = p_image_url,
    revision = case when created then 1 else target.revision + 1 end,
    last_save_request_id = p_request_id, updated_at = clock_timestamp()
    where id = p_paddock_id and stable_id = p_stable_id;
  return public.paddock_snapshot(p_paddock_id);
exception
  when foreign_key_violation then
    raise exception using errcode = '23503', message = '[paddock save] Stallet eller en vald häst finns inte längre.';
  when serialization_failure or deadlock_detected or lock_not_available then
    raise exception using errcode = '40001', message = '[paddock save] Hage ändras samtidigt. Ladda om och granska ditt utkast.';
end
$function$;
alter function public.save_paddock(uuid, uuid, text, uuid[], text, text, bigint, uuid) owner to postgres;
revoke all on function public.save_paddock(uuid, uuid, text, uuid[], text, text, bigint, uuid) from public, anon, authenticated, service_role;
grant execute on function public.save_paddock(uuid, uuid, text, uuid[], text, text, bigint, uuid) to authenticated;

create or replace function public.delete_paddock(p_paddock_id uuid, p_stable_id uuid, p_expected_revision bigint)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog set row_security = off
as $function$
declare current_revision bigint;
begin
  if auth.uid() is null or not public.can_edit_stable(p_stable_id) then
    raise exception using errcode = '42501', message = '[paddock delete] Du saknar redigeringsbehörighet i stallet.';
  end if;
  if p_paddock_id is null or p_stable_id is null or p_expected_revision is null or p_expected_revision <= 0 then
    raise exception using errcode = '22023', message = '[paddock delete] Ange hagens ID, stall och aktuell revision.';
  end if;
  perform 1 from public.stables where id = p_stable_id for key share nowait;
  if not found then
    raise exception using errcode = '23503', message = '[paddock delete] Stallet finns inte längre.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('paddock:' || p_paddock_id::text, 20261006));
  select revision into current_revision from public.paddocks
    where id = p_paddock_id and stable_id = p_stable_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = '[paddock delete] Hage saknas. Ladda om.';
  end if;
  if current_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = '[paddock delete] Hage har ändrats. Ladda om innan du tar bort den.';
  end if;
  insert into public.paddock_deleted_ids(paddock_id, stable_id)
    values(p_paddock_id, p_stable_id);
  delete from public.paddocks where id = p_paddock_id and stable_id = p_stable_id;
  return jsonb_build_object('id', p_paddock_id, 'stable_id', p_stable_id,
    'deleted', true, 'revision', current_revision);
exception when serialization_failure or deadlock_detected or lock_not_available then
  raise exception using errcode = '40001', message = '[paddock delete] Hage ändras samtidigt. Ladda om innan du tar bort den.';
end
$function$;
alter function public.delete_paddock(uuid, uuid, bigint) owner to postgres;
revoke all on function public.delete_paddock(uuid, uuid, bigint) from public, anon, authenticated, service_role;
grant execute on function public.delete_paddock(uuid, uuid, bigint) to authenticated;

-- No direct legacy or canonical writes, even when horse_names is unchanged.
drop policy if exists paddocks_insert on public.paddocks;
drop policy if exists paddocks_update on public.paddocks;
drop policy if exists paddocks_delete on public.paddocks;
revoke insert, update, delete on table public.paddocks from public, anon, authenticated, service_role;
-- Table revokes alone do not remove preexisting column ACLs.
revoke insert(id, created_at, updated_at, stable_id, name, horse_names, season, image_url, revision, last_save_request_id),
  update(id, created_at, updated_at, stable_id, name, horse_names, season, image_url, revision, last_save_request_id)
  on public.paddocks from public, anon, authenticated, service_role;
revoke all on table public.paddock_horses from public, anon, authenticated, service_role;
revoke insert(stable_id, paddock_id, horse_id), update(stable_id, paddock_id, horse_id)
  on public.paddock_horses from public, anon, authenticated, service_role;
grant select on table public.paddocks, public.paddock_horses to authenticated;

commit;

-- Push tokens and receipt ledger mirror.
-- Push notification tokens
create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table push_tokens enable row level security;

create policy "Users can manage own tokens"
  on push_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Notification preferences per user
create table if not exists notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  messages boolean not null default true,
  assignments boolean not null default true,
  feed boolean not null default true,
  reminders boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table notification_preferences enable row level security;

create policy "Users can manage own preferences"
  on notification_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Receipt ledger append; original push migration bytes are preserved above.
-- PREPARE-ONLY: no Hosted approval or runtime acceptance is implied.
-- Base b0b5ee71a9577d3ae2b7605874befc76f55efc7f. Requires the existing
-- 20250313_push_notifications.sql tables and auth.users/auth.role().
-- No provider configuration, scheduler, extension, token text or message storage.
-- Root's fresh Hosted catalog-only preflight reported: actor postgres,
-- auth.users SELECT=true/REFERENCES=true; authenticated and anon both currently
-- have notify_push EXECUTE=true. No user rows/Vault secrets/function calls read.
-- The notify EXECUTE revoke below fixes that concrete permission gap; this
-- entire migration still requires separate exact schema approval and replay.
begin;

do $preflight$
begin
  if to_regclass('public.push_tokens') is null
    or to_regclass('public.notification_preferences') is null then
    raise exception using errcode = '23514', message = '[push receipts] Existing push schema is required.';
  end if;
end
$preflight$;

alter table public.push_tokens
  add column if not exists registration_generation uuid not null default gen_random_uuid();

create or replace function public.rotate_push_registration_generation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  -- Every registration write gets a fresh DB value, including a client trying
  -- to restore an old generation or an ON CONFLICT upsert of the same token.
  new.registration_generation := gen_random_uuid();
  return new;
end;
$$;
revoke all on function public.rotate_push_registration_generation() from public, anon, authenticated, service_role;
drop trigger if exists rotate_push_registration_generation on public.push_tokens;
create trigger rotate_push_registration_generation
  before insert or update on public.push_tokens
  for each row execute function public.rotate_push_registration_generation();

create schema if not exists private;
create table if not exists private.push_delivery_attempts (
  attempt_id uuid primary key,
  created_at timestamptz not null,
  target_count integer not null check (target_count between 0 and 10000)
);
create table if not exists private.push_delivery_tickets (
  attempt_id uuid not null references private.push_delivery_attempts(attempt_id) on delete cascade,
  position integer not null check (position between 0 and 9999),
  token_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  registration_generation uuid not null,
  ticket_status text not null default 'unknown' check (ticket_status in ('unknown', 'accepted', 'ticket_error')),
  ticket_id text unique check (ticket_id is null or (length(btrim(ticket_id)) > 0 and length(ticket_id) <= 512)),
  ticket_error_code text check (ticket_error_code is null or ticket_error_code in
    ('DeviceNotRegistered', 'MessageTooBig', 'MessageRateExceeded', 'MismatchSenderId', 'InvalidCredentials', 'Unknown')),
  ticket_recorded_at timestamptz,
  receipt_status text check (receipt_status in ('pending', 'receipt_ok', 'receipt_error', 'expired_unknown')),
  receipt_error_code text check (receipt_error_code is null or receipt_error_code in
    ('DeviceNotRegistered', 'MessageTooBig', 'MessageRateExceeded', 'MismatchSenderId', 'InvalidCredentials', 'Unknown')),
  receipt_checked_at timestamptz,
  next_check_at timestamptz,
  expires_at timestamptz not null,
  lease_id uuid,
  lease_worker_id uuid,
  lease_expires_at timestamptz,
  primary key (attempt_id, position),
  unique (attempt_id, token_id, registration_generation),
  check ((ticket_status = 'accepted') = (ticket_id is not null)),
  check (ticket_status = 'unknown' or ticket_recorded_at is not null),
  check (ticket_status = 'ticket_error' or ticket_error_code is null),
  check ((ticket_status = 'accepted' and receipt_status is not null)
    or (ticket_status = 'unknown' and (receipt_status is null or receipt_status = 'expired_unknown'))
    or (ticket_status = 'ticket_error' and receipt_status is null)),
  check (receipt_error_code is null or receipt_status is not distinct from 'receipt_error'),
  check ((receipt_status is not distinct from 'pending') = (next_check_at is not null)),
  check ((lease_id is null and lease_worker_id is null and lease_expires_at is null)
    or (lease_id is not null and lease_worker_id is not null and lease_expires_at is not null
      and receipt_status = 'pending' and lease_expires_at <= expires_at))
);
create index if not exists push_delivery_tickets_due on private.push_delivery_tickets(next_check_at, attempt_id, position)
  where ticket_status = 'accepted' and receipt_status = 'pending';
create index if not exists push_delivery_tickets_expiry on private.push_delivery_tickets(expires_at)
  where ticket_status = 'unknown' and receipt_status is null or receipt_status = 'pending';
create index if not exists push_delivery_tickets_lease on private.push_delivery_tickets(lease_id)
  where lease_id is not null;
create index if not exists push_delivery_tickets_user on private.push_delivery_tickets(user_id);

alter table private.push_delivery_attempts enable row level security;
alter table private.push_delivery_tickets enable row level security;
-- Service workers also use RPC only; no direct raw-table grant is introduced.
revoke all on table private.push_delivery_attempts, private.push_delivery_tickets from public, anon, authenticated, service_role;

create or replace function private.retire_push_registration(
  p_token_id uuid, p_user_id uuid, p_generation uuid, p_deadline timestamptz)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare v_deleted integer; v_matched boolean;
begin
  -- Wait for the exact snapshot row before checking a collector's deadline.
  -- The row may be locked without being re-registered; generation alone would
  -- not stop an expired collector from deleting it after that wait.
  perform 1 from public.push_tokens
    where id = p_token_id and user_id = p_user_id and registration_generation = p_generation for update;
  v_matched := found;
  if p_deadline is not null and clock_timestamp() >= p_deadline then
    raise exception using errcode = '40001', message = '[push receipts] Lease deadline expired before token cleanup.';
  end if;
  if not v_matched then return 0; end if;
  delete from public.push_tokens
  where id = p_token_id and user_id = p_user_id and registration_generation = p_generation;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function private.retire_push_registration(uuid, uuid, uuid, timestamptz) from public, anon, authenticated, service_role;

create or replace function public.push_receipts_prepare(p_attempt_id uuid, p_registrations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare v_count integer; v_inserted integer; v_now timestamptz; v_item jsonb; v_registration record;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = '[push receipts] Service role is required.';
  end if;
  if p_attempt_id is null then
    raise exception using errcode = '22023', message = '[push receipts] Attempt ID is required.';
  end if;
  -- A persisted request identity is permanently consumed, even if recipients,
  -- ordering or registration generations have since changed. Never rearm it.
  if exists(select 1 from private.push_delivery_attempts where attempt_id = p_attempt_id) then
    return jsonb_build_object('attempt_id', p_attempt_id, 'started', false);
  end if;
  -- The unique parent insert also consumes concurrent retries before looking
  -- at changed payloads. An invalid NEW reservation rolls back atomically.
  v_now := clock_timestamp();
  insert into private.push_delivery_attempts(attempt_id,created_at,target_count)
  values(p_attempt_id,v_now,0) on conflict (attempt_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('attempt_id', p_attempt_id, 'started', false);
  end if;
  if p_registrations is null or jsonb_typeof(p_registrations) <> 'array' then
    raise exception using errcode = '22023', message = '[push receipts] Registrations must be an array.';
  end if;
  v_count := jsonb_array_length(p_registrations);
  if v_count > 10000 then
    raise exception using errcode = '22023', message = '[push receipts] Registration batch exceeds its bound.';
  end if;
  for v_item in select value from jsonb_array_elements(p_registrations) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using errcode = '22023', message = '[push receipts] Invalid registration object.';
    end if;
    if v_item - array['position','token_id','user_id','registration_generation'] <> '{}'::jsonb
      or jsonb_typeof(v_item->'position') is distinct from 'number'
      or jsonb_typeof(v_item->'token_id') is distinct from 'string'
      or jsonb_typeof(v_item->'user_id') is distinct from 'string'
      or jsonb_typeof(v_item->'registration_generation') is distinct from 'string' then
      raise exception using errcode = '22023', message = '[push receipts] Invalid registration fields.';
    end if;
  end loop;
  if (select count(distinct r.position) from jsonb_to_recordset(p_registrations)
      as r(position integer, token_id uuid, user_id uuid, registration_generation uuid)) <> v_count
    or exists(select 1 from jsonb_to_recordset(p_registrations)
      as r(position integer, token_id uuid, user_id uuid, registration_generation uuid)
      where r.position < 0 or r.position >= v_count)
    or (select count(distinct (r.token_id,r.registration_generation)) from jsonb_to_recordset(p_registrations)
      as r(position integer, token_id uuid, user_id uuid, registration_generation uuid)) <> v_count then
    raise exception using errcode = '22023', message = '[push receipts] Positions and registrations must be exact and unique.';
  end if;
  update private.push_delivery_attempts set target_count=v_count where attempt_id=p_attempt_id;
  -- Canonical token lock order avoids swapped-input reservation deadlocks.
  for v_registration in select * from jsonb_to_recordset(p_registrations)
    as r(position integer, token_id uuid, user_id uuid, registration_generation uuid)
    order by r.token_id, r.registration_generation loop
    perform 1 from public.push_tokens t where t.id = v_registration.token_id
      and t.user_id = v_registration.user_id and t.registration_generation = v_registration.registration_generation
      for share;
    if not found then
      raise exception using errcode = '23514', message = '[push receipts] Registration snapshot no longer matches.';
    end if;
    insert into private.push_delivery_tickets(attempt_id,position,token_id,user_id,registration_generation,expires_at)
    values(p_attempt_id,v_registration.position,v_registration.token_id,v_registration.user_id,
      v_registration.registration_generation,v_now + interval '24 hours');
  end loop;
  return jsonb_build_object('attempt_id', p_attempt_id, 'started', true);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = '[push receipts] Invalid registration value.';
end;
$$;

create or replace function public.push_receipts_record_tickets(p_attempt_id uuid, p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare v_count integer; v_item jsonb; v_result record; v_ticket private.push_delivery_tickets%rowtype; v_now timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = '[push receipts] Service role is required.';
  end if;
  if p_attempt_id is null or p_results is null or jsonb_typeof(p_results) <> 'array' then
    raise exception using errcode = '22023', message = '[push receipts] Attempt and ticket array are required.';
  end if;
  v_count := jsonb_array_length(p_results);
  if v_count not between 1 and 100 then
    raise exception using errcode = '22023', message = '[push receipts] Ticket batch must contain 1 to 100 results.';
  end if;
  for v_item in select value from jsonb_array_elements(p_results) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using errcode = '22023', message = '[push receipts] Invalid ticket object.';
    end if;
    if v_item - array['position','status','ticket_id','error_code'] <> '{}'::jsonb
      or jsonb_typeof(v_item->'position') is distinct from 'number'
      or jsonb_typeof(v_item->'status') is distinct from 'string'
      or coalesce(jsonb_typeof(v_item->'ticket_id'),'null') not in ('null','string')
      or coalesce(jsonb_typeof(v_item->'error_code'),'null') not in ('null','string') then
      raise exception using errcode = '22023', message = '[push receipts] Invalid ticket fields.';
    end if;
  end loop;
  if (select count(distinct position) from jsonb_to_recordset(p_results)
    as r(position integer,status text,ticket_id text,error_code text)) <> v_count then
    raise exception using errcode = '22023', message = '[push receipts] Ticket positions must be unique.';
  end if;
  perform 1 from private.push_delivery_attempts where attempt_id = p_attempt_id for update;
  if not found then
    raise exception using errcode = '23514', message = '[push receipts] Attempt was not reserved.';
  end if;
  for v_result in select * from jsonb_to_recordset(p_results)
    as r(position integer,status text,ticket_id text,error_code text) order by position loop
    if v_result.status is null or v_result.status not in ('accepted','ticket_error','unknown')
      or v_result.error_code is not null and v_result.error_code not in
        ('DeviceNotRegistered','MessageTooBig','MessageRateExceeded','MismatchSenderId','InvalidCredentials','Unknown')
      or v_result.status = 'accepted' and (v_result.ticket_id is null or length(btrim(v_result.ticket_id)) = 0
        or length(v_result.ticket_id) > 512 or v_result.error_code is not null)
      or v_result.status <> 'accepted' and v_result.ticket_id is not null
      or v_result.status = 'unknown' and v_result.error_code is not null then
      raise exception using errcode = '22023', message = '[push receipts] Invalid ticket outcome.';
    end if;
    select * into v_ticket from private.push_delivery_tickets
      where attempt_id = p_attempt_id and position = v_result.position for update;
    if not found then
      raise exception using errcode = '23514', message = '[push receipts] Ticket position was not reserved.';
    end if;
    if v_ticket.ticket_recorded_at is not null then
      if v_ticket.ticket_status is distinct from v_result.status or v_ticket.ticket_id is distinct from v_result.ticket_id
        or v_ticket.ticket_error_code is distinct from v_result.error_code then
        raise exception using errcode = '40001', message = '[push receipts] Ticket outcome conflicts with its frozen acknowledgement.';
      end if;
      continue;
    end if;
    v_now := clock_timestamp();
    update private.push_delivery_tickets set ticket_status=v_result.status,ticket_id=v_result.ticket_id,
      ticket_error_code=v_result.error_code,ticket_recorded_at=v_now,
      receipt_status=case when v_result.status='ticket_error' then null
        when v_now >= expires_at then 'expired_unknown'
        when v_result.status='accepted' then case when v_now+interval '15 minutes' < expires_at
          then 'pending' else 'expired_unknown' end else null end,
      next_check_at=case when v_result.status='accepted' and v_now + interval '15 minutes' < expires_at
        then v_now + interval '15 minutes' else null end
    where attempt_id=p_attempt_id and position=v_result.position;
    if v_result.status='ticket_error' and v_result.error_code='DeviceNotRegistered' then
      -- A terminal send ticket has no collector lease. NULL is intentional;
      -- cleanup still requires the exact original registration generation.
      perform private.retire_push_registration(v_ticket.token_id,v_ticket.user_id,v_ticket.registration_generation,null);
    end if;
  end loop;
  return jsonb_build_object('attempt_id',p_attempt_id,'recorded_count',v_count);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = '[push receipts] Invalid ticket value.';
when unique_violation then
  raise exception using errcode = '40001', message = '[push receipts] Ticket ID conflicts with an existing acknowledgement.';
end;
$$;

create or replace function public.push_receipts_claim_due(p_worker_id uuid, p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare v_lease_id uuid; v_now timestamptz; v_items jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = '[push receipts] Service role is required.';
  end if;
  if p_worker_id is null or p_limit is null or p_limit not between 1 and 1000 then
    raise exception using errcode = '22023', message = '[push receipts] Worker and limit from 1 to 1000 are required.';
  end if;
  v_lease_id := gen_random_uuid();
  v_now := clock_timestamp();
  -- Bound expiry maintenance too; locked rows remain for a later collector.
  with expired as (
    select attempt_id,position from private.push_delivery_tickets
    where expires_at <= v_now and (ticket_status='unknown' and receipt_status is null or receipt_status='pending')
    order by expires_at,attempt_id,position limit 1000 for update skip locked
  ) update private.push_delivery_tickets t set receipt_status='expired_unknown',next_check_at=null,
    lease_id=null,lease_worker_id=null,lease_expires_at=null
    from expired e where t.attempt_id=e.attempt_id and t.position=e.position;
  with due as (
    select attempt_id,position from private.push_delivery_tickets
    where ticket_status='accepted' and receipt_status='pending' and next_check_at <= v_now and expires_at > v_now
      and (lease_id is null or lease_expires_at <= v_now)
    order by next_check_at,attempt_id,position limit p_limit for update skip locked
  ), claimed as (
    update private.push_delivery_tickets t set lease_id=v_lease_id,lease_worker_id=p_worker_id,
      lease_expires_at=least(v_now+interval '2 minutes',t.expires_at),
      next_check_at=least(v_now+interval '15 minutes',t.expires_at)
    from due d where t.attempt_id=d.attempt_id and t.position=d.position
    returning t.attempt_id,t.position,t.ticket_id
  ) select coalesce(jsonb_agg(jsonb_build_object('attempt_id',attempt_id,'position',position,'ticket_id',ticket_id)
    order by attempt_id,position),'[]'::jsonb) into v_items from claimed;
  return jsonb_build_object('lease_id',v_lease_id,'items',v_items);
end;
$$;

create or replace function public.push_receipts_apply(p_lease_id uuid, p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare v_count integer; v_locked integer; v_item jsonb; v_result record; v_ticket private.push_delivery_tickets%rowtype;
  v_now timestamptz; v_ok integer:=0; v_error integer:=0; v_missing integer:=0; v_deleted integer:=0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = '[push receipts] Service role is required.';
  end if;
  if p_lease_id is null or p_results is null or jsonb_typeof(p_results) <> 'array' then
    raise exception using errcode = '22023', message = '[push receipts] Lease and receipt array are required.';
  end if;
  v_count := jsonb_array_length(p_results);
  if v_count not between 1 and 1000 then
    raise exception using errcode = '22023', message = '[push receipts] Receipt batch must contain 1 to 1000 results.';
  end if;
  for v_item in select value from jsonb_array_elements(p_results) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using errcode = '22023', message = '[push receipts] Invalid receipt object.';
    end if;
    if v_item - array['attempt_id','position','ticket_id','status','error_code'] <> '{}'::jsonb
      or jsonb_typeof(v_item->'attempt_id') is distinct from 'string'
      or jsonb_typeof(v_item->'position') is distinct from 'number'
      or jsonb_typeof(v_item->'ticket_id') is distinct from 'string'
      or jsonb_typeof(v_item->'status') is distinct from 'string'
      or coalesce(jsonb_typeof(v_item->'error_code'),'null') not in ('null','string') then
      raise exception using errcode = '22023', message = '[push receipts] Invalid receipt fields.';
    end if;
  end loop;
  if (select count(distinct (attempt_id,position)) from jsonb_to_recordset(p_results)
    as r(attempt_id uuid,position integer,ticket_id text,status text,error_code text)) <> v_count then
    raise exception using errcode = '22023', message = '[push receipts] Receipt positions must be unique.';
  end if;
  perform 1 from private.push_delivery_tickets where lease_id=p_lease_id order by attempt_id,position for update;
  get diagnostics v_locked=row_count;
  v_now:=clock_timestamp();
  if v_locked=0 or v_locked<>v_count or exists(select 1 from private.push_delivery_tickets where lease_id=p_lease_id
    and (lease_expires_at <= v_now or expires_at <= v_now)) then
    raise exception using errcode = '40001', message = '[push receipts] Lease is stale, expired or incomplete.';
  end if;
  for v_result in select * from jsonb_to_recordset(p_results)
    as r(attempt_id uuid,position integer,ticket_id text,status text,error_code text) order by attempt_id,position loop
    if v_result.status is null or v_result.status not in ('receipt_ok','receipt_error','missing')
      or length(btrim(v_result.ticket_id))=0 or length(v_result.ticket_id)>512
      or v_result.error_code is not null and v_result.error_code not in
        ('DeviceNotRegistered','MessageTooBig','MessageRateExceeded','MismatchSenderId','InvalidCredentials','Unknown')
      or v_result.status <> 'receipt_error' and v_result.error_code is not null then
      raise exception using errcode = '22023', message = '[push receipts] Invalid receipt outcome.';
    end if;
    select * into v_ticket from private.push_delivery_tickets where attempt_id=v_result.attempt_id
      and position=v_result.position and lease_id=p_lease_id for update;
    v_now:=clock_timestamp();
    if not found or v_ticket.ticket_id is distinct from v_result.ticket_id or v_ticket.ticket_status<>'accepted'
      or v_ticket.receipt_status<>'pending' or v_ticket.lease_expires_at <= v_now or v_ticket.expires_at <= v_now then
      raise exception using errcode = '40001', message = '[push receipts] Receipt does not match its current claim.';
    end if;
    update private.push_delivery_tickets set receipt_status=case when v_result.status='missing'
        then case when v_now+interval '15 minutes' < expires_at then 'pending' else 'expired_unknown' end
        else v_result.status end,
      receipt_error_code=v_result.error_code,receipt_checked_at=v_now,
      next_check_at=case when v_result.status='missing' and v_now+interval '15 minutes' < expires_at
        then v_now+interval '15 minutes' else null end,
      lease_id=null,lease_worker_id=null,lease_expires_at=null
    where attempt_id=v_result.attempt_id and position=v_result.position;
    if v_result.status='receipt_ok' then v_ok:=v_ok+1;
    elsif v_result.status='receipt_error' then
      v_error:=v_error+1;
      if v_result.error_code='DeviceNotRegistered' then
        v_deleted:=v_deleted+private.retire_push_registration(v_ticket.token_id,v_ticket.user_id,
          v_ticket.registration_generation,v_ticket.lease_expires_at);
      end if;
    else v_missing:=v_missing+1;
    end if;
  end loop;
  return jsonb_build_object('lease_id',p_lease_id,'applied_count',v_count,'receipt_ok_count',v_ok,
    'receipt_error_count',v_error,'missing_count',v_missing,'deleted_token_count',v_deleted);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = '[push receipts] Invalid receipt value.';
end;
$$;

revoke all on function public.push_receipts_prepare(uuid,jsonb), public.push_receipts_record_tickets(uuid,jsonb),
  public.push_receipts_claim_due(uuid,integer), public.push_receipts_apply(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.push_receipts_prepare(uuid,jsonb), public.push_receipts_record_tickets(uuid,jsonb),
  public.push_receipts_claim_due(uuid,integer), public.push_receipts_apply(uuid,jsonb) to service_role;

-- notify_push body below is the existing Vault/fallback implementation with
-- only the DB-generated request_id entry added to its JSON payload.
create or replace function public.notify_push(
  p_type text,
  p_record jsonb,
  p_old_record jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
  v_payload jsonb;
begin
  v_url := current_setting('app.settings.supabase_url', true)
    || '/functions/v1/send-push-notification';

  -- Primärt: läs ur Vault.
  begin
    select decrypted_secret
      into v_key
      from vault.decrypted_secrets
      where name = 'service_role_key'
      limit 1;
  exception when others then
    v_key := null;
  end;

  -- Transitions-fallback: gamla plaintext-GUC:en (tas bort efter verifiering).
  if v_key is null then
    v_key := current_setting('app.settings.service_role_key', true);
  end if;

  if v_url is null or v_key is null then
    raise warning 'Push notification settings not configured (no vault secret named service_role_key and no app.settings.service_role_key GUC)';
    return;
  end if;

  v_payload := jsonb_build_object(
    'request_id', gen_random_uuid(),
    'type', p_type,
    'record', p_record,
    'old_record', p_old_record
  );

  perform net.http_post(
    url := v_url,
    body := v_payload,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 5000
  );
end;
$$;

-- Existing SECURITY DEFINER notify_push otherwise exposes service-key push
-- dispatch to callers with PostgreSQL's default PUBLIC function EXECUTE.
revoke all on function public.notify_push(text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.notify_push(text,jsonb,jsonb) to service_role;

commit;

-- Push device ownership (20261008), after push receipt ledger.
-- REV2 PREPARE-ONLY: separate approval required; no Hosted or provider acceptance.
-- Main ef793f472f6be14d7909219216a5f9bc3c7e4e00; additive to receipt draft
-- SHA052bcb979a86d4c41247ab059049fe99efa121991f86b425be9d5ba32ffd5f68.
-- Built-in sha256(bytea): https://www.postgresql.org/docs/16/functions-binarystring.html
-- Raw token remains only in existing push_tokens. This private table retains
-- opaque token hashes/epochs after Auth deletion to prevent tombstone ABA.
-- No legacy owner inference, mass deletion, provider revocation or scheduler.
begin;
do $$begin
  if to_regprocedure('pg_catalog.sha256(bytea)') is null
    or to_regprocedure('public.push_receipts_prepare(uuid,jsonb)') is null
    or to_regprocedure('public.push_receipts_record_tickets(uuid,jsonb)') is null
    or to_regprocedure('public.push_receipts_apply(uuid,jsonb)') is null
    or to_regprocedure('private.retire_push_registration(uuid,uuid,uuid,timestamptz)') is null
    or not exists(select 1 from pg_attribute where attrelid=to_regclass('public.push_tokens')
      and attname='registration_generation' and atttypid='uuid'::regtype and not attisdropped) then
    raise exception using errcode='23514',message='[push device] Prior receipt ledger and built-in SHA256 are required.';
  end if;
end$$;
create table if not exists private.push_device_bindings (
  token_hash bytea primary key check(octet_length(token_hash)=32),
  binding_generation uuid not null default gen_random_uuid(),
  current_user_id uuid references auth.users(id) on delete set null,
  token_id uuid,
  registration_generation uuid,
  updated_at timestamptz not null default clock_timestamp(),
  check((current_user_id is null and token_id is null and registration_generation is null)
    or (current_user_id is not null and token_id is not null and registration_generation is not null))
);
-- Deliberately no token-row FK: raw legacy token DELETE must not create the
-- inverse token->binding lock order. Such dangling tuples are always inactive.
alter table private.push_device_bindings enable row level security;
revoke all on private.push_device_bindings from public,anon,authenticated,service_role;
create index if not exists push_device_bindings_user on private.push_device_bindings(current_user_id)
  where current_user_id is not null;

create or replace function private.detach_push_device_owner()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if old.current_user_id is not null and new.current_user_id is null then
    new.token_id:=null;
    new.registration_generation:=null;
    new.binding_generation:=gen_random_uuid();
    new.updated_at:=clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function private.detach_push_device_owner() from public,anon,authenticated,service_role;
drop trigger if exists detach_push_device_owner on private.push_device_bindings;
create trigger detach_push_device_owner before update on private.push_device_bindings
  for each row execute function private.detach_push_device_owner();

create or replace function private.push_device_hash(p_token text)
returns bytea language plpgsql immutable set search_path=pg_catalog as $$
begin
  if p_token is null or p_token='' or p_token<>btrim(p_token) or octet_length(p_token)>4096 then
    raise exception using errcode='22023',message='[push device] A bounded nonempty device token is required.';
  end if;
  return sha256(convert_to(p_token,'UTF8'));
end;
$$;
revoke all on function private.push_device_hash(text) from public,anon,authenticated,service_role;

create or replace function private.push_device_caller(p_expected_user_id uuid,p_require_profile boolean)
returns uuid language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare caller uuid;
begin
  caller:=auth.uid();
  if auth.role() is distinct from 'authenticated' or caller is null
    or p_expected_user_id is distinct from caller then
    raise exception using errcode='42501',message='[push device] Current authenticated account is required.';
  end if;
  if p_require_profile and not exists(select 1 from public.profiles where id=caller) then
    raise exception using errcode='42501',message='[push device] Active own profile is required.';
  end if;
  return caller;
end;
$$;
revoke all on function private.push_device_caller(uuid,boolean) from public,anon,authenticated,service_role;

-- Auth parents are the first row-lock namespace. Discovery has no locks;
-- distinct caller/target and observed previous-owner UIDs are locked in UUID
-- order before ledger, mapper or token rows. Under-lock scope drift rolls back.
-- Existing Hosted postgres UPDATE permits FOR KEY SHARE; no new grant.
create or replace function private.push_device_auth_scope(p_user_ids uuid[],p_token_ids uuid[],p_hash bytea)
returns uuid[] language sql stable security definer set search_path=pg_catalog set row_security=off as $$
  select coalesce(array_agg(uid order by uid),'{}'::uuid[]) from (
    select distinct uid from (
      select unnest(p_user_ids) uid
      union all select b.current_user_id from private.push_device_bindings b
        where b.token_hash=p_hash or b.token_hash in
          (select sha256(convert_to(t.token,'UTF8')) from public.push_tokens t where t.id=any(p_token_ids))
    ) discovered where uid is not null
  ) ordered
$$;
revoke all on function private.push_device_auth_scope(uuid[],uuid[],bytea) from public,anon,authenticated,service_role;
create or replace function private.lock_push_auth_users(p_user_ids uuid[])
returns void language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare uid uuid;
begin
  for uid in select distinct value from unnest(p_user_ids) value where value is not null order by value loop
    perform 1 from auth.users u where u.id=uid for key share;
    if not found then
      raise exception using errcode='40001',message='[push device] Account changed; read fresh state.';
    end if;
  end loop;
end;
$$;
revoke all on function private.lock_push_auth_users(uuid[]) from public,anon,authenticated,service_role;

create or replace function public.push_device_state(p_token text,p_expected_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare hashed bytea; generation uuid; caller uuid; auth_users uuid[];
begin
  caller:=private.push_device_caller(p_expected_user_id,true);
  hashed:=private.push_device_hash(p_token);
  auth_users:=private.push_device_auth_scope(array[caller],null,hashed);
  perform private.lock_push_auth_users(auth_users);
  insert into private.push_device_bindings(token_hash) values(hashed) on conflict(token_hash) do nothing;
  select binding_generation into generation from private.push_device_bindings where token_hash=hashed;
  return jsonb_build_object('binding_generation',generation);
exception when deadlock_detected then
  raise exception using errcode='40001',message='[push device] Concurrent ownership change; read fresh state.';
end;
$$;

create or replace function public.push_device_claim(
  p_token text,p_platform text,p_expected_binding_generation uuid,p_expected_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare caller uuid; hashed bytea; binding private.push_device_bindings%rowtype;
  registration public.push_tokens%rowtype; generation uuid; auth_users uuid[];
begin
  caller:=private.push_device_caller(p_expected_user_id,true);
  hashed:=private.push_device_hash(p_token);
  if p_platform is null or p_platform not in ('ios','android') or p_expected_binding_generation is null then
    raise exception using errcode='22023',message='[push device] Platform and observed binding generation are required.';
  end if;
  auth_users:=private.push_device_auth_scope(array[caller],null,hashed);
  perform private.lock_push_auth_users(auth_users);
  select * into binding from private.push_device_bindings where token_hash=hashed for update;
  if binding.token_hash is not null and binding.current_user_id is not null and not (binding.current_user_id=any(auth_users)) then
    raise exception using errcode='40001',message='[push device] Account scope changed; read fresh state.';
  end if;
  if binding.token_hash is null or binding.binding_generation is distinct from p_expected_binding_generation then
    raise exception using errcode='40001',message='[push device] Device ownership changed; read fresh state.';
  end if;
  -- Check again after a binding-lock wait. expected UID never supplies identity.
  perform private.push_device_caller(p_expected_user_id,true);
  insert into public.push_tokens(user_id,token,platform,updated_at)
    values(caller,p_token,p_platform,clock_timestamp())
    on conflict(user_id,token) do update set platform=excluded.platform,updated_at=excluded.updated_at
    returning * into registration;
  generation:=gen_random_uuid();
  update private.push_device_bindings set current_user_id=caller,token_id=registration.id,
    registration_generation=registration.registration_generation,binding_generation=generation,updated_at=clock_timestamp()
    where token_hash=hashed;
  return jsonb_build_object('user_id',caller,'token_id',registration.id,
    'registration_generation',registration.registration_generation,'binding_generation',generation);
exception when foreign_key_violation then
  raise exception using errcode='40001',message='[push device] Account changed during device registration.';
when deadlock_detected then
  raise exception using errcode='40001',message='[push device] Concurrent ownership change; read fresh state.';
end;
$$;

create or replace function public.push_device_release(
  p_token text,p_token_id uuid,p_registration_generation uuid,p_binding_generation uuid,p_expected_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare caller uuid; hashed bytea; binding private.push_device_bindings%rowtype; auth_users uuid[];
begin
  -- Cleanup may remain possible after own profile removal while Auth still
  -- verifies the token. It can neither bind nor discover a peer account.
  caller:=private.push_device_caller(p_expected_user_id,false);
  hashed:=private.push_device_hash(p_token);
  if p_token_id is null or p_registration_generation is null or p_binding_generation is null then
    raise exception using errcode='22023',message='[push device] Captured own device registration is required.';
  end if;
  auth_users:=private.push_device_auth_scope(array[caller],null,hashed);
  perform private.lock_push_auth_users(auth_users);
  select * into binding from private.push_device_bindings where token_hash=hashed for update;
  if binding.token_hash is not null and binding.current_user_id is not null and not (binding.current_user_id=any(auth_users)) then
    raise exception using errcode='40001',message='[push device] Account scope changed; read fresh state.';
  end if;
  if binding.token_hash is null or binding.current_user_id is distinct from caller or binding.token_id is distinct from p_token_id
    or binding.registration_generation is distinct from p_registration_generation
    or binding.binding_generation is distinct from p_binding_generation then
    return jsonb_build_object('user_id',caller,'released',false);
  end if;
  perform 1 from public.push_tokens where id=p_token_id and user_id=caller
    and registration_generation=p_registration_generation and token=p_token for update;
  delete from public.push_tokens where id=p_token_id and user_id=caller
    and registration_generation=p_registration_generation and token=p_token;
  update private.push_device_bindings set current_user_id=null,token_id=null,registration_generation=null,
    binding_generation=gen_random_uuid(),updated_at=clock_timestamp() where token_hash=hashed;
  return jsonb_build_object('user_id',caller,'released',true);
exception when deadlock_detected then
  raise exception using errcode='40001',message='[push device] Concurrent ownership change; cleanup unconfirmed.';
end;
$$;

create or replace function public.push_device_active_registrations(p_registrations jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare item jsonb; count_items integer; registrations jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode='42501',message='[push device] Service role is required.';
  end if;
  if p_registrations is null or jsonb_typeof(p_registrations)<>'array' then
    raise exception using errcode='22023',message='[push device] Registration array is required.';
  end if;
  count_items:=jsonb_array_length(p_registrations);
  if count_items>10000 then
    raise exception using errcode='22023',message='[push device] Registration array exceeds its bound.';
  end if;
  for item in select value from jsonb_array_elements(p_registrations) loop
    if jsonb_typeof(item) is distinct from 'object' then
      raise exception using errcode='22023',message='[push device] Registration object is required.';
    end if;
    if item-array['token_id','user_id','registration_generation']<>'{}'::jsonb
      or jsonb_typeof(item->'token_id') is distinct from 'string'
      or jsonb_typeof(item->'user_id') is distinct from 'string'
      or jsonb_typeof(item->'registration_generation') is distinct from 'string' then
      raise exception using errcode='22023',message='[push device] Invalid registration fields.';
    end if;
  end loop;
  if (select count(distinct(token_id,user_id,registration_generation)) from jsonb_to_recordset(p_registrations)
    as r(token_id uuid,user_id uuid,registration_generation uuid))<>count_items then
    raise exception using errcode='22023',message='[push device] Registration tuples must be unique.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('token_id',t.id,'user_id',t.user_id,
    'registration_generation',t.registration_generation) order by t.id),'[]'::jsonb) into registrations
  from jsonb_to_recordset(p_registrations) as r(token_id uuid,user_id uuid,registration_generation uuid)
  join public.push_tokens t on t.id=r.token_id and t.user_id=r.user_id and t.registration_generation=r.registration_generation
  join private.push_device_bindings b on b.token_hash=sha256(convert_to(t.token,'UTF8'))
    and b.current_user_id=t.user_id and b.token_id=t.id and b.registration_generation=t.registration_generation
  where exists(select 1 from public.profiles where id=t.user_id);
  return jsonb_build_object('registrations',registrations);
exception when invalid_text_representation then
  raise exception using errcode='22023',message='[push device] Invalid registration UUID.';
end;
$$;
revoke all on function public.push_device_state(text,uuid),public.push_device_claim(text,text,uuid,uuid),
  public.push_device_release(text,uuid,uuid,uuid,uuid),public.push_device_active_registrations(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.push_device_state(text,uuid),public.push_device_claim(text,text,uuid,uuid),
  public.push_device_release(text,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.push_device_active_registrations(jsonb) to service_role;

-- Auth parents precede ledger locks; canonical bindings precede token locks.
-- Discovery of an owner outside the already locked set rolls back. A raw legacy token write
-- cannot change bindings; its new registration_generation makes it inactive.
create or replace function private.lock_push_device_bindings(p_token_ids uuid[],p_write boolean,p_auth_users uuid[])
returns void language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare hashed bytea; owner_uid uuid;
begin
  for hashed in select distinct sha256(convert_to(token,'UTF8')) from public.push_tokens
    where id=any(p_token_ids) order by 1 loop
    if p_write then perform 1 from private.push_device_bindings where token_hash=hashed for update;
    else perform 1 from private.push_device_bindings where token_hash=hashed for share;
    end if;
    select current_user_id into owner_uid from private.push_device_bindings where token_hash=hashed;
    if owner_uid is not null and not (owner_uid=any(p_auth_users)) then
      raise exception using errcode='40001',message='[push receipts] Account scope changed; reservation unconfirmed.';
    end if;
  end loop;
end;
$$;
revoke all on function private.lock_push_device_bindings(uuid[],boolean,uuid[]) from public,anon,authenticated,service_role;

-- REV2: Auth-parent-first overlays; public API unchanged.
-- Exact additive receipt-function overlays; REV1 source hash is checked by builder.
create or replace function public.push_receipts_prepare(p_attempt_id uuid, p_registrations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare v_count integer; v_inserted integer; v_now timestamptz; v_item jsonb; v_registration record; auth_users uuid[]; token_ids uuid[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = '[push receipts] Service role is required.';
  end if;
  if p_attempt_id is null then
    raise exception using errcode = '22023', message = '[push receipts] Attempt ID is required.';
  end if;
  -- A persisted request identity is permanently consumed, even if recipients,
  -- ordering or registration generations have since changed. Never rearm it.
  if exists(select 1 from private.push_delivery_attempts where attempt_id = p_attempt_id) then
    return jsonb_build_object('attempt_id', p_attempt_id, 'started', false);
  end if;
  if p_registrations is null or jsonb_typeof(p_registrations) <> 'array' then
    raise exception using errcode = '22023', message = '[push receipts] Registrations must be an array.';
  end if;
  v_count := jsonb_array_length(p_registrations);
  if v_count > 10000 then
    raise exception using errcode = '22023', message = '[push receipts] Registration batch exceeds its bound.';
  end if;
  for v_item in select value from jsonb_array_elements(p_registrations) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using errcode = '22023', message = '[push receipts] Invalid registration object.';
    end if;
    if v_item - array['position','token_id','user_id','registration_generation'] <> '{}'::jsonb
      or jsonb_typeof(v_item->'position') is distinct from 'number'
      or jsonb_typeof(v_item->'token_id') is distinct from 'string'
      or jsonb_typeof(v_item->'user_id') is distinct from 'string'
      or jsonb_typeof(v_item->'registration_generation') is distinct from 'string' then
      raise exception using errcode = '22023', message = '[push receipts] Invalid registration fields.';
    end if;
  end loop;
  if (select count(distinct r.position) from jsonb_to_recordset(p_registrations)
      as r(position integer, token_id uuid, user_id uuid, registration_generation uuid)) <> v_count
    or exists(select 1 from jsonb_to_recordset(p_registrations)
      as r(position integer, token_id uuid, user_id uuid, registration_generation uuid)
      where r.position < 0 or r.position >= v_count)
    or (select count(distinct (r.token_id,r.registration_generation)) from jsonb_to_recordset(p_registrations)
      as r(position integer, token_id uuid, user_id uuid, registration_generation uuid)) <> v_count then
    raise exception using errcode = '22023', message = '[push receipts] Positions and registrations must be exact and unique.';
  end if;
  token_ids:=array(select token_id from jsonb_to_recordset(p_registrations)
    as r(position integer,token_id uuid,user_id uuid,registration_generation uuid));
  auth_users:=private.push_device_auth_scope(array(select user_id from jsonb_to_recordset(p_registrations)
    as r(position integer,token_id uuid,user_id uuid,registration_generation uuid)),token_ids,null);
  perform private.lock_push_auth_users(auth_users);
  -- The unique identity remains consumed; a failed new reservation rolls back.
  -- Auth locks precede this first ledger lock. A concurrent malformed duplicate
  -- may fail validation but can never start or rearm a send.
  v_now := clock_timestamp();
  insert into private.push_delivery_attempts(attempt_id,created_at,target_count)
  values(p_attempt_id,v_now,0) on conflict (attempt_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('attempt_id', p_attempt_id, 'started', false);
  end if;
  update private.push_delivery_attempts set target_count=v_count where attempt_id=p_attempt_id;
  perform private.lock_push_device_bindings(
    array(select token_id from jsonb_to_recordset(p_registrations)
      as r(position integer,token_id uuid,user_id uuid,registration_generation uuid)),false,auth_users);
  -- Canonical token lock order avoids swapped-input reservation deadlocks.
  for v_registration in select * from jsonb_to_recordset(p_registrations)
    as r(position integer, token_id uuid, user_id uuid, registration_generation uuid)
    order by r.token_id, r.registration_generation loop
    perform 1 from public.push_tokens t where t.id = v_registration.token_id
      and t.user_id = v_registration.user_id and t.registration_generation = v_registration.registration_generation
      for share;
    if not found then
      raise exception using errcode = '23514', message = '[push receipts] Registration snapshot no longer matches.';
    end if;
    if not exists(select 1 from private.push_device_bindings b join public.push_tokens t
      on b.token_hash=sha256(convert_to(t.token,'UTF8'))
      where t.id=v_registration.token_id and b.token_id=t.id and b.current_user_id=v_registration.user_id
        and b.registration_generation=v_registration.registration_generation
        and exists(select 1 from public.profiles where id=v_registration.user_id)) then
      raise exception using errcode='23514',message='[push receipts] Registration is not the active device owner.';
    end if;
    insert into private.push_delivery_tickets(attempt_id,position,token_id,user_id,registration_generation,expires_at)
    values(p_attempt_id,v_registration.position,v_registration.token_id,v_registration.user_id,
      v_registration.registration_generation,v_now + interval '24 hours');
  end loop;
  return jsonb_build_object('attempt_id', p_attempt_id, 'started', true);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = '[push receipts] Invalid registration value.';
when deadlock_detected then
  raise exception using errcode='40001',message='[push receipts] Concurrent registration change; acknowledgement unconfirmed.';
end;
$$;

create or replace function public.push_receipts_record_tickets(p_attempt_id uuid, p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare v_count integer; v_item jsonb; v_result record; v_ticket private.push_delivery_tickets%rowtype; v_now timestamptz; auth_users uuid[]; token_ids uuid[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = '[push receipts] Service role is required.';
  end if;
  if p_attempt_id is null or p_results is null or jsonb_typeof(p_results) <> 'array' then
    raise exception using errcode = '22023', message = '[push receipts] Attempt and ticket array are required.';
  end if;
  v_count := jsonb_array_length(p_results);
  if v_count not between 1 and 100 then
    raise exception using errcode = '22023', message = '[push receipts] Ticket batch must contain 1 to 100 results.';
  end if;
  for v_item in select value from jsonb_array_elements(p_results) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using errcode = '22023', message = '[push receipts] Invalid ticket object.';
    end if;
    if v_item - array['position','status','ticket_id','error_code'] <> '{}'::jsonb
      or jsonb_typeof(v_item->'position') is distinct from 'number'
      or jsonb_typeof(v_item->'status') is distinct from 'string'
      or coalesce(jsonb_typeof(v_item->'ticket_id'),'null') not in ('null','string')
      or coalesce(jsonb_typeof(v_item->'error_code'),'null') not in ('null','string') then
      raise exception using errcode = '22023', message = '[push receipts] Invalid ticket fields.';
    end if;
  end loop;
  if (select count(distinct position) from jsonb_to_recordset(p_results)
    as r(position integer,status text,ticket_id text,error_code text)) <> v_count then
    raise exception using errcode = '22023', message = '[push receipts] Ticket positions must be unique.';
  end if;
  -- Nonlocking discovery precedes all ledger row locks.
  select array_agg(token_id),array_agg(user_id) into token_ids,auth_users from private.push_delivery_tickets
    where attempt_id=p_attempt_id and position=any(array(select position from jsonb_to_recordset(p_results)
      as r(position integer,status text,ticket_id text,error_code text)));
  auth_users:=private.push_device_auth_scope(auth_users,token_ids,null);
  perform private.lock_push_auth_users(auth_users);
  perform 1 from private.push_delivery_attempts where attempt_id = p_attempt_id for update;
  if not found then
    raise exception using errcode = '23514', message = '[push receipts] Attempt was not reserved.';
  end if;
  perform 1 from private.push_delivery_tickets where attempt_id=p_attempt_id
    and position=any(array(select position from jsonb_to_recordset(p_results)
      as r(position integer,status text,ticket_id text,error_code text))) order by position for update;
  perform private.lock_push_device_bindings(array(select token_id from private.push_delivery_tickets
    where attempt_id=p_attempt_id and position=any(array(select position from jsonb_to_recordset(p_results)
      as r(position integer,status text,ticket_id text,error_code text)))),true,auth_users);
  for v_result in select * from jsonb_to_recordset(p_results)
    as r(position integer,status text,ticket_id text,error_code text) order by position loop
    if v_result.status is null or v_result.status not in ('accepted','ticket_error','unknown')
      or v_result.error_code is not null and v_result.error_code not in
        ('DeviceNotRegistered','MessageTooBig','MessageRateExceeded','MismatchSenderId','InvalidCredentials','Unknown')
      or v_result.status = 'accepted' and (v_result.ticket_id is null or length(btrim(v_result.ticket_id)) = 0
        or length(v_result.ticket_id) > 512 or v_result.error_code is not null)
      or v_result.status <> 'accepted' and v_result.ticket_id is not null
      or v_result.status = 'unknown' and v_result.error_code is not null then
      raise exception using errcode = '22023', message = '[push receipts] Invalid ticket outcome.';
    end if;
    select * into v_ticket from private.push_delivery_tickets
      where attempt_id = p_attempt_id and position = v_result.position for update;
    if not found then
      raise exception using errcode = '23514', message = '[push receipts] Ticket position was not reserved.';
    end if;
    if v_ticket.ticket_recorded_at is not null then
      if v_ticket.ticket_status is distinct from v_result.status or v_ticket.ticket_id is distinct from v_result.ticket_id
        or v_ticket.ticket_error_code is distinct from v_result.error_code then
        raise exception using errcode = '40001', message = '[push receipts] Ticket outcome conflicts with its frozen acknowledgement.';
      end if;
      continue;
    end if;
    v_now := clock_timestamp();
    update private.push_delivery_tickets set ticket_status=v_result.status,ticket_id=v_result.ticket_id,
      ticket_error_code=v_result.error_code,ticket_recorded_at=v_now,
      receipt_status=case when v_result.status='ticket_error' then null
        when v_now >= expires_at then 'expired_unknown'
        when v_result.status='accepted' then case when v_now+interval '15 minutes' < expires_at
          then 'pending' else 'expired_unknown' end else null end,
      next_check_at=case when v_result.status='accepted' and v_now + interval '15 minutes' < expires_at
        then v_now + interval '15 minutes' else null end
    where attempt_id=p_attempt_id and position=v_result.position;
    if v_result.status='ticket_error' and v_result.error_code='DeviceNotRegistered' then
      -- A terminal send ticket has no collector lease. NULL is intentional;
      -- cleanup still requires the exact original registration generation.
      perform private.retire_push_registration(v_ticket.token_id,v_ticket.user_id,v_ticket.registration_generation,null);
    end if;
  end loop;
  return jsonb_build_object('attempt_id',p_attempt_id,'recorded_count',v_count);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = '[push receipts] Invalid ticket value.';
when unique_violation then
  raise exception using errcode = '40001', message = '[push receipts] Ticket ID conflicts with an existing acknowledgement.';
when deadlock_detected then
  raise exception using errcode='40001',message='[push receipts] Concurrent registration change; acknowledgement unconfirmed.';
end;
$$;

create or replace function public.push_receipts_apply(p_lease_id uuid, p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare v_count integer; v_locked integer; v_item jsonb; v_result record; v_ticket private.push_delivery_tickets%rowtype;
  v_now timestamptz; v_ok integer:=0; v_error integer:=0; v_missing integer:=0; v_deleted integer:=0; auth_users uuid[]; token_ids uuid[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = '[push receipts] Service role is required.';
  end if;
  if p_lease_id is null or p_results is null or jsonb_typeof(p_results) <> 'array' then
    raise exception using errcode = '22023', message = '[push receipts] Lease and receipt array are required.';
  end if;
  v_count := jsonb_array_length(p_results);
  if v_count not between 1 and 1000 then
    raise exception using errcode = '22023', message = '[push receipts] Receipt batch must contain 1 to 1000 results.';
  end if;
  for v_item in select value from jsonb_array_elements(p_results) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using errcode = '22023', message = '[push receipts] Invalid receipt object.';
    end if;
    if v_item - array['attempt_id','position','ticket_id','status','error_code'] <> '{}'::jsonb
      or jsonb_typeof(v_item->'attempt_id') is distinct from 'string'
      or jsonb_typeof(v_item->'position') is distinct from 'number'
      or jsonb_typeof(v_item->'ticket_id') is distinct from 'string'
      or jsonb_typeof(v_item->'status') is distinct from 'string'
      or coalesce(jsonb_typeof(v_item->'error_code'),'null') not in ('null','string') then
      raise exception using errcode = '22023', message = '[push receipts] Invalid receipt fields.';
    end if;
  end loop;
  if (select count(distinct (attempt_id,position)) from jsonb_to_recordset(p_results)
    as r(attempt_id uuid,position integer,ticket_id text,status text,error_code text)) <> v_count then
    raise exception using errcode = '22023', message = '[push receipts] Receipt positions must be unique.';
  end if;
  -- Lease discovery is nonlocking. A missing Auth parent fails before
  -- acquiring any ledger, mapper or token row lock.
  select array_agg(token_id),array_agg(user_id) into token_ids,auth_users
    from private.push_delivery_tickets where lease_id=p_lease_id;
  auth_users:=private.push_device_auth_scope(auth_users,token_ids,null);
  perform private.lock_push_auth_users(auth_users);
  perform 1 from private.push_delivery_tickets where lease_id=p_lease_id order by attempt_id,position for update;
  get diagnostics v_locked=row_count;
  v_now:=clock_timestamp();
  if v_locked=0 or v_locked<>v_count or exists(select 1 from private.push_delivery_tickets where lease_id=p_lease_id
    and (lease_expires_at <= v_now or expires_at <= v_now)) then
    raise exception using errcode = '40001', message = '[push receipts] Lease is stale, expired or incomplete.';
  end if;
  perform private.lock_push_device_bindings(array(select token_id from private.push_delivery_tickets
    where lease_id=p_lease_id),true,auth_users);
  for v_result in select * from jsonb_to_recordset(p_results)
    as r(attempt_id uuid,position integer,ticket_id text,status text,error_code text) order by attempt_id,position loop
    if v_result.status is null or v_result.status not in ('receipt_ok','receipt_error','missing')
      or length(btrim(v_result.ticket_id))=0 or length(v_result.ticket_id)>512
      or v_result.error_code is not null and v_result.error_code not in
        ('DeviceNotRegistered','MessageTooBig','MessageRateExceeded','MismatchSenderId','InvalidCredentials','Unknown')
      or v_result.status <> 'receipt_error' and v_result.error_code is not null then
      raise exception using errcode = '22023', message = '[push receipts] Invalid receipt outcome.';
    end if;
    select * into v_ticket from private.push_delivery_tickets where attempt_id=v_result.attempt_id
      and position=v_result.position and lease_id=p_lease_id for update;
    v_now:=clock_timestamp();
    if not found or v_ticket.ticket_id is distinct from v_result.ticket_id or v_ticket.ticket_status<>'accepted'
      or v_ticket.receipt_status<>'pending' or v_ticket.lease_expires_at <= v_now or v_ticket.expires_at <= v_now then
      raise exception using errcode = '40001', message = '[push receipts] Receipt does not match its current claim.';
    end if;
    update private.push_delivery_tickets set receipt_status=case when v_result.status='missing'
        then case when v_now+interval '15 minutes' < expires_at then 'pending' else 'expired_unknown' end
        else v_result.status end,
      receipt_error_code=v_result.error_code,receipt_checked_at=v_now,
      next_check_at=case when v_result.status='missing' and v_now+interval '15 minutes' < expires_at
        then v_now+interval '15 minutes' else null end,
      lease_id=null,lease_worker_id=null,lease_expires_at=null
    where attempt_id=v_result.attempt_id and position=v_result.position;
    if v_result.status='receipt_ok' then v_ok:=v_ok+1;
    elsif v_result.status='receipt_error' then
      v_error:=v_error+1;
      if v_result.error_code='DeviceNotRegistered' then
        v_deleted:=v_deleted+private.retire_push_registration(v_ticket.token_id,v_ticket.user_id,
          v_ticket.registration_generation,v_ticket.lease_expires_at);
      end if;
    else v_missing:=v_missing+1;
    end if;
  end loop;
  return jsonb_build_object('lease_id',p_lease_id,'applied_count',v_count,'receipt_ok_count',v_ok,
    'receipt_error_count',v_error,'missing_count',v_missing,'deleted_token_count',v_deleted);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = '[push receipts] Invalid receipt value.';
when deadlock_detected then
  raise exception using errcode='40001',message='[push receipts] Concurrent registration change; acknowledgement unconfirmed.';
end;
$$;

create or replace function private.retire_push_registration(
  p_token_id uuid,p_user_id uuid,p_generation uuid,p_deadline timestamptz)
returns integer language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare hashed bytea; binding private.push_device_bindings%rowtype; matched boolean:=false; deleted integer;
begin
  select sha256(convert_to(token,'UTF8')) into hashed from public.push_tokens
    where id=p_token_id and user_id=p_user_id and registration_generation=p_generation;
  if found then
    select * into binding from private.push_device_bindings where token_hash=hashed for update;
    matched:=found and binding.current_user_id is not distinct from p_user_id
      and binding.token_id is not distinct from p_token_id and binding.registration_generation is not distinct from p_generation;
    if matched then
      perform 1 from public.push_tokens where id=p_token_id and user_id=p_user_id and registration_generation=p_generation for update;
      matched:=found;
    end if;
  end if;
  if p_deadline is not null and clock_timestamp()>=p_deadline then
    raise exception using errcode='40001',message='[push receipts] Lease deadline expired before token cleanup.';
  end if;
  if not matched then return 0; end if;
  delete from public.push_tokens where id=p_token_id and user_id=p_user_id and registration_generation=p_generation;
  get diagnostics deleted=row_count;
  if deleted=1 then
    update private.push_device_bindings set current_user_id=null,token_id=null,registration_generation=null,
      binding_generation=gen_random_uuid(),updated_at=clock_timestamp() where token_hash=hashed;
  end if;
  return deleted;
end;
$$;
revoke all on function private.retire_push_registration(uuid,uuid,uuid,timestamptz) from public,anon,authenticated,service_role;

commit;

-- Own exact-message read receipts; mirrors migration 20261007230000.
-- PROPOSED ONLY. Requires separate approval before any Hosted migration apply.
-- Exact observed message IDs; no timestamp prefix, history backfill or publication.
begin;

create table if not exists public.chat_message_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

-- Replay must not silently adopt a different pre-existing table/policy contract.
do $$
begin
  if (select count(*) from pg_catalog.pg_attribute
      where attrelid = 'public.chat_message_reads'::regclass and attnum > 0 and not attisdropped) <> 3
    or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.chat_message_reads'::regclass and attname = 'user_id' and atttypid = 'uuid'::regtype and attnotnull)
    or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.chat_message_reads'::regclass and attname = 'message_id' and atttypid = 'uuid'::regtype and attnotnull)
    or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.chat_message_reads'::regclass and attname = 'read_at' and atttypid = 'timestamptz'::regtype and attnotnull)
    or (select count(*) from pg_catalog.pg_constraint where conrelid = 'public.chat_message_reads'::regclass and contype = 'p' and pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id, message_id)') <> 1
    or (select count(*) from pg_catalog.pg_constraint where conrelid = 'public.chat_message_reads'::regclass and contype = 'f' and confdeltype = 'c'
        and ((confrelid = 'public.profiles'::regclass and pg_get_constraintdef(oid) = 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE')
          or (confrelid = 'public.messages'::regclass and pg_get_constraintdef(oid) = 'FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE'))) <> 2
    or exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.chat_message_reads'::regclass)
  then
    raise exception using errcode = '55000', message = '[chat read] Befintlig tabell matchar inte föreslagen läskvittens.';
  end if;
end;
$$;

alter table public.chat_message_reads enable row level security;
revoke all on table public.chat_message_reads from public, anon, authenticated, service_role;

create or replace function public.own_chat_read_state(
  expected_user_id uuid,
  target_conversation_id uuid,
  message_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare
  caller uuid := auth.uid();
  chat public.conversations%rowtype;
  requested uuid[];
  confirmed jsonb;
  known_read jsonb;
  unread jsonb;
begin
  -- PostgREST verifies the token. expected_user_id is only a client session fence.
  if caller is null or auth.role() is distinct from 'authenticated' or caller is distinct from expected_user_id then
    raise exception using errcode = '42501', message = '[chat read] Verifierat eget konto krävs.';
  end if;
  perform p.id from public.profiles p where p.id = caller for key share;
  if not found or not exists (
    select 1 from auth.users u where u.id = caller and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
  ) then
    raise exception using errcode = '42501', message = '[chat read] Aktivt eget konto krävs.';
  end if;
  select c.* into chat from public.conversations c where c.id = target_conversation_id for share;
  if not found then
    raise exception using errcode = '42501', message = '[chat read] Aktuell chattåtkomst krävs.';
  end if;
  if chat.is_group then
    perform sm.id from public.stable_members sm
      where sm.stable_id = chat.stable_id and sm.user_id = caller for key share;
  else
    perform cm.id from public.conversation_members cm
      where cm.conversation_id = chat.id and cm.user_id = caller for key share;
  end if;
  if not found then
    raise exception using errcode = '42501', message = '[chat read] Aktuell chattåtkomst krävs.';
  end if;
  if message_ids is null or array_position(message_ids, null) is not null then
    raise exception using errcode = '22023', message = '[chat read] Exakta meddelande-ID:n krävs.';
  end if;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into requested
    from (select distinct unnest(message_ids) as id) ids;
  perform m.id from public.messages m
    where m.id = any(requested) and m.conversation_id = chat.id
      and m.author_id is distinct from caller
      and not exists (select 1 from public.blocked_users b where b.blocker_user_id = caller and b.blocked_user_id = m.author_id)
    order by m.id for share;
  if exists (
    select 1 from unnest(requested) ids(id)
    where not exists (
      select 1 from public.messages m where m.id = ids.id and m.conversation_id = chat.id
        and m.author_id is distinct from caller
        and not exists (select 1 from public.blocked_users b where b.blocker_user_id = caller and b.blocked_user_id = m.author_id)
    )
  ) then
    raise exception using errcode = '42501', message = '[chat read] Meddelandena kunde inte verifieras i den här chatten.';
  end if;
  -- One statement/snapshot and one JSON value: no partial sets or REST row cap.
  -- Complete own read IDs classify delayed INSERTs outside loaded history too.
  select
    coalesce(jsonb_agg(m.id order by m.id) filter (where r.message_id is not null and m.id = any(requested)), '[]'::jsonb),
    coalesce(jsonb_agg(m.id order by m.id) filter (where r.message_id is not null), '[]'::jsonb),
    coalesce(jsonb_agg(m.id order by m.id) filter (where r.message_id is null), '[]'::jsonb)
    into confirmed, known_read, unread
    from public.messages m
    left join public.chat_message_reads r on r.user_id = caller and r.message_id = m.id
    where m.conversation_id = chat.id and m.author_id is distinct from caller
      and not exists (select 1 from public.blocked_users b where b.blocker_user_id = caller and b.blocked_user_id = m.author_id);
  return jsonb_build_object(
    'user_id', caller, 'conversation_id', chat.id, 'complete', true,
    'requested_message_ids', to_jsonb(requested), 'read_message_ids', confirmed,
    'known_read_message_ids', known_read, 'unread_message_ids', unread
  );
end;
$$;

create or replace function public.mark_chat_messages_read(
  expected_user_id uuid,
  target_conversation_id uuid,
  message_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare
  caller uuid := auth.uid();
begin
  -- Validate current identity, access and every requested peer ID before mutation.
  perform public.own_chat_read_state(expected_user_id, target_conversation_id, message_ids);
  insert into public.chat_message_reads(user_id, message_id)
    select caller, id from (select distinct unnest(message_ids) as id) ids
    on conflict (user_id, message_id) do nothing;
  -- Includes already-existing receipts on retry; never just INSERT RETURNING.
  return public.own_chat_read_state(expected_user_id, target_conversation_id, message_ids);
end;
$$;

revoke all on function public.own_chat_read_state(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.mark_chat_messages_read(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.own_chat_read_state(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.mark_chat_messages_read(uuid, uuid, uuid[]) to authenticated;

commit;

-- Social write quota; mirrors migration 20261008230000.
-- PROPOSAL ONLY. Values below require explicit approval before installation.
-- Separate first-write-anchored fixed 60-second windows per caller and feature.
-- This is not a sliding 'maximum N in any 60 seconds' contract.
-- Operational feeding, care, assignment and removal writes are unchanged.
create schema if not exists private;

create table private.social_write_limits (
  feature text primary key check (feature in ('posts', 'comments', 'likes', 'messages', 'alerts')),
  max_writes integer not null check (max_writes between 1 and 10000),
  window_seconds integer not null check (window_seconds between 1 and 3600)
);
insert into private.social_write_limits(feature, max_writes, window_seconds) values
  ('posts', 10, 60), ('comments', 30, 60), ('likes', 120, 60),
  ('messages', 60, 60), ('alerts', 20, 60);

create table private.social_write_counters (
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature text not null references private.social_write_limits(feature),
  window_started_at timestamptz not null,
  write_count integer not null check (write_count >= 0),
  primary key(user_id, feature)
);
alter table private.social_write_limits enable row level security;
alter table private.social_write_counters enable row level security;
revoke all on private.social_write_limits, private.social_write_counters from public, anon, authenticated, service_role;

create function private.check_social_write_limit()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$
declare
  caller uuid := auth.uid();
  feature_name text;
  row_author uuid;
  duplicate_row boolean := false;
  quota integer;
  period_seconds integer;
  started timestamptz;
  used integer;
  observed_now timestamptz;
  retry_seconds integer;
begin
  -- Trusted maintenance/notification functions remain outside client throttling.
  if auth.role() = 'service_role' or session_user = 'postgres' and auth.role() is null then
    return new;
  end if;
  if auth.role() is distinct from 'authenticated' or caller is null then
    raise sqlstate '42501' using message = 'social_write_auth_required';
  end if;
  if TG_TABLE_SCHEMA <> 'public' or TG_OP <> 'INSERT' then
    raise exception '[social rate limit] Unsupported write';
  end if;
  case TG_TABLE_NAME
    when 'posts' then
      feature_name := 'posts'; row_author := NEW.user_id;
    when 'comments' then
      feature_name := 'comments'; row_author := NEW.user_id;
    when 'likes' then
      feature_name := 'likes'; row_author := NEW.user_id;
    when 'messages' then
      feature_name := 'messages'; row_author := NEW.author_id;
    when 'stable_alerts' then
      feature_name := 'alerts'; row_author := NEW.created_by_user_id;
    when 'alerts' then
      -- The legacy events table has no author column. Server caller is authoritative;
      -- its existing stable-scoped INSERT RLS still decides whether the write is allowed.
      feature_name := 'alerts'; row_author := caller;
    else raise exception '[social rate limit] Unsupported feature';
  end case;
  if row_author is distinct from caller then
    raise sqlstate '42501' using message = 'social_write_auth_required';
  end if;
  -- Hold the existing own profile through commit, including legacy events without
  -- an author FK. Profile/Auth cascade cannot delete the counter between checks.
  perform 1 from public.profiles p where p.id = caller for key share;
  if not found or not exists (
    select 1 from auth.users u
    where u.id = caller and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= clock_timestamp())
  ) then
    raise sqlstate '42501' using message = 'social_write_auth_required';
  end if;
  select l.max_writes, l.window_seconds into quota, period_seconds
    from private.social_write_limits l where l.feature = feature_name;
  if not found then raise exception '[social rate limit] Missing configuration'; end if;
  insert into private.social_write_counters(user_id, feature, window_started_at, write_count)
    values(caller, feature_name, '-infinity', 0) on conflict do nothing;
  select c.window_started_at, c.write_count into started, used
    from private.social_write_counters c
    where c.user_id = caller and c.feature = feature_name for update;
  if not found then raise exception '[social rate limit] Missing counter'; end if;
  -- Hold the matching duplicate through unique-check; DELETE cannot turn retry into new write.
  -- Recheck only after the quota lock. A concurrent same-ID writer may have
  -- committed while this request waited. Keep the real 23505 receipt-recovery path.
  case TG_TABLE_NAME
    when 'posts' then
      perform 1 from public.posts p where p.id = NEW.id and p.user_id = caller for key share;
      duplicate_row := FOUND;
    when 'comments' then
      perform 1 from public.comments c where c.id = NEW.id and c.user_id = caller for key share;
      duplicate_row := FOUND;
    when 'likes' then
      perform 1 from public.likes l where l.post_id = NEW.post_id and l.user_id = caller for key share;
      duplicate_row := FOUND;
    when 'messages' then
      perform 1 from public.messages m where m.id = NEW.id and m.author_id = caller for key share;
      duplicate_row := FOUND;
    when 'stable_alerts' then
      perform 1 from public.stable_alerts a where a.id = NEW.id and a.created_by_user_id = caller for key share;
      duplicate_row := FOUND;
    when 'alerts' then
      perform 1 from public.alerts a where a.id = NEW.id and a.stable_id = NEW.stable_id
        and public.can_manage_day_events(a.stable_id) for key share;
      duplicate_row := FOUND;
  end case;
  if duplicate_row then return new; end if;
  -- Observe server time after the row lock: waiting requests cannot rewind a window.
  observed_now := clock_timestamp();
  if observed_now >= started + make_interval(secs => period_seconds) then
    started := observed_now; used := 0;
  end if;
  if used >= quota then
    retry_seconds := greatest(1, ceil(extract(epoch from started + make_interval(secs => period_seconds) - observed_now))::integer);
    raise log '[social rate limit] Rejected % write', feature_name;
    raise sqlstate 'PT429' using message = 'social_rate_limited',
      detail = json_build_object('feature', feature_name, 'retry_seconds', retry_seconds)::text;
  end if;
  update private.social_write_counters set window_started_at = started, write_count = used + 1
    where user_id = caller and feature = feature_name;
  return new;
end;
$$;
revoke all on function private.check_social_write_limit() from public, anon, authenticated, service_role;

create trigger social_write_limit_posts before insert on public.posts for each row execute function private.check_social_write_limit();
create trigger social_write_limit_comments before insert on public.comments for each row execute function private.check_social_write_limit();
create trigger social_write_limit_likes before insert on public.likes for each row execute function private.check_social_write_limit();
create trigger social_write_limit_messages before insert on public.messages for each row execute function private.check_social_write_limit();
create trigger social_write_limit_alerts before insert on public.stable_alerts for each row execute function private.check_social_write_limit();
create trigger social_write_limit_legacy_alerts before insert on public.alerts for each row execute function private.check_social_write_limit();

-- Proposed account deletion contract; exact migration mirror.
-- PROPOSED ONLY. Requires explicit approval for this exact schema/RLS scope.
-- Keeps auth.admin.deleteUser; no direct Auth writes and no Storage blob deletion.
begin;

-- Read managed Auth status fields only after their reviewed shape is present.
-- No Auth column/schema is created or changed by this proposal.
do $auth_shape$
begin
  if (select count(*) from pg_catalog.pg_attribute
      where attrelid='auth.users'::regclass and attname in ('deleted_at','banned_until')
        and not attisdropped and atttypid='timestamptz'::regtype) <> 2 then
    raise exception using errcode='55000', message='[account delete] Auth status columns saknas eller avviker; avbryt.';
  end if;
end
$auth_shape$;

-- Validate the missing live creator FK instead of accepting dangling farms.
do $farm_fk$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.farms'::regclass and conname='farms_account_owner_fkey') then
    alter table public.farms add constraint farms_account_owner_fkey
      foreign key (created_by) references public.profiles(id) on delete restrict not valid;
  elsif not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid='public.farms'::regclass and conname='farms_account_owner_fkey'
      and contype='f' and confrelid='public.profiles'::regclass and confdeltype='r'
      and conkey=array[(select attnum from pg_catalog.pg_attribute where attrelid='public.farms'::regclass and attname='created_by')]::smallint[]
      and confkey=array[(select attnum from pg_catalog.pg_attribute where attrelid='public.profiles'::regclass and attname='id')]::smallint[]
  ) then
    raise exception using errcode='55000', message='[account delete] farms_account_owner_fkey avviker; avbryt.';
  end if;
end
$farm_fk$;
alter table public.farms validate constraint farms_account_owner_fkey;

-- One immutable selected owner per pending deletion. A delayed Auth request
-- must never consume a different owner's replacement plan. No automatic expiry.
create table if not exists public.account_deletion_intents (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  replacement_user_id uuid,
  created_at timestamptz not null default now()
);
alter table public.account_deletion_intents enable row level security;
revoke all on public.account_deletion_intents from public, anon, authenticated, service_role;

-- This is a targeted stale-UID gate, not JWT revocation. Existing permissive
-- Storage/invite policies remain in place. Public buckets remain public.
create or replace function public.account_is_active()
returns boolean language sql stable security definer
set search_path=pg_catalog set row_security=off
as $function$
  select exists(select 1 from public.profiles where id=auth.uid())
    and not exists(select 1 from public.account_deletion_intents where user_id=auth.uid());
$function$;
alter function public.account_is_active() owner to postgres;
revoke all on function public.account_is_active() from public, anon, authenticated, service_role;
grant execute on function public.account_is_active() to authenticated;

-- Serialize Storage INSERT with preparation's profile FOR UPDATE lock. A write
-- already in flight completes first and is then seen by the ownership check;
-- a subsequent write sees the committed deletion intent and is denied.
create or replace function public.account_can_upload()
returns boolean language plpgsql volatile security definer
set search_path=pg_catalog set row_security=off
as $function$
begin
  perform 1 from public.profiles where id=auth.uid() for key share;
  if not found then return false; end if;
  return not exists(select 1 from public.account_deletion_intents where user_id=auth.uid());
end
$function$;
alter function public.account_can_upload() owner to postgres;
revoke all on function public.account_can_upload() from public, anon, authenticated, service_role;
grant execute on function public.account_can_upload() to authenticated;

drop policy if exists account_active_gate on storage.objects;
create policy account_active_gate on storage.objects as restrictive for all to authenticated
  using (public.account_is_active()) with check (public.account_is_active());
drop policy if exists account_upload_gate on storage.objects;
create policy account_upload_gate on storage.objects as restrictive for insert to authenticated
  with check (public.account_can_upload());
drop policy if exists account_active_gate on public.stable_invites;
create policy account_active_gate on public.stable_invites as restrictive for all to authenticated
  using (public.account_is_active()) with check (public.account_is_active());

create or replace function public.assert_account_deletion(p_user_id uuid, p_replacement_user_id uuid)
returns void language plpgsql volatile security definer
set search_path=pg_catalog set row_security=off
as $function$
declare affected record;
begin
  -- Never delete Storage metadata or pretend its bytes were deleted. Unknown
  -- legacy media attribution also fails closed pending a reviewed file plan.
  if exists(select 1 from storage.objects where owner=p_user_id or owner_id=p_user_id::text)
    or exists(select 1 from public.profiles where id=p_user_id and nullif(avatar_url,'') is not null)
    or exists(select 1 from public.posts where user_id=p_user_id and nullif(image_url,'') is not null) then
    raise exception using errcode='P0001', message='[account delete] storage_blocked';
  end if;
  if p_replacement_user_id=p_user_id then
    raise exception using errcode='P0001', message='[account delete] owner_invalid';
  end if;
  if p_replacement_user_id is not null then
    perform 1 from auth.users where id=p_replacement_user_id
      and deleted_at is null and coalesce(banned_until,'-infinity'::timestamptz) <= now() for share;
    if not found then raise exception using errcode='P0001', message='[account delete] owner_invalid'; end if;
    perform 1 from public.profiles where id=p_replacement_user_id for key share;
    if not found or exists(select 1 from public.account_deletion_intents where user_id=p_replacement_user_id) then
      raise exception using errcode='P0001', message='[account delete] owner_invalid';
    end if;
  end if;

  -- Lock farms first: no concurrent FK link can add another stable to their
  -- management scope while the selected owner's permissions are being checked.
  perform 1 from public.farms where created_by=p_user_id order by id for update;
  if found and p_replacement_user_id is null then
    raise exception using errcode='P0001', message='[account delete] owner_required';
  end if;
  for affected in
    select s.id from public.stables s
    where s.created_by=p_user_id
      or exists(select 1 from public.stable_members m where m.stable_id=s.id and m.user_id=p_user_id and m.role='admin' and m.access='owner')
      or exists(select 1 from public.farms f where f.id=s.farm_id and f.created_by=p_user_id)
    order by s.id
  loop
    if p_replacement_user_id is null then
      raise exception using errcode='P0001', message='[account delete] owner_required';
    end if;
    -- Same serialization write as the existing last-owner guard; a stale
    -- Repeatable Read snapshot fails instead of accepting old owner metadata.
    update public.stables set created_at=created_at where id=affected.id;
    perform 1 from public.stable_members
      where stable_id=affected.id and user_id=p_replacement_user_id and role='admin' and access='owner'
      for update;
    if not found then
      raise exception using errcode='P0001', message='[account delete] owner_invalid';
    end if;
  end loop;
end
$function$;
alter function public.assert_account_deletion(uuid,uuid) owner to postgres;
revoke all on function public.assert_account_deletion(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function public.prepare_account_deletion(p_user_id uuid, p_replacement_user_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog set row_security=off
as $function$
declare existing_owner uuid;
begin
  -- Service-role endpoint supplies a getUser-verified UID, never raw client UID.
  perform 1 from auth.users where id=p_user_id for key share;
  if not found then raise exception using errcode='P0001', message='[account delete] account_changed'; end if;
  perform 1 from public.profiles where id=p_user_id for update;
  if not found then raise exception using errcode='P0001', message='[account delete] account_changed'; end if;
  select replacement_user_id into existing_owner from public.account_deletion_intents where user_id=p_user_id;
  if found and existing_owner is distinct from p_replacement_user_id then
    raise exception using errcode='P0001', message='[account delete] deletion_in_progress';
  end if;
  perform public.assert_account_deletion(p_user_id,p_replacement_user_id);
  insert into public.account_deletion_intents(user_id,replacement_user_id)
    values(p_user_id,p_replacement_user_id) on conflict(user_id) do nothing;
  return jsonb_build_object('prepared',true,'user_id',p_user_id,'replacement_user_id',p_replacement_user_id);
end
$function$;
alter function public.prepare_account_deletion(uuid,uuid) owner to postgres;
revoke all on function public.prepare_account_deletion(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.prepare_account_deletion(uuid,uuid) to service_role;

create or replace function public.apply_account_deletion()
returns trigger language plpgsql volatile security definer
set search_path=pg_catalog set row_security=off
as $function$
declare replacement_id uuid;
begin
  -- Direct profile-only deletion cannot masquerade as an Auth account deletion.
  if exists(select 1 from auth.users where id=old.id) then
    raise exception using errcode='P0001', message='[account delete] auth_cascade_required';
  end if;
  select replacement_user_id into replacement_id from public.account_deletion_intents where user_id=old.id;
  if not found then raise exception using errcode='P0001', message='[account delete] preparation_required'; end if;
  perform public.assert_account_deletion(old.id,replacement_id);
  update public.stables set created_by=replacement_id where created_by=old.id;
  update public.farms set created_by=replacement_id where created_by=old.id;

  -- Leave the thread ID and everyone else's replies/likes intact. Remove the
  -- author's text/media references BEFORE deployed user_id CASCADE executes.
  update public.posts set user_id=null,caption=null,content=null,image_url=null where user_id=old.id;
  delete from public.comments where user_id=old.id;
  delete from public.messages where author_id=old.id;
  return old;
end
$function$;
alter function public.apply_account_deletion() owner to postgres;
revoke all on function public.apply_account_deletion() from public, anon, authenticated, service_role;
drop trigger if exists apply_account_deletion on public.profiles;
create trigger apply_account_deletion before delete on public.profiles
  for each row execute function public.apply_account_deletion();
commit;

-- Proposed own deletion receipt; exact migration mirror.
-- PROPOSED ONLY: separate exact schema approval required after the first proposal.
-- One own-account receipt function. No intent reset, new table, policy or Auth write.
begin;
do $dependencies$
begin
  if to_regclass('public.account_deletion_intents') is null
    or to_regprocedure('public.prepare_account_deletion(uuid,uuid)') is null then
    raise exception using errcode='55000', message='[account delete status] Granskad kontoraderingsförberedelse saknas; avbryt.';
  end if;
end
$dependencies$;

create or replace function public.own_account_deletion_status()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog set row_security=off
as $function$
declare caller uuid := auth.uid();
begin
  if caller is null or coalesce(auth.role(),'') <> 'authenticated' then
    raise exception using errcode='42501', message='[account delete status] Verifierad egen JWT-identitet krävs.';
  end if;
  -- One statement snapshot, no row locks or mutations. A still-valid JWT may
  -- read its own removal receipt even after its Auth user/profile was removed.
  -- It does not grant access to app content or inspect any other user's receipt.
  return (
    with affected_stables as materialized (
      -- Exactly assert_account_deletion's creator/farm/owner-membership scope.
      select s.id from public.stables s
      where s.created_by=caller
        or exists(select 1 from public.stable_members m where m.stable_id=s.id and m.user_id=caller and m.role='admin' and m.access='owner')
        or exists(select 1 from public.farms f where f.id=s.farm_id and f.created_by=caller)
    ), own_scope as (
      select exists(select 1 from public.farms where created_by=caller)
          or exists(select 1 from affected_stables) as requires_owner,
        (select count(*) from affected_stables) as affected_stable_count
    ), candidate_ids as (
      select distinct m.user_id from public.stable_members m
      join affected_stables s on s.id=m.stable_id
      where m.role='admin' and m.access='owner' and m.user_id<>caller
    ), eligible_owners as (
      -- No global directory when affected_stables is empty. Only active owners
      -- already in every affected stable; expose just UID and display name.
      select p.id, coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.username),''),'Ägare utan visningsnamn') as display_name
      from candidate_ids c join public.profiles p on p.id=c.user_id
      join auth.users u on u.id=p.id
      where u.deleted_at is null and coalesce(u.banned_until,'-infinity'::timestamptz)<=now()
        and not exists(select 1 from public.account_deletion_intents where user_id=p.id)
        and not exists(select 1 from affected_stables s where not exists(
          select 1 from public.stable_members m
          where m.stable_id=s.id and m.user_id=p.id and m.role='admin' and m.access='owner'))
    ), receipt as (
      select exists(select 1 from auth.users where id=caller) as auth_present,
        exists(select 1 from public.profiles where id=caller) as profile_present,
        i.user_id is not null as pending,
        i.replacement_user_id, i.created_at
      from (values(1)) as one(n)
      left join public.account_deletion_intents i on i.user_id=caller
    )
    select jsonb_build_object(
      'user_id',caller,
      'status',case
        when not auth_present and not profile_present and not pending then 'deleted'
        when auth_present and profile_present and pending then 'pending'
        when auth_present and profile_present and not pending then 'not_started'
        else 'unconfirmed' end,
      'auth_present',auth_present,'profile_present',profile_present,
      'requires_owner',auth_present and profile_present and own_scope.requires_owner,
      'affected_stable_count',case when auth_present and profile_present then own_scope.affected_stable_count else 0 end,
      'replacement_owners',case when auth_present and profile_present then coalesce(
        (select jsonb_agg(jsonb_build_object('user_id',id,'display_name',display_name) order by display_name,id) from eligible_owners),
        '[]'::jsonb) else '[]'::jsonb end,
      'replacement_user_id',case when pending then replacement_user_id else null end,
      'prepared_at',case when pending then created_at else null end
    ) from receipt cross join own_scope
  );
end
$function$;
alter function public.own_account_deletion_status() owner to postgres;
revoke all on function public.own_account_deletion_status() from public, anon, authenticated, service_role;
grant execute on function public.own_account_deletion_status() to authenticated;
notify pgrst, 'reload schema';
commit;
