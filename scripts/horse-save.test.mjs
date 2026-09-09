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

test('horse edits preserve omitted box and sleeping settings and wait for persistence', async () => {
  let finish;
  const operation = new Promise(resolve => { finish = resolve; });
  const horse = { id: 'horse', stableId: 'stable', name: 'Mira', boxNumber: '7', canSleepInside: true, note: 'Behåll' };
  const dispatched = [];
  const action = await loadAction('upsertHorse', {
    stateRef: { current: { horses: [horse] } }, ensurePermission: () => ({ success: true }),
    dispatch: action => dispatched.push(action), generateId: () => 'new-horse',
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 }, trackDataWrite: () => {},
    persistHorseUpsert: next => { assert.equal(next.boxNumber, '7'); assert.equal(next.canSleepInside, true); return operation; },
  });
  const result = action({ id: 'horse', stableId: 'stable', name: 'Mira II', note: '' });
  assert.equal(dispatched.length, 0);
  finish({ success: false, reason: 'Network failure' });
  assert.equal((await result).success, false);
  assert.equal(dispatched.length, 0);
});

test('confirmed horse uses server image and explicit cleared settings', async () => {
  const dispatched = [];
  const serverHorse = { id: 'horse', stableId: 'stable', name: 'Mira', image: { uri: 'https://example.test/photo.jpg' } };
  const action = await loadAction('upsertHorse', {
    stateRef: { current: { horses: [{ ...serverHorse, boxNumber: '7', canSleepInside: true }] } },
    ensurePermission: () => ({ success: true }), dispatch: action => dispatched.push(action), generateId: () => 'horse',
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 }, trackDataWrite: () => {},
    persistHorseUpsert: async next => { assert.equal(next.boxNumber, undefined); assert.equal(next.canSleepInside, false); return { success: true, data: serverHorse }; },
  });
  const result = await action({ id: 'horse', stableId: 'stable', name: 'Mira', boxNumber: '', canSleepInside: false });
  assert.equal(result.success, true);
  assert.deepEqual(dispatched, [{ type: 'HORSE_UPSERT', payload: serverHorse }]);
});

test('horse deletion waits for acknowledgement and preserves the horse on failure', async () => {
  const dispatched = [];
  const action = await loadAction('deleteHorse', {
    stateRef: { current: { horses: [{ id: 'horse', stableId: 'stable', name: 'Mira' }] } },
    ensurePermission: () => ({ success: true }), dispatch: action => dispatched.push(action),
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 }, trackDataWrite: () => {},
    persistHorseDelete: async () => ({ success: false, reason: 'QA missing acknowledgement' }),
  });
  assert.equal((await action('horse')).success, false);
  assert.equal(dispatched.length, 0);
});

test('horse deletion shares the in-flight horse-save lock', async () => {
  let deletes = 0;
  const action = await loadAction('deleteHorse', {
    stateRef: { current: { horses: [{ id: 'horse', stableId: 'stable' }] } },
    ensurePermission: () => ({ success: true }), dispatch() {},
    pendingDataWrites: { current: new Set(['horse:horse']) }, dataWriteVersion: { current: 0 }, trackDataWrite() {},
    persistHorseDelete: async () => { deletes += 1; return { success: true }; },
  });
  assert.equal((await action('horse')).success, false);
  assert.equal(deletes, 0);
});
