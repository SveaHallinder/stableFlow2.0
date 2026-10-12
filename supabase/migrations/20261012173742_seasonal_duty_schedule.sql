-- Approved seasonal duties. Existing legacy assignments are never inferred as templates.
-- Concrete batches are resumable; only a database-verified complete revision is active.
begin;

do $dependencies$ begin
  if to_regprocedure('public.account_is_active()') is null
    or to_regclass('public.account_deletion_intents') is null
    or to_regprocedure('public.guard_assignment_member_update()') is null
    or to_regprocedure('public.guard_recurring_assignment_content()') is null then
    raise exception '[season schedule] Befintliga konto- och passkydd måste finnas.' using errcode='55000';
  end if;
end $dependencies$;

create table public.schedule_periods (
  id uuid primary key,
  stable_id uuid not null references public.stables(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  date_from date not null,
  date_to date not null,
  revision integer not null default 1 check (revision > 0),
  generation_revision integer not null default 0 check (generation_revision >= 0 and generation_revision <= revision),
  status text not null default 'draft' check (status in ('draft','generating','ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,stable_id),
  check (isfinite(date_from) and isfinite(date_to) and date_from <= date_to),
  constraint schedule_periods_duration_check check (date_to-date_from <= 365),
  check (status <> 'ready' or generation_revision = revision)
);
create table public.schedule_templates (
  id uuid primary key,
  period_id uuid not null,
  -- Technical scope key makes cross-stable links impossible even for trusted SQL.
  stable_id uuid not null,
  name text not null check (btrim(name) <> ''),
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and end_time > start_time),
  instructions text not null default '',
  sort_order integer not null default 0 check (sort_order >= 0),
  archived boolean not null default false,
  unique (id,stable_id),
  foreign key (period_id,stable_id) references public.schedule_periods(id,stable_id) on delete cascade
);
create table public.schedule_weekly_assignments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.schedule_templates(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  effective_from date not null check (isfinite(effective_from)),
  assignee_id uuid references public.profiles(id) on delete set null,
  changed_by_user_id uuid references public.profiles(id) on delete set null,
  owner_controlled boolean not null default false,
  revision integer not null check (revision > 0),
  unique (template_id,weekday,effective_from)
);
create index schedule_periods_scope_idx on public.schedule_periods(stable_id,date_from,date_to);
create index schedule_templates_period_idx on public.schedule_templates(period_id,sort_order,id);
create index schedule_weekly_assignee_idx on public.schedule_weekly_assignments(assignee_id) where assignee_id is not null;

alter table public.assignments add column template_id uuid;
alter table public.assignments add column original_date date;
alter table public.assignments add column is_schedule_override boolean not null default false;
alter table public.assignments add constraint assignments_schedule_template_fkey
  foreign key (template_id,stable_id) references public.schedule_templates(id,stable_id) on delete restrict;
alter table public.assignments add constraint assignments_schedule_identity_check
  check ((template_id is null and original_date is null and not is_schedule_override)
    or (template_id is not null and original_date is not null and stable_id is not null and series_id is null));
create unique index assignments_schedule_occurrence_unique on public.assignments(template_id,original_date) where template_id is not null;

alter table public.schedule_periods enable row level security;
alter table public.schedule_templates enable row level security;
alter table public.schedule_weekly_assignments enable row level security;
revoke all on public.schedule_periods,public.schedule_templates,public.schedule_weekly_assignments from public,anon,authenticated,service_role;
grant select on public.schedule_periods,public.schedule_templates,public.schedule_weekly_assignments to authenticated;

-- RLS uses the same current identity and membership contract as the RPCs.
create function public.schedule_has_access(p_stable_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog set row_security=off as $$
  select auth.role()='authenticated' and public.account_is_active()
    and exists(select 1 from auth.users a join public.profiles p on p.id=a.id
      join public.stable_members m on m.user_id=p.id
      where a.id=auth.uid() and m.stable_id=p_stable_id and a.deleted_at is null
        and coalesce(a.banned_until,'-infinity'::timestamptz)<=statement_timestamp());
$$;
revoke all on function public.schedule_has_access(uuid) from public,anon,authenticated,service_role;
grant execute on function public.schedule_has_access(uuid) to authenticated;
create policy schedule_periods_read on public.schedule_periods for select to authenticated using (public.schedule_has_access(stable_id));
create policy schedule_templates_read on public.schedule_templates for select to authenticated using (public.schedule_has_access(stable_id));
create policy schedule_weekly_read on public.schedule_weekly_assignments for select to authenticated
  using (exists(select 1 from public.schedule_templates t where t.id=template_id and public.schedule_has_access(t.stable_id)));
create policy schedule_assignments_read on public.assignments as restrictive for select to authenticated
  using (template_id is null or (public.schedule_has_access(stable_id) and exists(
    select 1 from public.schedule_templates t join public.schedule_periods p on p.id=t.period_id
    where t.id=template_id and p.stable_id=assignments.stable_id and p.status='ready' and p.generation_revision=p.revision)));
create policy schedule_assignments_insert on public.assignments as restrictive for insert to authenticated with check (template_id is null);
create policy schedule_assignments_delete on public.assignments as restrictive for delete to authenticated using (template_id is null);
create policy schedule_assignments_update on public.assignments as restrictive for update to authenticated
  using (template_id is null or public.schedule_has_access(stable_id))
  with check (template_id is null or public.schedule_has_access(stable_id));

-- Shared lock order: Auth, profile/deletion intent, stable, membership, period, occurrence.
-- The harmless stable write also makes stale Repeatable Read snapshots conflict.
create function public.lock_schedule_scope(p_expected_user_id uuid,p_stable_id uuid,p_assignee_id uuid default null,p_write boolean default true)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog set row_security=off as $$
declare person uuid; owner boolean;
begin
  -- Deletion preparation locks the profile without changing its tuple version.
  -- A historical snapshot could otherwise miss its newly committed intent.
  if p_write and current_setting('transaction_isolation') <> 'read committed' then
    raise exception '[season schedule] Ändringen kräver ett färskt läsläge. Försök igen.' using errcode='40001';
  end if;
  if auth.role() is distinct from 'authenticated' or auth.uid() is null
    or auth.uid() is distinct from p_expected_user_id or p_stable_id is null then
    raise exception '[season schedule] Inloggning och rätt konto krävs.' using errcode='42501';
  end if;
  if not exists(select 1 from public.stable_members where stable_id=p_stable_id and user_id=auth.uid()) then
    raise exception '[season schedule] Du måste vara medlem i det valda stallet.' using errcode='42501';
  end if;
  for person in select distinct x from unnest(array[p_expected_user_id,p_assignee_id]) x where x is not null order by x loop
    perform 1 from auth.users where id=person and deleted_at is null
      and coalesce(banned_until,'-infinity'::timestamptz)<=clock_timestamp() for share;
    if not found then raise exception '[season schedule] Kontot eller den ansvariga personen är inte aktiv.' using errcode='42501'; end if;
    perform 1 from public.profiles where id=person for key share;
    if not found or exists(select 1 from public.account_deletion_intents where user_id=person) then
      raise exception '[season schedule] Kontot håller på att tas bort eller är inte aktivt.' using errcode='42501';
    end if;
  end loop;
  if p_write then update public.stables set created_at=created_at where id=p_stable_id;
  else perform 1 from public.stables where id=p_stable_id for key share; end if;
  if not found then raise exception '[season schedule] Stallet finns inte längre.' using errcode='42501'; end if;
  perform 1 from public.stable_members where stable_id=p_stable_id and user_id=any(array[p_expected_user_id,p_assignee_id]) order by user_id for share;
  select role='admin' and coalesce(access,'view')='owner' into owner
    from public.stable_members where stable_id=p_stable_id and user_id=p_expected_user_id;
  if not found or public.account_is_active() is distinct from true then
    raise exception '[season schedule] Ditt medlemskap eller konto har ändrats. Uppdatera schemat.' using errcode='42501';
  end if;
  if p_assignee_id is not null and not exists(select 1 from public.stable_members where stable_id=p_stable_id
    and user_id=p_assignee_id and role in ('admin','staff','rider')) then
    raise exception '[season schedule] Ansvarig måste vara en behörig medlem i samma stall.' using errcode='42501';
  end if;
  return owner;
end $$;
revoke all on function public.lock_schedule_scope(uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;
-- The invoker trigger calls this check too; calling it directly grants no schedule write.
grant execute on function public.lock_schedule_scope(uuid,uuid,uuid,boolean) to authenticated;

-- No extension is needed for overlap protection: all definitions serialize on their stable.
create function public.guard_schedule_period_dates()
returns trigger language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
begin
  if tg_op='UPDATE' and new.stable_id is distinct from old.stable_id then
    raise exception '[season schedule] Perioden får inte flyttas till ett annat stall.' using errcode='23514';
  end if;
  update public.stables set created_at=created_at where id=new.stable_id;
  if exists(select 1 from public.schedule_periods p where p.stable_id=new.stable_id and p.id<>new.id
    and p.date_from<=new.date_to and p.date_to>=new.date_from) then
    raise exception '[season schedule] Datumen överlappar en annan period i stallet.' using errcode='23P01';
  end if;
  return new;
end $$;
revoke all on function public.guard_schedule_period_dates() from public,anon,authenticated,service_role;
create trigger guard_schedule_period_dates before insert or update on public.schedule_periods for each row execute function public.guard_schedule_period_dates();

create function public.get_season_schedule(p_expected_user_id uuid,p_stable_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare periods jsonb; templates jsonb; rules jsonb;
begin
  perform public.lock_schedule_scope(p_expected_user_id,p_stable_id,null,false);
  select coalesce(jsonb_agg(to_jsonb(p) order by p.date_from,p.id),'[]'::jsonb) into periods from public.schedule_periods p where p.stable_id=p_stable_id;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.period_id,t.sort_order,t.id),'[]'::jsonb) into templates from public.schedule_templates t where t.stable_id=p_stable_id;
  select coalesce(jsonb_agg(to_jsonb(w) order by w.template_id,w.weekday,w.effective_from),'[]'::jsonb) into rules
    from public.schedule_weekly_assignments w join public.schedule_templates t on t.id=w.template_id where t.stable_id=p_stable_id;
  return jsonb_build_object('user_id',p_expected_user_id,'stable_id',p_stable_id,'periods',periods,'templates',templates,'weekly_assignments',rules);
end $$;

create function public.save_schedule_period(p_expected_user_id uuid,p_stable_id uuid,p_period_id uuid,p_expected_revision integer,
  p_name text,p_date_from date,p_date_to date,p_templates jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare period public.schedule_periods%rowtype; item jsonb; template_id uuid; requested jsonb; stored jsonb; replay boolean;
begin
  if not public.lock_schedule_scope(p_expected_user_id,p_stable_id) then
    raise exception '[season schedule] Bara stallägaren får ändra perioder och passmallar.' using errcode='42501';
  end if;
  if isfinite(p_date_from) and isfinite(p_date_to) and p_date_to-p_date_from>365 then
    raise exception '[season schedule] En period får vara högst 366 dagar inklusive start- och slutdatum.' using errcode='22023';
  end if;
  if p_period_id is null or p_expected_revision is null or p_expected_revision<0 or p_name is null or btrim(p_name)=''
    or p_date_from is null or p_date_to is null or not isfinite(p_date_from) or not isfinite(p_date_to) or p_date_from>p_date_to
    or p_templates is null or jsonb_typeof(p_templates)<>'array' then
    raise exception '[season schedule] Ange periodnamn, giltiga datum och passmallar.' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_templates) loop
    if jsonb_typeof(item)<>'object' or not (item ?& array['id','name','start_time','end_time','instructions','sort_order','archived'])
      or (select count(*) from jsonb_object_keys(item))<>7
      or coalesce(item->>'id','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(item->'name')<>'string' or btrim(item->>'name')=''
      or coalesce(item->>'start_time','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or (item->>'end_time' is not null and ((item->>'end_time')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or item->>'end_time'<=item->>'start_time'))
      or jsonb_typeof(item->'instructions')<>'string' or jsonb_typeof(item->'archived')<>'boolean'
      or jsonb_typeof(item->'sort_order')<>'number' or coalesce(item->>'sort_order','')!~'^[0-9]{1,9}$' then
      raise exception '[season schedule] Varje pass behöver egen identitet, namn, giltiga tider och instruktioner.' using errcode='22023';
    end if;
  end loop;
  if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p_templates)) then
    raise exception '[season schedule] Två passmallar får inte ha samma identitet.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',(value->>'id')::uuid,'name',btrim(value->>'name'),'start_time',value->>'start_time',
    'end_time',value->>'end_time','instructions',value->>'instructions','sort_order',(value->>'sort_order')::integer,'archived',(value->>'archived')::boolean)
    order by (value->>'id')::uuid),'[]'::jsonb) into requested from jsonb_array_elements(p_templates);
  select * into period from public.schedule_periods where id=p_period_id for update;
  if found then
    if period.stable_id<>p_stable_id then raise exception '[season schedule] Perioden tillhör ett annat stall.' using errcode='42501'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'start_time',t.start_time,'end_time',t.end_time,
      'instructions',t.instructions,'sort_order',t.sort_order,'archived',t.archived) order by t.id),'[]'::jsonb) into stored
      from public.schedule_templates t where t.period_id=p_period_id and (not t.archived or t.id in(select (value->>'id')::uuid from jsonb_array_elements(requested)));
    replay := period.revision=p_expected_revision+1 and period.name=btrim(p_name) and period.date_from=p_date_from and period.date_to=p_date_to and stored=requested;
    if replay then return jsonb_build_object('user_id',p_expected_user_id,'stable_id',p_stable_id,'period',to_jsonb(period)); end if;
    if period.revision<>p_expected_revision then raise exception '[season schedule] Perioden ändrades samtidigt. Uppdatera innan du sparar.' using errcode='40001'; end if;
  elsif p_expected_revision<>0 then
    raise exception '[season schedule] Perioden finns inte längre. Uppdatera schemat.' using errcode='40001';
  end if;
  if exists(select 1 from public.schedule_templates t where t.id in(select (value->>'id')::uuid from jsonb_array_elements(requested))
    and (t.period_id<>p_period_id or t.stable_id<>p_stable_id)) then
    raise exception '[season schedule] Passmallar får inte flyttas mellan perioder eller stall.' using errcode='42501';
  end if;
  if exists(select 1 from public.assignments a join jsonb_array_elements(requested) proposed on (proposed.value->>'id')::uuid=a.template_id
    where a.stable_id=p_stable_id and not a.is_schedule_override and a.status<>'completed' and a.completed_at is null
      and not (proposed.value->>'archived')::boolean and a.original_date between p_date_from and p_date_to
      and case when a.time~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then (a.date+a.time::time) at time zone 'Europe/Stockholm'>clock_timestamp() else false end
      and (a.original_date+(proposed.value->>'start_time')::time) at time zone 'Europe/Stockholm'<=clock_timestamp()) then
    raise exception '[season schedule] Den nya starttiden måste ligga i framtiden för alla ändringsbara pass.' using errcode='23514';
  end if;
  insert into public.schedule_periods(id,stable_id,name,date_from,date_to,revision,status)
    values(p_period_id,p_stable_id,btrim(p_name),p_date_from,p_date_to,1,'generating')
    on conflict(id) do update set name=excluded.name,date_from=excluded.date_from,date_to=excluded.date_to,
      revision=schedule_periods.revision+1,status='generating',updated_at=clock_timestamp()
    returning * into period;
  -- Omitted definitions are archived, retaining all historical identity links.
  update public.schedule_templates set archived=true where period_id=p_period_id and id not in(select (value->>'id')::uuid from jsonb_array_elements(requested));
  for item in select value from jsonb_array_elements(requested) loop
    template_id:=(item->>'id')::uuid;
    insert into public.schedule_templates(id,period_id,stable_id,name,start_time,end_time,instructions,sort_order,archived)
      values(template_id,p_period_id,p_stable_id,item->>'name',item->>'start_time',item->>'end_time',item->>'instructions',(item->>'sort_order')::integer,(item->>'archived')::boolean)
      on conflict(id) do update set name=excluded.name,start_time=excluded.start_time,end_time=excluded.end_time,
        instructions=excluded.instructions,sort_order=excluded.sort_order,archived=excluded.archived;
  end loop;
  return jsonb_build_object('user_id',p_expected_user_id,'stable_id',p_stable_id,'period',to_jsonb(period));
