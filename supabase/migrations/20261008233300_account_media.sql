-- PROPOSAL ONLY. Uses Storage API for bytes; never UPDATE/DELETE Storage metadata.
-- Core account deletion/17 push functions are dependencies, not replacements.
begin;
do $precondition$
begin
  if to_regprocedure('public.prepare_account_deletion(uuid,uuid)') is null
    or to_regprocedure('public.own_account_deletion_status()') is null
    or to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise exception using errcode='55000',message='[account media] prerequisites_missing';
  end if;
end
$precondition$;

create table private.account_media_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  replacement_user_id uuid,
  plan_generation uuid not null unique,
  used_generations uuid[] not null,
  last_expected_generation uuid,
  last_expected_owner uuid,
  project_url text not null,
  stable_ids uuid[] not null,
  farm_ids uuid[] not null,
  created_at timestamptz not null default now()
);
create table private.account_media_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references private.account_media_plans(id) on delete cascade,
  kind text not null check(kind in ('post','avatar','shared','unused')),
  stable_id uuid,
  bucket_id text not null,
  source_id uuid not null,
  source_path text not null,
  source_version text not null,
  source_metadata jsonb not null,
  source_updated_at timestamptz not null,
  refs jsonb not null,
  destination_path text,
  destination_id uuid,
  destination_version text,
  destination_metadata jsonb,
  state text not null default 'frozen' check(state in ('frozen','copy_pending','copied','remove_pending','removed')),
  unique(bucket_id,source_path),
  check((kind='shared') = (destination_path is not null))
);
-- Opaque permanent ABA fence. No UID, raw path or Auth FK; no automatic expiry.
-- Removal of A/profile/plan must not let a delayed path-only DELETE hit a new B file.
create table private.account_media_retired_paths (
  path_hash bytea primary key check(octet_length(path_hash)=32),
  reference_hash bytea not null check(octet_length(reference_hash)=32),
  retired_at timestamptz not null default now()
);
alter table private.account_media_plans enable row level security;
alter table private.account_media_items enable row level security;
alter table private.account_media_retired_paths enable row level security;
revoke all on private.account_media_plans,private.account_media_items,private.account_media_retired_paths from public,anon,authenticated,service_role;

-- Reference namespace closes new-row reference races before immutable preparation/retirement.
create function private.account_media_reference_key(p_value text)
returns bigint language sql immutable set search_path=pg_catalog
as $f$
 select ('x'||substr(encode(sha256(convert_to('[account media reference]/'||p_value,'UTF8')),'hex'),1,16))::bit(64)::bigint;
$f$;
create function private.account_media_refs(p_bucket text,p_path text,p_url text)
returns jsonb language sql stable security definer set search_path=pg_catalog set row_security=off
as $f$
 select coalesce(jsonb_agg(to_jsonb(r) order by r.kind,r.id),'[]'::jsonb) from (
   select 'avatar'::text kind,id,null::uuid stable_id,id author_id,avatar_url value from public.profiles
     where avatar_url=p_url||'/storage/v1/object/public/'||p_bucket||'/'||p_path
   union all select 'post',id,stable_id,user_id,image_url from public.posts
     where p_bucket='posts' and image_url=p_path
   union all select 'horse',id,stable_id,null::uuid,image_url from public.horses
     where image_url=p_url||'/storage/v1/object/public/'||p_bucket||'/'||p_path
   union all select 'paddock',id,stable_id,null::uuid,image_url from public.paddocks
     where image_url=p_url||'/storage/v1/object/public/'||p_bucket||'/'||p_path
 ) r;
$f$;
create function private.account_media_metadata_complete(p_version text,p_metadata jsonb,p_updated_at timestamptz)
returns boolean language sql immutable set search_path=pg_catalog
as $f$
 select coalesce(p_updated_at is not null and p_version is not null and btrim(p_version)=p_version and length(p_version)>0
   and jsonb_typeof(p_metadata)='object' and jsonb_typeof(p_metadata->'eTag')='string' and length(p_metadata->>'eTag')>0
   and jsonb_typeof(p_metadata->'size')='number' and (p_metadata->>'size')::numeric>=0
   and jsonb_typeof(p_metadata->'mimetype')='string' and p_metadata->>'mimetype' like 'image/%',false);
