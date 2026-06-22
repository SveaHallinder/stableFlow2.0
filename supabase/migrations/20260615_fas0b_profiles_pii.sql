-- Fas 0B — strama åt profiles_select (GDPR/PII).
-- FÖRE: vilken stallmedlem som helst kunde SELECT:a en co-members hela profilrad,
-- inklusive `phone` (RLS är radnivå, inte kolumnnivå) → allas telefonnummer läckte.
-- EFTER: bas-tabellen profiles är self-only. Co-member-namn/avatar (load-bearing i
-- hela appen) serveras via en SECURITY DEFINER-RPC som bara returnerar icke-PII-fält,
-- och `phone` returneras enbart när anroparen är admin i ett delat stall.

-- 1) Lås bas-tabellen till self-only.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using ((select auth.uid()) = id);

-- 2) Säker co-member-katalog. Definer → kringgår profiles-RLS, men exponerar bara
--    de kolumner som behövs för rendering. phone maskas för icke-admins.
create or replace function public.get_member_directory()
returns table (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  location text,
  responsibilities text[],
  onboarding_dismissed boolean,
  phone text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    p.location,
    p.responsibilities,
    p.onboarding_dismissed,
    case
      when p.id = (select auth.uid()) then p.phone
      when exists (
        select 1
        from public.stable_members m_self
        join public.stable_members m_other
          on m_self.stable_id = m_other.stable_id
        where m_self.user_id = (select auth.uid())
          and m_other.user_id = p.id
          and m_self.role = 'admin'
      ) then p.phone
      else null
    end as phone
  from public.profiles p
  where p.id = (select auth.uid())
     or exists (
       select 1
       from public.stable_members m_self
       join public.stable_members m_other
         on m_self.stable_id = m_other.stable_id
       where m_self.user_id = (select auth.uid())
         and m_other.user_id = p.id
     );
$$;

revoke all on function public.get_member_directory() from public;
grant execute on function public.get_member_directory() to authenticated;
