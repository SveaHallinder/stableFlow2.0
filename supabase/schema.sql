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
  v_url := nullif(current_setting('app.settings.supabase_url', true), '');
  if v_url is null then
    begin
      select nullif(decrypted_secret, '') into v_url
      from vault.decrypted_secrets where name = 'supabase_url' limit 1;
    exception when others then
      v_url := null;
    end;
  end if;
  if v_url is not null then
    v_url := v_url || '/functions/v1/send-push-notification';
  end if;

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
    raise warning '[push notify] Project URL or service key is missing; no push request was queued';
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

-- Proposal only. Create private horse/paddock buckets and narrow existing Storage access.
begin;
do $preflight$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null
    or to_regprocedure('public.account_is_active()') is null
    or to_regprocedure('public.is_stable_member(uuid)') is null
    or to_regprocedure('public.can_edit_stable(uuid)') is null then
    raise exception using errcode='P0001',message='[private images] required Storage or account scope is missing';
  end if;
  if exists(select 1 from storage.buckets where id in ('avatars','paddocks')
    and (public is distinct from false or name is distinct from id)) then
    raise exception using errcode='P0001',message='[private images] existing bucket configuration differs';
  end if;
end
$preflight$;

insert into storage.buckets(id,name,public) values('avatars','avatars',false),('paddocks','paddocks',false)
  on conflict(id) do nothing;

create or replace function public.stable_image_scope(p_bucket text,p_path text,p_edit boolean)
returns boolean language plpgsql stable security definer
set search_path=pg_catalog set row_security=off
as $function$
declare stable_id uuid;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated' or not public.account_is_active()
    or not exists(select 1 from auth.users u where u.id=auth.uid() and u.deleted_at is null
      and coalesce(u.banned_until,'-infinity'::timestamptz)<=now())
    or p_bucket is null or p_bucket not in ('avatars','paddocks') or p_path is null
    or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][a-zA-Z0-9]+$'
    or p_edit is null then return false; end if;
  stable_id:=split_part(p_path,'/',1)::uuid;
  if p_edit then return public.can_edit_stable(stable_id); end if;
  return public.is_stable_member(stable_id);
end
$function$;
alter function public.stable_image_scope(text,text,boolean) owner to postgres;
revoke all on function public.stable_image_scope(text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.stable_image_scope(text,text,boolean) to authenticated;

-- All other bucket rows retain their existing policies, including legacy NULL bucket values.
drop policy if exists stable_images_read_gate on storage.objects;
create policy stable_images_read_gate on storage.objects as restrictive for select to authenticated
  using ((bucket_id is distinct from 'avatars' and bucket_id is distinct from 'paddocks')
    or public.stable_image_scope(bucket_id,name,false));
drop policy if exists stable_images_insert_gate on storage.objects;
create policy stable_images_insert_gate on storage.objects as restrictive for insert to authenticated
  with check ((bucket_id is distinct from 'avatars' and bucket_id is distinct from 'paddocks')
    or (public.stable_image_scope(bucket_id,name,true) and owner_id=auth.uid()::text and (owner is null or owner=auth.uid())));
drop policy if exists stable_images_delete_gate on storage.objects;
create policy stable_images_delete_gate on storage.objects as restrictive for delete to authenticated
  using ((bucket_id is distinct from 'avatars' and bucket_id is distinct from 'paddocks')
    or (public.stable_image_scope(bucket_id,name,true)
      and (owner_id=auth.uid()::text or owner_id is null and owner=auth.uid()) and (owner is null or owner=auth.uid())));

-- Preserve all permissive grants and account/media restrictives. No new UPDATE or DELETE grant.
-- New files use upsert:false. Modern owner_id-only deletion in the account plan uses service-role Storage SDK.
commit;

-- PROPOSAL ONLY. Uses Storage API for bytes; never UPDATE/DELETE Storage metadata.
-- Core account deletion/17 push functions are dependencies, not replacements.
begin;
do $precondition$
begin
  if to_regprocedure('public.prepare_account_deletion(uuid,uuid)') is null
    or to_regprocedure('public.own_account_deletion_status()') is null
    or to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise exception using errcode='55000',message='[account media] prerequisites_missing';
  end if;
end
$precondition$;

create table private.account_media_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  replacement_user_id uuid,
  plan_generation uuid not null unique,
  used_generations uuid[] not null,
  last_expected_generation uuid,
  last_expected_owner uuid,
  project_url text not null,
  stable_ids uuid[] not null,
  farm_ids uuid[] not null,
  created_at timestamptz not null default now()
);
create table private.account_media_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references private.account_media_plans(id) on delete cascade,
  kind text not null check(kind in ('post','avatar','shared','unused')),
  stable_id uuid,
  bucket_id text not null,
  source_id uuid not null,
  source_path text not null,
  source_version text not null,
  source_metadata jsonb not null,
  source_updated_at timestamptz not null,
  refs jsonb not null,
  destination_path text,
  destination_id uuid,
  destination_version text,
  destination_metadata jsonb,
  state text not null default 'frozen' check(state in ('frozen','copy_pending','copied','remove_pending','removed')),
  unique(bucket_id,source_path),
  check((kind='shared') = (destination_path is not null))
);
-- Opaque permanent ABA fence. No UID, raw path or Auth FK; no automatic expiry.
-- Removal of A/profile/plan must not let a delayed path-only DELETE hit a new B file.
create table private.account_media_retired_paths (
  path_hash bytea primary key check(octet_length(path_hash)=32),
  reference_hash bytea not null check(octet_length(reference_hash)=32),
  retired_at timestamptz not null default now()
);
alter table private.account_media_plans enable row level security;
alter table private.account_media_items enable row level security;
alter table private.account_media_retired_paths enable row level security;
revoke all on private.account_media_plans,private.account_media_items,private.account_media_retired_paths from public,anon,authenticated,service_role;

-- Reference namespace closes new-row reference races before immutable preparation/retirement.
create function private.account_media_reference_key(p_value text)
returns bigint language sql immutable set search_path=pg_catalog
as $f$
 select ('x'||substr(encode(sha256(convert_to('[account media reference]/'||p_value,'UTF8')),'hex'),1,16))::bit(64)::bigint;
$f$;
create function private.account_media_refs(p_bucket text,p_path text,p_url text)
returns jsonb language sql stable security definer set search_path=pg_catalog set row_security=off
as $f$
 select coalesce(jsonb_agg(to_jsonb(r) order by r.kind,r.id),'[]'::jsonb) from (
   select 'avatar'::text kind,id,null::uuid stable_id,id author_id,avatar_url value from public.profiles
     where avatar_url=p_url||'/storage/v1/object/public/'||p_bucket||'/'||p_path
   union all select 'post',id,stable_id,user_id,image_url from public.posts
     where p_bucket='posts' and image_url=p_path
   union all select 'horse',id,stable_id,null::uuid,image_url from public.horses
     where image_url=p_url||'/storage/v1/object/public/'||p_bucket||'/'||p_path
   union all select 'paddock',id,stable_id,null::uuid,image_url from public.paddocks
     where image_url=p_url||'/storage/v1/object/public/'||p_bucket||'/'||p_path
 ) r;
$f$;
create function private.account_media_metadata_complete(p_version text,p_metadata jsonb,p_updated_at timestamptz)
returns boolean language sql immutable set search_path=pg_catalog
as $f$
 select coalesce(p_updated_at is not null and p_version is not null and btrim(p_version)=p_version and length(p_version)>0
   and jsonb_typeof(p_metadata)='object' and jsonb_typeof(p_metadata->'eTag')='string' and length(p_metadata->>'eTag')>0
   and jsonb_typeof(p_metadata->'size')='number' and (p_metadata->>'size')::numeric>=0
   and jsonb_typeof(p_metadata->'mimetype')='string' and p_metadata->>'mimetype' like 'image/%',false);
