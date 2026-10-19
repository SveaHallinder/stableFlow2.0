import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadAction(name, dependencies) {
  const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
  const declaration = provider.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === name);
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

test('an invite is not confirmed before the server saves it', async () => {
  let finish;
  const operation = new Promise(resolve => { finish = resolve; });
  const pending = new Set();
  const action = await loadAction('addMember', {
    ensurePermission: () => ({ success: true }), generateInviteCode: () => 'CODE', trackDataWrite: () => {},
    pendingDataWrites: { current: pending }, dataWriteVersion: { current: 0 },
    persistStableInvite: () => operation,
  });
  const result = action({ stableId: 'A', stableIds: ['A'], name: 'Ägaren', email: 'owner@example.test', role: 'rider' });
  assert.equal(pending.size, 1);
  finish({ success: false, reason: 'Network failure' });
  assert.equal((await result).success, false);
  assert.equal(pending.size, 0);
});

test('an explicitly deselected stable must never receive an invitation', async () => {
  let writes = 0;
  const action = await loadAction('addMember', {
    ensurePermission: () => ({ success: true }), generateInviteCode: () => 'CODE', trackDataWrite: () => {},
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
    persistStableInvite: async () => { writes += 1; return { success: true, data: { inviteCode: 'CODE' } }; },
  });
  const result = await action({ stableId: 'A', stableIds: ['B'], name: 'Ägaren', email: 'owner@example.test', role: 'rider' });
  assert.equal(result.success, false);
  assert.equal(writes, 0);
});

async function loadInvitePersistence(confirmRows, options = {}) {
  const capture = { rows: [], pending: new Map(), invocations: [], state: { horses: [], currentUserId: 'user' }, phase: 'insert', logs: [] };
  let id = 0;
  const query = {
    insert(rows) { capture.rows = rows; capture.phase = 'insert'; return this; },
    in(column, ids) { assert.equal(column, 'id'); capture.selectedIds = ids; capture.phase = 'recovery'; return this; },
    select() { return this; },
    abortSignal: async () => ({ data: await confirmRows(capture.rows), error: capture.phase === 'insert' ? options.insertError ?? null : null }),
  };
  const persist = await loadAction('persistStableInvite', {
    user: { id: 'user' }, isQaDemoMode: false, pendingInviteDrafts: { current: capture.pending },
    stateRef: { current: capture.state }, generateId: () => `invite-${++id}`,
    generateInviteCode: () => `CODE-${id}`, supabase: {
      from: () => query,
      auth: { getSession: options.getSession ?? (async () => ({ data: { session: { user: { id: options.sessionUser ?? 'user' }, access_token: 'synthetic-captured-token' } }, error: null })) },
      functions: { invoke: async (name, input) => {
        capture.invocations.push({ name, input });
        if (options.invoke) return options.invoke(capture.rows, name, input);
        return { data: { accepted: true, actor_id: 'user', invite_ids: capture.rows.map(row => row.id) }, error: null };
      } },
    }, console: { warn: (...args) => capture.logs.push(args) },
    ...(options.timeoutMs ? { setTimeout: callback => globalThis.setTimeout(callback, options.timeoutMs) } : {}),
  });
  return { persist, capture };
}

test('the invite receipt returns the confirmed normalized email for every selected stable', async () => {
  const { persist, capture } = await loadInvitePersistence(rows => rows);
  const result = await persist({ stableId: 'A', email: '  OWNER@Example.Test  ', role: 'rider' }, ['A', 'B']);
  assert.equal(result.success, true);
  assert.equal(result.data.email, 'owner@example.test');
  assert.deepEqual(capture.rows.map(row => row.email), ['owner@example.test', 'owner@example.test']);
  assert.deepEqual(result.data.codes, capture.rows.map(row => ({ stableId: row.stable_id, code: row.code })));
  assert.equal(capture.pending.size, 0);
});

test('an invite acknowledged for another email must not show a receipt', async () => {
  const { persist, capture } = await loadInvitePersistence(rows => rows.map(row => ({ ...row, email: 'other@example.test' })));
  const result = await persist({ stableId: 'A', email: 'owner@example.test', role: 'rider' }, ['A']);
  assert.equal(result.success, false);
  assert.equal(result.data, undefined);
  assert.equal(capture.pending.size, 1, 'Keep the original invitation draft for a safe retry');
});


