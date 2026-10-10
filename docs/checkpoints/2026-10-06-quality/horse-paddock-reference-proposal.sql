-- REVIEW DRAFT ONLY. Not a migration; not approved or applied to any live DB.
-- Scope: every existing horse and paddock. Stop on null stable_id; never infer it.
-- Read-only relation scaffold. Current UI and legacy writes are NOT compatible.
-- See README-horse-reference.md for mandatory activation gates.
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
      '[horse reference] %s rows have null stable_id; explicit scope decision required', null_scope);
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
      '[horse reference] %s invalid/cross-stable/stale-source approved mappings', invalid_mappings);
  end if;
  select count(*) into unresolved
    from pg_temp.horse_reference_backfill where horse_id is null;
  if unresolved > 0 then
    raise exception using errcode = '23514', message = format(
      '[horse reference] %s unapproved entries; retain original text and map every position explicitly', unresolved);
  end if;
  select count(*) into repeated_links from (
    select paddock_id, horse_id from pg_temp.horse_reference_backfill
    group by paddock_id, horse_id having count(*) > 1
  ) repeated;
  if repeated_links > 0 then
    raise exception using errcode = '23514', message = format(
      '[horse reference] %s repeated entries would collapse; explicit decision required', repeated_links);
  end if;
end;
$$;

-- Composite FKs enforce the stable boundary without trigger helpers.
create unique index horses_id_stable_reference on public.horses (id, stable_id);
create unique index paddocks_id_stable_reference on public.paddocks (id, stable_id);
create table public.paddock_horses (
  stable_id uuid not null,
  paddock_id uuid not null,
  horse_id uuid not null,
  primary key (paddock_id, horse_id),
  foreign key (paddock_id, stable_id)
    references public.paddocks (id, stable_id) on delete cascade,
  foreign key (horse_id, stable_id)
    references public.horses (id, stable_id) on delete cascade
);
-- No uniqueness on horse_id: one horse may retain several paddock links.
create index paddock_horses_horse_reference on public.paddock_horses (horse_id, stable_id);
alter table public.paddock_horses enable row level security;
create policy paddock_horses_select on public.paddock_horses
  for select to authenticated using (public.is_stable_member(stable_id));
-- Explicitly undo possible default grants on this new table only.
revoke all on table public.paddock_horses from public, anon, authenticated, service_role;
grant select on table public.paddock_horses to authenticated;
-- No INSERT/UPDATE/DELETE policy/grant, RPC, trigger, or helper EXECUTE grant.
insert into public.paddock_horses (stable_id, paddock_id, horse_id)
select stable_id, paddock_id, horse_id from pg_temp.horse_reference_backfill;
-- Original horse_names arrays (including spelling and order) are never changed.
commit;