end $$;

-- Authoritative expected rows; this never depends on a client-loaded subset.
create function public.schedule_expected_occurrences(p_period_id uuid)
returns table(template_id uuid,original_date date,label text,"time" text,note text,slot text,icon text,assignee_id uuid)
language sql stable security definer set search_path=pg_catalog set row_security=off as $$
  select t.id,d.day::date,t.name,t.start_time,
    t.instructions || case when t.end_time is null then '' else case when t.instructions='' then '' else E'\n' end || 'Slut: ' || t.end_time end,
    case when t.start_time<'10:00' then 'Morning' when t.start_time<'15:00' then 'Lunch' else 'Evening' end,
    case when t.start_time<'10:00' then 'sun' when t.start_time<'15:00' then 'clock' else 'moon' end,
    case when exists(select 1 from public.stable_members m join public.profiles pr on pr.id=m.user_id join auth.users a on a.id=pr.id
      where m.stable_id=p.stable_id and m.user_id=w.assignee_id and m.role in ('admin','staff','rider') and a.deleted_at is null
        and coalesce(a.banned_until,'-infinity'::timestamptz)<=statement_timestamp()
        and not exists(select 1 from public.account_deletion_intents i where i.user_id=m.user_id)) then w.assignee_id else null end
  from public.schedule_periods p join public.schedule_templates t on t.period_id=p.id and not t.archived
  cross join lateral generate_series(p.date_from::timestamp,p.date_to::timestamp,interval '1 day') d(day)
  left join lateral (select r.assignee_id from public.schedule_weekly_assignments r where r.template_id=t.id
    and r.weekday=extract(isodow from d.day)::integer-1 and r.effective_from<=d.day::date order by r.effective_from desc limit 1) w on true
  where p.id=p_period_id;