$f$;
create function private.account_media_inventory(p_user uuid,p_url text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog set row_security=off
as $f$
declare o record; refs jsonb; kind text; stable_id uuid; entries jsonb:='[]'; unknown_count integer:=0; parts uuid[];
begin
 if p_url !~ '^https://[a-z0-9]+[.]supabase[.]co$' then
   raise exception using errcode='22023',message='[account media] invalid_project_url';
 end if;
 for o in select * from storage.objects where owner=p_user or owner_id=p_user::text order by id loop
   kind:=null; stable_id:=null; refs:=private.account_media_refs(o.bucket_id,o.name,p_url);
   if o.bucket_id is not null and o.name is not null and o.owner_id=p_user::text and (o.owner is null or o.owner=p_user)
     and private.account_media_metadata_complete(o.version,o.metadata,o.updated_at)
     and exists(select 1 from storage.buckets b where b.id=o.bucket_id) then
     -- Exact current uploader grammar. URLs, raw legacy names and mismatched refs are unknown.
     if o.bucket_id='posts' and o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][a-zA-Z0-9]+$' then
       begin parts:=array[(string_to_array(o.name,'/'))[1]::uuid,(string_to_array(o.name,'/'))[2]::uuid,(string_to_array(o.name,'/'))[3]::uuid];
       exception when invalid_text_representation then parts:=null; end;
       if parts[2]=p_user and not exists(select 1 from jsonb_array_elements(refs) r
         where r->>'kind'<>'post' or r->>'author_id' is distinct from p_user::text
           or r->>'stable_id' is distinct from parts[1]::text or r->>'id' is distinct from parts[3]::text) then
         kind:='post'; stable_id:=parts[1];
       end if;
     elsif o.bucket_id in ('avatars','paddocks') and o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][a-zA-Z0-9]+$'
       and exists(select 1 from storage.buckets b where b.id=o.bucket_id) then
       begin stable_id:=(string_to_array(o.name,'/'))[1]::uuid;
       exception when invalid_text_representation then stable_id:=null; end;
       if jsonb_array_length(refs)=0 and stable_id is not null then kind:='unused';
       elsif stable_id is not null and not exists(select 1 from jsonb_array_elements(refs) r
         where (r->>'kind'='horse' and o.bucket_id='avatars' or r->>'kind'='paddock' and o.bucket_id='paddocks') is not true
           or r->>'stable_id' is distinct from stable_id::text) then kind:='shared';
       elsif o.bucket_id='avatars' and not exists(select 1 from jsonb_array_elements(refs) r
         where r->>'kind'<>'avatar' or r->>'id' is distinct from p_user::text) then kind:='avatar'; end if;
     end if;
   end if;
   if kind is null then unknown_count:=unknown_count+1; else
     entries:=entries||jsonb_build_array(jsonb_build_object('source_id',o.id,'bucket_id',o.bucket_id,'source_path',o.name,
       'source_version',o.version,'source_metadata',o.metadata,'source_updated_at',o.updated_at,'kind',kind,'stable_id',stable_id,'refs',refs));
   end if;
 end loop;
 -- A's external/legacy/unowned image reference never authorizes deletion of somebody else's object.
 unknown_count:=unknown_count+(select count(*) from (
   select 'avatar' kind,id from public.profiles where id=p_user and nullif(avatar_url,'') is not null
   union all select 'post',id from public.posts where user_id=p_user and nullif(image_url,'') is not null
 ) r where not exists(select 1 from jsonb_array_elements(entries) e,jsonb_array_elements(e->'refs') x
   where x->>'kind'=r.kind and x->>'id'=r.id::text));
 return jsonb_build_object('entries',entries,'blocked_count',unknown_count,'complete',true);
end
$f$;
create function private.account_media_scope(p_user uuid,p_entries jsonb)
returns uuid[] language sql stable security definer set search_path=pg_catalog set row_security=off
as $f$
 select coalesce(array_agg(id order by id),'{}'::uuid[]) from (
   select s.id from public.stables s where s.created_by=p_user
     or exists(select 1 from public.stable_members m where m.stable_id=s.id and m.user_id=p_user and m.role='admin' and m.access='owner')
     or exists(select 1 from public.farms f where f.id=s.farm_id and f.created_by=p_user)
   union select (e->>'stable_id')::uuid from jsonb_array_elements(p_entries) e where e->>'kind'='shared'
 ) scope;
$f$;
create function private.account_media_owners(p_user uuid,p_stables uuid[])
returns jsonb language sql stable security definer set search_path=pg_catalog set row_security=off
as $f$
 select coalesce(jsonb_agg(jsonb_build_object('user_id',p.id,'display_name',coalesce(nullif(p.username,''),'Medlem')) order by p.id),'[]')
 from public.profiles p join auth.users u on u.id=p.id where cardinality(p_stables)>0 and p.id<>p_user
   and u.deleted_at is null and coalesce(u.banned_until,'-infinity'::timestamptz)<=now()
   and not exists(select 1 from public.account_deletion_intents i where i.user_id=p.id)
   and exists(select 1 from public.stable_members m where m.user_id=p.id and m.stable_id=any(p_stables) and m.role='admin' and m.access='owner')
   and not exists(select 1 from unnest(p_stables) s(id) where not exists(select 1 from public.stable_members m
     where m.user_id=p.id and m.stable_id=s.id and m.role='admin' and m.access='owner'));
