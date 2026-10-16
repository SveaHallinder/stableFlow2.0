-- PROPOSED ONLY. Non-secret public project URL; no service-key value is present.
begin;
do $configuration$
begin
  if (select count(*) from vault.secrets where name='supabase_url')=0 then
    perform vault.create_secret('https://zbcghmpjslasnxqcodqa.supabase.co','supabase_url','StableFlow existing project URL for the notification trigger');
  elsif (select count(*) from vault.decrypted_secrets where name='supabase_url' and decrypted_secret='https://zbcghmpjslasnxqcodqa.supabase.co')<>1 then
    raise exception using errcode='55000',message='[push notify] Existing Vault URL differs; configuration was not changed';
  end if;
end
$configuration$;
commit;
