import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('phase 6 migration introduces stable alerts with RLS', async () => {
  const migrationSql = await readProjectFile('supabase/migrations/20260503_alerts.sql');

  assert.match(migrationSql, /create table if not exists public\.stable_alerts/i);
  assert.match(migrationSql, /severity text not null default 'info'/i);
  assert.match(migrationSql, /resolved_at timestamptz/i);
  assert.match(migrationSql, /alter table public\.stable_alerts enable row level security/i);
  assert.match(migrationSql, /create policy "stable_alerts_select"/i);
  assert.match(migrationSql, /create policy "stable_alerts_update"/i);
});

test('phase 6 schema mirrors stable alerts table and policies', async () => {
  const schemaSql = await readProjectFile('supabase/schema.sql');

  assert.match(schemaSql, /create table if not exists public\.stable_alerts/i);
  assert.match(schemaSql, /horse_id uuid references public\.horses/i);
  assert.match(schemaSql, /assignment_id uuid references public\.assignments/i);
  assert.match(schemaSql, /create policy "stable_alerts_insert"/i);
  assert.match(schemaSql, /create index if not exists stable_alerts_active_idx/i);
});

test('phase 6 app state exposes create and resolve alert actions', async () => {
  const appDataContext = await readProjectFile('context/AppDataContext.tsx');

  assert.match(appDataContext, /export type StableAlert =/i);
  assert.match(appDataContext, /stableAlerts: StableAlert\[\]/i);
  assert.match(appDataContext, /createStableAlert: \(input: CreateStableAlertInput\)/i);
  assert.match(appDataContext, /resolveStableAlert: \(alertId: string\)/i);
  assert.match(appDataContext, /from\('stable_alerts'\)/i);
});

test('phase 6 UI separates important alerts from feed posts', async () => {
  const todayScreen = await readProjectFile('app/(tabs)/index.tsx');
  const feedScreen = await readProjectFile('app/(tabs)/feed.tsx');

  assert.match(todayScreen, /activeStableAlerts/i);
  assert.match(todayScreen, /Viktigt/i);
  assert.match(todayScreen, /actions\.resolveStableAlert/i);
  assert.match(feedScreen, /importantAlerts/i);
  assert.match(feedScreen, /Viktigt i stallet/i);
});

test('phase 6 push rules notify important alerts but not normal posts', async () => {
  const pushFunction = await readProjectFile('supabase/functions/send-push-notification/index.ts');
  const triggerSql = await readProjectFile('supabase/migrations/20260503_alerts.sql');

  assert.match(pushFunction, /type NotificationType = "message" \| "assignment" \| "post" \| "alert"/i);
  assert.match(pushFunction, /async function handleAlert/i);
  assert.match(pushFunction, /severity === "info"/i);
  assert.match(pushFunction, /normal feed posts do not push/i);
  assert.match(triggerSql, /notify_push\('alert', to_jsonb\(NEW\)\)/i);
});