$f$;
create function private.account_media_inventory(p_user uuid,p_url text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog set row_security=off
as $f$
declare o record; refs jsonb; kind text; stable_id uuid; entries jsonb:='[]'; unknown_count integer:=0; parts uuid[];
begin
 if p_url !~ '^https://[a-z0-9]+[.]supabase[.]co$' then
   raise exception using errcode='22023',message='[account media] invalid_project_url';
 end if;
 for o in select * from storage.objects where owner=p_user or owner_id=p_user::text order by id loop
   kind:=null; stable_id:=null; refs:=private.account_media_refs(o.bucket_id,o.name,p_url);
   if o.bucket_id is not null and o.name is not null and o.owner_id=p_user::text and (o.owner is null or o.owner=p_user)
     and private.account_media_metadata_complete(o.version,o.metadata,o.updated_at)
     and exists(select 1 from storage.buckets b where b.id=o.bucket_id) then
     -- Exact current uploader grammar. URLs, raw legacy names and mismatched refs are unknown.
     if o.bucket_id='posts' and o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][a-zA-Z0-9]+$' then
       begin parts:=array[(string_to_array(o.name,'/'))[1]::uuid,(string_to_array(o.name,'/'))[2]::uuid,(string_to_array(o.name,'/'))[3]::uuid];
       exception when invalid_text_representation then parts:=null; end;
       if parts[2]=p_user and not exists(select 1 from jsonb_array_elements(refs) r
         where r->>'kind'<>'post' or r->>'author_id' is distinct from p_user::text
           or r->>'stable_id' is distinct from parts[1]::text or r->>'id' is distinct from parts[3]::text) then
         kind:='post'; stable_id:=parts[1];
       end if;
     elsif o.bucket_id in ('avatars','paddocks') and o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][a-zA-Z0-9]+$'
       and exists(select 1 from storage.buckets b where b.id=o.bucket_id) then
       begin stable_id:=(string_to_array(o.name,'/'))[1]::uuid;
       exception when invalid_text_representation then stable_id:=null; end;
       if jsonb_array_length(refs)=0 and stable_id is not null then kind:='unused';
       elsif stable_id is not null and not exists(select 1 from jsonb_array_elements(refs) r
         where (r->>'kind'='horse' and o.bucket_id='avatars' or r->>'kind'='paddock' and o.bucket_id='paddocks') is not true
           or r->>'stable_id' is distinct from stable_id::text) then kind:='shared';
       elsif o.bucket_id='avatars' and not exists(select 1 from jsonb_array_elements(refs) r
         where r->>'kind'<>'avatar' or r->>'id' is distinct from p_user::text) then kind:='avatar'; end if;
     end if;
   end if;
   if kind is null then unknown_count:=unknown_count+1; else
     entries:=entries||jsonb_build_array(jsonb_build_object('source_id',o.id,'bucket_id',o.bucket_id,'source_path',o.name,
       'source_version',o.version,'source_metadata',o.metadata,'source_updated_at',o.updated_at,'kind',kind,'stable_id',stable_id,'refs',refs));
   end if;
 end loop;
 -- A's external/legacy/unowned image reference never authorizes deletion of somebody else's object.
 unknown_count:=unknown_count+(select count(*) from (
   select 'avatar' kind,id from public.profiles where id=p_user and nullif(avatar_url,'') is not null
   union all select 'post',id from public.posts where user_id=p_user and nullif(image_url,'') is not null
 ) r where not exists(select 1 from jsonb_array_elements(entries) e,jsonb_array_elements(e->'refs') x
   where x->>'kind'=r.kind and x->>'id'=r.id::text));
 return jsonb_build_object('entries',entries,'blocked_count',unknown_count,'complete',true);
end
$f$;
create function private.account_media_scope(p_user uuid,p_entries jsonb)
returns uuid[] language sql stable security definer set search_path=pg_catalog set row_security=off
as $f$
 select coalesce(array_agg(id order by id),'{}'::uuid[]) from (
   select s.id from public.stables s where s.created_by=p_user
     or exists(select 1 from public.stable_members m where m.stable_id=s.id and m.user_id=p_user and m.role='admin' and m.access='owner')
     or exists(select 1 from public.farms f where f.id=s.farm_id and f.created_by=p_user)
   union select (e->>'stable_id')::uuid from jsonb_array_elements(p_entries) e where e->>'kind'='shared'
 ) scope;
$f$;
create function private.account_media_owners(p_user uuid,p_stables uuid[])
returns jsonb language sql stable security definer set search_path=pg_catalog set row_security=off
as $f$
 select coalesce(jsonb_agg(jsonb_build_object('user_id',p.id,'display_name',coalesce(nullif(p.username,''),'Medlem')) order by p.id),'[]')
 from public.profiles p join auth.users u on u.id=p.id where cardinality(p_stables)>0 and p.id<>p_user
   and u.deleted_at is null and coalesce(u.banned_until,'-infinity'::timestamptz)<=now()
   and not exists(select 1 from public.account_deletion_intents i where i.user_id=p.id)
   and exists(select 1 from public.stable_members m where m.user_id=p.id and m.stable_id=any(p_stables) and m.role='admin' and m.access='owner')
   and not exists(select 1 from unnest(p_stables) s(id) where not exists(select 1 from public.stable_members m
     where m.user_id=p.id and m.stable_id=s.id and m.role='admin' and m.access='owner'));
$f$;
create function private.account_media_lock(p_user uuid,p_owner uuid,p_stables uuid[],p_farms uuid[])
returns void language plpgsql volatile security definer set search_path=pg_catalog set row_security=off
as $f$
declare who uuid;
begin
 -- Auth before profile/operational/ledger/Storage locks. Recheck status after waits.
 for who in select distinct id from unnest(array[p_user,p_owner]) x(id) where id is not null order by id loop
   perform 1 from auth.users where id=who for share;
   if not found then raise exception using errcode='P0001',message='[account media] account_changed'; end if;
 end loop;
 perform 1 from public.profiles where id=any(array[p_user,p_owner]) order by id for update;
 if not exists(select 1 from public.profiles where id=p_user)
   or exists(select 1 from auth.users where id=any(array[p_user,p_owner]) and (deleted_at is not null or coalesce(banned_until,'-infinity'::timestamptz)>now())) then
   raise exception using errcode='P0001',message='[account media] account_changed';
 end if;
 if p_owner=p_user or (cardinality(p_stables)>0 or cardinality(p_farms)>0) and p_owner is null then
   raise exception using errcode='P0001',message='[account media] owner_required';
 end if;
 if p_owner is not null and (not exists(select 1 from public.profiles where id=p_owner)
   or exists(select 1 from public.account_deletion_intents where user_id=p_owner)) then
   raise exception using errcode='P0001',message='[account media] owner_invalid';
 end if;
 perform 1 from public.farms where id=any(p_farms) order by id for update;
 perform 1 from public.stables where id=any(p_stables) order by id for update;
 perform 1 from public.stable_members where user_id=p_owner and stable_id=any(p_stables) order by stable_id,id for update;
 if exists(select 1 from unnest(p_stables) s(id) where not exists(select 1 from public.stables where id=s.id)
   or not exists(select 1 from public.stable_members where stable_id=s.id and user_id=p_owner and role='admin' and access='owner')) then
   raise exception using errcode='P0001',message='[account media] owner_invalid';
 end if;
 if (select coalesce(array_agg(id order by id),'{}'::uuid[]) from public.farms where created_by=p_user) is distinct from p_farms then
   raise exception using errcode='40001',message='[account media] scope_changed';
 end if;
end
$f$;
create function private.account_media_summary(p_plan uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog set row_security=off
as $f$
 select jsonb_build_object('plan_id',p.id,'plan_generation',p.plan_generation,'replacement_user_id',p.replacement_user_id,
   'reselect_allowed',count(i.id)>0 and count(*) filter(where i.state<>'frozen')=0,
   'reselect_blocked_reason',case when count(i.id)>0 and count(*) filter(where i.state<>'frozen')=0 then null else 'operation_already_reserved' end,
   'delete_count',count(*) filter(where i.kind<>'shared'),'transfer_count',count(*) filter(where i.kind='shared'),
   'copied_count',count(*) filter(where i.kind='shared' and i.state in ('copied','remove_pending','removed')),
   'removed_count',count(*) filter(where i.state='removed'),'state',case when count(*) filter(where i.state<>'removed')=0 then 'ready' else 'pending' end,
   'next_copy_item_id',(select x.id from private.account_media_items x where x.plan_id=p.id and x.kind='shared' and x.state in ('frozen','copy_pending') order by x.id limit 1),
   'next_remove_item_id',case when count(*) filter(where i.kind='shared' and i.state in ('frozen','copy_pending'))=0 then
     (select x.id from private.account_media_items x where x.plan_id=p.id and x.state<>'removed' order by x.id limit 1) end)
 from private.account_media_plans p left join private.account_media_items i on i.plan_id=p.id where p.id=p_plan group by p.id;
$f$;

create function public.own_account_media_status(p_project_url text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog set row_security=off
as $f$
declare caller uuid:=auth.uid(); inventory jsonb; entries jsonb; scope uuid[]; own_plan private.account_media_plans%rowtype; own_summary jsonb;
begin
 if caller is null or auth.role() is distinct from 'authenticated' or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
   where u.id=caller and u.deleted_at is null and coalesce(u.banned_until,'-infinity'::timestamptz)<=now()) then
   raise exception using errcode='42501',message='[account media] active_caller_required';
 end if;
 select * into own_plan from private.account_media_plans where user_id=caller;
 if found then
   entries:=(select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'stable_id',stable_id)),'[]') from private.account_media_items where plan_id=own_plan.id);
   scope:=private.account_media_scope(caller,entries); own_summary:=private.account_media_summary(own_plan.id);
   inventory:=jsonb_build_object('complete',true,'blocked_count',0);
 else
   inventory:=private.account_media_inventory(caller,p_project_url); entries:=inventory->'entries'; scope:=private.account_media_scope(caller,entries);
   own_summary:=jsonb_build_object('plan_id',null,'plan_generation',null,'replacement_user_id',null,'reselect_allowed',false,'reselect_blocked_reason',null,'state','not_started','delete_count',
     (select count(*) from jsonb_array_elements(entries) e where e->>'kind'<>'shared'),'transfer_count',
     (select count(*) from jsonb_array_elements(entries) e where e->>'kind'='shared'),'copied_count',0,'removed_count',0,'next_copy_item_id',null,'next_remove_item_id',null);
 end if;
 return jsonb_build_object('user_id',caller,'complete',inventory->'complete','blocked_count',inventory->'blocked_count',
   'requires_owner',cardinality(scope)>0 or exists(select 1 from public.farms where created_by=caller),
   'affected_stable_count',cardinality(scope),'replacement_owners',private.account_media_owners(caller,scope),'own',own_summary,
   'incoming',coalesce((select jsonb_agg(private.account_media_summary(p.id) order by p.id) from private.account_media_plans p
     where p.replacement_user_id=caller and exists(select 1 from private.account_media_items i where i.plan_id=p.id and i.kind='shared')),'[]'));
