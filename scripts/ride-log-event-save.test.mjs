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

test('ordinary event remains unsaved when its server acknowledgement fails', async () => {
  const dispatched = [];
  const action = await loadAction('addEvent', {
    stateRef: { current: { currentStableId: 'stable' } }, ensurePermission: () => ({ success: true }),
    dispatch: value => dispatched.push(value), generateId: () => 'event', trackDataWrite() {},
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
    persistAlertInsert: async () => ({ success: false, reason: 'QA no receipt' }),
  });
  const result = await action('Ny uppdatering', 'info', 'event');
  assert.equal(result.success, false);
  assert.deepEqual(dispatched, []);
});

test('ride-log creation requires the confirmed row and keeps the request id for retry', async () => {
  const dispatched = [];
  const action = await loadAction('addRideLog', {
    stateRef: { current: { currentStableId: 'stable', currentUserId: 'user', stables: [{ id: 'stable', rideTypes: [{ id: 'type' }] }], horses: [{ id: 'horse', stableId: 'stable' }] } },
    ensurePermission: () => ({ success: true }), isValidISODate: () => true,
    dispatch: value => dispatched.push(value), generateId: () => 'wrong-new-id', trackDataWrite() {},
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
    persistRideLogInsert: async (log, confirm) => { assert.equal(log.id, 'same-request'); assert.equal(confirm, true); return undefined; },
  });
  const result = await action({ requestId: 'same-request', date: '2026-09-08', horseId: 'horse', rideTypeId: 'type' });
  assert.equal(result.success, false);
  assert.deepEqual(dispatched, []);
});

test('ride-log deletion preserves the row when the server refuses it', async () => {
  const dispatched = [];
  const action = await loadAction('removeRideLog', {
    stateRef: { current: { rideLogs: [{ id: 'log', stableId: 'stable' }] } }, ensurePermission: () => ({ success: true }),
    dispatch: value => dispatched.push(value), trackDataWrite() {},
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
    persistRideLogDelete: async () => ({ success: false, reason: 'QA no receipt' }),
  });
  assert.equal((await action('log')).success, false);
  assert.deepEqual(dispatched, []);
});