$f$;
create function private.account_media_lock(p_user uuid,p_owner uuid,p_stables uuid[],p_farms uuid[])
returns void language plpgsql volatile security definer set search_path=pg_catalog set row_security=off
as $f$
declare who uuid;
begin
 -- Auth before profile/operational/ledger/Storage locks. Recheck status after waits.
 for who in select distinct id from unnest(array[p_user,p_owner]) x(id) where id is not null order by id loop
   perform 1 from auth.users where id=who for share;
   if not found then raise exception using errcode='P0001',message='[account media] account_changed'; end if;
 end loop;
 perform 1 from public.profiles where id=any(array[p_user,p_owner]) order by id for update;
 if not exists(select 1 from public.profiles where id=p_user)
   or exists(select 1 from auth.users where id=any(array[p_user,p_owner]) and (deleted_at is not null or coalesce(banned_until,'-infinity'::timestamptz)>now())) then
   raise exception using errcode='P0001',message='[account media] account_changed';
 end if;
 if p_owner=p_user or (cardinality(p_stables)>0 or cardinality(p_farms)>0) and p_owner is null then
   raise exception using errcode='P0001',message='[account media] owner_required';
 end if;
 if p_owner is not null and (not exists(select 1 from public.profiles where id=p_owner)
   or exists(select 1 from public.account_deletion_intents where user_id=p_owner)) then
   raise exception using errcode='P0001',message='[account media] owner_invalid';
 end if;
 perform 1 from public.farms where id=any(p_farms) order by id for update;
 perform 1 from public.stables where id=any(p_stables) order by id for update;
 perform 1 from public.stable_members where user_id=p_owner and stable_id=any(p_stables) order by stable_id,id for update;
 if exists(select 1 from unnest(p_stables) s(id) where not exists(select 1 from public.stables where id=s.id)
   or not exists(select 1 from public.stable_members where stable_id=s.id and user_id=p_owner and role='admin' and access='owner')) then
   raise exception using errcode='P0001',message='[account media] owner_invalid';
 end if;
 if (select coalesce(array_agg(id order by id),'{}'::uuid[]) from public.farms where created_by=p_user) is distinct from p_farms then
   raise exception using errcode='40001',message='[account media] scope_changed';
 end if;
end
$f$;
create function private.account_media_summary(p_plan uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog set row_security=off
as $f$
 select jsonb_build_object('plan_id',p.id,'plan_generation',p.plan_generation,'replacement_user_id',p.replacement_user_id,
   'reselect_allowed',count(i.id)>0 and count(*) filter(where i.state<>'frozen')=0,
   'reselect_blocked_reason',case when count(i.id)>0 and count(*) filter(where i.state<>'frozen')=0 then null else 'operation_already_reserved' end,
   'delete_count',count(*) filter(where i.kind<>'shared'),'transfer_count',count(*) filter(where i.kind='shared'),
   'copied_count',count(*) filter(where i.kind='shared' and i.state in ('copied','remove_pending','removed')),
   'removed_count',count(*) filter(where i.state='removed'),'state',case when count(*) filter(where i.state<>'removed')=0 then 'ready' else 'pending' end,
   'next_copy_item_id',(select x.id from private.account_media_items x where x.plan_id=p.id and x.kind='shared' and x.state in ('frozen','copy_pending') order by x.id limit 1),
   'next_remove_item_id',case when count(*) filter(where i.kind='shared' and i.state in ('frozen','copy_pending'))=0 then
     (select x.id from private.account_media_items x where x.plan_id=p.id and x.state<>'removed' order by x.id limit 1) end)
 from private.account_media_plans p left join private.account_media_items i on i.plan_id=p.id where p.id=p_plan group by p.id;
$f$;

create function public.own_account_media_status(p_project_url text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog set row_security=off
as $f$
declare caller uuid:=auth.uid(); inventory jsonb; entries jsonb; scope uuid[]; own_plan private.account_media_plans%rowtype; own_summary jsonb;
begin
 if caller is null or auth.role() is distinct from 'authenticated' or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
   where u.id=caller and u.deleted_at is null and coalesce(u.banned_until,'-infinity'::timestamptz)<=now()) then
   raise exception using errcode='42501',message='[account media] active_caller_required';
 end if;
 select * into own_plan from private.account_media_plans where user_id=caller;
 if found then
   entries:=(select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'stable_id',stable_id)),'[]') from private.account_media_items where plan_id=own_plan.id);
   scope:=private.account_media_scope(caller,entries); own_summary:=private.account_media_summary(own_plan.id);
   inventory:=jsonb_build_object('complete',true,'blocked_count',0);
 else
   inventory:=private.account_media_inventory(caller,p_project_url); entries:=inventory->'entries'; scope:=private.account_media_scope(caller,entries);
   own_summary:=jsonb_build_object('plan_id',null,'plan_generation',null,'replacement_user_id',null,'reselect_allowed',false,'reselect_blocked_reason',null,'state','not_started','delete_count',
     (select count(*) from jsonb_array_elements(entries) e where e->>'kind'<>'shared'),'transfer_count',
     (select count(*) from jsonb_array_elements(entries) e where e->>'kind'='shared'),'copied_count',0,'removed_count',0,'next_copy_item_id',null,'next_remove_item_id',null);
 end if;
 return jsonb_build_object('user_id',caller,'complete',inventory->'complete','blocked_count',inventory->'blocked_count',
   'requires_owner',cardinality(scope)>0 or exists(select 1 from public.farms where created_by=caller),
   'affected_stable_count',cardinality(scope),'replacement_owners',private.account_media_owners(caller,scope),'own',own_summary,
   'incoming',coalesce((select jsonb_agg(private.account_media_summary(p.id) order by p.id) from private.account_media_plans p
     where p.replacement_user_id=caller and exists(select 1 from private.account_media_items i where i.plan_id=p.id and i.kind='shared')),'[]'));
end
$f$;

