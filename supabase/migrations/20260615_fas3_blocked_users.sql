-- Fas 3 — blockera/tysta användare (App Store / Google Play UGC-krav).
-- En användare kan blockera en annan; klienten döljer blockerade användares inlägg,
-- kommentarer och meddelanden, och hindrar nya privata konversationer.
-- Varje rad ägs av blockeraren — bara du ser och hanterar din egen blocklista.

create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

alter table public.blocked_users enable row level security;

drop policy if exists "blocked_users_select" on public.blocked_users;
create policy "blocked_users_select" on public.blocked_users
  for select using (blocker_user_id = (select auth.uid()));

drop policy if exists "blocked_users_insert" on public.blocked_users;
create policy "blocked_users_insert" on public.blocked_users
  for insert with check (
    blocker_user_id = (select auth.uid()) and blocked_user_id <> (select auth.uid())
  );

drop policy if exists "blocked_users_delete" on public.blocked_users;
create policy "blocked_users_delete" on public.blocked_users
  for delete using (blocker_user_id = (select auth.uid()));

create index if not exists blocked_users_blocker_idx
  on public.blocked_users(blocker_user_id);

-- NOTE: Content hiding is enforced client-side today (feed/comments/chat filter on
-- blockedUserIds). Server-side enforcement (e.g. a blocked user cannot insert a message
-- into a conversation with the blocker) is a follow-up — it needs the conversation
-- membership model and is tracked for Fas 0B/3 hardening.
