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

const paddock = { id: 'paddock', stableId: 'stable', name: 'Sommarhagen', horseNames: ['Mira'], season: 'summer', updatedAt: '2026-09-08T12:00:00Z' };

function dependencies(overrides = {}) {
  return {
    stateRef: { current: { currentStableId: 'stable', paddocks: [paddock] } },
    ensurePermission: () => ({ success: true }), generateId: () => 'new-paddock',
    normalizeHorseNames: names => names, dispatch() {}, trackDataWrite: promise => Promise.resolve(promise).catch(() => {}),
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
    ...overrides,
  };
}

test('paddock save waits for server acknowledgement and retains the row on failure', async () => {
  let finish;
  const operation = new Promise(resolve => { finish = resolve; });
  const dispatched = [];
  const action = await loadAction('upsertPaddock', dependencies({
    dispatch: action => dispatched.push(action), persistPaddockUpsert: () => operation,
  }));
  const result = action({ ...paddock, name: 'Ny hage' });
  const beforeAcknowledgement = dispatched.length;
  finish({ success: false, reason: 'QA no acknowledgement' });
  assert.equal(beforeAcknowledgement, 0);
  assert.equal((await result).success, false);
  assert.equal(dispatched.length, 0);
});

test('paddock save dispatches the confirmed canonical row and reuses the requested ID', async () => {
  const dispatched = [];
  const serverPaddock = { ...paddock, id: 'request-id', image: { uri: 'https://example.test/paddock.jpg' } };
  const action = await loadAction('upsertPaddock', dependencies({
    dispatch: action => dispatched.push(action),
    persistPaddockUpsert: async next => { assert.equal(next.id, 'request-id'); return { success: true, data: serverPaddock }; },
  }));
  assert.equal((await action({ ...paddock, id: 'request-id' })).success, true);
  assert.deepEqual(dispatched, [{ type: 'PADDOCK_UPSERT', payload: serverPaddock }]);
});

test('paddock deletion retains the row when persistence fails', async () => {
  const dispatched = [];
  const action = await loadAction('deletePaddock', dependencies({
    dispatch: action => dispatched.push(action), persistPaddockDelete: async () => ({ success: false, reason: 'QA no acknowledgement' }),
  }));
  assert.equal((await action(paddock.id)).success, false);
  assert.equal(dispatched.length, 0);
});

test('paddock deletion and save share an in-flight lock', async () => {
  let writes = 0;
  const deps = dependencies({
    pendingDataWrites: { current: new Set(['paddock:paddock']) },
    persistPaddockDelete: async () => { writes++; return { success: true }; },
    persistPaddockUpsert: async () => { writes++; return { success: true, data: paddock }; },
  });
  assert.equal((await (await loadAction('deletePaddock', deps))(paddock.id)).success, false);
  assert.equal((await (await loadAction('upsertPaddock', deps))(paddock)).success, false);
  assert.equal(writes, 0);
});


test('paddock persistence rejects empty save and delete acknowledgements', async () => {
  const query = { upsert() { return this; }, update() { return this; }, delete() { return this; }, eq() { return this; }, select() { return this; }, single() { return this; }, abortSignal() { return this; }, then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve); } };
  const deps = { user: { id: 'user' }, isQaDemoMode: false, supabase: { from: () => query }, reportPersistErrorRef: { current() {} }, console: { warn() {} }, dispatch() {}, getUploadableImage: () => null };
  const save = await loadAction('persistPaddockUpsert', deps);
  const remove = await loadAction('persistPaddockDelete', deps);
  assert.equal((await save(paddock, null, false))?.success, false);
  assert.equal((await remove(paddock))?.success, false);
});
