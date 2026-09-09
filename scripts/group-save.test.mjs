import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

async function loadAction(name, dependencies) {
  const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
  const declaration = provider.body.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === name);
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

const group = { id: 'group', stableId: 'stable', name: 'Foderlag', type: 'custom', createdAt: '2026-09-08T00:00:00.000Z', createdByUserId: 'owner' };
function setup(overrides = {}) {
  const dispatched = [];
  return { dispatched, dependencies: {
    stateRef: { current: { currentUserId: 'owner', currentStableId: 'stable', groups: [group] } },
    ensurePermission: () => ({ success: true }), generateId: () => 'generated-id',
    dispatch: action => dispatched.push(action), trackDataWrite: promise => promise,
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
    persistGroupInsert: async () => ({ success: false, reason: 'QA denied' }),
    persistGroupUpdate: async () => ({ success: false, reason: 'QA denied' }),
    persistGroupDelete: async () => ({ success: false, reason: 'QA denied' }),
    ...overrides,
  } };
}
const cases = [
  ['createGroup', action => action({ requestId: 'group', name: 'Foderlag', stableId: 'stable' })],
  ['renameGroup', action => action({ id: 'group', name: 'Kvällslag' })],
  ['deleteGroup', action => action('group')],
];
for (const [name, invoke] of cases) {
  test(`${name} retains groups and post targets before acknowledgement and on failure`, async () => {
    let finish;
    const operation = new Promise(resolve => { finish = resolve; });
    const { dependencies, dispatched } = setup({ persistGroupInsert: () => operation, persistGroupUpdate: () => operation, persistGroupDelete: () => operation });
    const result = invoke(await loadAction(name, dependencies));
    try {
      assert.equal(dispatched.length, 0);
      assert.equal(dependencies.pendingDataWrites.current.size, 1);
    } finally { finish({ success: false, reason: 'QA rejected group write' }); }
    assert.equal((await result).success, false);
    assert.equal(dispatched.length, 0);
    assert.equal(dependencies.pendingDataWrites.current.size, 0);
  });
  test(`${name} shares the group lock`, async () => {
    const { dependencies, dispatched } = setup({ pendingDataWrites: { current: new Set(['group:group']) } });
    assert.equal((await invoke(await loadAction(name, dependencies))).success, false);
    assert.equal(dispatched.length, 0);
  });
}
test('create retry preserves request identity and uses acknowledged data', async () => {
  const sent = [];
  const acknowledged = { ...group, name: 'Server name' };
  const { dependencies, dispatched } = setup({ persistGroupInsert: async value => {
    sent.push(value);
    return sent.length === 1 ? { success: false, reason: 'Lost acknowledgement' } : { success: true, data: acknowledged };
  } });
  const action = await loadAction('createGroup', dependencies);
  dependencies.stateRef.current.groups = [];
  assert.equal((await action({ requestId: 'group', name: 'Foderlag', stableId: 'stable' })).success, false);
  assert.equal((await action({ requestId: 'group', name: 'Foderlag', stableId: 'stable' })).success, true);
  assert.deepEqual(sent.map(value => value.id), ['group', 'group']);
  assert.deepEqual(dispatched, [{ type: 'GROUP_ADD', payload: acknowledged }]);
});
test('create recovery replaces a group already loaded by refresh', async () => {
  const acknowledged = { ...group, name: 'Nytt namn' };
  const { dependencies, dispatched } = setup({ persistGroupInsert: async () => ({ success: true, data: acknowledged }) });
  assert.equal((await (await loadAction('createGroup', dependencies))({ requestId: 'group', name: 'Nytt namn' })).success, true);
  assert.deepEqual(dispatched, [{ type: 'GROUP_UPDATE', payload: { id: 'group', updates: acknowledged } }]);
});
test('lost create acknowledgement safely recovers an edited draft with the same identity', async () => {
  const row = { id: 'group', stable_id: 'stable', name: 'Första namn', type: 'custom', created_by_user_id: 'owner', created_at: group.createdAt };
  let reads = 0;
  const query = { then: resolve => Promise.resolve(resolve(reads++ === 0 ? { error: { code: '23505' } } : { data: row, error: null })) };
  for (const method of ['insert', 'eq', 'select', 'abortSignal', 'single']) query[method] = () => query;
  query.update = updates => { Object.assign(row, updates); return query; };
  const action = await loadAction('persistGroupInsert', { user: { id: 'owner' }, isQaDemoMode: false, supabase: { from: () => query }, console: { warn() {} } });
  const result = await action({ ...group, name: 'Ändrat namn' });
  assert.equal(result.success, true);
  assert.equal(result.data.id, 'group');
  assert.equal(result.data.name, 'Ändrat namn');
});
for (const name of ['persistGroupInsert', 'persistGroupUpdate', 'persistGroupDelete']) {
  test(`${name} rejects zero-row acknowledgement`, async () => {
    const query = { then: resolve => Promise.resolve(resolve({ data: null, error: null })) };
    for (const method of ['insert', 'update', 'delete', 'eq', 'select', 'abortSignal', 'single', 'maybeSingle']) query[method] = () => query;
    const action = await loadAction(name, { user: { id: 'owner' }, isQaDemoMode: false,
      supabase: { from: () => query }, reportPersistErrorRef: { current() {} }, console: { warn() {} },
      hasOwnProperty: (value, key) => Object.prototype.hasOwnProperty.call(value, key),
    });
    const result = name === 'persistGroupInsert' ? await action(group) : await action('group', name === 'persistGroupUpdate' ? { name: 'Ny' } : 'stable', 'stable');
    assert.equal(result?.success, false);
  });
}
test('create recovery never accepts a duplicate from another stable or author', async () => {
  for (const wrong of [{ stable_id: 'another-stable' }, { created_by_user_id: 'another-user' }]) {
    const row = { id: 'group', stable_id: 'stable', name: 'Foderlag', type: 'custom', created_by_user_id: 'owner', ...wrong };
    let reads = 0;
    const query = { then: resolve => Promise.resolve(resolve(reads++ === 0 ? { error: { code: '23505' } } : { data: row, error: null })) };
    for (const method of ['insert', 'update', 'eq', 'select', 'abortSignal', 'single']) query[method] = () => query;
    const action = await loadAction('persistGroupInsert', { user: { id: 'owner' }, isQaDemoMode: false, supabase: { from: () => query }, reportPersistErrorRef: { current() {} }, console: { warn() {} } });
    assert.equal((await action(group))?.success, false);
  }
});