test('confirmed invitation invokes email only with saved IDs and a captured caller token', async () => {
  const { persist, capture } = await loadInvitePersistence(rows => rows);
  const result = await persist({ stableId: 'A', email: 'owner@example.test', role: 'rider' }, ['A', 'B']);
  assert.equal(result.success, true);
  assert.equal(capture.invocations.length, 1);
  assert.equal(capture.invocations[0].name, 'send-invite');
  assert.deepEqual(capture.invocations[0].input.body, { invite_ids: capture.rows.map(row => row.id) });
  assert.equal(capture.invocations[0].input.headers.Authorization, 'Bearer synthetic-captured-token');
  assert.equal(result.data.createdByUserId, 'user');
  assert.equal(result.data.emailDelivery, 'accepted');
});

test('a failed invitation insert never invokes email', async () => {
  const { persist, capture } = await loadInvitePersistence(rows => rows.map(row => ({ ...row, email: 'wrong@example.test' })));
  assert.equal((await persist({ stableId: 'A', email: 'owner@example.test', role: 'rider' }, ['A'])).success, false);
  assert.equal(capture.invocations.length, 0);
});

test('email failure cannot erase a saved invitation or its codes', async () => {
  const { persist, capture } = await loadInvitePersistence(rows => rows, { invoke: async () => { throw new Error('Synthetic provider failure'); } });
  const result = await persist({ stableId: 'A', email: 'owner@example.test', role: 'rider' }, ['A']);
  assert.equal(result.success, true);
  assert.equal(result.data.emailDelivery, 'unconfirmed');
  assert.equal(result.data.codes[0].code, capture.rows[0].code);
  assert.equal(capture.pending.size, 0, 'A mail failure must not turn the saved invite into a creation retry.');
});

test('email acceptance must bind the exact saved IDs and current actor', async () => {
  for (const acknowledgement of [
    { accepted: true, actor_id: 'another-user', invite_ids: ['invite-1'] },
    { accepted: true, actor_id: 'user', invite_ids: ['another-invite'] },
    { accepted: true, actor_id: 'user', invite_ids: [] },
    { accepted: true, actor_id: 'user', invite_ids: ['invite-1', 'invite-1'] },
    { accepted: 'true', actor_id: 'user', invite_ids: ['invite-1'] },
  ]) {
    const { persist } = await loadInvitePersistence(rows => rows, { invoke: async () => ({ data: acknowledgement, error: null }) });
    const result = await persist({ stableId: 'A', email: 'owner@example.test', role: 'rider' }, ['A']);
    assert.equal(result.success, true);
    assert.equal(result.data.emailDelivery, 'unconfirmed');
  }
});

test('an SDK account switch before email dispatch cannot use the new session', async () => {
  const { persist, capture } = await loadInvitePersistence(rows => rows, { sessionUser: 'other-user' });
  const result = await persist({ stableId: 'A', email: 'owner@example.test', role: 'rider' }, ['A']);
  assert.equal(result.success, true);
  assert.equal(result.data.emailDelivery, 'unconfirmed');
  assert.equal(capture.invocations.length, 0);
});

test('an unresolved email invocation is bounded while the saved codes remain usable', async () => {
  const { persist } = await loadInvitePersistence(rows => rows, { invoke: () => new Promise(() => {}), timeoutMs: 5 });
  const result = await persist({ stableId: 'A', email: 'owner@example.test', role: 'rider' }, ['A']);
  assert.equal(result.success, true);
  assert.equal(result.data.emailDelivery, 'unconfirmed');
  assert.ok(result.data.codes[0].code);
});


test('a lost insert receipt recovers only the original IDs before invoking email', async () => {
  const { persist, capture } = await loadInvitePersistence(rows => rows, { insertError: { code: '23505' } });
  const result = await persist({ stableId: 'A', email: 'owner@example.test', role: 'rider' }, ['A']);
  assert.equal(result.success, true);
  assert.deepEqual(capture.selectedIds, capture.rows.map(row => row.id));
  assert.deepEqual(capture.invocations[0].input.body.invite_ids, capture.selectedIds);
});

