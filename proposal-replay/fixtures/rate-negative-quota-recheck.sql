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
      select exists(select 1 from public.posts p where p.id = NEW.id and p.user_id = caller) into duplicate_row;
    when 'comments' then
      feature_name := 'comments'; row_author := NEW.user_id;
      select exists(select 1 from public.comments c where c.id = NEW.id and c.user_id = caller) into duplicate_row;
    when 'likes' then
      feature_name := 'likes'; row_author := NEW.user_id;
      select exists(select 1 from public.likes l where l.post_id = NEW.post_id and l.user_id = caller) into duplicate_row;
    when 'messages' then
      feature_name := 'messages'; row_author := NEW.author_id;
      select exists(select 1 from public.messages m where m.id = NEW.id and m.author_id = caller) into duplicate_row;
    when 'stable_alerts' then
      feature_name := 'alerts'; row_author := NEW.created_by_user_id;
      select exists(select 1 from public.stable_alerts a where a.id = NEW.id and a.created_by_user_id = caller) into duplicate_row;
    when 'alerts' then
      -- The legacy events table has no author column. Server caller is authoritative;
      -- its existing stable-scoped INSERT RLS still decides whether the write is allowed.
      feature_name := 'alerts'; row_author := caller;
      select exists(select 1 from public.alerts a where a.id = NEW.id) into duplicate_row;
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
  -- A retry of an existing own identifier is left to the real unique/RLS checks.
  -- It creates no new row and must retain the app's lost-receipt recovery path.
  if duplicate_row then return new; end if;

  select l.max_writes, l.window_seconds into quota, period_seconds
    from private.social_write_limits l where l.feature = feature_name;
  if not found then raise exception '[social rate limit] Missing configuration'; end if;
  insert into private.social_write_counters(user_id, feature, window_started_at, write_count)
    values(caller, feature_name, '-infinity', 0) on conflict do nothing;
  select c.window_started_at, c.write_count into started, used
    from private.social_write_counters c
    where c.user_id = caller and c.feature = feature_name for update;
  if not found then raise exception '[social rate limit] Missing counter'; end if;
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
