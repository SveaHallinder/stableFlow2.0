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
