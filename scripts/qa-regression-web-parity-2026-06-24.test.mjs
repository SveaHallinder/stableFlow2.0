// Regression: ISSUE-101..106 — web-parity + security cluster from the exhaustive
// multi-agent QA + codex review pass.
// Found by /qa on 2026-06-24 (branch balanced-mvp-1.1.0)
// Report: .gstack/qa-reports/qa-report-localhost-2026-06-24.md
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
async function readProjectFile(path) {
  return readFile(new URL(path, root), 'utf8');
}

// ISSUE-101 — owner signup must not depend on expo-secure-store on web.
test('ISSUE-101: pendingAuth uses platform-aware storage, not SecureStore on web', async () => {
  const src = await readProjectFile('lib/pendingAuth.ts');
  assert.match(src, /import \{ Platform \} from 'react-native'/);
  assert.match(src, /Platform\.OS === 'web'/);
  assert.match(src, /globalThis\.localStorage/);
  // The public API still gates signup on a durable write.
  assert.match(src, /export async function savePendingOwnerStable/);
});

// ISSUE-102 — email links must be platform-aware, never the native scheme on web.
test('ISSUE-102: authRedirectUrl is platform-aware and screens use it (no stableflow:// literals)', async () => {
  const helper = await readProjectFile('lib/authRedirect.ts');
  assert.match(helper, /export function authRedirectUrl\(path: 'confirm' \| 'reset'\)/);
  assert.match(helper, /globalThis\.location\?\.origin/);
  assert.match(helper, /return `stableflow:\/\/\$\{path\}`/); // native fallback only

  for (const f of ['app/(auth)/index.tsx', 'app/(auth)/forgot-password.tsx', 'app/settings/account.tsx']) {
    const src = await readProjectFile(f);
    assert.match(src, /authRedirectUrl\(/, `${f} should call authRedirectUrl`);
    assert.doesNotMatch(src, /['"`]stableflow:\/\//, `${f} must not hardcode the native scheme`);
  }
});

// ISSUE-103 — destructive/moderation flows must use a web-capable confirm.
test('ISSUE-103: confirmAction falls back to window.confirm; no Alert.alert remains', async () => {
  const helper = await readProjectFile('lib/confirm.ts');
  assert.match(helper, /Platform\.OS === 'web'/);
  assert.match(helper, /globalThis\.confirm/);

  for (const f of ['app/(tabs)/feed.tsx', 'app/paddocks/index.tsx', 'app/members/index.tsx']) {
    const src = await readProjectFile(f);
    assert.match(src, /confirmAction\(/, `${f} should use confirmAction`);
    assert.doesNotMatch(src, /Alert\.alert/, `${f} must not use Alert.alert (no-op on web)`);
  }
});

// ISSUE-104 — browser-invoked edge function must answer CORS preflight.
test('ISSUE-104: delete-account handles OPTIONS preflight and sets CORS headers', async () => {
  const src = await readProjectFile('supabase/functions/delete-account/index.ts');
  assert.match(src, /req\.method === "OPTIONS"/);
  assert.match(src, /Access-Control-Allow-Origin/);
  assert.match(src, /Access-Control-Allow-Methods/);
});

// ISSUE-105 — owner RLS branch must bind the horse to the row's stable.
test('ISSUE-105: owner RLS branches bind h.stable_id to the row stable', async () => {
  const sql = await readProjectFile('supabase/migrations/20260624_fix_owner_cross_stable_writes.sql');
  assert.match(sql, /h\.stable_id = feed_plans\.stable_id/);
  assert.match(sql, /h\.stable_id = planned_rides\.stable_id/);
  // 3 policies per table (insert/update/delete) = 6 bindings total.
  const count = (sql.match(/and h\.stable_id = (feed_plans|planned_rides)\.stable_id/g) || []).length;
  assert.equal(count, 6, `expected 6 stable_id bindings, found ${count}`);
});

// ISSUE-106 — moderation must not claim success on a partial failure.
test('ISSUE-106: handleRemovePost checks the resolve result before claiming success', async () => {
  const src = await readProjectFile('app/admin/reports.tsx');
  assert.match(src, /const resolved = await actions\.resolveContentReport/);
  assert.match(src, /if \(!resolved\.success\)/);
});