end
$f$;

create function public.prepare_account_media_deletion(p_user_id uuid,p_replacement_user_id uuid,p_project_url text,p_plan_generation uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog set row_security=off
as $f$
declare inventory jsonb; entries jsonb; scope uuid[]; farms uuid[]; plan private.account_media_plans%rowtype; e jsonb; old_owner uuid; reference_key bigint;
begin
 if p_plan_generation is null then raise exception using errcode='22023',message='[account media] generation_required'; end if;
 -- Discover frozen metadata without locks; always reacquire Auth before profile/plan/Storage.
 select * into plan from private.account_media_plans where user_id=p_user_id;
 if found then scope:=plan.stable_ids; farms:=plan.farm_ids;
 else
   inventory:=private.account_media_inventory(p_user_id,p_project_url); entries:=inventory->'entries'; scope:=private.account_media_scope(p_user_id,entries);
   select coalesce(array_agg(id order by id),'{}'::uuid[]) into farms from public.farms where created_by=p_user_id;
 end if;
 perform private.account_media_lock(p_user_id,p_replacement_user_id,scope,farms);
 select * into plan from private.account_media_plans where user_id=p_user_id for update;
 if found then
   if plan.plan_generation is distinct from p_plan_generation then raise exception using errcode='40001',message='[account media] generation_changed'; end if;
   if plan.replacement_user_id is distinct from p_replacement_user_id or plan.project_url<>p_project_url then
     raise exception using errcode='P0001',message='[account media] immutable_plan';
   end if;
   return jsonb_build_object('prepared',true,'user_id',p_user_id,'plan',private.account_media_summary(plan.id));
 end if;
 select replacement_user_id into old_owner from public.account_deletion_intents where user_id=p_user_id;
 if found then raise exception using errcode='P0001',message='[account media] existing_core_intent'; end if;
 perform 1 from storage.objects where owner=p_user_id or owner_id=p_user_id::text order by id for share;
 for reference_key in select distinct private.account_media_reference_key(case when x->>'bucket_id'='posts' then x->>'source_path'
   else p_project_url||'/storage/v1/object/public/'||(x->>'bucket_id')||'/'||(x->>'source_path') end)
   from jsonb_array_elements(entries) x order by 1 loop
   perform pg_advisory_xact_lock(reference_key);
 end loop;
 if inventory is distinct from private.account_media_inventory(p_user_id,p_project_url) or scope is distinct from private.account_media_scope(p_user_id,entries) then
   raise exception using errcode='40001',message='[account media] inventory_changed';
 end if;
 if (inventory->>'blocked_count')::integer<>0 then raise exception using errcode='P0001',message='[account media] unknown_media'; end if;
 insert into private.account_media_plans(user_id,replacement_user_id,plan_generation,used_generations,project_url,stable_ids,farm_ids)
   values(p_user_id,p_replacement_user_id,p_plan_generation,array[p_plan_generation],p_project_url,scope,farms) returning * into plan;
 for e in select * from jsonb_array_elements(entries) loop
   insert into private.account_media_items(plan_id,kind,stable_id,bucket_id,source_id,source_path,source_version,source_metadata,source_updated_at,refs,destination_path)
     values(plan.id,e->>'kind',(e->>'stable_id')::uuid,e->>'bucket_id',(e->>'source_id')::uuid,e->>'source_path',e->>'source_version',e->'source_metadata',
       (e->>'source_updated_at')::timestamptz,e->'refs',case when e->>'kind'='shared' then (e->>'stable_id')||'/'||gen_random_uuid()::text||'.'||regexp_replace(e->>'source_path','^.*[.]','') end);
 end loop;
 -- Intent is frozen only after full classification and owner validation. Existing final Auth prepare still checks every owned object is gone.
 insert into public.account_deletion_intents(user_id,replacement_user_id) values(p_user_id,p_replacement_user_id);
 return jsonb_build_object('prepared',true,'user_id',p_user_id,'plan',private.account_media_summary(plan.id));
end
$f$;

-- Explicit only: a never-reserved frozen plan can change owner; preserve ID and all prior generations.
create function public.reselect_account_media_owner(p_user_id uuid,p_plan_id uuid,p_expected_generation uuid,
 p_expected_owner uuid,p_replacement_user_id uuid,p_next_generation uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog set row_security=off
as $f$
declare p private.account_media_plans%rowtype; frozen jsonb; inventory jsonb; k bigint;
begin
 select * into p from private.account_media_plans where id=p_plan_id and user_id=p_user_id;
 if not found then raise exception using errcode='P0001',message='[account media] plan_missing'; end if;
 perform private.account_media_lock(p_user_id,p_replacement_user_id,p.stable_ids,p.farm_ids);
 select * into p from private.account_media_plans where id=p_plan_id and user_id=p_user_id for update;
 -- Idempotent same frozen generation acknowledgement, even after a lost reply.
 if p.plan_generation=p_next_generation and p.replacement_user_id is not distinct from p_replacement_user_id
   and p.last_expected_generation=p_expected_generation and p.last_expected_owner is not distinct from p_expected_owner then
   return jsonb_build_object('prepared',true,'user_id',p_user_id,'plan',private.account_media_summary(p.id));
 end if;
 if p.plan_generation is distinct from p_expected_generation or p.replacement_user_id is distinct from p_expected_owner
   or p_next_generation is null or p_next_generation=any(p.used_generations) then
   raise exception using errcode='40001',message='[account media] generation_changed'; end if;
 if not exists(select 1 from private.account_media_items where plan_id=p.id)
   or exists(select 1 from private.account_media_items where plan_id=p.id and state<>'frozen') then
   raise exception using errcode='P0001',message='[account media] operation_already_reserved'; end if;
 perform 1 from storage.objects where owner=p_user_id or owner_id=p_user_id::text order by id for share;
 for k in select distinct private.account_media_reference_key(case when i.bucket_id='posts' then i.source_path
   else p.project_url||'/storage/v1/object/public/'||i.bucket_id||'/'||i.source_path end)
   from private.account_media_items i where i.plan_id=p.id order by 1 loop perform pg_advisory_xact_lock(k); end loop;
 select coalesce(jsonb_agg(jsonb_build_object('source_id',i.source_id,'bucket_id',i.bucket_id,'source_path',i.source_path,
   'source_version',i.source_version,'source_metadata',i.source_metadata,'source_updated_at',i.source_updated_at,
   'kind',i.kind,'stable_id',i.stable_id,'refs',i.refs) order by i.source_id),'[]') into frozen from private.account_media_items i where i.plan_id=p.id;
 inventory:=private.account_media_inventory(p_user_id,p.project_url);
 if inventory->>'blocked_count'<>'0' or inventory->'entries' is distinct from frozen
   or private.account_media_scope(p_user_id,frozen) is distinct from p.stable_ids then
   raise exception using errcode='40001',message='[account media] inventory_changed'; end if;
 -- No earlier supported Auth delete can have been prepared while these exact owned source objects remain.
 begin
   perform public.assert_account_deletion(p_user_id,p_expected_owner);
   raise exception using errcode='P0001',message='[account media] retry_not_safe';
 exception when sqlstate 'P0001' then
   if sqlerrm<>'[account delete] storage_blocked' then raise; end if;
 end;
 update public.account_deletion_intents set replacement_user_id=p_replacement_user_id
   where user_id=p_user_id and replacement_user_id is not distinct from p_expected_owner;
 if not found then raise exception using errcode='40001',message='[account media] core_intent_changed'; end if;
 update private.account_media_plans set replacement_user_id=p_replacement_user_id,plan_generation=p_next_generation,
   used_generations=used_generations||array[p_next_generation],last_expected_generation=p_expected_generation,last_expected_owner=p_expected_owner where id=p.id;
 return jsonb_build_object('prepared',true,'user_id',p_user_id,'plan',private.account_media_summary(p.id));
end
$f$;

create function public.account_media_step(p_plan_id uuid,p_item_id uuid,p_caller_id uuid,p_action text,p_storage_receipt text default null,p_plan_generation uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog set row_security=off
as $f$
declare p private.account_media_plans%rowtype; i private.account_media_items%rowtype; o storage.objects%rowtype; d storage.objects%rowtype; r jsonb; dest text; current_scope uuid[];
begin
 if p_action is null or p_action not in ('claim_copy','confirm_copy','claim_remove','confirm_remove') then raise exception using errcode='22023',message='[account media] invalid_action'; end if;
 select * into p from private.account_media_plans where id=p_plan_id;
 if not found then raise exception using errcode='P0001',message='[account media] plan_missing'; end if;
 perform private.account_media_lock(p.user_id,p.replacement_user_id,p.stable_ids,p.farm_ids);
 select * into p from private.account_media_plans where id=p_plan_id for update;
 if p.plan_generation is distinct from p_plan_generation then raise exception using errcode='40001',message='[account media] generation_changed'; end if;
 select * into i from private.account_media_items where id=p_item_id and plan_id=p.id for update;
 if not found then raise exception using errcode='P0001',message='[account media] item_missing'; end if;
 if (p_action like '%copy' and (i.kind<>'shared' or p_caller_id is distinct from p.replacement_user_id))
   or (p_action like '%remove' and p_caller_id is distinct from p.user_id) then
   raise exception using errcode='42501',message='[account media] caller_mismatch';
 end if;
 select private.account_media_scope(p.user_id,coalesce(jsonb_agg(jsonb_build_object('kind',kind,'stable_id',stable_id)),'[]'))
   into current_scope from private.account_media_items where plan_id=p.id;
 if current_scope is distinct from p.stable_ids then raise exception using errcode='40001',message='[account media] scope_changed'; end if;
 if i.state='removed' or p_action like '%copy' and i.state in ('copied','remove_pending') then
   return jsonb_build_object('plan_id',p.id,'plan_generation',p.plan_generation,'item_id',i.id,'caller_id',p_caller_id,'replacement_user_id',p.replacement_user_id,'confirmed',true,'state',i.state);
 end if;
 select * into o from storage.objects where id=i.source_id and bucket_id=i.bucket_id and name=i.source_path for share;
 if p_action='claim_remove' and i.state='remove_pending' and not found then
   return jsonb_build_object('plan_id',p.id,'plan_generation',p.plan_generation,'item_id',i.id,'caller_id',p_caller_id,'replacement_user_id',p.replacement_user_id,
     'confirmed',false,'action','verify_remove','bucket_id',i.bucket_id,'source_path',i.source_path,'source_id',i.source_id);
 end if;
 if p_action<>'confirm_remove' and (not found or o.owner_id is distinct from p.user_id::text or (o.owner is not null and o.owner<>p.user_id)
   or o.version is distinct from i.source_version or o.metadata is distinct from i.source_metadata or o.updated_at is distinct from i.source_updated_at) then
   raise exception using errcode='P0001',message='[account media] source_changed';
 end if;
 if p_action='claim_copy' then
   if private.account_media_refs(i.bucket_id,i.source_path,p.project_url) is distinct from i.refs then raise exception using errcode='P0001',message='[account media] references_changed'; end if;
   update private.account_media_items set state='copy_pending' where id=i.id;
   return jsonb_build_object('plan_id',p.id,'plan_generation',p.plan_generation,'item_id',i.id,'caller_id',p_caller_id,'replacement_user_id',p.replacement_user_id,'confirmed',false,'action','copy',
     'bucket_id',i.bucket_id,'source_path',i.source_path,'destination_path',i.destination_path);
 elsif p_action='confirm_copy' then
   if i.state<>'copy_pending' or private.account_media_refs(i.bucket_id,i.source_path,p.project_url) is distinct from i.refs then
     raise exception using errcode='P0001',message='[account media] references_changed'; end if;
   select * into d from storage.objects where bucket_id=i.bucket_id and name=i.destination_path for share;
   if not found or d.id=i.source_id or d.owner_id is distinct from p.replacement_user_id::text or (d.owner is not null and d.owner<>p.replacement_user_id)
     or not private.account_media_metadata_complete(d.version,d.metadata,d.updated_at)
     or d.metadata->'eTag' is distinct from i.source_metadata->'eTag' or d.metadata->'size' is distinct from i.source_metadata->'size'
     or d.metadata->'mimetype' is distinct from i.source_metadata->'mimetype' then
     raise exception using errcode='P0001',message='[account media] copy_unconfirmed';
   end if;
   update private.account_media_items set state='copied',destination_id=d.id,destination_version=d.version,destination_metadata=d.metadata where id=i.id;
   dest:=p.project_url||'/storage/v1/object/public/'||i.bucket_id||'/'||i.destination_path;
   for r in select * from jsonb_array_elements(i.refs) loop
     if r->>'kind'='horse' then update public.horses set image_url=dest where id=(r->>'id')::uuid and stable_id=i.stable_id and image_url=r->>'value';
     elsif r->>'kind'='paddock' then update public.paddocks set image_url=dest where id=(r->>'id')::uuid and stable_id=i.stable_id and image_url=r->>'value';
     else raise exception using errcode='P0001',message='[account media] reference_kind'; end if;
     if not found then raise exception using errcode='40001',message='[account media] references_changed'; end if;
   end loop;
 elsif p_action='claim_remove' then
   perform pg_advisory_xact_lock(private.account_media_reference_key(case when i.bucket_id='posts' then i.source_path
     else p.project_url||'/storage/v1/object/public/'||i.bucket_id||'/'||i.source_path end));
   if exists(select 1 from private.account_media_items where plan_id=p.id and kind='shared' and state in ('frozen','copy_pending')) then
     raise exception using errcode='P0001',message='[account media] waiting_for_owner';
   end if;
   if i.kind='shared' then
     select * into d from storage.objects where id=i.destination_id and bucket_id=i.bucket_id and name=i.destination_path for share;
     if not found or d.owner_id is distinct from p.replacement_user_id::text or (d.owner is not null and d.owner<>p.replacement_user_id)
       or d.version is distinct from i.destination_version or d.metadata is distinct from i.destination_metadata
       or private.account_media_refs(i.bucket_id,i.source_path,p.project_url)<>'[]'::jsonb then
       raise exception using errcode='P0001',message='[account media] copy_unconfirmed'; end if;
   elsif private.account_media_refs(i.bucket_id,i.source_path,p.project_url) is distinct from i.refs then
     raise exception using errcode='P0001',message='[account media] references_changed';
   end if;
   insert into private.account_media_retired_paths(path_hash,reference_hash)
     values(sha256(convert_to(i.bucket_id||'/'||i.source_path,'UTF8')),sha256(convert_to(case when i.bucket_id='posts' then i.source_path
       else p.project_url||'/storage/v1/object/public/'||i.bucket_id||'/'||i.source_path end,'UTF8'))) on conflict(path_hash) do nothing;
   update private.account_media_items set state='remove_pending' where id=i.id;
   return jsonb_build_object('plan_id',p.id,'plan_generation',p.plan_generation,'item_id',i.id,'caller_id',p_caller_id,'replacement_user_id',p.replacement_user_id,'confirmed',false,'action','remove','bucket_id',i.bucket_id,'source_path',i.source_path,'source_id',i.source_id);
 elsif p_action='confirm_remove' then
   if i.state<>'remove_pending' or p_storage_receipt not in ('removed','absent') or p_storage_receipt is null
     or exists(select 1 from storage.objects where bucket_id=i.bucket_id and name=i.source_path or id=i.source_id) then
     raise exception using errcode='P0001',message='[account media] remove_unconfirmed'; end if;
   update private.account_media_items set state='removed' where id=i.id;
   for r in select * from jsonb_array_elements(i.refs) loop
     if i.kind='avatar' then update public.profiles set avatar_url=null where id=p.user_id and avatar_url=r->>'value';
     elsif i.kind='post' then update public.posts set image_url=null where id=(r->>'id')::uuid and user_id=p.user_id and image_url=r->>'value';
     end if;
     if i.kind<>'shared' and not found then raise exception using errcode='40001',message='[account media] references_changed'; end if;
   end loop;
 end if;
 return jsonb_build_object('plan_id',p.id,'plan_generation',p.plan_generation,'item_id',i.id,'caller_id',p_caller_id,'replacement_user_id',p.replacement_user_id,'confirmed',true,'state',case when p_action='confirm_copy' then 'copied' else 'removed' end);
end
$f$;

-- Scoped policy helpers expose only booleans. Existing permissive policies govern all unrelated rows.
create function public.account_media_storage_gate(p_bucket text,p_path text,p_mutating boolean)
returns boolean language sql stable security definer set search_path=pg_catalog set row_security=off
as $f$
 select not exists(select 1 from private.account_media_retired_paths where path_hash=sha256(convert_to(p_bucket||'/'||p_path,'UTF8')))
   and (not p_mutating or not exists(select 1 from private.account_media_items where bucket_id=p_bucket and (source_path=p_path or destination_path=p_path)));
$f$;
create function public.account_media_transfer_gate(p_bucket text,p_path text,p_insert boolean)
returns boolean language sql stable security definer set search_path=pg_catalog set row_security=off
as $f$
 select public.account_is_active() and exists(select 1 from private.account_media_plans p join private.account_media_items i on i.plan_id=p.id
   where p.replacement_user_id=auth.uid() and i.kind='shared' and i.state='copy_pending' and i.bucket_id=p_bucket
     and (p_insert and i.destination_path=p_path or not p_insert and p_path in (i.source_path,i.destination_path))
     and exists(select 1 from auth.users u where u.id=auth.uid() and u.deleted_at is null and coalesce(u.banned_until,'-infinity'::timestamptz)<=now())
     and not exists(select 1 from unnest(p.stable_ids) s(id) where not exists(select 1 from public.stable_members m
       where m.user_id=auth.uid() and m.stable_id=s.id and m.role='admin' and m.access='owner'))
     and exists(select 1 from storage.objects o where o.id=i.source_id and o.owner_id=p.user_id::text and (o.owner is null or o.owner=p.user_id)
       and o.version=i.source_version and o.metadata=i.source_metadata and o.updated_at=i.source_updated_at));
$f$;
create policy account_media_retired_gate on storage.objects as restrictive for insert to authenticated
  with check(public.account_media_storage_gate(bucket_id,name,false));
create policy account_media_update_gate on storage.objects as restrictive for update to authenticated
  using(public.account_media_storage_gate(bucket_id,name,true)) with check(public.account_media_storage_gate(bucket_id,name,true));
create policy account_media_delete_gate on storage.objects as restrictive for delete to authenticated
  using(public.account_media_storage_gate(bucket_id,name,true));
create policy account_media_transfer_read on storage.objects for select to authenticated
  using(public.account_media_transfer_gate(bucket_id,name,false));
create policy account_media_transfer_insert on storage.objects for insert to authenticated
  with check(public.account_media_transfer_gate(bucket_id,name,true) and owner_id=auth.uid()::text and (owner is null or owner=auth.uid()));

create function private.account_media_reference_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog set row_security=off
as $f$
declare v_kind text:=case tg_table_name when 'profiles' then 'avatar' when 'posts' then 'post' when 'horses' then 'horse' else 'paddock' end;
 old_value text; new_value text; row_id uuid; i record; expected text; reference_key bigint;
begin
 row_id:=case when tg_op='DELETE' then old.id else new.id end;
 if tg_op<>'INSERT' then old_value:=case when v_kind='avatar' then to_jsonb(old)->>'avatar_url' else to_jsonb(old)->>'image_url' end; end if;
 if tg_op<>'DELETE' then new_value:=case when v_kind='avatar' then to_jsonb(new)->>'avatar_url' else to_jsonb(new)->>'image_url' end; end if;
 -- SHARE writers; exclusive freeze/retirement waits for prior writers then rechecks exact inventory.
 for reference_key in select distinct private.account_media_reference_key(value) from unnest(array[old_value,new_value]) x(value)
   where value is not null order by 1 loop perform pg_advisory_xact_lock_shared(reference_key); end loop;
 if new_value is not null and exists(select 1 from private.account_media_items x join private.account_media_plans p on p.id=x.plan_id
   where new_value=case when x.bucket_id='posts' then x.source_path else p.project_url||'/storage/v1/object/public/'||x.bucket_id||'/'||x.source_path end
     and not exists(select 1 from jsonb_array_elements(x.refs) r where r->>'kind'=v_kind and r->>'id'=row_id::text)) then
   raise exception using errcode='P0001',message='[account media] frozen_source'; end if;
 if new_value is not null and exists(select 1 from private.account_media_retired_paths where reference_hash=sha256(convert_to(new_value,'UTF8'))) then
   raise exception using errcode='P0001',message='[account media] retired_reference'; end if;
 for i in select x.*,p.project_url from private.account_media_items x join private.account_media_plans p on p.id=x.plan_id
   where exists(select 1 from jsonb_array_elements(x.refs) r where r->>'kind'=v_kind and r->>'id'=row_id::text) loop
   expected:=case when i.kind='shared' then i.project_url||'/storage/v1/object/public/'||i.bucket_id||'/'||i.destination_path else null end;
   if old_value is distinct from new_value or tg_op='DELETE' then
     if not ((i.kind='shared' and i.state in ('copied','remove_pending','removed') and new_value is not distinct from expected)
       or (i.kind<>'shared' and i.state='removed' and new_value is null and tg_op<>'DELETE')) then
       raise exception using errcode='P0001',message='[account media] frozen_reference'; end if;
   end if;
 end loop;
 if new_value is not null and exists(select 1 from private.account_media_items x join private.account_media_plans p on p.id=x.plan_id
   where x.kind='shared' and new_value=p.project_url||'/storage/v1/object/public/'||x.bucket_id||'/'||x.destination_path
     and not exists(select 1 from jsonb_array_elements(x.refs) r where r->>'kind'=v_kind and r->>'id'=row_id::text)) then
   raise exception using errcode='P0001',message='[account media] frozen_destination'; end if;
 return case when tg_op='DELETE' then old else new end;
end
$f$;
create trigger account_media_reference_guard before insert or update or delete on public.posts for each row execute function private.account_media_reference_guard();
create trigger account_media_reference_guard before insert or update or delete on public.horses for each row execute function private.account_media_reference_guard();
create trigger account_media_reference_guard before insert or update or delete on public.paddocks for each row execute function private.account_media_reference_guard();
create trigger account_media_reference_guard before insert or update on public.profiles for each row execute function private.account_media_reference_guard();

create function private.account_media_deletion_ready()
returns trigger language plpgsql security definer set search_path=pg_catalog set row_security=off
as $f$
declare p private.account_media_plans%rowtype; frozen_entries jsonb;
begin
 -- Preserve existing direct-profile rejection. During supported Auth cascade A is already gone.
 if exists(select 1 from auth.users where id=old.id) then return old; end if;
 select * into p from private.account_media_plans where user_id=old.id;
 if not found then return old; end if;
 perform 1 from auth.users where id=p.replacement_user_id for share;
 perform 1 from public.profiles where id=p.replacement_user_id for key share;
 perform 1 from public.farms where id=any(p.farm_ids) order by id for update;
 perform 1 from public.stables where id=any(p.stable_ids) order by id for update;
 perform 1 from public.stable_members where user_id=p.replacement_user_id and stable_id=any(p.stable_ids) order by stable_id,id for update;
 select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'stable_id',stable_id)),'[]') into frozen_entries from private.account_media_items where plan_id=p.id;
 if private.account_media_scope(old.id,frozen_entries) is distinct from p.stable_ids
   or (select coalesce(array_agg(id order by id),'{}'::uuid[]) from public.farms where created_by=old.id) is distinct from p.farm_ids
   or (p.replacement_user_id is not null and not exists(select 1 from auth.users u join public.profiles q on q.id=u.id
     where u.id=p.replacement_user_id and u.deleted_at is null and coalesce(u.banned_until,'-infinity'::timestamptz)<=now()
       and not exists(select 1 from public.account_deletion_intents where user_id=u.id)))
   or exists(select 1 from unnest(p.stable_ids) s(id) where not exists(select 1 from public.stable_members m where m.user_id=p.replacement_user_id and m.stable_id=s.id and m.role='admin' and m.access='owner')) then
   raise exception using errcode='P0001',message='[account media] owner_invalid';
 end if;
 perform 1 from storage.objects d where exists(select 1 from private.account_media_items i where i.plan_id=p.id and i.destination_id=d.id) order by d.id for share;
 if exists(select 1 from private.account_media_items where plan_id=p.id and state<>'removed')
   or exists(select 1 from private.account_media_items i where i.plan_id=p.id and i.kind='shared' and not exists(select 1 from storage.objects d
     where d.id=i.destination_id and d.bucket_id=i.bucket_id and d.name=i.destination_path and d.owner_id=p.replacement_user_id::text
       and (d.owner is null or d.owner=p.replacement_user_id) and d.version=i.destination_version and d.metadata=i.destination_metadata)) then
   raise exception using errcode='P0001',message='[account media] media_unconfirmed';
 end if;
 return old;
