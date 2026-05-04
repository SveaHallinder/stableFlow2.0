-- Phase 6: important stable alerts separated from social feed and chat.

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

create index if not exists stable_alerts_stable_id_idx on public.stable_alerts(stable_id);
create index if not exists stable_alerts_horse_id_idx on public.stable_alerts(horse_id);
create index if not exists stable_alerts_paddock_id_idx on public.stable_alerts(paddock_id);
create index if not exists stable_alerts_assignment_id_idx on public.stable_alerts(assignment_id);
create index if not exists stable_alerts_active_idx
  on public.stable_alerts(stable_id, severity, created_at desc)
  where resolved_at is null;

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

create or replace function public.trigger_push_new_stable_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_push('alert', to_jsonb(NEW));
  return NEW;
end;
$$;

drop trigger if exists on_stable_alert_push on public.stable_alerts;
create trigger on_stable_alert_push
  after insert on public.stable_alerts
  for each row
  execute function public.trigger_push_new_stable_alert();
