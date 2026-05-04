-- StableFlow staging database bootstrap.
-- Run this against a clean Supabase staging project before applying app schema.
-- Replace the two app.settings values before running, then run:
-- 1. this file
-- 2. supabase/schema.sql
-- 3. supabase/storage_policies.sql as role supabase_admin
-- 4. supabase/migrations/20250313_push_notifications.sql
-- 5. supabase/migrations/20250313_push_notification_triggers.sql

create extension if not exists "pgcrypto";
create extension if not exists pg_net with schema net;

alter database postgres set "app.settings.supabase_url" = 'https://YOUR-STAGING-PROJECT.supabase.co';
alter database postgres set "app.settings.service_role_key" = 'YOUR-STAGING-SERVICE-ROLE-KEY';
