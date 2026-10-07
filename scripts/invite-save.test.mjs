import assert from 'node:assert/strict';
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

async function loadInvitePersistence(confirmRows) {
  const capture = { rows: [], pending: new Map() };
  let id = 0;
  const query = {
    insert(rows) { capture.rows = rows; return this; },
    select() { return this; },
    abortSignal: async () => ({ data: confirmRows(capture.rows), error: null }),
  };
  const persist = await loadAction('persistStableInvite', {
    user: { id: 'user' }, isQaDemoMode: false, pendingInviteDrafts: { current: capture.pending },
    stateRef: { current: { horses: [] } }, generateId: () => `invite-${++id}`,
    generateInviteCode: () => `CODE-${id}`, supabase: { from: () => query }, console: { warn() {} },
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
