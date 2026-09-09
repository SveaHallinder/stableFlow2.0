-- Fas 3 — innehållsrapportering (App Store / Google Play UGC-krav).
-- Medlemmar kan flagga stötande innehåll; feed-/gruppansvariga (admin/staff) ser och
-- löser rapporter för sitt stall.

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
    public.is_stable_member(stable_id)
    and reporter_user_id = (select auth.uid())
  );

drop policy if exists "content_reports_select" on public.content_reports;
create policy "content_reports_select" on public.content_reports
  for select using (
    reporter_user_id = (select auth.uid())
    or public.can_manage_groups(stable_id)
  );

drop policy if exists "content_reports_update" on public.content_reports;
create policy "content_reports_update" on public.content_reports
  for update using (public.can_manage_groups(stable_id));

create index if not exists content_reports_stable_open_idx
  on public.content_reports(stable_id, created_at desc)
  where resolved_at is null;
