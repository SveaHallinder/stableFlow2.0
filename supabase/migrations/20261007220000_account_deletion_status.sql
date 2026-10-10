-- PROPOSED ONLY: separate exact schema approval required after the first proposal.
-- One own-account receipt function. No intent reset, new table, policy or Auth write.
begin;
do $dependencies$
begin
  if to_regclass('public.account_deletion_intents') is null
    or to_regprocedure('public.prepare_account_deletion(uuid,uuid)') is null then
    raise exception using errcode='55000', message='[account delete status] Granskad kontoraderingsförberedelse saknas; avbryt.';
  end if;
end
$dependencies$;

create or replace function public.own_account_deletion_status()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog set row_security=off
as $function$
declare caller uuid := auth.uid();
begin
  if caller is null or coalesce(auth.role(),'') <> 'authenticated' then
    raise exception using errcode='42501', message='[account delete status] Verifierad egen JWT-identitet krävs.';
  end if;
  -- One statement snapshot, no row locks or mutations. A still-valid JWT may
  -- read its own removal receipt even after its Auth user/profile was removed.
  -- It does not grant access to app content or inspect any other user's receipt.
  return (
    with affected_stables as materialized (
      -- Exactly assert_account_deletion's creator/farm/owner-membership scope.
      select s.id from public.stables s
      where s.created_by=caller
        or exists(select 1 from public.stable_members m where m.stable_id=s.id and m.user_id=caller and m.role='admin' and m.access='owner')
        or exists(select 1 from public.farms f where f.id=s.farm_id and f.created_by=caller)
    ), own_scope as (
      select exists(select 1 from public.farms where created_by=caller)
          or exists(select 1 from affected_stables) as requires_owner,
        (select count(*) from affected_stables) as affected_stable_count
    ), candidate_ids as (
      select distinct m.user_id from public.stable_members m
      join affected_stables s on s.id=m.stable_id
      where m.role='admin' and m.access='owner' and m.user_id<>caller
    ), eligible_owners as (
      -- No global directory when affected_stables is empty. Only active owners
      -- already in every affected stable; expose just UID and display name.
      select p.id, coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.username),''),'Ägare utan visningsnamn') as display_name
      from candidate_ids c join public.profiles p on p.id=c.user_id
      join auth.users u on u.id=p.id
      where u.deleted_at is null and coalesce(u.banned_until,'-infinity'::timestamptz)<=now()
        and not exists(select 1 from public.account_deletion_intents where user_id=p.id)
        and not exists(select 1 from affected_stables s where not exists(
          select 1 from public.stable_members m
          where m.stable_id=s.id and m.user_id=p.id and m.role='admin' and m.access='owner'))
    ), receipt as (
      select exists(select 1 from auth.users where id=caller) as auth_present,
        exists(select 1 from public.profiles where id=caller) as profile_present,
        i.user_id is not null as pending,
        i.replacement_user_id, i.created_at
      from (values(1)) as one(n)
      left join public.account_deletion_intents i on i.user_id=caller
    )
    select jsonb_build_object(
      'user_id',caller,
      'status',case
        when not auth_present and not profile_present and not pending then 'deleted'
        when auth_present and profile_present and pending then 'pending'
        when auth_present and profile_present and not pending then 'not_started'
        else 'unconfirmed' end,
      'auth_present',auth_present,'profile_present',profile_present,
      'requires_owner',auth_present and profile_present and own_scope.requires_owner,
      'affected_stable_count',case when auth_present and profile_present then own_scope.affected_stable_count else 0 end,
      'replacement_owners',case when auth_present and profile_present then coalesce(
        (select jsonb_agg(jsonb_build_object('user_id',id,'display_name',display_name) order by display_name,id) from eligible_owners),
        '[]'::jsonb) else '[]'::jsonb end,
      'replacement_user_id',case when pending then replacement_user_id else null end,
      'prepared_at',case when pending then created_at else null end
    ) from receipt cross join own_scope
  );
end
$function$;
alter function public.own_account_deletion_status() owner to postgres;
revoke all on function public.own_account_deletion_status() from public, anon, authenticated, service_role;
grant execute on function public.own_account_deletion_status() to authenticated;
notify pgrst, 'reload schema';
commit;
