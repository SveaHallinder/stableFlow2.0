-- REVIEW PROPOSAL ONLY. NOT APPROVED, NOT RUN, NEVER AUTO-RUN FROM BUILD/TEST.
-- Root observed pg_cron absent; pg_net already present. No new project/plan/key.
-- Install only after explicit schema approval and repo integration + exact green CI.
-- Exact supported SQL from Supabase Cron install docs (checked 2026-10-08):
-- https://supabase.com/docs/guides/cron/install
-- https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/cron/install.mdx
-- If pg_cron is already present, stop and review; do not replace/drop an extension.
begin;
create extension pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
commit;
