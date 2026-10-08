-- PROPOSED ONLY. Requires separate approval before any Hosted migration apply.
-- Exact observed message IDs; no timestamp prefix, history backfill or publication.
begin;

create table if not exists public.chat_message_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

-- Replay must not silently adopt a different pre-existing table/policy contract.
do $$
begin
  if (select count(*) from pg_catalog.pg_attribute
      where attrelid = 'public.chat_message_reads'::regclass and attnum > 0 and not attisdropped) <> 3
    or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.chat_message_reads'::regclass and attname = 'user_id' and atttypid = 'uuid'::regtype and attnotnull)
    or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.chat_message_reads'::regclass and attname = 'message_id' and atttypid = 'uuid'::regtype and attnotnull)
    or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.chat_message_reads'::regclass and attname = 'read_at' and atttypid = 'timestamptz'::regtype and attnotnull)
    or (select count(*) from pg_catalog.pg_constraint where conrelid = 'public.chat_message_reads'::regclass and contype = 'p' and pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id, message_id)') <> 1
    or (select count(*) from pg_catalog.pg_constraint where conrelid = 'public.chat_message_reads'::regclass and contype = 'f' and confdeltype = 'c'
        and ((confrelid = 'public.profiles'::regclass and pg_get_constraintdef(oid) = 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE')
          or (confrelid = 'public.messages'::regclass and pg_get_constraintdef(oid) = 'FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE'))) <> 2
    or exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.chat_message_reads'::regclass)
  then
    raise exception using errcode = '55000', message = '[chat read] Befintlig tabell matchar inte föreslagen läskvittens.';
  end if;
end;
$$;

alter table public.chat_message_reads enable row level security;
revoke all on table public.chat_message_reads from public, anon, authenticated, service_role;

create or replace function public.own_chat_read_state(
  expected_user_id uuid,
  target_conversation_id uuid,
  message_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare
  caller uuid := auth.uid();
  chat public.conversations%rowtype;
  requested uuid[];
  confirmed jsonb;
  known_read jsonb;
  unread jsonb;
begin
  -- PostgREST verifies the token. expected_user_id is only a client session fence.
  if caller is null or auth.role() is distinct from 'authenticated' or caller is distinct from expected_user_id then
    raise exception using errcode = '42501', message = '[chat read] Verifierat eget konto krävs.';
  end if;
  perform p.id from public.profiles p where p.id = caller for key share;
  if not found or not exists (
    select 1 from auth.users u where u.id = caller and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
  ) then
    raise exception using errcode = '42501', message = '[chat read] Aktivt eget konto krävs.';
  end if;
  select c.* into chat from public.conversations c where c.id = target_conversation_id for share;
  if not found then
    raise exception using errcode = '42501', message = '[chat read] Aktuell chattåtkomst krävs.';
  end if;
  if chat.is_group then
    perform sm.id from public.stable_members sm
      where sm.stable_id = chat.stable_id and sm.user_id = caller for key share;
  else
    perform cm.id from public.conversation_members cm
      where cm.conversation_id = chat.id and cm.user_id = caller for key share;
  end if;
  if not found then
    raise exception using errcode = '42501', message = '[chat read] Aktuell chattåtkomst krävs.';
  end if;
  if message_ids is null or array_position(message_ids, null) is not null then
    raise exception using errcode = '22023', message = '[chat read] Exakta meddelande-ID:n krävs.';
  end if;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into requested
    from (select distinct unnest(message_ids) as id) ids;
  perform m.id from public.messages m
    where m.id = any(requested) and m.conversation_id = chat.id
      and m.author_id is distinct from caller
      and not exists (select 1 from public.blocked_users b where b.blocker_user_id = caller and b.blocked_user_id = m.author_id)
    order by m.id for share;
  if exists (
    select 1 from unnest(requested) ids(id)
    where not exists (
      select 1 from public.messages m where m.id = ids.id and m.conversation_id = chat.id
        and m.author_id is distinct from caller
        and not exists (select 1 from public.blocked_users b where b.blocker_user_id = caller and b.blocked_user_id = m.author_id)
    )
  ) then
    raise exception using errcode = '42501', message = '[chat read] Meddelandena kunde inte verifieras i den här chatten.';
  end if;
  -- One statement/snapshot and one JSON value: no partial sets or REST row cap.
  -- Complete own read IDs classify delayed INSERTs outside loaded history too.
  select
    coalesce(jsonb_agg(m.id order by m.id) filter (where r.message_id is not null and m.id = any(requested)), '[]'::jsonb),
    coalesce(jsonb_agg(m.id order by m.id) filter (where r.message_id is not null), '[]'::jsonb),
    coalesce(jsonb_agg(m.id order by m.id) filter (where r.message_id is null), '[]'::jsonb)
    into confirmed, known_read, unread
    from public.messages m
    left join public.chat_message_reads r on r.user_id = caller and r.message_id = m.id
    where m.conversation_id = chat.id and m.author_id is distinct from caller
      and not exists (select 1 from public.blocked_users b where b.blocker_user_id = caller and b.blocked_user_id = m.author_id);
  return jsonb_build_object(
    'user_id', caller, 'conversation_id', chat.id, 'complete', true,
    'requested_message_ids', to_jsonb(requested), 'read_message_ids', confirmed,
    'known_read_message_ids', known_read, 'unread_message_ids', unread
  );
end;
$$;

create or replace function public.mark_chat_messages_read(
  expected_user_id uuid,
  target_conversation_id uuid,
  message_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
set row_security = off
as $$
declare
  caller uuid := auth.uid();
begin
  -- Validate current identity, access and every requested peer ID before mutation.
  perform public.own_chat_read_state(expected_user_id, target_conversation_id, message_ids);
  insert into public.chat_message_reads(user_id, message_id)
    select caller, id from public.messages where conversation_id=target_conversation_id and author_id is distinct from caller
    on conflict (user_id, message_id) do nothing;
  -- Includes already-existing receipts on retry; never just INSERT RETURNING.
  return public.own_chat_read_state(expected_user_id, target_conversation_id, message_ids);
end;
$$;

revoke all on function public.own_chat_read_state(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.mark_chat_messages_read(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.own_chat_read_state(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.mark_chat_messages_read(uuid, uuid, uuid[]) to authenticated;

commit;
