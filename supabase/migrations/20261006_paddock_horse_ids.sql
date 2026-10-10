-- Canonical paddock horse IDs. LOCAL IMPLEMENTATION; not applied in production.
-- Every legacy array position requires an approved ID and exact source text below.
-- Do not add real mappings/identifiers to the public repository.
begin;
set local search_path = pg_catalog;
set local lock_timeout = '5s';

-- Freeze the source snapshot through preflight/backfill (maintenance transaction).
lock table public.horses, public.paddocks in share mode;

-- Only explicitly approved mappings may be added here before review/apply.
-- Identify an original array entry by paddock ID + 1-based position, never by name.
-- EVERY original entry needs approval; names/whitespace are never inferred.
create temporary table approved_horse_mapping (
  paddock_id uuid not null,
  source_position bigint not null check (source_position > 0),
  horse_id uuid not null,
  expected_source_name text,
  primary key (paddock_id, source_position)
) on commit drop;
-- APPROVED_MAPPING_INSERTS (empty intentionally; no production identifiers here).

create temporary table horse_reference_backfill on commit drop as
select p.id as paddock_id, p.stable_id, n.source_position, n.source_name,
       a.horse_id
from public.paddocks p
cross join lateral unnest(p.horse_names) with ordinality
  as n(source_name, source_position)
left join pg_temp.approved_horse_mapping a
  on a.paddock_id = p.id and a.source_position = n.source_position;

-- Counts contain no horse/person names. An exception rolls back all work.
do $$
declare
  null_scope bigint;
  invalid_mappings bigint;
  unresolved bigint;
  repeated_links bigint;
begin
  select (select count(*) from public.horses where stable_id is null)
       + (select count(*) from public.paddocks where stable_id is null)
    into null_scope;
  if null_scope > 0 then
    raise exception using errcode = '23514', message = format(
      '[paddock migration] %s rows have null stable_id; explicit scope decision required', null_scope);
  end if;
  select count(*) into invalid_mappings
  from pg_temp.approved_horse_mapping a
  left join pg_temp.horse_reference_backfill b
    on b.paddock_id = a.paddock_id and b.source_position = a.source_position
  left join public.horses h on h.id = a.horse_id and h.stable_id = b.stable_id
  where b.paddock_id is null or h.id is null
    or b.source_name is distinct from a.expected_source_name;
  if invalid_mappings > 0 then
    raise exception using errcode = '23514', message = format(
      '[paddock migration] %s invalid/cross-stable/stale-source approved mappings', invalid_mappings);
  end if;
  select count(*) into unresolved
    from pg_temp.horse_reference_backfill where horse_id is null;
  if unresolved > 0 then
    raise exception using errcode = '23514', message = format(
      '[paddock migration] %s unapproved entries; retain original text and map every position explicitly', unresolved);
  end if;
  select count(*) into repeated_links from (
    select paddock_id, horse_id from pg_temp.horse_reference_backfill
    group by paddock_id, horse_id having count(*) > 1
  ) repeated;
  if repeated_links > 0 then
    raise exception using errcode = '23514', message = format(
      '[paddock migration] %s repeated entries would collapse; explicit decision required', repeated_links);
  end if;
end;
$$;

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

insert into public.paddock_horses(stable_id, paddock_id, horse_id)
select stable_id, paddock_id, horse_id from pg_temp.horse_reference_backfill;

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
