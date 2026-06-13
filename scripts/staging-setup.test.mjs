import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('staging database setup is reproducible from repo files', async () => {
  const setupSql = await readProjectFile('supabase/staging_setup.sql');
  const schemaSql = await readProjectFile('supabase/schema.sql');
  const bootstrapSql = `${setupSql}\n${schemaSql}`;

  assert.match(bootstrapSql, /create table if not exists public\.profiles/i);
  assert.match(bootstrapSql, /create table if not exists public\.posts/i);
  assert.match(bootstrapSql, /create table if not exists public\.likes/i);
  assert.match(bootstrapSql, /create table if not exists public\.comments/i);
  assert.match(schemaSql, /create or replace function public\.validate_invite/i);
  assert.match(schemaSql, /upper\(i\.code\) = v_code/i);
  assert.doesNotMatch(schemaSql, /return v_has_email or v_has_code/i);
  assert.match(setupSql, /create extension if not exists pg_net/i);
  assert.match(setupSql, /supabase\/schema\.sql/i);
  assert.match(setupSql, /supabase\/storage_policies\.sql/i);
  assert.match(setupSql, /app\.settings\.supabase_url/i);
  // Fas 0A #6: service-role key now lives in Supabase Vault, not a plaintext GUC.
  assert.match(setupSql, /vault\.create_secret/i);
  assert.match(setupSql, /'service_role_key'/i);
  assert.doesNotMatch(setupSql, /app\.settings\.service_role_key/i);
});

test('invite validation migration is present for staging rebuilds', async () => {
  const migrationSql = await readProjectFile('supabase/migrations/20260503_sync_invite_validation.sql');

  assert.match(migrationSql, /create or replace function public\.validate_invite/i);
  assert.match(migrationSql, /upper\(i\.code\) = v_code/i);
  assert.match(migrationSql, /return v_has_code;/i);
});

test('feed plan migration introduces feed_plans and feed_checks with RLS', async () => {
  const migrationSql = await readProjectFile('supabase/migrations/20260503_feed_plans.sql');

  assert.match(migrationSql, /create table if not exists public\.feed_plans/i);
  assert.match(migrationSql, /create table if not exists public\.feed_checks/i);
  assert.match(migrationSql, /alter table public\.feed_plans enable row level security/i);
  assert.match(migrationSql, /alter table public\.feed_checks enable row level security/i);
  assert.match(migrationSql, /unique \(horse_id, date, slot\)/i);
  assert.match(migrationSql, /can_update_horse_status/i);
});

test('schema mirrors feed plan tables and policies', async () => {
  const schemaSql = await readProjectFile('supabase/schema.sql');

  assert.match(schemaSql, /create table if not exists public\.feed_plans/i);
  assert.match(schemaSql, /create table if not exists public\.feed_checks/i);
  assert.match(schemaSql, /create policy "feed_plans_select"/i);
  assert.match(schemaSql, /create policy "feed_checks_insert"/i);
});

test('planned_rides migration introduces table with RLS', async () => {
  const migrationSql = await readProjectFile('supabase/migrations/20260503_planned_rides.sql');

  assert.match(migrationSql, /create table if not exists public\.planned_rides/i);
  assert.match(migrationSql, /alter table public\.planned_rides enable row level security/i);
  assert.match(migrationSql, /completed_ride_log_id uuid references public\.ride_logs/i);
  assert.match(migrationSql, /can_manage_ride_logs\(stable_id\)/i);
});

test('schema mirrors planned_rides table and policies', async () => {
  const schemaSql = await readProjectFile('supabase/schema.sql');

  assert.match(schemaSql, /create table if not exists public\.planned_rides/i);
  assert.match(schemaSql, /create policy "planned_rides_select"/i);
  assert.match(schemaSql, /create policy "planned_rides_insert"/i);
  assert.match(schemaSql, /create index if not exists planned_rides_stable_id_date_idx/i);
});

test('care events + contacts migration introduces both tables with RLS', async () => {
  const migrationSql = await readProjectFile('supabase/migrations/20260503_care_events_contacts.sql');

  assert.match(migrationSql, /create table if not exists public\.external_contacts/i);
  assert.match(migrationSql, /create table if not exists public\.care_events/i);
  assert.match(migrationSql, /horse_ids uuid\[\] not null default/i);
  assert.match(migrationSql, /alter table public\.external_contacts enable row level security/i);
  assert.match(migrationSql, /alter table public\.care_events enable row level security/i);
  assert.match(migrationSql, /can_edit_stable\(stable_id\)/i);
});

test('schema mirrors care events + contacts tables and policies', async () => {
  const schemaSql = await readProjectFile('supabase/schema.sql');

  assert.match(schemaSql, /create table if not exists public\.external_contacts/i);
  assert.match(schemaSql, /create table if not exists public\.care_events/i);
  assert.match(schemaSql, /create policy "care_events_select"/i);
  assert.match(schemaSql, /create policy "external_contacts_insert"/i);
  assert.match(schemaSql, /create index if not exists care_events_horse_ids_gin_idx/i);
});

test('qa seed path documents role-based staging users', async () => {
  const seedSql = await readProjectFile('supabase/seed_qa.sql');

  assert.match(seedSql, /confirmed auth users/i);
  assert.match(seedSql, /qa_admin_email/i);
  assert.match(seedSql, /qa_staff_email/i);
  assert.match(seedSql, /qa_owner_email/i);
  assert.match(seedSql, /qa_rider_email/i);
  assert.match(seedSql, /qa_guest_email/i);
  assert.match(seedSql, /stable_members/i);
});

test('package exposes the minimal test gate', async () => {
  const packageJson = JSON.parse(await readProjectFile('package.json'));

  assert.equal(packageJson.scripts?.test, 'node --test scripts/*.test.mjs');
});
