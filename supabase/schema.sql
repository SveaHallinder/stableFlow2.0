-- Core schema for StableFlow (Supabase)
-- Apply in Supabase SQL editor.

create extension if not exists "pgcrypto";

-- Helpers
create or replace function public.generate_join_code()
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
$$;

-- Profiles (extend existing)
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
set search_path = public
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
set search_path = public
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

  update public.stable_invites
    set accepted_at = now()
  where lower(email) = lower(v_email) and accepted_at is null;

  get diagnostics v_count = row_count;
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
begin
  v_email := lower(trim(p_email));
  if v_email is null or length(v_email) = 0 then
    return false;
  end if;

  select exists(
    select 1
    from public.stable_invites i
    where lower(i.email) = v_email
      and i.accepted_at is null
      and (i.expires_at is null or i.expires_at > now())
  ) into v_has_email;

  if p_code is not null and length(trim(p_code)) > 0 then
    select exists(
      select 1
      from public.stables s
      where s.join_code = upper(trim(p_code))
    ) into v_has_code;
  end if;

  return v_has_email or v_has_code;
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

-- Posts (extend existing)
alter table public.posts add column if not exists stable_id uuid references public.stables(id) on delete set null;
alter table public.posts add column if not exists group_ids uuid[] default '{}'::uuid[];
alter table public.posts add column if not exists content text;
alter table public.posts enable row level security;

-- Likes/comments tables already exist; ensure RLS enabled
alter table public.likes enable row level security;
create unique index if not exists likes_unique on public.likes(user_id, post_id);
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
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using ((select auth.role()) = 'authenticated');
create policy "profiles_update_self" on public.profiles
  for update using ((select auth.uid()) = id);
create policy "profiles_insert_self" on public.profiles
  for insert with check ((select auth.uid()) = id);

drop policy if exists "farms_select" on public.farms;
create policy "farms_select" on public.farms
  for select using (
    exists (
      select 1 from public.stables s
      join public.stable_members m on m.stable_id = s.id
      where s.farm_id = farms.id and m.user_id = (select auth.uid())
    )
  );
drop policy if exists "farms_insert" on public.farms;
create policy "farms_insert" on public.farms for insert with check ((select auth.uid()) is not null);
drop policy if exists "farms_update" on public.farms;
create policy "farms_update" on public.farms for update using ((select auth.uid()) is not null);
drop policy if exists "farms_delete" on public.farms;
create policy "farms_delete" on public.farms for delete using ((select auth.uid()) is not null);

drop policy if exists "stables_select" on public.stables;
create policy "stables_select" on public.stables for select using (public.is_stable_member(id));
drop policy if exists "stables_insert" on public.stables;
create policy "stables_insert" on public.stables for insert with check ((select auth.uid()) is not null);
drop policy if exists "stables_update" on public.stables;
create policy "stables_update" on public.stables for update using (public.is_stable_owner(id));
drop policy if exists "stables_delete" on public.stables;
create policy "stables_delete" on public.stables for delete using (public.is_stable_owner(id));

drop policy if exists "stable_members_select" on public.stable_members;
create policy "stable_members_select" on public.stable_members for select using (public.is_stable_member(stable_id));
drop policy if exists "stable_members_insert" on public.stable_members;
create policy "stable_members_insert" on public.stable_members
  for insert with check (
    public.is_stable_owner(stable_id)
    or exists (
      select 1
      from public.stables s
      where s.id = stable_id and s.created_by = (select auth.uid())
    )
  );
drop policy if exists "stable_members_update" on public.stable_members;
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

drop policy if exists "assignments_select" on public.assignments;
create policy "assignments_select" on public.assignments for select using (public.is_stable_member(stable_id));
drop policy if exists "assignments_insert" on public.assignments;
create policy "assignments_insert" on public.assignments for insert with check (public.can_edit_stable(stable_id));
drop policy if exists "assignments_update" on public.assignments;
create policy "assignments_update" on public.assignments
  for update using (public.can_edit_stable(stable_id) or public.can_claim_assignments(stable_id));
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
create policy "posts_delete" on public.posts for delete using ((select auth.uid()) = user_id);

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

drop policy if exists "conversation_members_select" on public.conversation_members;
create policy "conversation_members_select" on public.conversation_members
  for select using ((select auth.uid()) = user_id);
drop policy if exists "conversation_members_insert" on public.conversation_members;
create policy "conversation_members_insert" on public.conversation_members
  for insert with check ((select auth.uid()) = user_id);
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

-- Foreign key indexes for performance
create index if not exists alerts_stable_id_idx on public.alerts(stable_id);
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
create index if not exists default_passes_stable_id_idx on public.default_passes(stable_id);
create index if not exists groups_created_by_user_id_idx on public.groups(created_by_user_id);
create index if not exists groups_farm_id_idx on public.groups(farm_id);
create index if not exists groups_horse_id_idx on public.groups(horse_id);
create index if not exists groups_stable_id_idx on public.groups(stable_id);
create index if not exists horse_day_statuses_horse_id_idx on public.horse_day_statuses(horse_id);
create index if not exists horses_owner_user_id_idx on public.horses(owner_user_id);
create index if not exists horses_stable_id_idx on public.horses(stable_id);
create index if not exists likes_post_id_idx on public.likes(post_id);
create index if not exists messages_author_id_idx on public.messages(author_id);
create index if not exists messages_conversation_id_idx on public.messages(conversation_id);
create index if not exists paddocks_stable_id_idx on public.paddocks(stable_id);
create index if not exists posts_stable_id_idx on public.posts(stable_id);
create index if not exists posts_user_id_idx on public.posts(user_id);
create index if not exists ride_logs_created_by_user_id_idx on public.ride_logs(created_by_user_id);
create index if not exists ride_logs_horse_id_idx on public.ride_logs(horse_id);
create index if not exists ride_logs_stable_id_idx on public.ride_logs(stable_id);
create index if not exists riding_days_stable_id_idx on public.riding_days(stable_id);
create index if not exists stable_invites_stable_id_idx on public.stable_invites(stable_id);
create index if not exists stable_members_user_id_idx on public.stable_members(user_id);
create index if not exists stables_created_by_idx on public.stables(created_by);
create index if not exists stables_farm_id_idx on public.stables(farm_id);
