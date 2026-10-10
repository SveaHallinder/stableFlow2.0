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
