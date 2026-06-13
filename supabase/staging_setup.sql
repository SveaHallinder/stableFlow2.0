-- StableFlow staging database bootstrap.
-- Run this against a clean Supabase staging project before applying app schema.
-- Replace the two app.settings values before running, then run:
-- 1. this file
-- 2. supabase/schema.sql
-- 3. supabase/storage_policies.sql as role supabase_admin
-- 4. supabase/migrations/20250313_push_notifications.sql
-- 5. supabase/migrations/20250313_push_notification_triggers.sql
-- 6. supabase/migrations/20260613_fas0a_push_vault.sql
-- 7. supabase/migrations/20260613_fas0a_chat_rls.sql
-- 8. supabase/migrations/20260613_fas0a_stables_update.sql
-- 9. supabase/migrations/20260613_fas2_invite_delivery.sql

create extension if not exists "pgcrypto";
create extension if not exists pg_net with schema net;

alter database postgres set "app.settings.supabase_url" = 'https://YOUR-STAGING-PROJECT.supabase.co';

-- Fas 0A #6: service-role-nyckeln ligger i Supabase Vault (ej plaintext-GUC).
-- Måste matcha edge-funktionens SUPABASE_SERVICE_ROLE_KEY exakt (den sträng-jämför).
select vault.create_secret(
  'YOUR-STAGING-SERVICE-ROLE-KEY',
  'service_role_key',
  'Used by notify_push to authenticate calls to the send-push-notification edge function'
);