$$;
revoke all on function public.schedule_expected_occurrences(uuid) from public,anon,authenticated,service_role;

create function public.generate_schedule_batch(p_expected_user_id uuid,p_stable_id uuid,p_period_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare period public.schedule_periods%rowtype; target record; changed integer:=0; total bigint; generated bigint; extra bigint; affected integer;
begin
  if not public.lock_schedule_scope(p_expected_user_id,p_stable_id) then
    raise exception '[season schedule] Bara stallägaren får skapa eller återuppta periodens pass.' using errcode='42501';
  end if;
  select * into period from public.schedule_periods where id=p_period_id and stable_id=p_stable_id for update;
  if not found then raise exception '[season schedule] Perioden finns inte i det valda stallet.' using errcode='42501'; end if;
  if p_expected_revision is null or period.revision<>p_expected_revision then
    raise exception '[season schedule] Perioden ändrades. Uppdatera och återuppta rätt version.' using errcode='40001';
  end if;
  -- Hold entitlement parents for currently selected people while materializing snapshots.
  perform 1 from auth.users u where u.id in(select w.assignee_id from public.schedule_weekly_assignments w
    join public.schedule_templates t on t.id=w.template_id where t.period_id=p_period_id) order by u.id for share;
  perform 1 from public.profiles u where u.id in(select w.assignee_id from public.schedule_weekly_assignments w
    join public.schedule_templates t on t.id=w.template_id where t.period_id=p_period_id) order by u.id for key share;
  perform 1 from public.stable_members m where m.stable_id=p_stable_id and m.user_id in(select w.assignee_id from public.schedule_weekly_assignments w
    join public.schedule_templates t on t.id=w.template_id where t.period_id=p_period_id) order by m.user_id for share;
  for target in
    with expected as materialized (select * from public.schedule_expected_occurrences(p_period_id)),
    changes as (
      select case when a.id is null then 'insert' else 'update' end kind,a.id assignment_id,e.*
      from expected e left join public.assignments a on a.template_id=e.template_id and a.original_date=e.original_date
      where a.id is null or (not a.is_schedule_override and a.status<>'completed' and a.completed_at is null
        and case when a.time~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then (a.date+a.time::time) at time zone 'Europe/Stockholm'>clock_timestamp() else false end
        and row(a.date,a.label,a.time,coalesce(a.note,''),a.slot,a.icon,a.assignee_id,a.status,a.assigned_via)
          is distinct from row(e.original_date,e.label,e.time,e.note,e.slot,e.icon,e.assignee_id,
            case when e.assignee_id is null then 'open' else 'assigned' end,case when e.assignee_id is null then null::text else 'default' end))
      union all
      select 'delete',a.id,a.template_id,a.original_date,a.label,a.time,a.note,a.slot,a.icon,a.assignee_id
      from public.assignments a join public.schedule_templates t on t.id=a.template_id
      where t.period_id=p_period_id and not a.is_schedule_override and a.status<>'completed' and a.completed_at is null
        and case when a.time~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then (a.date+a.time::time) at time zone 'Europe/Stockholm'>clock_timestamp() else false end
        and not exists(select 1 from expected e where e.template_id=a.template_id and e.original_date=a.original_date)
        and not exists(select 1 from public.assignment_history h where h.assignment_id=a.id)
    ) select * from changes order by template_id,original_date,kind limit 365
  loop
    if target.kind='delete' then
      delete from public.assignments a where a.id=target.assignment_id and not a.is_schedule_override
        and a.status<>'completed' and a.completed_at is null
        and (a.date+a.time::time) at time zone 'Europe/Stockholm'>clock_timestamp()
        and not exists(select 1 from public.assignment_history h where h.assignment_id=a.id);
    elsif target.kind='insert' then
      insert into public.assignments(stable_id,date,slot,label,icon,time,note,status,assignee_id,assigned_via,template_id,original_date)
        values(p_stable_id,target.original_date,target.slot,target.label,target.icon,target.time,target.note,
          case when target.assignee_id is null then 'open' else 'assigned' end,target.assignee_id,
          case when target.assignee_id is null then null else 'default' end,target.template_id,target.original_date)
        on conflict(template_id,original_date) where template_id is not null do nothing;
    else
      update public.assignments set date=target.original_date,slot=target.slot,label=target.label,icon=target.icon,time=target.time,note=target.note,
        assignee_id=target.assignee_id,status=case when target.assignee_id is null then 'open' else 'assigned' end,
        assigned_via=case when target.assignee_id is null then null else 'default' end,updated_at=clock_timestamp()
        where id=target.assignment_id and not is_schedule_override and status<>'completed' and completed_at is null
          and (date+time::time) at time zone 'Europe/Stockholm'>clock_timestamp();
    end if;
    get diagnostics affected=row_count; changed:=changed+affected;
  end loop;
  select count(*),count(a.id) filter(where a.is_schedule_override or a.status='completed' or a.completed_at is not null
    or case when a.time~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then (a.date+a.time::time) at time zone 'Europe/Stockholm'<=clock_timestamp() else true end
    or row(a.date,a.label,a.time,coalesce(a.note,''),a.slot,a.icon,a.assignee_id,a.status,a.assigned_via)
      is not distinct from row(e.original_date,e.label,e.time,e.note,e.slot,e.icon,e.assignee_id,
        case when e.assignee_id is null then 'open' else 'assigned' end,case when e.assignee_id is null then null::text else 'default' end))
    into total,generated from public.schedule_expected_occurrences(p_period_id) e
    left join public.assignments a on a.template_id=e.template_id and a.original_date=e.original_date;
  select count(*) into extra from public.assignments a join public.schedule_templates t on t.id=a.template_id
    where t.period_id=p_period_id and not a.is_schedule_override and a.status<>'completed' and a.completed_at is null
      and case when a.time~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then (a.date+a.time::time) at time zone 'Europe/Stockholm'>clock_timestamp() else false end
      and (t.archived or a.original_date<period.date_from or a.original_date>period.date_to)
      and not exists(select 1 from public.assignment_history h where h.assignment_id=a.id);
  update public.schedule_periods set status=case when total=generated and extra=0 then 'ready' else 'generating' end,
    generation_revision=case when total=generated and extra=0 then revision else generation_revision end,
    updated_at=case when changed>0 or status<>'ready' then clock_timestamp() else updated_at end
    where id=p_period_id returning * into period;
  return jsonb_build_object('user_id',p_expected_user_id,'stable_id',p_stable_id,'period',to_jsonb(period),
    'changed_count',changed,'total_count',total,'generated_count',generated);
end $$;

create function public.set_schedule_weekly_assignment(p_expected_user_id uuid,p_stable_id uuid,p_template_id uuid,p_weekday integer,
  p_effective_from date,p_assignee_id uuid,p_owner_controlled boolean,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare owner boolean; period public.schedule_periods%rowtype; rule public.schedule_weekly_assignments%rowtype;
  prior public.schedule_weekly_assignments%rowtype; current_revision integer; total integer; updated integer;
begin
  owner:=public.lock_schedule_scope(p_expected_user_id,p_stable_id,p_assignee_id);
  select p.* into period from public.schedule_periods p join public.schedule_templates t on t.period_id=p.id
    where t.id=p_template_id and t.stable_id=p_stable_id and not t.archived for update of p;
  if not found then raise exception '[season schedule] Passmallen finns inte i den valda perioden.' using errcode='42501'; end if;
  if period.status<>'ready' or period.generation_revision<>period.revision then
    raise exception '[season schedule] Periodens pass skapas fortfarande. Återuppta och slutför först.' using errcode='55000';
  end if;
  if p_weekday is null or p_weekday not between 0 and 6 or p_effective_from is null
    or p_effective_from<period.date_from or p_effective_from>period.date_to or p_expected_revision is null
    or p_expected_revision<0 or p_owner_controlled is null then
    raise exception '[season schedule] Välj en giltig veckodag och ett från-datum inom perioden.' using errcode='22023';
  end if;
  perform 1 from public.schedule_weekly_assignments where template_id=p_template_id and weekday=p_weekday order by effective_from for update;
  select coalesce(max(revision),0) into current_revision from public.schedule_weekly_assignments where template_id=p_template_id and weekday=p_weekday;
  if current_revision<>p_expected_revision then
    raise exception '[season schedule] Veckofördelningen ändrades samtidigt. Uppdatera innan du väljer.' using errcode='40001';
  end if;
  select * into prior from public.schedule_weekly_assignments where template_id=p_template_id and weekday=p_weekday
    and effective_from<=p_effective_from order by effective_from desc limit 1;
  if not owner then
    if not exists(select 1 from public.stable_members where stable_id=p_stable_id and user_id=p_expected_user_id and role in ('admin','staff','rider'))
      or p_owner_controlled or (p_assignee_id is not null and p_assignee_id<>p_expected_user_id)
      or prior.owner_controlled is true
      or exists(select 1 from public.schedule_weekly_assignments where template_id=p_template_id and weekday=p_weekday
        and effective_from>p_effective_from and effective_from<=period.date_to and owner_controlled) then
      raise exception '[season schedule] Stallägaren styr dessa veckopass. Du kan bara välja egna lediga pass.' using errcode='42501';
    end if;
    if (prior.assignee_id is not null and prior.assignee_id<>p_expected_user_id)
      or exists(select 1 from public.schedule_weekly_assignments where template_id=p_template_id and weekday=p_weekday
        and effective_from>p_effective_from and effective_from<=period.date_to and assignee_id is not null and assignee_id<>p_expected_user_id)
      or (p_assignee_id is null and prior.assignee_id is distinct from p_expected_user_id) then
      raise exception '[season schedule] Veckopasset står på någon annan eller är inte ditt att släppa.' using errcode='42501';
    end if;
  end if;
  select count(*) into total from public.assignments a where a.template_id=p_template_id
    and extract(isodow from a.original_date)::integer-1=p_weekday and a.original_date>=p_effective_from and a.original_date<=period.date_to
    and not a.is_schedule_override and a.status<>'completed' and a.completed_at is null
    and case when a.time~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then (a.date+a.time::time) at time zone 'Europe/Stockholm'>clock_timestamp() else false end;
  if total>365 then raise exception '[season schedule] Högst 365 pass får ändras per omgång. Välj ett senare från-datum.' using errcode='23514'; end if;
  -- Owner decisions replace all later segments; members cannot erase later authority.
  if owner then delete from public.schedule_weekly_assignments where template_id=p_template_id and weekday=p_weekday and effective_from>p_effective_from; end if;
  insert into public.schedule_weekly_assignments(template_id,weekday,effective_from,assignee_id,changed_by_user_id,owner_controlled,revision)
    values(p_template_id,p_weekday,p_effective_from,p_assignee_id,p_expected_user_id,p_owner_controlled,current_revision+1)
    on conflict(template_id,weekday,effective_from) do update set assignee_id=excluded.assignee_id,
      changed_by_user_id=excluded.changed_by_user_id,owner_controlled=excluded.owner_controlled,revision=excluded.revision
    returning * into rule;
  with expected as (select e.* from public.schedule_expected_occurrences(period.id) e
    where e.template_id=p_template_id and extract(isodow from e.original_date)::integer-1=p_weekday and e.original_date>=p_effective_from)
  update public.assignments a set assignee_id=e.assignee_id,status=case when e.assignee_id is null then 'open' else 'assigned' end,
    assigned_via=case when e.assignee_id is null then null else 'default' end,updated_at=clock_timestamp()
    from expected e where a.template_id=e.template_id and a.original_date=e.original_date
      and not a.is_schedule_override and a.status<>'completed' and a.completed_at is null
      and case when a.time~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then (a.date+a.time::time) at time zone 'Europe/Stockholm'>clock_timestamp() else false end
      and row(a.assignee_id,a.status,a.assigned_via) is distinct from row(e.assignee_id,
        case when e.assignee_id is null then 'open' else 'assigned' end,case when e.assignee_id is null then null::text else 'default' end);
  get diagnostics updated=row_count;
  return jsonb_build_object('user_id',p_expected_user_id,'stable_id',p_stable_id,'rule',to_jsonb(rule),'updated_count',updated);
end $$;

create function public.update_schedule_occurrence(p_expected_user_id uuid,p_stable_id uuid,p_assignment_id uuid,p_expected_updated_at text,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare owner boolean; period public.schedule_periods%rowtype; target public.assignments%rowtype; expected record;
  person uuid; stamp timestamptz; next_date date; next_time text; next_name text; next_note text; next_end text;
  reset boolean; next_slot text; next_icon text;
begin
  if p_changes is null or jsonb_typeof(p_changes)<>'object' or (select count(*) from jsonb_object_keys(p_changes))=0
    or exists(select 1 from jsonb_object_keys(p_changes) x where x not in ('date','label','time','end_time','instructions','assignee_id','reset_override')) then
    raise exception '[season schedule] Ange en giltig ändring för bara detta pass.' using errcode='22023';
  end if;
  begin
    person:=case when p_changes ? 'assignee_id' then (p_changes->>'assignee_id')::uuid else null end;
    stamp:=p_expected_updated_at::timestamptz;
    reset:=coalesce((p_changes->>'reset_override')::boolean,false);
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception '[season schedule] Ansvarig eller versionsstämpel är ogiltig.' using errcode='22023';
  end;
  -- Determine the potential target before the lock hierarchy. Recheck it after the
  -- period/row locks: a reset must not assign a newly suspended or deleted person.
  if reset then
    select w.assignee_id into person from public.assignments a
      left join lateral (select r.assignee_id from public.schedule_weekly_assignments r
        where r.template_id=a.template_id and r.weekday=extract(isodow from a.original_date)::integer-1
          and r.effective_from<=a.original_date order by r.effective_from desc limit 1) w on true
      where a.id=p_assignment_id and a.stable_id=p_stable_id;
  elsif not (p_changes ? 'assignee_id') then
    select assignee_id into person from public.assignments where id=p_assignment_id and stable_id=p_stable_id;
  end if;
  owner:=public.lock_schedule_scope(p_expected_user_id,p_stable_id,person);
  select p.* into period from public.schedule_periods p join public.schedule_templates t on t.period_id=p.id
    join public.assignments a on a.template_id=t.id where a.id=p_assignment_id and a.stable_id=p_stable_id for update of p;
  if not found then raise exception '[season schedule] Passet finns inte i det valda stallet.' using errcode='42501'; end if;
  if period.status<>'ready' or period.generation_revision<>period.revision then
    raise exception '[season schedule] Periodens pass skapas fortfarande. Slutför perioden först.' using errcode='55000';
  end if;
  select * into target from public.assignments where id=p_assignment_id and stable_id=p_stable_id for update;
  if stamp is null or target.updated_at is distinct from stamp then
    raise exception '[season schedule] Passet ändrades samtidigt. Uppdatera innan du sparar.' using errcode='40001';
  end if;
  if target.status='completed' or target.completed_at is not null or target.time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or (target.date+target.time::time) at time zone 'Europe/Stockholm'<=clock_timestamp() then
    raise exception '[season schedule] Klara, historiska eller redan startade pass får inte ändras.' using errcode='23514';
  end if;
  if not owner then
    if (select count(*) from jsonb_object_keys(p_changes))<>1 or not (p_changes ? 'assignee_id')
      or not exists(select 1 from public.stable_members where stable_id=p_stable_id and user_id=p_expected_user_id and role in ('admin','staff','rider'))
      or not ((person is null and target.status='assigned' and target.assignee_id=p_expected_user_id)
        or (person=p_expected_user_id and target.status='open' and target.assignee_id is null)) then
      raise exception '[season schedule] Du kan bara släppa ditt eget pass eller ta ett ledigt pass för detta datum.' using errcode='42501';
    end if;
  end if;
  if reset then
    if not owner or (select count(*) from jsonb_object_keys(p_changes))<>1 then
      raise exception '[season schedule] Stallägaren måste återställa passet med ett uttryckligt separat val.' using errcode='42501';
    end if;
    select * into expected from public.schedule_expected_occurrences(period.id) e where e.template_id=target.template_id and e.original_date=target.original_date;
    if not found then raise exception '[season schedule] Passmallen är arkiverad eller datumet ligger utanför perioden.' using errcode='23514'; end if;
    if expected.assignee_id is distinct from person then
      raise exception '[season schedule] Veckofördelningen ändrades. Uppdatera innan du återställer passet.' using errcode='40001';
    end if;
    next_date:=expected.original_date; next_time:=expected.time; next_name:=expected.label; next_note:=expected.note; person:=expected.assignee_id;
  else
    begin next_date:=case when p_changes ? 'date' then (p_changes->>'date')::date else target.date end;
    exception when invalid_datetime_format or datetime_field_overflow then raise exception '[season schedule] Ange ett giltigt datum.' using errcode='22023'; end;
    next_time:=case when p_changes ? 'time' then p_changes->>'time' else target.time end;
    next_name:=case when p_changes ? 'label' then btrim(p_changes->>'label') else target.label end;
    if not (p_changes ? 'assignee_id') then person:=target.assignee_id; end if;
    if p_changes ? 'instructions' then next_note:=p_changes->>'instructions';
    else next_note:=regexp_replace(coalesce(target.note,''),E'(^|\\n)Slut: ([01][0-9]|2[0-3]):[0-5][0-9]$','','i'); end if;
    if p_changes ? 'end_time' then next_end:=p_changes->>'end_time';
    else next_end:=(regexp_match(coalesce(target.note,''),'Slut: (([01][0-9]|2[0-3]):[0-5][0-9])$'))[1]; end if;
    if next_note is null or (p_changes ? 'instructions' and jsonb_typeof(p_changes->'instructions')<>'string')
      or (next_end is not null and (next_end!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or next_end<=next_time)) then
      raise exception '[season schedule] Ange giltiga instruktioner och en sluttid efter starttiden.' using errcode='22023';
    end if;
    next_note:=next_note || case when next_end is null then '' else case when next_note='' then '' else E'\n' end || 'Slut: ' || next_end end;
  end if;
  if next_date is null or not isfinite(next_date) or next_name is null or btrim(next_name)='' or next_time is null
    or next_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '[season schedule] Ange namn, giltigt datum och starttid.' using errcode='22023';
  end if;
  if (next_date+next_time::time) at time zone 'Europe/Stockholm'<=clock_timestamp() then
    raise exception '[season schedule] Den nya starttiden måste ligga i framtiden.' using errcode='23514';
  end if;
  next_slot:=case when next_time<'10:00' then 'Morning' when next_time<'15:00' then 'Lunch' else 'Evening' end;
  next_icon:=case next_slot when 'Morning' then 'sun' when 'Lunch' then 'clock' else 'moon' end;
  update public.assignments set date=next_date,time=next_time,label=next_name,note=next_note,slot=next_slot,icon=next_icon,
    assignee_id=person,status=case when person is null then 'open' else 'assigned' end,
    assigned_via=case when person is null then null when reset then 'default' else 'manual' end,
    declined_by_user_ids=case when person is null and target.assignee_id=p_expected_user_id
      then array_append(array_remove(coalesce(target.declined_by_user_ids,'{}'::uuid[]),p_expected_user_id),p_expected_user_id)
      else array_remove(coalesce(target.declined_by_user_ids,'{}'::uuid[]),person) end,
    is_schedule_override=not reset,updated_at=clock_timestamp() where id=p_assignment_id returning * into target;
  return jsonb_build_object('user_id',p_expected_user_id,'stable_id',p_stable_id,'assignment',to_jsonb(target));
end $$;

-- Retain the exact legacy member-update behavior; explicit seasonal rows use the stricter guard below.
create or replace function public.guard_assignment_member_update()
returns trigger language plpgsql set search_path=pg_catalog as $$
declare caller_id uuid:=auth.uid(); previous_declines uuid[]:=coalesce(old.declined_by_user_ids,'{}'::uuid[]); expected_declines uuid[];
begin
  if old.template_id is not null then return new; end if;
  if current_user in ('postgres','supabase_admin') or auth.role()='service_role' then return new; end if;
  if caller_id is null then raise exception '[assignment update] Inloggning krävs.' using errcode='42501'; end if;
  if new.assignee_id is not null and not exists(select 1 from public.stable_members m where m.stable_id=new.stable_id and m.user_id=new.assignee_id) then
    raise exception '[assignment update] Ansvarig måste tillhöra passets stall.' using errcode='42501';
  end if;
  if public.can_edit_stable(old.stable_id) and public.can_edit_stable(new.stable_id) then return new; end if;
  if not public.can_claim_assignments(old.stable_id)
    or (to_jsonb(new)-array['status','assignee_id','assigned_via','declined_by_user_ids','completed_at','updated_at'])
      is distinct from (to_jsonb(old)-array['status','assignee_id','assigned_via','declined_by_user_ids','completed_at','updated_at']) then
    raise exception '[assignment update] Du får endast ta ett öppet pass eller hantera ditt eget pass.' using errcode='42501';
  end if;
  if old.status='open' and old.assignee_id is null and new.status='assigned' and new.assignee_id=caller_id and new.assigned_via='manual'
    and new.completed_at is not distinct from old.completed_at and coalesce(new.declined_by_user_ids,'{}'::uuid[])=array_remove(previous_declines,caller_id) then return new; end if;
  if old.status='assigned' and old.assignee_id=caller_id then
    if new.status='completed' and new.completed_at is not null and new.assignee_id is not distinct from old.assignee_id
      and new.assigned_via is not distinct from old.assigned_via and new.declined_by_user_ids is not distinct from old.declined_by_user_ids then return new; end if;
    expected_declines:=case when caller_id=any(previous_declines) then previous_declines else array_append(previous_declines,caller_id) end;
    if new.status='open' and new.assignee_id is null and new.assigned_via is null and new.completed_at is not distinct from old.completed_at
      and coalesce(new.declined_by_user_ids,'{}'::uuid[])=expected_declines then return new; end if;
  end if;
  raise exception '[assignment update] Passet har ändrats eller står inte på dig. Uppdatera schemat.' using errcode='42501';
end $$;

create or replace function public.guard_recurring_assignment_content()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if auth.role() is distinct from 'authenticated' then return new; end if;
  if new.series_id is distinct from old.series_id then
    raise exception '[assignment series] Serieidentiteten får inte ändras.' using errcode='23514';
  end if;
  if old.template_id is not null or old.series_id is null then return new; end if;
  if new.stable_id is distinct from old.stable_id then raise exception '[assignment series] Serien får inte flyttas till ett annat stall.' using errcode='23514'; end if;
  if row(new.date,new.slot,new.label,new.icon,new.time,new.note) is not distinct from row(old.date,old.slot,old.label,old.icon,old.time,old.note) then return new; end if;
  if old.status<>'open' or old.assignee_id is not null or old.completed_at is not null or old.time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '[assignment series] Endast framtida öppna pass får ändras.' using errcode='23514';
  end if;
  if (old.date+old.time::time) at time zone 'Europe/Stockholm'<=clock_timestamp() then
    raise exception '[assignment series] Redan startade eller historiska pass får inte ändras.' using errcode='23514';
  end if;
  if new.time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception '[assignment series] Ange en giltig starttid.' using errcode='23514'; end if;
  if (new.date+new.time::time) at time zone 'Europe/Stockholm'<=clock_timestamp() then
    raise exception '[assignment series] Den nya starttiden måste ligga i framtiden.' using errcode='23514';
  end if;
  return new;
end $$;

create function public.guard_season_assignment_update()
returns trigger language plpgsql set search_path=pg_catalog as $$
declare caller_id uuid:=auth.uid(); prior uuid[]:=coalesce(old.declined_by_user_ids,'{}'::uuid[]); ready boolean;
begin
  -- RPCs run as their owner and perform their own scope/version checks. Clients cannot assume that role.
  if current_user in ('postgres','supabase_admin') or auth.role()='service_role' then return new; end if;
  if old.template_id is null then
    if new.template_id is distinct from old.template_id or new.original_date is distinct from old.original_date or new.is_schedule_override then
      raise exception '[season schedule] Äldre pass får inte kopplas till en passmall i efterhand.' using errcode='42501';
    end if;
    return new;
  end if;
  perform public.lock_schedule_scope(caller_id,old.stable_id,new.assignee_id);
  select p.status='ready' and p.generation_revision=p.revision into ready from public.schedule_periods p
    join public.schedule_templates t on t.period_id=p.id where t.id=old.template_id;
  if ready is distinct from true then raise exception '[season schedule] Periodens pass skapas fortfarande.' using errcode='55000'; end if;
  if old.status='completed' or old.completed_at is not null then
    raise exception '[season schedule] Klara pass får inte ändras.' using errcode='23514';
  end if;
  if not public.can_claim_assignments(old.stable_id)
    or (to_jsonb(new)-array['status','assignee_id','assigned_via','declined_by_user_ids','completed_at','updated_at','is_schedule_override'])
      is distinct from (to_jsonb(old)-array['status','assignee_id','assigned_via','declined_by_user_ids','completed_at','updated_at','is_schedule_override']) then
    raise exception '[season schedule] Använd Bara detta pass för innehållsändringar. Du kan bara ta, släppa eller klarmarkera ditt eget pass.' using errcode='42501';
  end if;
  if old.status='assigned' and old.assignee_id=caller_id and new.status='completed' and new.completed_at is not null
    and new.assignee_id=old.assignee_id and new.assigned_via is not distinct from old.assigned_via
    and new.declined_by_user_ids is not distinct from old.declined_by_user_ids then
    new.is_schedule_override:=true; new.updated_at:=clock_timestamp(); return new;
  end if;
  if old.time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or (old.date+old.time::time) at time zone 'Europe/Stockholm'<=clock_timestamp() then
    raise exception '[season schedule] Historiska eller redan startade pass får inte tas eller släppas.' using errcode='23514';
  end if;
  if old.status='open' and old.assignee_id is null and new.status='assigned' and new.assignee_id=caller_id
    and new.assigned_via='manual' and new.completed_at is not distinct from old.completed_at
    and coalesce(new.declined_by_user_ids,'{}'::uuid[])=array_remove(prior,caller_id) then
    new.is_schedule_override:=true; new.updated_at:=clock_timestamp(); return new;
  end if;
  if old.status='assigned' and old.assignee_id=caller_id and new.status='open' and new.assignee_id is null and new.assigned_via is null
    and new.completed_at is not distinct from old.completed_at
    and coalesce(new.declined_by_user_ids,'{}'::uuid[])=(case when caller_id=any(prior) then prior else array_append(prior,caller_id) end) then
    new.is_schedule_override:=true; new.updated_at:=clock_timestamp(); return new;
  end if;
  raise exception '[season schedule] Passet ändrades eller styrs av stallägaren. Uppdatera schemat.' using errcode='42501';
end $$;
revoke all on function public.guard_season_assignment_update() from public,anon,authenticated,service_role;
create trigger guard_season_assignment_update before update on public.assignments for each row execute function public.guard_season_assignment_update();

-- Preserve shared schedule identities when a person leaves. No template or occurrence is deleted.
create function public.detach_schedule_person(p_user_id uuid,p_stable_id uuid default null)
returns void language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
begin
  perform 1 from public.schedule_periods p where (p_stable_id is null or p.stable_id=p_stable_id)
    and (exists(select 1 from public.assignments a join public.schedule_templates t on t.id=a.template_id where t.period_id=p.id and a.assignee_id=p_user_id)
      or exists(select 1 from public.schedule_weekly_assignments w join public.schedule_templates t on t.id=w.template_id
        where t.period_id=p.id and (w.assignee_id=p_user_id or w.changed_by_user_id=p_user_id))) order by p.id for update;
  update public.schedule_weekly_assignments w set assignee_id=case when w.assignee_id=p_user_id then null else w.assignee_id end,
    changed_by_user_id=case when w.changed_by_user_id=p_user_id then null else w.changed_by_user_id end,revision=revision+1
    from public.schedule_templates t where t.id=w.template_id and (p_stable_id is null or t.stable_id=p_stable_id)
      and (w.assignee_id=p_user_id or w.changed_by_user_id=p_user_id);
  update public.assignments a set assignee_id=null,
    status=case when a.status<>'completed' and a.completed_at is null
      and case when a.time~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then (a.date+a.time::time) at time zone 'Europe/Stockholm'>clock_timestamp() else false end then 'open' else a.status end,
    assigned_via=null,declined_by_user_ids=array_remove(coalesce(a.declined_by_user_ids,'{}'::uuid[]),p_user_id),updated_at=clock_timestamp()
    where a.template_id is not null and (p_stable_id is null or a.stable_id=p_stable_id) and a.assignee_id=p_user_id;
  update public.assignments a set declined_by_user_ids=array_remove(a.declined_by_user_ids,p_user_id),updated_at=clock_timestamp()
    where a.template_id is not null and (p_stable_id is null or a.stable_id=p_stable_id) and p_user_id=any(a.declined_by_user_ids);
end $$;
revoke all on function public.detach_schedule_person(uuid,uuid) from public,anon,authenticated,service_role;
create function public.cleanup_schedule_membership()
returns trigger language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
begin
  if tg_op='DELETE' or new.user_id is distinct from old.user_id or new.stable_id is distinct from old.stable_id
    or (old.role in ('admin','staff','rider') and new.role not in ('admin','staff','rider')) then
    perform public.detach_schedule_person(old.user_id,old.stable_id);
  end if;
  return old;
end $$;
create function public.cleanup_schedule_account()
returns trigger language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
begin perform public.detach_schedule_person(old.id); return old; end $$;
revoke all on function public.cleanup_schedule_membership(),public.cleanup_schedule_account() from public,anon,authenticated,service_role;
create trigger cleanup_schedule_membership after delete or update of user_id,stable_id,role on public.stable_members
  for each row execute function public.cleanup_schedule_membership();
create trigger cleanup_schedule_account before delete on public.profiles for each row execute function public.cleanup_schedule_account();

revoke all on function public.get_season_schedule(uuid,uuid),
  public.save_schedule_period(uuid,uuid,uuid,integer,text,date,date,jsonb),
  public.generate_schedule_batch(uuid,uuid,uuid,integer),
  public.set_schedule_weekly_assignment(uuid,uuid,uuid,integer,date,uuid,boolean,integer),
  public.update_schedule_occurrence(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_season_schedule(uuid,uuid),
  public.save_schedule_period(uuid,uuid,uuid,integer,text,date,date,jsonb),
  public.generate_schedule_batch(uuid,uuid,uuid,integer),
  public.set_schedule_weekly_assignment(uuid,uuid,uuid,integer,date,uuid,boolean,integer),
  public.update_schedule_occurrence(uuid,uuid,uuid,text,jsonb) to authenticated;

commit;
