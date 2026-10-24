-- Apply only after the deployed send-push-notification AND _shared/push-receipts
-- sources have been read back and verified for custom-group audience checks.
-- No chat policies, helper permissions, trigger bindings or message data change.
begin;
lock table public.messages in share row exclusive mode;

do $$
begin
  if not exists(
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang
    where p.oid=to_regprocedure('public.trigger_push_new_message()')
      and p.prorettype='pg_catalog.trigger'::regtype and l.lanname='plpgsql'
      and p.prosecdef and p.proconfig=array['search_path=public']
      and p.provolatile='v' and not p.proisstrict and not p.proleakproof and p.proparallel='u'
      and p.procost=100 and p.prorows=0
      and lower(regexp_replace(p.prosrc,'[[:space:]]','','g'))=lower(regexp_replace($guard$
        begin
          if exists(select 1 from public.conversations c where c.id=NEW.conversation_id and c.chat_kind='custom') then
            return NEW;
          end if;
          perform public.notify_push('message', to_jsonb(NEW));
          return NEW;
        end;
      $guard$,'[[:space:]]','','g'))
      and exists(select 1 from pg_catalog.pg_trigger t
        where t.tgrelid='public.messages'::regclass and t.tgfoid=p.oid
          and t.tgname='on_new_message_push' and not t.tgisinternal
          and t.tgtype=5 and t.tgenabled='O' and t.tgqual is null)
  ) then
    raise exception using errcode='55000',
      message='[chat group push] Pushtriggern har ändrats. Granska aktuell funktion och bindning före aktivering.';
  end if;
end $$;

create or replace function public.trigger_push_new_message()
returns trigger language plpgsql security definer set search_path=public as $function$
begin
  perform public.notify_push('message', to_jsonb(NEW));
  return NEW;
end;
$function$;

-- Rollback BEFORE deploying an older Edge sender: restore only the guarded
-- function body from 20261024122050_custom_member_group_chats.sql. Keep its OID,
-- owner, ACL and on_new_message_push binding; do not undo the chat migration.
commit;