create function public.prepare_account_media_deletion(p_user_id uuid,p_replacement_user_id uuid,p_project_url text,p_plan_generation uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog set row_security=off
as $f$
declare inventory jsonb; entries jsonb; scope uuid[]; farms uuid[]; plan private.account_media_plans%rowtype; e jsonb; old_owner uuid; reference_key bigint;
begin
 if p_plan_generation is null then raise exception using errcode='22023',message='[account media] generation_required'; end if;
 -- Discover frozen metadata without locks; always reacquire Auth before profile/plan/Storage.
 select * into plan from private.account_media_plans where user_id=p_user_id;
 if found then scope:=plan.stable_ids; farms:=plan.farm_ids;
 else
   inventory:=private.account_media_inventory(p_user_id,p_project_url); entries:=inventory->'entries'; scope:=private.account_media_scope(p_user_id,entries);
   select coalesce(array_agg(id order by id),'{}'::uuid[]) into farms from public.farms where created_by=p_user_id;
 end if;
 perform private.account_media_lock(p_user_id,p_replacement_user_id,scope,farms);
 select * into plan from private.account_media_plans where user_id=p_user_id for update;
 if found then
   if plan.plan_generation is distinct from p_plan_generation then raise exception using errcode='40001',message='[account media] generation_changed'; end if;
   if plan.replacement_user_id is distinct from p_replacement_user_id or plan.project_url<>p_project_url then
     raise exception using errcode='P0001',message='[account media] immutable_plan';
   end if;
   return jsonb_build_object('prepared',true,'user_id',p_user_id,'plan',private.account_media_summary(plan.id));
 end if;
 select replacement_user_id into old_owner from public.account_deletion_intents where user_id=p_user_id;
 if found then raise exception using errcode='P0001',message='[account media] existing_core_intent'; end if;
 perform 1 from storage.objects where owner=p_user_id or owner_id=p_user_id::text order by id for share;
 for reference_key in select distinct private.account_media_reference_key(case when x->>'bucket_id'='posts' then x->>'source_path'
   else p_project_url||'/storage/v1/object/public/'||(x->>'bucket_id')||'/'||(x->>'source_path') end)
   from jsonb_array_elements(entries) x order by 1 loop
   perform pg_advisory_xact_lock(reference_key);
 end loop;
 if inventory is distinct from private.account_media_inventory(p_user_id,p_project_url) or scope is distinct from private.account_media_scope(p_user_id,entries) then
   raise exception using errcode='40001',message='[account media] inventory_changed';
 end if;
 if (inventory->>'blocked_count')::integer<>0 then raise exception using errcode='P0001',message='[account media] unknown_media'; end if;
 insert into private.account_media_plans(user_id,replacement_user_id,plan_generation,used_generations,project_url,stable_ids,farm_ids)
   values(p_user_id,p_replacement_user_id,p_plan_generation,array[p_plan_generation],p_project_url,scope,farms) returning * into plan;
 for e in select * from jsonb_array_elements(entries) loop
   insert into private.account_media_items(plan_id,kind,stable_id,bucket_id,source_id,source_path,source_version,source_metadata,source_updated_at,refs,destination_path)
     values(plan.id,e->>'kind',(e->>'stable_id')::uuid,e->>'bucket_id',(e->>'source_id')::uuid,e->>'source_path',e->>'source_version',e->'source_metadata',
       (e->>'source_updated_at')::timestamptz,e->'refs',case when e->>'kind'='shared' then (e->>'stable_id')||'/'||gen_random_uuid()::text||'.'||regexp_replace(e->>'source_path','^.*[.]','') end);
 end loop;
 -- Intent is frozen only after full classification and owner validation. Existing final Auth prepare still checks every owned object is gone.
 insert into public.account_deletion_intents(user_id,replacement_user_id) values(p_user_id,p_replacement_user_id);
 return jsonb_build_object('prepared',true,'user_id',p_user_id,'plan',private.account_media_summary(plan.id));
end
$f$;

-- Explicit only: a never-reserved frozen plan can change owner; preserve ID and all prior generations.
create function public.reselect_account_media_owner(p_user_id uuid,p_plan_id uuid,p_expected_generation uuid,
 p_expected_owner uuid,p_replacement_user_id uuid,p_next_generation uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog set row_security=off
as $f$
declare p private.account_media_plans%rowtype; frozen jsonb; inventory jsonb; k bigint;
begin
 select * into p from private.account_media_plans where id=p_plan_id and user_id=p_user_id;
 if not found then raise exception using errcode='P0001',message='[account media] plan_missing'; end if;
 perform private.account_media_lock(p_user_id,p_replacement_user_id,p.stable_ids,p.farm_ids);
 select * into p from private.account_media_plans where id=p_plan_id and user_id=p_user_id for update;
 -- Idempotent same frozen generation acknowledgement, even after a lost reply.
 if p.plan_generation=p_next_generation and p.replacement_user_id is not distinct from p_replacement_user_id
   and p.last_expected_generation=p_expected_generation and p.last_expected_owner is not distinct from p_expected_owner then
   return jsonb_build_object('prepared',true,'user_id',p_user_id,'plan',private.account_media_summary(p.id));
 end if;
 if p.plan_generation is distinct from p_expected_generation or p.replacement_user_id is distinct from p_expected_owner
   or p_next_generation is null or p_next_generation=any(p.used_generations) then
   raise exception using errcode='40001',message='[account media] generation_changed'; end if;
 if not exists(select 1 from private.account_media_items where plan_id=p.id)
   or exists(select 1 from private.account_media_items where plan_id=p.id and state<>'frozen') then
   raise exception using errcode='P0001',message='[account media] operation_already_reserved'; end if;
 perform 1 from storage.objects where owner=p_user_id or owner_id=p_user_id::text order by id for share;
 for k in select distinct private.account_media_reference_key(case when i.bucket_id='posts' then i.source_path
   else p.project_url||'/storage/v1/object/public/'||i.bucket_id||'/'||i.source_path end)
   from private.account_media_items i where i.plan_id=p.id order by 1 loop perform pg_advisory_xact_lock(k); end loop;
 select coalesce(jsonb_agg(jsonb_build_object('source_id',i.source_id,'bucket_id',i.bucket_id,'source_path',i.source_path,
   'source_version',i.source_version,'source_metadata',i.source_metadata,'source_updated_at',i.source_updated_at,
   'kind',i.kind,'stable_id',i.stable_id,'refs',i.refs) order by i.source_id),'[]') into frozen from private.account_media_items i where i.plan_id=p.id;
 inventory:=private.account_media_inventory(p_user_id,p.project_url);
 if inventory->>'blocked_count'<>'0' or inventory->'entries' is distinct from frozen
   or private.account_media_scope(p_user_id,frozen) is distinct from p.stable_ids then
   raise exception using errcode='40001',message='[account media] inventory_changed'; end if;
 -- No earlier supported Auth delete can have been prepared while these exact owned source objects remain.
 begin
   perform public.assert_account_deletion(p_user_id,p_expected_owner);
   raise exception using errcode='P0001',message='[account media] retry_not_safe';
 exception when sqlstate 'P0001' then
   if sqlerrm<>'[account delete] storage_blocked' then raise; end if;
 end;
 update public.account_deletion_intents set replacement_user_id=p_replacement_user_id
   where user_id=p_user_id and replacement_user_id is not distinct from p_expected_owner;
 if not found then raise exception using errcode='40001',message='[account media] core_intent_changed'; end if;
 update private.account_media_plans set replacement_user_id=p_replacement_user_id,plan_generation=p_next_generation,
   used_generations=used_generations||array[p_next_generation],last_expected_generation=p_expected_generation,last_expected_owner=p_expected_owner where id=p.id;
 return jsonb_build_object('prepared',true,'user_id',p_user_id,'plan',private.account_media_summary(p.id));
end
$f$;

create function public.account_media_step(p_plan_id uuid,p_item_id uuid,p_caller_id uuid,p_action text,p_storage_receipt text default null,p_plan_generation uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog set row_security=off
as $f$
declare p private.account_media_plans%rowtype; i private.account_media_items%rowtype; o storage.objects%rowtype; d storage.objects%rowtype; r jsonb; dest text; current_scope uuid[];
begin
 if p_action is null or p_action not in ('claim_copy','confirm_copy','claim_remove','confirm_remove') then raise exception using errcode='22023',message='[account media] invalid_action'; end if;
 select * into p from private.account_media_plans where id=p_plan_id;
 if not found then raise exception using errcode='P0001',message='[account media] plan_missing'; end if;
 perform private.account_media_lock(p.user_id,p.replacement_user_id,p.stable_ids,p.farm_ids);
 select * into p from private.account_media_plans where id=p_plan_id for update;
 if p.plan_generation is distinct from p_plan_generation then raise exception using errcode='40001',message='[account media] generation_changed'; end if;
 select * into i from private.account_media_items where id=p_item_id and plan_id=p.id for update;
 if not found then raise exception using errcode='P0001',message='[account media] item_missing'; end if;
 if (p_action like '%copy' and (i.kind<>'shared' or p_caller_id is distinct from p.replacement_user_id))
   or (p_action like '%remove' and p_caller_id is distinct from p.user_id) then
   raise exception using errcode='42501',message='[account media] caller_mismatch';
 end if;
 select private.account_media_scope(p.user_id,coalesce(jsonb_agg(jsonb_build_object('kind',kind,'stable_id',stable_id)),'[]'))
   into current_scope from private.account_media_items where plan_id=p.id;
 if current_scope is distinct from p.stable_ids then raise exception using errcode='40001',message='[account media] scope_changed'; end if;
 if i.state='removed' or p_action like '%copy' and i.state in ('copied','remove_pending') then
   return jsonb_build_object('plan_id',p.id,'plan_generation',p.plan_generation,'item_id',i.id,'caller_id',p_caller_id,'replacement_user_id',p.replacement_user_id,'confirmed',true,'state',i.state);
 end if;
 select * into o from storage.objects where id=i.source_id and bucket_id=i.bucket_id and name=i.source_path for share;
 if p_action='claim_remove' and i.state='remove_pending' and not found then
   return jsonb_build_object('plan_id',p.id,'plan_generation',p.plan_generation,'item_id',i.id,'caller_id',p_caller_id,'replacement_user_id',p.replacement_user_id,
     'confirmed',false,'action','verify_remove','bucket_id',i.bucket_id,'source_path',i.source_path,'source_id',i.source_id);
 end if;
 if p_action<>'confirm_remove' and (not found or o.owner_id is distinct from p.user_id::text or (o.owner is not null and o.owner<>p.user_id)
   or o.version is distinct from i.source_version or o.metadata is distinct from i.source_metadata or o.updated_at is distinct from i.source_updated_at) then
   raise exception using errcode='P0001',message='[account media] source_changed';
 end if;
 if p_action='claim_copy' then
   if private.account_media_refs(i.bucket_id,i.source_path,p.project_url) is distinct from i.refs then raise exception using errcode='P0001',message='[account media] references_changed'; end if;
   update private.account_media_items set state='copy_pending' where id=i.id;
   return jsonb_build_object('plan_id',p.id,'plan_generation',p.plan_generation,'item_id',i.id,'caller_id',p_caller_id,'replacement_user_id',p.replacement_user_id,'confirmed',false,'action','copy',
     'bucket_id',i.bucket_id,'source_path',i.source_path,'destination_path',i.destination_path);
 elsif p_action='confirm_copy' then
   if i.state<>'copy_pending' or private.account_media_refs(i.bucket_id,i.source_path,p.project_url) is distinct from i.refs then
     raise exception using errcode='P0001',message='[account media] references_changed'; end if;
   select * into d from storage.objects where bucket_id=i.bucket_id and name=i.destination_path for share;
   if not found or d.id=i.source_id or d.owner_id is distinct from p.replacement_user_id::text or (d.owner is not null and d.owner<>p.replacement_user_id)
     or not private.account_media_metadata_complete(d.version,d.metadata,d.updated_at)
     or d.metadata->'eTag' is distinct from i.source_metadata->'eTag' or d.metadata->'size' is distinct from i.source_metadata->'size'
     or d.metadata->'mimetype' is distinct from i.source_metadata->'mimetype' then
     raise exception using errcode='P0001',message='[account media] copy_unconfirmed';
   end if;
   update private.account_media_items set state='copied',destination_id=d.id,destination_version=d.version,destination_metadata=d.metadata where id=i.id;
   dest:=p.project_url||'/storage/v1/object/public/'||i.bucket_id||'/'||i.destination_path;
   for r in select * from jsonb_array_elements(i.refs) loop
     if r->>'kind'='horse' then update public.horses set image_url=dest where id=(r->>'id')::uuid and stable_id=i.stable_id and image_url=r->>'value';
     elsif r->>'kind'='paddock' then update public.paddocks set image_url=dest where id=(r->>'id')::uuid and stable_id=i.stable_id and image_url=r->>'value';
     else raise exception using errcode='P0001',message='[account media] reference_kind'; end if;
     if not found then raise exception using errcode='40001',message='[account media] references_changed'; end if;
   end loop;
 elsif p_action='claim_remove' then
   perform pg_advisory_xact_lock(private.account_media_reference_key(case when i.bucket_id='posts' then i.source_path
     else p.project_url||'/storage/v1/object/public/'||i.bucket_id||'/'||i.source_path end));
   if exists(select 1 from private.account_media_items where plan_id=p.id and kind='shared' and state in ('frozen','copy_pending')) then
     raise exception using errcode='P0001',message='[account media] waiting_for_owner';
   end if;
   if i.kind='shared' then
     select * into d from storage.objects where id=i.destination_id and bucket_id=i.bucket_id and name=i.destination_path for share;
     if not found or d.owner_id is distinct from p.replacement_user_id::text or (d.owner is not null and d.owner<>p.replacement_user_id)
       or d.version is distinct from i.destination_version or d.metadata is distinct from i.destination_metadata
       or private.account_media_refs(i.bucket_id,i.source_path,p.project_url)<>'[]'::jsonb then
       raise exception using errcode='P0001',message='[account media] copy_unconfirmed'; end if;
   elsif private.account_media_refs(i.bucket_id,i.source_path,p.project_url) is distinct from i.refs then
     raise exception using errcode='P0001',message='[account media] references_changed';
   end if;
   insert into private.account_media_retired_paths(path_hash,reference_hash)
     values(sha256(convert_to(i.bucket_id||'/'||i.source_path,'UTF8')),sha256(convert_to(case when i.bucket_id='posts' then i.source_path
       else p.project_url||'/storage/v1/object/public/'||i.bucket_id||'/'||i.source_path end,'UTF8'))) on conflict(path_hash) do nothing;
   update private.account_media_items set state='remove_pending' where id=i.id;
   return jsonb_build_object('plan_id',p.id,'plan_generation',p.plan_generation,'item_id',i.id,'caller_id',p_caller_id,'replacement_user_id',p.replacement_user_id,'confirmed',false,'action','remove','bucket_id',i.bucket_id,'source_path',i.source_path,'source_id',i.source_id);
 elsif p_action='confirm_remove' then
   if i.state<>'remove_pending' or p_storage_receipt not in ('removed','absent') or p_storage_receipt is null
     or exists(select 1 from storage.objects where bucket_id=i.bucket_id and name=i.source_path or id=i.source_id) then
     raise exception using errcode='P0001',message='[account media] remove_unconfirmed'; end if;
   update private.account_media_items set state='removed' where id=i.id;
   for r in select * from jsonb_array_elements(i.refs) loop
     if i.kind='avatar' then update public.profiles set avatar_url=null where id=p.user_id and avatar_url=r->>'value';
     elsif i.kind='post' then update public.posts set image_url=null where id=(r->>'id')::uuid and user_id=p.user_id and image_url=r->>'value';
     end if;
     if i.kind<>'shared' and not found then raise exception using errcode='40001',message='[account media] references_changed'; end if;
   end loop;
 end if;
 return jsonb_build_object('plan_id',p.id,'plan_generation',p.plan_generation,'item_id',i.id,'caller_id',p_caller_id,'replacement_user_id',p.replacement_user_id,'confirmed',true,'state',case when p_action='confirm_copy' then 'copied' else 'removed' end);
end
$f$;

-- Scoped policy helpers expose only booleans. Existing permissive policies govern all unrelated rows.
create function public.account_media_storage_gate(p_bucket text,p_path text,p_mutating boolean)
returns boolean language sql stable security definer set search_path=pg_catalog set row_security=off
as $f$
 select not exists(select 1 from private.account_media_retired_paths where path_hash=sha256(convert_to(p_bucket||'/'||p_path,'UTF8')))
   and (not p_mutating or not exists(select 1 from private.account_media_items where bucket_id=p_bucket and (source_path=p_path or destination_path=p_path)));
$f$;
create function public.account_media_transfer_gate(p_bucket text,p_path text,p_insert boolean)
returns boolean language sql stable security definer set search_path=pg_catalog set row_security=off
as $f$
 select public.account_is_active() and exists(select 1 from private.account_media_plans p join private.account_media_items i on i.plan_id=p.id
   where p.replacement_user_id=auth.uid() and i.kind='shared' and i.state='copy_pending' and i.bucket_id=p_bucket
     and (p_insert and i.destination_path=p_path or not p_insert and p_path in (i.source_path,i.destination_path))
     and exists(select 1 from auth.users u where u.id=auth.uid() and u.deleted_at is null and coalesce(u.banned_until,'-infinity'::timestamptz)<=now())
     and not exists(select 1 from unnest(p.stable_ids) s(id) where not exists(select 1 from public.stable_members m
       where m.user_id=auth.uid() and m.stable_id=s.id and m.role='admin' and m.access='owner'))
     and exists(select 1 from storage.objects o where o.id=i.source_id and o.owner_id=p.user_id::text and (o.owner is null or o.owner=p.user_id)
       and o.version=i.source_version and o.metadata=i.source_metadata and o.updated_at=i.source_updated_at));
$f$;
create policy account_media_retired_gate on storage.objects as restrictive for insert to authenticated
  with check(public.account_media_storage_gate(bucket_id,name,false));
create policy account_media_update_gate on storage.objects as restrictive for update to authenticated
  using(public.account_media_storage_gate(bucket_id,name,true)) with check(public.account_media_storage_gate(bucket_id,name,true));
create policy account_media_delete_gate on storage.objects as restrictive for delete to authenticated
  using(public.account_media_storage_gate(bucket_id,name,true));
create policy account_media_transfer_read on storage.objects for select to authenticated
  using(public.account_media_transfer_gate(bucket_id,name,false));
create policy account_media_transfer_insert on storage.objects for insert to authenticated
  with check(public.account_media_transfer_gate(bucket_id,name,true) and owner_id=auth.uid()::text and (owner is null or owner=auth.uid()));

create function private.account_media_reference_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog set row_security=off
as $f$
declare v_kind text:=case tg_table_name when 'profiles' then 'avatar' when 'posts' then 'post' when 'horses' then 'horse' else 'paddock' end;
 old_value text; new_value text; row_id uuid; i record; expected text; reference_key bigint;
begin
 row_id:=case when tg_op='DELETE' then old.id else new.id end;
 if tg_op<>'INSERT' then old_value:=case when v_kind='avatar' then to_jsonb(old)->>'avatar_url' else to_jsonb(old)->>'image_url' end; end if;
 if tg_op<>'DELETE' then new_value:=case when v_kind='avatar' then to_jsonb(new)->>'avatar_url' else to_jsonb(new)->>'image_url' end; end if;
 -- SHARE writers; exclusive freeze/retirement waits for prior writers then rechecks exact inventory.
 for reference_key in select distinct private.account_media_reference_key(value) from unnest(array[old_value,new_value]) x(value)
   where value is not null order by 1 loop perform pg_advisory_xact_lock_shared(reference_key); end loop;
 if new_value is not null and exists(select 1 from private.account_media_items x join private.account_media_plans p on p.id=x.plan_id
   where new_value=case when x.bucket_id='posts' then x.source_path else p.project_url||'/storage/v1/object/public/'||x.bucket_id||'/'||x.source_path end
     and not exists(select 1 from jsonb_array_elements(x.refs) r where r->>'kind'=v_kind and r->>'id'=row_id::text)) then
   raise exception using errcode='P0001',message='[account media] frozen_source'; end if;
 if new_value is not null and exists(select 1 from private.account_media_retired_paths where reference_hash=sha256(convert_to(new_value,'UTF8'))) then
   raise exception using errcode='P0001',message='[account media] retired_reference'; end if;
 for i in select x.*,p.project_url from private.account_media_items x join private.account_media_plans p on p.id=x.plan_id
   where exists(select 1 from jsonb_array_elements(x.refs) r where r->>'kind'=v_kind and r->>'id'=row_id::text) loop
   expected:=case when i.kind='shared' then i.project_url||'/storage/v1/object/public/'||i.bucket_id||'/'||i.destination_path else null end;
   if old_value is distinct from new_value or tg_op='DELETE' then
     if not ((i.kind='shared' and i.state in ('copied','remove_pending','removed') and new_value is not distinct from expected)
       or (i.kind<>'shared' and i.state='removed' and new_value is null and tg_op<>'DELETE')) then
       raise exception using errcode='P0001',message='[account media] frozen_reference'; end if;
   end if;
 end loop;
 if new_value is not null and exists(select 1 from private.account_media_items x join private.account_media_plans p on p.id=x.plan_id
   where x.kind='shared' and new_value=p.project_url||'/storage/v1/object/public/'||x.bucket_id||'/'||x.destination_path
     and not exists(select 1 from jsonb_array_elements(x.refs) r where r->>'kind'=v_kind and r->>'id'=row_id::text)) then
   raise exception using errcode='P0001',message='[account media] frozen_destination'; end if;
 return case when tg_op='DELETE' then old else new end;
end
$f$;
create trigger account_media_reference_guard before insert or update or delete on public.posts for each row execute function private.account_media_reference_guard();
create trigger account_media_reference_guard before insert or update or delete on public.horses for each row execute function private.account_media_reference_guard();
create trigger account_media_reference_guard before insert or update or delete on public.paddocks for each row execute function private.account_media_reference_guard();
create trigger account_media_reference_guard before insert or update on public.profiles for each row execute function private.account_media_reference_guard();

create function private.account_media_deletion_ready()
returns trigger language plpgsql security definer set search_path=pg_catalog set row_security=off
as $f$
declare p private.account_media_plans%rowtype; frozen_entries jsonb;
begin
 -- Preserve existing direct-profile rejection. During supported Auth cascade A is already gone.
 if exists(select 1 from auth.users where id=old.id) then return old; end if;
 select * into p from private.account_media_plans where user_id=old.id;
 if not found then return old; end if;
 perform 1 from auth.users where id=p.replacement_user_id for share;
 perform 1 from public.profiles where id=p.replacement_user_id for key share;
 perform 1 from public.farms where id=any(p.farm_ids) order by id for update;
 perform 1 from public.stables where id=any(p.stable_ids) order by id for update;
 perform 1 from public.stable_members where user_id=p.replacement_user_id and stable_id=any(p.stable_ids) order by stable_id,id for update;
 select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'stable_id',stable_id)),'[]') into frozen_entries from private.account_media_items where plan_id=p.id;
 if private.account_media_scope(old.id,frozen_entries) is distinct from p.stable_ids
   or (select coalesce(array_agg(id order by id),'{}'::uuid[]) from public.farms where created_by=old.id) is distinct from p.farm_ids
   or (p.replacement_user_id is not null and not exists(select 1 from auth.users u join public.profiles q on q.id=u.id
     where u.id=p.replacement_user_id and u.deleted_at is null and coalesce(u.banned_until,'-infinity'::timestamptz)<=now()
       and not exists(select 1 from public.account_deletion_intents where user_id=u.id)))
   or exists(select 1 from unnest(p.stable_ids) s(id) where not exists(select 1 from public.stable_members m where m.user_id=p.replacement_user_id and m.stable_id=s.id and m.role='admin' and m.access='owner')) then
   raise exception using errcode='P0001',message='[account media] owner_invalid';
 end if;
 perform 1 from storage.objects d where exists(select 1 from private.account_media_items i where i.plan_id=p.id and i.destination_id=d.id) order by d.id for share;
 if exists(select 1 from private.account_media_items where plan_id=p.id and state<>'removed')
   or exists(select 1 from private.account_media_items i where i.plan_id=p.id and i.kind='shared' and not exists(select 1 from storage.objects d
     where d.id=i.destination_id and d.bucket_id=i.bucket_id and d.name=i.destination_path and d.owner_id=p.replacement_user_id::text
       and (d.owner is null or d.owner=p.replacement_user_id) and d.version=i.destination_version and d.metadata=i.destination_metadata)) then
   raise exception using errcode='P0001',message='[account media] media_unconfirmed';
 end if;
 return old;