end
$f$;
-- Auth cascade: verify frozen media/owner BEFORE existing creator transfer, with whole-transaction rollback on any failure.
create trigger a_account_media_deletion_ready before delete on public.profiles for each row execute function private.account_media_deletion_ready();

-- Explicit per-function ACLs; never widen existing table/schema/global grants.
revoke all on function private.account_media_reference_key(text),private.account_media_refs(text,text,text),private.account_media_metadata_complete(text,jsonb,timestamptz),private.account_media_inventory(uuid,text),private.account_media_scope(uuid,jsonb),private.account_media_owners(uuid,uuid[]),private.account_media_lock(uuid,uuid,uuid[],uuid[]),private.account_media_summary(uuid),private.account_media_reference_guard(),private.account_media_deletion_ready() from public,anon,authenticated,service_role;
revoke all on function public.own_account_media_status(text),public.prepare_account_media_deletion(uuid,uuid,text,uuid),public.account_media_step(uuid,uuid,uuid,text,text,uuid),public.reselect_account_media_owner(uuid,uuid,uuid,uuid,uuid,uuid),public.account_media_storage_gate(text,text,boolean),public.account_media_transfer_gate(text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.own_account_media_status(text),public.account_media_storage_gate(text,text,boolean),public.account_media_transfer_gate(text,text,boolean) to authenticated;
grant execute on function public.prepare_account_media_deletion(uuid,uuid,text,uuid),public.account_media_step(uuid,uuid,uuid,text,text,uuid),public.reselect_account_media_owner(uuid,uuid,uuid,uuid,uuid,uuid) to service_role;
commit;

-- PROPOSAL ONLY. Separate schema approval and deployment are required.
-- Finite, materialized series; no reconstruction, recurrence job or backfill.
begin;

alter table public.assignments add column if not exists series_id uuid;
create index if not exists assignments_series_scope_idx on public.assignments(stable_id, series_id) where series_id is not null;

create or replace function public.guard_recurring_assignment_content()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if auth.role() is distinct from 'authenticated' then return new; end if;
  if new.series_id is distinct from old.series_id then
    raise exception '[assignment series] Serieidentiteten får inte ändras.' using errcode = '23514';
  end if;
  if old.series_id is null then return new; end if;
  if new.stable_id is distinct from old.stable_id then
    raise exception '[assignment series] Serien får inte flyttas till ett annat stall.' using errcode = '23514';
  end if;
  if row(new.date,new.slot,new.label,new.icon,new.time,new.note)
    is not distinct from row(old.date,old.slot,old.label,old.icon,old.time,old.note) then return new; end if;
  if old.status <> 'open' or old.assignee_id is not null or old.completed_at is not null
    or old.time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '[assignment series] Endast framtida öppna pass får ändras.' using errcode = '23514';
  end if;
  if (old.date + old.time::time) at time zone 'Europe/Stockholm' <= clock_timestamp() then
    raise exception '[assignment series] Redan startade eller historiska pass får inte ändras.' using errcode = '23514';
  end if;
  if new.time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '[assignment series] Ange en giltig starttid.' using errcode = '23514';
  end if;
  if (new.date + new.time::time) at time zone 'Europe/Stockholm' <= clock_timestamp() then
    raise exception '[assignment series] Den nya starttiden måste ligga i framtiden.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_recurring_assignment_content() from public, anon, authenticated, service_role;
drop trigger if exists guard_recurring_assignment_content on public.assignments;
create trigger guard_recurring_assignment_content before update on public.assignments for each row execute function public.guard_recurring_assignment_content();

create or replace function public.update_future_open_assignment_series(
  p_expected_user_id uuid, p_stable_id uuid, p_series_id uuid,
  p_label text, p_start_time text, p_end_time text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog set row_security = off as $$
declare
  caller_id uuid := auth.uid();
  target public.assignments%rowtype;
  target_id uuid;
  updated public.assignments%rowtype;
  targets uuid[] := '{}'::uuid[];
  result jsonb := '[]'::jsonb;
  now_at_scope timestamptz := clock_timestamp();
  next_slot text;
  next_icon text;
  next_note text;
begin
  if auth.role() is distinct from 'authenticated' or caller_id is null
    or p_expected_user_id is distinct from caller_id or p_stable_id is null or p_series_id is null then
    raise exception '[assignment series] Inloggning och rätt konto krävs.' using errcode = '42501';
  end if;
  -- Parent before membership/assignment locks: Auth cascade cannot commit first.
  perform 1 from auth.users u where u.id = caller_id and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= clock_timestamp()) for share;
  if not found then raise exception '[assignment series] Kontot är inte aktivt.' using errcode = '42501'; end if;
  -- Preparation takes profile FOR UPDATE. Check the committed intent only after
  -- this lock wait, before membership/assignment locks or any content change.
  perform 1 from public.profiles p where p.id = caller_id for key share;
  if not found or public.account_is_active() is distinct from true then
    raise exception '[assignment series] Kontot är inte aktivt.' using errcode = '42501';
  end if;
  perform 1 from public.stable_members m where m.stable_id = p_stable_id and m.user_id = caller_id
    and coalesce(m.access,'view') in ('edit','owner') for share;
  if not found then raise exception '[assignment series] Behörighet saknas.' using errcode = '42501'; end if;
  if p_label is null or btrim(p_label) = '' or p_start_time is null or p_end_time is null
    or p_start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or p_end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_end_time <= p_start_time then
    raise exception '[assignment series] Ange namn och giltiga start- och sluttider.' using errcode = '22023';
  end if;
  -- One stable/series, actual server time, exact eligible rows. LIMIT366 detects
  -- an oversized operation before any mutation. Lock IDs in a canonical order.
  for target in select a.* from public.assignments a
    where a.stable_id = p_stable_id and a.series_id = p_series_id and a.status = 'open'
      and a.assignee_id is null and a.completed_at is null
      and case when a.time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        then (a.date + a.time::time) at time zone 'Europe/Stockholm' > now_at_scope else false end
    order by a.id limit 366 for update
  loop
    targets := array_append(targets,target.id);
  end loop;
  if cardinality(targets) > 365 then
    raise exception '[assignment series] Högst 365 pass får ändras per omgång.' using errcode = '23514';
  end if;
  next_slot := case when split_part(p_start_time,':',1)::integer < 10 then 'Morning'
    when split_part(p_start_time,':',1)::integer < 15 then 'Lunch' else 'Evening' end;
  next_icon := case next_slot when 'Morning' then 'sun' when 'Lunch' then 'clock' else 'moon' end;
  foreach target_id in array targets loop
    select a.* into target from public.assignments a where a.id = target_id;
    -- A lock wait may cross the old start time; it then remains unchanged.
    if (target.date + target.time::time) at time zone 'Europe/Stockholm' <= clock_timestamp() then continue; end if;
    if (target.date + p_start_time::time) at time zone 'Europe/Stockholm' <= clock_timestamp() then
      raise exception '[assignment series] Den nya starttiden måste ligga i framtiden för alla berörda pass.' using errcode = '23514';
    end if;
    if coalesce(target.note,'') ~* '\y(?:Till|Slut)\s*:?\s*([0-9]{1,2}:[0-9]{2})' then
      next_note := regexp_replace(target.note,'\y(?:Till|Slut)\s*:?\s*([0-9]{1,2}:[0-9]{2})','Slut: ' || p_end_time,'i');
    else next_note := coalesce(nullif(target.note,'' ) || E'\n','') || 'Slut: ' || p_end_time; end if;
    update public.assignments a set label = btrim(p_label), time = p_start_time,
      slot = next_slot, icon = next_icon, note = next_note, updated_at = clock_timestamp()
      where a.id = target.id and a.stable_id = p_stable_id and a.series_id = p_series_id
        and a.status = 'open' and a.assignee_id is null and a.completed_at is null
      returning a.* into updated;
    if not found then raise exception '[assignment series] Passet ändrades. Uppdatera schemat.' using errcode = '40001'; end if;
    result := result || jsonb_build_array(to_jsonb(updated));
  end loop;
  return jsonb_build_object('user_id',caller_id,'stable_id',p_stable_id,'series_id',p_series_id,
    'updated_count',jsonb_array_length(result),'assignments',result);
end;
$$;
revoke all on function public.update_future_open_assignment_series(uuid,uuid,uuid,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.update_future_open_assignment_series(uuid,uuid,uuid,text,text,text) to authenticated;

commit;

-- REVIEW PROPOSAL ONLY. No schema or schedule has been applied.
-- Prerequisites: current care_events/stable access helpers, private schema and push receipt/ownership protocol.
-- One current plan per selected horse/event; request journal preserves same-body retries.
begin;
do $care_dependencies$ begin
  if to_regprocedure('public.account_is_active()') is null or to_regclass('public.account_deletion_intents') is null
    or (select count(*) from pg_attribute where attrelid='auth.users'::regclass
      and attname in ('deleted_at','banned_until') and not attisdropped and atttypid='timestamptz'::regtype)<>2 then
    raise exception using errcode='55000',message='[care reminder] Reviewed account status contract is required';
  end if;
end $care_dependencies$;
create table private.care_reminder_plans (
  id uuid primary key default gen_random_uuid(),
  care_event_id uuid not null references public.care_events(id) on delete cascade,
  stable_id uuid not null references public.stables(id) on delete cascade,
  horse_id uuid not null references public.horses(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  body jsonb not null,
  due_at timestamptz not null,
  state text not null check(state in ('scheduled','held','dispatch_unknown','submitted')),
  attempt_id uuid not null default gen_random_uuid(),
  unique(care_event_id,horse_id)
);
create table private.care_reminder_requests (
  request_id uuid primary key,
  actor_id uuid not null references auth.users(id) on delete cascade,
  care_event_id uuid not null references public.care_events(id) on delete cascade,
  body jsonb not null
);
alter table private.care_reminder_plans enable row level security;
alter table private.care_reminder_requests enable row level security;
revoke all on private.care_reminder_plans,private.care_reminder_requests from public,anon,authenticated,service_role;
create index care_reminder_due_idx on private.care_reminder_plans(due_at,id) where state='scheduled';

create function public.care_reminder_read(p_expected_user_id uuid,p_stable_id uuid,p_horse_id uuid,p_care_event_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare e public.care_events%rowtype; result jsonb; stored jsonb;
begin
  if auth.uid() is null or auth.uid() is distinct from p_expected_user_id or not public.is_stable_member(p_stable_id)
    or public.account_is_active() is distinct from true
    or not exists(select 1 from auth.users a join public.profiles p on p.id=a.id where a.id=auth.uid()
      and a.deleted_at is null and coalesce(a.banned_until,'-infinity'::timestamptz)<=clock_timestamp()) then
    raise exception using errcode='42501',message='[care reminder] Current stable member is required';
  end if;
  select * into e from public.care_events where id=p_care_event_id and stable_id=p_stable_id;
  if not found or not p_horse_id=any(e.horse_ids)
    or not exists(select 1 from public.horses h where h.id=p_horse_id and h.stable_id=p_stable_id) then
    raise exception using errcode='23514',message='[care reminder] Current horse and care event are required';
  end if;
  select jsonb_build_object('requestId',c.request_id,'nextDate',c.body->>'nextDate',
    'recipientUserIds',c.body->'recipientUserIds','state',c.state) into stored
    from private.care_reminder_plans c where c.care_event_id=e.id and c.horse_id=p_horse_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'stableId',m.stable_id,
    'name',coalesce(nullif(p.full_name,''),nullif(p.username,''),'Stallmedlem')) order by m.user_id),'[]'::jsonb) into result
    from public.stable_members m join public.profiles p on p.id=m.user_id join auth.users a on a.id=p.id
    where m.stable_id=p_stable_id and a.deleted_at is null
      and coalesce(a.banned_until,'-infinity'::timestamptz)<=clock_timestamp()
      and not exists(select 1 from public.account_deletion_intents i where i.user_id=m.user_id);
  return jsonb_build_object('accountId',p_expected_user_id,'stableId',p_stable_id,'horseId',p_horse_id,
    'anchor',jsonb_build_object('id',e.id,'stableId',e.stable_id,'horseIds',e.horse_ids,'title',e.title,
      'date',e.date,'status',e.status,'revision',e.updated_at),'recipients',result,'plan',stored);
end $$;

create function public.care_reminder_save(p_plan jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare actor uuid; stable uuid; horse uuid; event_id uuid; request uuid; expected uuid;
  people uuid[]; auth_id uuid; e public.care_events%rowtype; prior private.care_reminder_plans%rowtype;
  seen private.care_reminder_requests%rowtype; due timestamptz; next_day date;
begin
  if p_plan is null or jsonb_typeof(p_plan)<>'object' or not (p_plan ?& array['accountId','sessionEpoch','stableId','horseId','requestId',
    'careEventId','sourceEventDate','sourceEventRevision','expectedRevision','nextDate','reminderDate','recipientUserIds'])
    or (select count(*) from jsonb_object_keys(p_plan))<>12
    or jsonb_typeof(p_plan->'recipientUserIds')<>'array' or jsonb_array_length(p_plan->'recipientUserIds') not between 1 and 10000
    or jsonb_typeof(p_plan->'sessionEpoch')<>'number' or (p_plan->>'sessionEpoch')!~'^[0-9]+$' then
    raise exception using errcode='22023',message='[care reminder] Invalid plan';
  end if;
  actor:=(p_plan->>'accountId')::uuid;stable:=(p_plan->>'stableId')::uuid;horse:=(p_plan->>'horseId')::uuid;
  event_id:=(p_plan->>'careEventId')::uuid;request:=(p_plan->>'requestId')::uuid;expected:=(p_plan->>'expectedRevision')::uuid;
  if auth.uid() is null or actor is distinct from auth.uid() or public.account_is_active() is distinct from true then
    raise exception using errcode='42501',message='[care reminder] Current active account is required';end if;
  select array_agg(value::uuid order by value::uuid) into people from jsonb_array_elements_text(p_plan->'recipientUserIds');
  if cardinality(people)<>(select count(distinct x) from unnest(people) x)
    or to_jsonb(people)<>p_plan->'recipientUserIds' then
    raise exception using errcode='22023',message='[care reminder] Recipients must be distinct and canonical';
  end if;
  -- Reject out-of-scope recipient probes before touching Auth parents.
  if not public.can_edit_stable(stable) or not exists(select 1 from public.profiles where id=actor)
    or exists(select 1 from unnest(people) x where not exists(select 1 from public.stable_members m
      join public.profiles p on p.id=m.user_id where m.stable_id=stable and m.user_id=x)) then
    raise exception using errcode='42501',message='[care reminder] Current care scope is unavailable';
  end if;
  -- Auth-parent first, sorted, matching the current ownership/deletion protocol.
  for auth_id in select distinct x from unnest(people||array[actor]) x order by x loop
    perform 1 from auth.users where id=auth_id and deleted_at is null
      and coalesce(banned_until,'-infinity'::timestamptz)<=clock_timestamp() for key share;
    if not found then raise exception using errcode='42501',message='[care reminder] Active account is required';end if;
  end loop;
  -- Account deletion preparation locks profiles FOR UPDATE before creating its intent.
  perform 1 from public.profiles where id=any(people||array[actor]) order by id for key share;
  if exists(select 1 from unnest(people||array[actor]) x where not exists(select 1 from public.profiles where id=x)
    or exists(select 1 from public.account_deletion_intents where user_id=x)) then
    raise exception using errcode='42501',message='[care reminder] Current active members are required';
  end if;
  perform 1 from public.stables where id=stable for key share;
  select * into e from public.care_events where id=event_id and stable_id=stable for share;
  if not found or e.status='cancelled' or not horse=any(e.horse_ids)
    or e.date::text is distinct from p_plan->>'sourceEventDate' or e.updated_at is null
    or e.updated_at is distinct from (p_plan->>'sourceEventRevision')::timestamptz then
    raise exception using errcode='40001',message='[care reminder] Care event changed';
  end if;
  perform 1 from public.horses where id=horse and stable_id=stable for share;
  if not found then raise exception using errcode='23514',message='[care reminder] Horse scope changed';end if;
  perform 1 from public.stable_members where stable_id=stable and user_id=any(people||array[actor]) order by user_id for share;
  if not public.can_edit_stable(stable) or not exists(select 1 from public.profiles where id=actor)
    or exists(select 1 from unnest(people) x where not exists(select 1 from public.stable_members m
      join public.profiles p on p.id=m.user_id where m.stable_id=stable and m.user_id=x)) then
    raise exception using errcode='42501',message='[care reminder] Care editor and eligible current members are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('care-reminder:'||event_id::text||':'||horse::text,0));
  select * into prior from private.care_reminder_plans where care_event_id=event_id and horse_id=horse for update;
  -- Recheck account status after all possibly waiting scope/plan locks.
  if exists(select 1 from unnest(people||array[actor]) x where not exists(
    select 1 from auth.users a join public.profiles p on p.id=a.id where a.id=x and a.deleted_at is null
      and coalesce(a.banned_until,'-infinity'::timestamptz)<=clock_timestamp())
    or exists(select 1 from public.account_deletion_intents where user_id=x)) then
    raise exception using errcode='42501',message='[care reminder] Active account scope changed';
  end if;
  select * into seen from private.care_reminder_requests where request_id=request;
  if found then
    if seen.actor_id<>actor or seen.body<>p_plan then raise exception using errcode='23505',message='[care reminder] Request is already bound';end if;
    if prior.request_id is distinct from request then raise exception using errcode='40001',message='[care reminder] Plan was superseded';end if;
    return jsonb_build_object('success',true,'data',seen.body);
  end if;
  if prior.request_id is distinct from expected or prior.state='dispatch_unknown' then
    raise exception using errcode='40001',message='[care reminder] Read the current plan before changing it';
  end if;
  if p_plan->>'nextDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or p_plan->>'nextDate'<>p_plan->>'reminderDate' then
    raise exception using errcode='22023',message='[care reminder] Explicit next date is required';
  end if;
  next_day:=(p_plan->>'nextDate')::date;
  if to_char(next_day,'YYYY-MM-DD')<>p_plan->>'nextDate' then raise exception using errcode='22023',message='[care reminder] Invalid date';end if;
  due:=(next_day+time '09:00') at time zone 'Europe/Stockholm';
  if due<=clock_timestamp() then raise exception using errcode='23514',message='[care reminder] Selected date at 09 Stockholm has passed';end if;
  insert into private.care_reminder_requests(request_id,actor_id,care_event_id,body) values(request,actor,event_id,p_plan);
  insert into private.care_reminder_plans(care_event_id,stable_id,horse_id,actor_id,request_id,body,due_at,state)
    values(event_id,stable,horse,actor,request,p_plan,due,'scheduled')
    on conflict(care_event_id,horse_id) do update set actor_id=excluded.actor_id,request_id=excluded.request_id,
      body=excluded.body,due_at=excluded.due_at,state='scheduled',attempt_id=gen_random_uuid();
  return jsonb_build_object('success',true,'data',p_plan);
end $$;

create function public.care_reminder_claim_due(p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare candidate private.care_reminder_plans%rowtype; locked private.care_reminder_plans%rowtype;
  people uuid[]; auth_id uuid; available boolean; candidates jsonb; items jsonb:='[]'::jsonb;
begin
  if p_limit is null or p_limit not between 1 and 10 then raise exception using errcode='22023',message='[care reminder] Invalid claim limit';end if;
  -- Freeze revisions before locks; acquire ALL batch Auth parents in UUID order first.
  select coalesce(jsonb_agg(to_jsonb(c) order by c.due_at,c.id),'[]'::jsonb) into candidates
    from (select * from private.care_reminder_plans where state='scheduled' and due_at<=clock_timestamp()
      order by due_at,id limit p_limit) c;
  for auth_id in select uid from (
    select (c->>'actor_id')::uuid uid from jsonb_array_elements(candidates) c
    union select recipient.value::uuid from jsonb_array_elements(candidates) c,
      lateral jsonb_array_elements_text(c->'body'->'recipientUserIds') recipient
  ) ordered_users order by uid loop
    perform 1 from auth.users where id=auth_id for key share;
  end loop;
  perform 1 from public.profiles where id in (
    select (c->>'actor_id')::uuid from jsonb_array_elements(candidates) c
    union select recipient.value::uuid from jsonb_array_elements(candidates) c,
      lateral jsonb_array_elements_text(c->'body'->'recipientUserIds') recipient
  ) order by id for key share;
  for candidate in select * from jsonb_populate_recordset(null::private.care_reminder_plans,candidates) loop
    select array_agg(value::uuid order by value::uuid) into people from jsonb_array_elements_text(candidate.body->'recipientUserIds');
    available:=not exists(select 1 from unnest(people||array[candidate.actor_id]) x
      where not exists(select 1 from auth.users a join public.profiles p on p.id=a.id where a.id=x
        and a.deleted_at is null and coalesce(a.banned_until,'-infinity'::timestamptz)<=clock_timestamp())
        or exists(select 1 from public.account_deletion_intents where user_id=x));
    perform 1 from public.stables where id=candidate.stable_id for key share;
    perform 1 from public.care_events where id=candidate.care_event_id and stable_id=candidate.stable_id for share;
    perform 1 from public.horses where id=candidate.horse_id and stable_id=candidate.stable_id for share;
    if not found then available:=false;end if;
    perform 1 from public.stable_members where stable_id=candidate.stable_id
      and user_id=any(people||array[candidate.actor_id]) order by user_id for share;
    select * into locked from private.care_reminder_plans where id=candidate.id for update skip locked;
    if not found or locked.request_id<>candidate.request_id or locked.state<>'scheduled' then continue;end if;
    available:=available and not exists(select 1 from unnest(people||array[locked.actor_id]) x where not exists(
      select 1 from auth.users a join public.profiles p on p.id=a.id where a.id=x and a.deleted_at is null
        and coalesce(a.banned_until,'-infinity'::timestamptz)<=clock_timestamp())
      or exists(select 1 from public.account_deletion_intents where user_id=x));
    available:=available and exists(select 1 from public.stable_members m join public.profiles p on p.id=m.user_id
      where m.stable_id=locked.stable_id and m.user_id=locked.actor_id and coalesce(m.access,'view') in ('edit','owner'))
      and exists(select 1 from public.care_events e where e.id=locked.care_event_id and e.stable_id=locked.stable_id
        and e.status<>'cancelled' and locked.horse_id=any(e.horse_ids) and e.date::text=locked.body->>'sourceEventDate'
        and e.updated_at=(locked.body->>'sourceEventRevision')::timestamptz)
      and not exists(select 1 from unnest(people) x where not exists(select 1 from public.stable_members m
        join public.profiles p on p.id=m.user_id where m.stable_id=locked.stable_id and m.user_id=x));
    if not available then update private.care_reminder_plans set state='held' where id=locked.id;continue;end if;
    -- Durable at-most-once reservation. Crash/lost acknowledgement remains unknown, never automatically resent.
    update private.care_reminder_plans set state='dispatch_unknown' where id=locked.id;
    items:=items||jsonb_build_array(jsonb_build_object('planId',locked.id,'requestId',locked.request_id,
      'attemptId',locked.attempt_id,'stableId',locked.stable_id,'recipientUserIds',people));
  end loop;
  return jsonb_build_object('items',items);
end $$;

create function public.care_reminder_finish(p_plan_id uuid,p_request_id uuid,p_attempt_id uuid,p_state text)
returns jsonb language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
begin
  if p_state is null or p_state not in ('held','submitted') then raise exception using errcode='22023',message='[care reminder] Invalid completion';end if;
  update private.care_reminder_plans set state=p_state where id=p_plan_id and request_id=p_request_id
    and attempt_id=p_attempt_id and state='dispatch_unknown';
  if not found then raise exception using errcode='40001',message='[care reminder] Completion scope changed';end if;
  return jsonb_build_object('planId',p_plan_id,'requestId',p_request_id,'attemptId',p_attempt_id,'state',p_state);
end $$;

revoke all on function public.care_reminder_read(uuid,uuid,uuid,uuid),public.care_reminder_save(jsonb),
  public.care_reminder_claim_due(integer),public.care_reminder_finish(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.care_reminder_read(uuid,uuid,uuid,uuid),public.care_reminder_save(jsonb) to authenticated;
grant execute on function public.care_reminder_claim_due(integer),public.care_reminder_finish(uuid,uuid,uuid,text) to service_role;
commit;
