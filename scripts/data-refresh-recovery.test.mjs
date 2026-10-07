import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

async function loadAction(dependencies) {
  const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
  const declaration = provider.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(ast) === 'loadAppData');
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

async function fixture() {
  const controls = { error: null, onRead: null };
  const requests = [];
  const warnings = [];
  const dispatched = [];
  const states = { hydrating: [], refreshing: [], errors: [], refreshedAt: [] };
  const user = { id: 'offline-refresh-user', email: 'offline-refresh@example.test' };
  const sdk = createClient('https://offline-refresh.example.test', 'offline-anon-key', {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, storage: {
      getItem() {
        controls.onRead?.();
        if (controls.error) throw controls.error;
        return null;
      },
      setItem() {}, removeItem() {},
    } },
    global: { fetch: async input => {
      const url = new URL(input);
      requests.push(url.pathname);
      const rows = url.pathname === '/rest/v1/profiles' ? { id: user.id, full_name: 'Offline Refresh' } : [];
      assert.ok(['/rest/v1/rpc/accept_pending_invites', '/rest/v1/stable_members', '/rest/v1/profiles'].includes(url.pathname));
      return new globalThis.Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
    } },
  });
  await sdk.auth.getSession();
  const dependencies = {
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 }, refreshRequestId: { current: 0 },
    setHydrating: value => states.hydrating.push(value), setRefreshing: value => states.refreshing.push(value),
    setRefreshError: value => states.errors.push(value), setLastRefreshedAt: value => states.refreshedAt.push(value),
    isQaDemoMode: false, supabase: sdk, user, dispatch: value => dispatched.push(value),
    loadPendingOwnerStable: async () => null, loadPendingJoinCode: async () => null, loadDefaultPassDraft: async () => [],
    console: { warn: (...values) => warnings.push(values) },
  };
  return { controls, requests, warnings, dispatched, states, dependencies, action: await loadAction(dependencies) };
}

for (const reason of ['init', 'manual']) {
  test(`${reason} refresh keeps data, releases loading and retries after an actual SDK storage failure`, async () => {
    const f = await fixture();
    const privateDetail = 'PRIVATE session detail offline-person@example.test Bearer offline-secret';
    f.controls.error = new Error(privateDetail);
    assert.deepEqual(await f.action({ reason }), { success: false, reason: 'Kunde inte uppdatera stalldata. Försök igen.' });
    assert.deepEqual(f.dispatched, []);
    assert.deepEqual(f.requests, []);
    assert.equal(f.states.hydrating.at(-1), false);
    assert.equal(f.states.refreshing.at(-1), false);
    assert.equal(f.warnings.length, 1);
    assert.equal(f.warnings[0][0], '[stable refresh] Kunde inte uppdatera stalldata');
    assert.match(JSON.stringify(f.warnings[0].slice(1)), /"Error"/);
    assert.doesNotMatch(JSON.stringify({ states: f.states, warnings: f.warnings }), /PRIVATE|offline-person|offline-secret/);

    f.controls.error = null;
    assert.deepEqual(await f.action({ reason }), { success: true });
    assert.equal(f.dispatched.length, 1);
    assert.equal(f.dispatched[0].payload.currentUserId, f.dependencies.user.id);
    assert.equal(f.states.errors.at(-1), null);
    assert.equal(f.states.refreshedAt.length, 1);
    assert.equal(f.states.hydrating.at(-1), false);
    assert.equal(f.states.refreshing.at(-1), false);
  });
}

test('an unexpected non-Error refresh rejection exposes neither its detail nor session fields', async () => {
  const f = await fixture();
  f.controls.error = { message: 'PRIVATE rejection', access_token: 'offline-secret-token' };
  assert.equal((await f.action()).reason, 'Kunde inte uppdatera stalldata. Försök igen.');
  assert.equal(f.warnings.length, 1);
  assert.equal(f.warnings[0][0], '[stable refresh] Kunde inte uppdatera stalldata');
  assert.match(JSON.stringify(f.warnings[0].slice(1)), /"Unknown"/);
  assert.doesNotMatch(JSON.stringify({ states: f.states, warnings: f.warnings }), /PRIVATE|offline-secret-token/);
  assert.deepEqual(f.dispatched, []);
});

test('an obsolete refresh error does not replace or unlock a newer refresh', async () => {
  const f = await fixture();
  f.controls.error = new Error('Obsolete read');
  f.controls.onRead = () => { f.dependencies.refreshRequestId.current += 1; };
  assert.equal((await f.action()).success, false);
  assert.deepEqual(f.states.errors, []);
  assert.deepEqual(f.states.hydrating, []);
  assert.deepEqual(f.states.refreshing, [true]);
  assert.deepEqual(f.dispatched, []);
});

test('a pending stable write retains its specific wait message and starts no refresh reads', async () => {
  const f = await fixture();
  f.dependencies.pendingDataWrites.current.add('offline-pending-write');
  const result = await f.action();
  assert.equal(result.reason, 'En ändring sparas. Vänta ett ögonblick och uppdatera igen.');
  assert.deepEqual(f.requests, []);
  assert.deepEqual(f.warnings, []);
  assert.deepEqual(f.states.refreshing, []);
});