end
$f$;
-- Auth cascade: verify frozen media/owner BEFORE existing creator transfer, with whole-transaction rollback on any failure.
create trigger a_account_media_deletion_ready before delete on public.profiles for each row execute function private.account_media_deletion_ready();

-- Explicit per-function ACLs; never widen existing table/schema/global grants.
revoke all on function private.account_media_reference_key(text),private.account_media_refs(text,text,text),private.account_media_metadata_complete(text,jsonb,timestamptz),private.account_media_inventory(uuid,text),private.account_media_scope(uuid,jsonb),private.account_media_owners(uuid,uuid[]),private.account_media_lock(uuid,uuid,uuid[],uuid[]),private.account_media_summary(uuid),private.account_media_reference_guard(),private.account_media_deletion_ready() from public,anon,authenticated,service_role;
revoke all on function public.own_account_media_status(text),public.prepare_account_media_deletion(uuid,uuid,text,uuid),public.account_media_step(uuid,uuid,uuid,text,text,uuid),public.reselect_account_media_owner(uuid,uuid,uuid,uuid,uuid,uuid),public.account_media_storage_gate(text,text,boolean),public.account_media_transfer_gate(text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.own_account_media_status(text),public.account_media_storage_gate(text,text,boolean),public.account_media_transfer_gate(text,text,boolean) to authenticated;
grant execute on function public.prepare_account_media_deletion(uuid,uuid,text,uuid),public.account_media_step(uuid,uuid,uuid,text,text,uuid),public.reselect_account_media_owner(uuid,uuid,uuid,uuid,uuid,uuid) to service_role;
commit;
