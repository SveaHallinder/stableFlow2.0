import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('Phase 4 — horse profile renders interactive daily status editor', async () => {
  const horseProfile = await readProjectFile('app/horses/[id].tsx');

  assert.match(horseProfile, /function DailyStatusEditor/);
  // In/ute toggles + checkbox-toggles use updateHorseDayStatus
  assert.match(horseProfile, /actions\.updateHorseDayStatus\(\{/);
  // Two in/out fields and three booleans
  assert.match(horseProfile, /'dayStatus'/);
  assert.match(horseProfile, /'nightStatus'/);
  assert.match(horseProfile, /'hay'/);
  assert.match(horseProfile, /'water'/);
  assert.match(horseProfile, /'checked'/);
  // Read-only message when canEdit=false
  assert.match(horseProfile, /Du kan läsa detta, men inte ändra\./);
});

test('Phase 4 — PlannedRide types + reducer + actions wired in AppDataContext', async () => {
  const context = await readProjectFile('context/AppDataContext.tsx');

  assert.match(context, /export type PlannedRideStatus = 'planned' \| 'done' \| 'cancelled'/);
  assert.match(context, /export type PlannedRide = \{/);
  assert.match(context, /export type CreatePlannedRideInput = \{/);
  assert.match(context, /export type UpdatePlannedRideInput = \{/);
  assert.match(context, /export type CompletePlannedRideInput = \{/);
  assert.match(context, /plannedRides: PlannedRide\[\];/);
  assert.match(context, /case 'PLANNED_RIDE_UPSERT'/);
  assert.match(context, /case 'PLANNED_RIDE_DELETE'/);
  assert.match(context, /createPlannedRide: \(input: CreatePlannedRideInput\)/);
  assert.match(context, /completePlannedRide: \(input: CompletePlannedRideInput\)/);
  // Stable/horse-delete clears plannedRides
  assert.match(
    context,
    /plannedRides: state\.plannedRides\.filter\(\(ride\) => ride\.stableId !== action\.payload\.id\)/,
  );
  assert.match(
    context,
    /plannedRides: state\.plannedRides\.filter\(\(ride\) => ride\.horseId !== action\.payload\.id\)/,
  );
});

test('Phase 4 — completePlannedRide creates a ride log atomically', async () => {
  const context = await readProjectFile('context/AppDataContext.tsx');

  // The action dispatches RIDE_LOG_ADD AND PLANNED_RIDE_UPSERT
  assert.match(context, /dispatch\(\{ type: 'RIDE_LOG_ADD', payload: rideLog \}\);/);
  assert.match(
    context,
    /dispatch\(\{ type: 'PLANNED_RIDE_UPSERT', payload: updatedRide \}\);/,
  );
  // Status flips to done and links completed_ride_log_id
  assert.match(context, /status: 'done',\s+completedRideLogId: rideLog\.id/);
  // Ride log inherits stable/horse/date from the planned ride
  assert.match(context, /stableId: existing\.stableId/);
  assert.match(context, /horseId: existing\.horseId/);
});

test('Phase 4 — Supabase load includes planned_rides', async () => {
  const context = await readProjectFile('context/AppDataContext.tsx');

  assert.match(context, /supabase\.from\('planned_rides'\)\.select\('\*'\)\.in\('stable_id', stableIds\)/);
  assert.match(context, /from\('planned_rides'\)\.upsert/);
  assert.match(context, /from\('planned_rides'\)\.delete\(\)\.eq\('id', rideId\)/);
  // STATE_HYDRATE includes plannedRides
  assert.match(context, /plannedRides: action\.payload\.plannedRides \?\? state\.plannedRides/);
});

test('Phase 4 — planned_rides migration + schema mirror RLS shape', async () => {
  const migrationSql = await readProjectFile('supabase/migrations/20260503_planned_rides.sql');
  const schemaSql = await readProjectFile('supabase/schema.sql');

  for (const fragment of [
    /create table if not exists public\.planned_rides/i,
    /alter table public\.planned_rides enable row level security/i,
    /completed_ride_log_id uuid references public\.ride_logs/i,
    /can_manage_ride_logs\(stable_id\)/i,
    /horses h\s+where h\.id = planned_rides\.horse_id\s+and h\.owner_user_id = \(select auth\.uid\(\)\)/i,
  ]) {
    assert.match(migrationSql, fragment);
    assert.match(schemaSql, fragment);
  }
});

test('Phase 4 — horse profile exposes planned-rides editor and history block', async () => {
  const horseProfile = await readProjectFile('app/horses/[id].tsx');

  assert.match(horseProfile, /function PlannedRidesEditor/);
  assert.match(horseProfile, /Planera ridpass/);
  assert.match(horseProfile, /Slutför ridpass/);
  assert.match(horseProfile, /Logga ridpass klart/);
  assert.match(horseProfile, /Senaste loggade pass/);
  // Owner OR manageRideLogs can edit
  assert.match(horseProfile, /derived\.permissions\.canManageRideLogs \|\| isOwner/);
});
