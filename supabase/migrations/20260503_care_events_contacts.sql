-- Phase 5: External contacts (farrier/vet/etc) and care events that become horse history.

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

create index if not exists external_contacts_stable_id_idx on public.external_contacts(stable_id);
create index if not exists care_events_stable_id_idx on public.care_events(stable_id);
create index if not exists care_events_stable_id_date_idx on public.care_events(stable_id, date);
create index if not exists care_events_horse_ids_gin_idx on public.care_events using gin (horse_ids);

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
