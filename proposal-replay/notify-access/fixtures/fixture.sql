-- Entirely synthetic local fixture; no extension, Auth rows, real key or HTTP.
create schema private;
create schema net;
create schema vault;
revoke all on schema private,net,vault from public,anon,authenticated,service_role;

create table private.synthetic_http_calls (
  id bigint generated always as identity primary key,
  url text not null,
  payload jsonb not null,
  content_type text,
  timeout_ms integer not null,
  authorization_is_vault boolean not null,
  authorization_is_fallback boolean not null,
  executing_role text not null,
  login_role text not null
);
create table vault.decrypted_secrets (name text primary key, decrypted_secret text not null);
insert into vault.decrypted_secrets(name,decrypted_secret)
  values ('service_role_key','synthetic-vault-only-key');

create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer)
returns bigint language plpgsql as $fake_http$
declare result bigint;
begin
  if url is distinct from 'https://synthetic-dispatch.invalid/functions/v1/send-push-notification'
     or headers->>'Content-Type' is distinct from 'application/json'
     or timeout_milliseconds <> 5000 then
    raise exception '[push acl replay] Only the synthetic endpoint and original request shape are allowed.';
  end if;
  if headers->>'Authorization' is distinct from 'Bearer synthetic-vault-only-key'
     and headers->>'Authorization' is distinct from 'Bearer synthetic-fallback-only-key' then
    raise exception '[push acl replay] Only synthetic authorization is allowed.';
  end if;
  insert into private.synthetic_http_calls(
    url,payload,content_type,timeout_ms,authorization_is_vault,authorization_is_fallback,executing_role,login_role
  ) values (
    url,body,headers->>'Content-Type',timeout_milliseconds,
    headers->>'Authorization' = 'Bearer synthetic-vault-only-key',
    headers->>'Authorization' = 'Bearer synthetic-fallback-only-key',current_user,session_user
  ) returning id into result;
  return result;
end;
$fake_http$;

create table public.messages (
  id uuid primary key, conversation_id uuid, author_id uuid, text text
);
create table public.assignments (
  id uuid primary key, assignee_id uuid, label text, date text, time text
);
create table public.posts (
  id uuid primary key, user_id uuid, stable_id uuid, content text
);
create table public.stable_alerts (
  id uuid primary key, stable_id uuid, created_by_user_id uuid, severity text, title text, body text
);
grant select,insert,update on public.messages,public.assignments,public.posts,public.stable_alerts to authenticated;
