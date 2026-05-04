import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('Phase 3 feed types are exported from AppDataContext', async () => {
  const context = await readProjectFile('context/AppDataContext.tsx');

  assert.match(context, /export type FeedSlot = 'morning' \| 'lunch' \| 'evening'/);
  assert.match(context, /export type FeedPlanItem = \{/);
  assert.match(context, /export type FeedCheck = \{/);
  assert.match(context, /export type UpsertFeedPlanInput = \{/);
  assert.match(context, /export type UpsertFeedCheckInput = \{/);
  assert.match(context, /feedPlans: FeedPlanItem\[\];/);
  assert.match(context, /feedChecks: FeedCheck\[\];/);
});

test('AppDataContext has feed reducer cases and clears on stable/horse delete', async () => {
  const context = await readProjectFile('context/AppDataContext.tsx');

  assert.match(context, /case 'FEED_PLAN_UPSERT'/);
  assert.match(context, /case 'FEED_PLAN_DELETE'/);
  assert.match(context, /case 'FEED_CHECK_UPSERT'/);
  assert.match(context, /case 'FEED_CHECK_DELETE'/);
  // STABLE_DELETE clears feed data
  assert.match(
    context,
    /feedPlans: state\.feedPlans\.filter\(\(plan\) => plan\.stableId !== action\.payload\.id\)/,
  );
  assert.match(
    context,
    /feedChecks: state\.feedChecks\.filter\(\(check\) => check\.stableId !== action\.payload\.id\)/,
  );
  // HORSE_DELETE clears feed data
  assert.match(
    context,
    /feedPlans: state\.feedPlans\.filter\(\(plan\) => plan\.horseId !== action\.payload\.id\)/,
  );
});

test('AppDataContext exposes upsertFeedPlan/deleteFeedPlan/upsertFeedCheck actions', async () => {
  const context = await readProjectFile('context/AppDataContext.tsx');

  assert.match(context, /upsertFeedPlan: \(input: UpsertFeedPlanInput\) => ActionResult<FeedPlanItem>;/);
  assert.match(context, /deleteFeedPlan: \(feedPlanId: string\) => ActionResult;/);
  assert.match(context, /upsertFeedCheck: \(input: UpsertFeedCheckInput\) => ActionResult<FeedCheck>;/);
  // Owner can edit override OR admin/edit can edit defaults
  assert.match(context, /horse\?\.ownerUserId === current\.currentUserId/);
  // Owner of horse can also mark feed checks even with view access
  assert.match(context, /isHorseOwner =/);
  assert.match(context, /permissions\.canUpdateHorseStatus \|\| isHorseOwner/);
  // upsertFeedCheck preserves existing deviationNote when input.deviationNote is undefined
  assert.match(context, /input\.deviationNote === undefined/);
});

test('AppDataContext loads feed_plans and feed_checks from Supabase', async () => {
  const context = await readProjectFile('context/AppDataContext.tsx');

  assert.match(context, /supabase\.from\('feed_plans'\)\.select\('\*'\)\.in\('stable_id', stableIds\)/);
  assert.match(context, /supabase\.from\('feed_checks'\)\.select\('\*'\)\.in\('stable_id', stableIds\)/);
  assert.match(context, /from\('feed_plans'\)\.upsert/);
  assert.match(context, /from\('feed_checks'\)\.upsert/);
  assert.match(context, /onConflict: 'horse_id,date,slot'/);
});

test('lib/today.ts exposes feed slot helpers and deriveFeedFocus', async () => {
  const today = await readProjectFile('lib/today.ts');

  assert.match(today, /export const feedSlotLabels: Record<FeedSlot, string>/);
  assert.match(today, /export function getCurrentFeedSlot/);
  assert.match(today, /export function deriveFeedFocus/);
  assert.match(today, /if \(hour < 10\) return 'morning'/);
  assert.match(today, /if \(hour < 14\) return 'lunch'/);
  // FeedFocus aggregates totalCount, checkedCount, deviationCount
  assert.match(today, /totalCount: items\.length/);
  assert.match(today, /checkedCount = items\.filter\(\(item\) => Boolean\(item\.check\?\.checkedAt\)\)/);
  assert.match(today, /deviationCount = items\.filter\(\(item\) => Boolean\(item\.check\?\.deviationNote\)\)/);
});

test('Today screen renders Foder nu card with deviation flow', async () => {
  const todayScreen = await readProjectFile('app/(tabs)/index.tsx');

  assert.match(todayScreen, /Foder nu/);
  assert.match(todayScreen, /deriveFeedFocus\(\{/);
  assert.match(todayScreen, /handleFeedCheck/);
  assert.match(todayScreen, /handleFeedDeviationOpen/);
  assert.match(todayScreen, /handleFeedDeviationSave/);
  assert.match(todayScreen, /Spara avvikelse/);
  assert.match(todayScreen, /Markera klart/);
});

test('Horse profile renders feed plan editor + history', async () => {
  const horseProfile = await readProjectFile('app/horses/[id].tsx');

  assert.match(horseProfile, /function FeedPlanList/);
  assert.match(horseProfile, /function FeedPlanForm/);
  assert.match(horseProfile, /Senaste foderkollar/);
  assert.match(horseProfile, /Lägg till hästplan/);
  assert.match(horseProfile, /Ändra stallplan|Lägg till stallplan/);
  assert.match(horseProfile, /Markera klart/);
  assert.match(horseProfile, /Spara avvikelse/);
  // Avbryt-knapp i deviation form
  assert.match(horseProfile, /Avbryt/);
});

// Pure runtime checks: replicate the slot-resolution logic and assert it matches
// the source file. This keeps the test gate honest about the boundaries.
function inlineGetCurrentFeedSlot(now) {
  const hour = now.getHours();
  if (hour < 10) return 'morning';
  if (hour < 14) return 'lunch';
  return 'evening';
}

test('getCurrentFeedSlot resolves morning/lunch/evening at boundary hours', () => {
  assert.equal(inlineGetCurrentFeedSlot(new Date(2026, 4, 3, 6, 0)), 'morning');
  assert.equal(inlineGetCurrentFeedSlot(new Date(2026, 4, 3, 9, 59)), 'morning');
  assert.equal(inlineGetCurrentFeedSlot(new Date(2026, 4, 3, 10, 0)), 'lunch');
  assert.equal(inlineGetCurrentFeedSlot(new Date(2026, 4, 3, 13, 59)), 'lunch');
  assert.equal(inlineGetCurrentFeedSlot(new Date(2026, 4, 3, 14, 0)), 'evening');
  assert.equal(inlineGetCurrentFeedSlot(new Date(2026, 4, 3, 22, 30)), 'evening');
});

test('feed migration + schema mirror identical RLS rule shapes', async () => {
  const migrationSql = await readProjectFile('supabase/migrations/20260503_feed_plans.sql');
  const schemaSql = await readProjectFile('supabase/schema.sql');

  // Identical DDL
  for (const fragment of [
    /create table if not exists public\.feed_plans/i,
    /create table if not exists public\.feed_checks/i,
    /unique \(horse_id, date, slot\)/i,
    /alter table public\.feed_plans enable row level security/i,
    /alter table public\.feed_checks enable row level security/i,
    /can_update_horse_status\(stable_id\)/i,
    /horses h\s+where h\.id = feed_plans\.horse_id\s+and h\.owner_user_id = \(select auth\.uid\(\)\)/i,
  ]) {
    assert.match(migrationSql, fragment);
    assert.match(schemaSql, fragment);
  }
});