test('email dispatch waits for the actual invitation insert acknowledgement', async () => {
  let confirm;
  const receipt = new Promise(resolve => { confirm = resolve; });
  const { persist, capture } = await loadInvitePersistence(() => receipt);
  const pending = persist({ stableId: 'A', email: 'owner@example.test', role: 'rider' }, ['A']);
  assert.equal(capture.invocations.length, 0);
  confirm(capture.rows);
  assert.equal((await pending).data.emailDelivery, 'accepted');
  assert.equal(capture.invocations.length, 1);
});

test('a delayed session read cannot dispatch mail after the deadline', async () => {
  let release;
  const session = new Promise(resolve => { release = resolve; });
  const { persist, capture } = await loadInvitePersistence(rows => rows, { getSession: () => session, timeoutMs: 5 });
  const result = await persist({ stableId: 'A', email: 'owner@example.test', role: 'rider' }, ['A']);
  assert.equal(result.success, true);
  assert.equal(result.data.emailDelivery, 'unconfirmed');
  release({ data: { session: { user: { id: 'user' }, access_token: 'synthetic-captured-token' } }, error: null });
  await new Promise(resolve => globalThis.setImmediate(resolve));
  assert.equal(capture.invocations.length, 0);
});

test('a late email acknowledgement cannot confirm delivery on another account', async () => {
  let acknowledge;
  const ack = new Promise(resolve => { acknowledge = resolve; });
  const { persist, capture } = await loadInvitePersistence(rows => rows, { invoke: () => ack });
  const pending = persist({ stableId: 'A', email: 'owner@example.test', role: 'rider' }, ['A']);
  await new Promise(resolve => globalThis.setImmediate(resolve));
  assert.equal(capture.invocations.length, 1);
  capture.state.currentUserId = 'other-user';
  acknowledge({ data: { accepted: true, actor_id: 'user', invite_ids: capture.rows.map(row => row.id) }, error: null });
  const result = await pending;
  assert.equal(result.data.emailDelivery, 'unconfirmed');
  assert.equal(result.data.createdByUserId, 'user');
});

test('actual installed FunctionsClient preserves the captured JWT even if the global SDK token changed', async () => {
  const http = [];
  const client = createClient('https://synthetic.example.test', 'synthetic-anon-key', {
    accessToken: async () => 'new-global-B-token',
    global: { fetch: async (input, options) => {
      http.push({ input: String(input), options });
      const ids = JSON.parse(options.body).invite_ids;
      return new globalThis.Response(JSON.stringify({ accepted: true, actor_id: 'user', invite_ids: ids }), { status: 200, headers: { 'content-type': 'application/json' } });
    } },
  });
  const { persist } = await loadInvitePersistence(rows => rows, { invoke: (_rows, name, input) => client.functions.invoke(name, input) });
  assert.equal((await persist({ stableId: 'A', email: 'owner@example.test', role: 'rider' }, ['A'])).data.emailDelivery, 'accepted');
  assert.equal(http.length, 1);
  assert.equal(new globalThis.Headers(http[0].options.headers).get('authorization'), 'Bearer synthetic-captured-token');
  assert.deepEqual(Object.keys(JSON.parse(http[0].options.body)), ['invite_ids']);
});


test('a stalled invitation insert is bounded and retains the same draft without invoking email', async () => {
  const { persist, capture } = await loadInvitePersistence(() => new Promise(() => {}), { timeoutMs: 5 });
  const result = await Promise.race([
    persist({ stableId: 'A', email: 'owner@example.test', role: 'rider' }, ['A']),
    new Promise(resolve => globalThis.setTimeout(() => resolve('hung'), 100)),
  ]);
  assert.notEqual(result, 'hung', 'A storage/SDK stall must not keep the invite form busy indefinitely.');
  assert.equal(result.success, false);
  assert.equal(capture.pending.size, 1);
  assert.equal(capture.invocations.length, 0);
});

test('invitation failures log only a safe error class, without SDK payloads', async () => {
  const { persist, capture } = await loadInvitePersistence(() => { throw new Error('private-marker recipient@example.test'); });
  assert.equal((await persist({ stableId: 'A', email: 'owner@example.test', role: 'rider' }, ['A'])).success, false);
  assert.match(capture.logs.at(-1)[0], /^\[invite create\]/);
  assert.doesNotMatch(capture.logs.flat().map(String).join(' '), /private-marker|recipient@example.test/);
});
