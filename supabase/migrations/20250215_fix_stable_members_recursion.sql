-- Avoid RLS recursion in stable_members policies by using security definer helpers.

create or replace function public.is_stable_member(p_stable_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.stable_members m
    where m.stable_id = p_stable_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_stable_owner(p_stable_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.stable_members m
    where m.stable_id = p_stable_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
      and coalesce(m.access, 'view') = 'owner'
  );
$$;

create or replace function public.is_stable_creator(p_stable_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.stables s
    where s.id = p_stable_id
      and s.created_by = auth.uid()
  );
$$;
