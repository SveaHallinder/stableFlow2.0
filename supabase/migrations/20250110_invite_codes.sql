-- Update invite validation to accept stable_invites code and require a valid code
create or replace function public.validate_invite(p_email text, p_code text default null)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text;
  v_has_email boolean := false;
  v_has_code boolean := false;
  v_code text;
begin
  v_email := lower(trim(p_email));
  v_code := upper(trim(p_code));

  if v_email is not null and length(v_email) > 0 then
    select exists(
      select 1
      from public.stable_invites i
      where lower(i.email) = v_email
        and i.accepted_at is null
        and (i.expires_at is null or i.expires_at > now())
    ) into v_has_email;
  end if;

  if v_code is not null and length(v_code) > 0 then
    select exists(
      select 1
      from public.stable_invites i
      where upper(i.code) = v_code
        and i.accepted_at is null
        and (i.expires_at is null or i.expires_at > now())
    ) into v_has_code;

    if not v_has_code then
      select exists(
        select 1
        from public.stables s
        where s.join_code = v_code
      ) into v_has_code;
    end if;
  end if;

  if v_code is not null and length(v_code) > 0 then
    return v_has_code;
  end if;

  return v_has_email;
end;
$$;

-- Ensure invites update role and access when a user already joined
create or replace function public.accept_pending_invites()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text;
  v_count integer := 0;
begin
  v_email := auth.jwt()->>'email';
  if v_email is null then
    return 0;
  end if;

  insert into public.stable_members (stable_id, user_id, role, custom_role, access, rider_role, horse_ids)
  select i.stable_id, auth.uid(), i.role, i.custom_role, i.access, i.rider_role, i.horse_ids
  from public.stable_invites i
  where lower(i.email) = lower(v_email)
    and i.accepted_at is null
    and (i.expires_at is null or i.expires_at > now())
  on conflict (stable_id, user_id) do update
    set role = excluded.role,
        custom_role = excluded.custom_role,
        access = excluded.access,
        rider_role = excluded.rider_role,
        horse_ids = excluded.horse_ids;

  get diagnostics v_count = row_count;

  update public.stable_invites
    set accepted_at = now()
  where lower(email) = lower(v_email)
    and accepted_at is null
    and (expires_at is null or expires_at > now());

  return v_count;
end;
$$;
