-- Sync invite validation with live staging/production behavior.
-- A typed invite code must match stable_invites.code or stables.join_code.
-- Email-only validation remains allowed for pending invited emails.
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

grant execute on function public.validate_invite(text, text) to anon, authenticated;
