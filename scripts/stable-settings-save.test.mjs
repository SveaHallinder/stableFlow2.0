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

test('stable settings stay unchanged until the server acknowledges them', async () => {
  let finish;
  const operation = new Promise(resolve => { finish = resolve; });
  const dispatched = [];
  const settings = { dayLogic: 'box', eventVisibility: {}, arena: {}, onboarding: {} };
  const stable = { id: 'stable', name: 'Stallet', settings };
  const action = await loadAction('updateStable', {
    stateRef: { current: { stables: [stable] } }, ensurePermission: () => ({ success: true }),
    resolveStableSettings: () => settings, dispatch: action => dispatched.push(action),
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 }, trackDataWrite: () => {},
    persistStableUpdate: () => operation,
  });
  const result = action({ id: stable.id, updates: { settings: { dayLogic: 'loose' } } });
  assert.equal(dispatched.length, 0);
  finish({ success: false, reason: 'Network failure' });
  assert.equal((await result).success, false);
  assert.equal(dispatched.length, 0);
});

for (const changedRemotely of [false, true]) {
  test(`settings compare the stored JSON before writing (remote change: ${changedRemotely})`, async () => {
    const base = { dayLogic: 'box', eventVisibility: {}, arena: { hasArena: false }, onboarding: {} };
    const desired = { ...base, dayLogic: 'loose' };
    const calls = [];
    const answers = [{ data: { id: 'stable', settings: changedRemotely ? { ...base, arena: { hasArena: true } } : null }, error: null },
      { data: { id: 'stable', name: 'Stallet', settings: desired }, error: null }];
    const supabase = { from() {
      const query = {};
      for (const method of ['select', 'eq', 'is', 'update', 'abortSignal']) query[method] = (...args) => { if (method !== 'abortSignal') calls.push({ method, args }); return query; };
      query.single = async () => answers.shift();
      return query;
    } };
    const persist = await loadAction('persistStableUpdate', {
      supabase, user: { id: 'admin' }, isQaDemoMode: false,
      resolveStableSettings: stable => stable.settings ?? base,
      hasOwnProperty: (object, key) => Object.prototype.hasOwnProperty.call(object, key),
    });
    const result = await persist('stable', { settings: desired }, { id: 'stable', name: 'Stallet', settings: base });
    assert.equal(result.success, !changedRemotely);
    assert.equal(calls.filter(call => call.method === 'update').length, changedRemotely ? 0 : 1);
    if (!changedRemotely) assert.ok(calls.some(call => call.method === 'is' && call.args[0] === 'settings' && call.args[1] === null));
  });
}

test('ride-type JSON key order does not turn a confirmed retry into a conflict', async () => {
  const previous = [{ id: 'type', code: 'D', label: 'Dressyr', description: 'Lugnt' }];
  const desired = [{ ...previous[0], description: 'Teknik' }];
  let writes = 0;
  const answers = [{ data: { id: 'stable', ride_types: [{ label: 'Dressyr', description: 'Teknik', code: 'D', id: 'type' }] }, error: null },
    { data: { id: 'stable', name: 'Stallet', ride_types: desired }, error: null }];
  const supabase = { from() {
    const query = {};
    for (const method of ['select', 'eq', 'is', 'update', 'abortSignal']) query[method] = () => { if (method === 'update') writes++; return query; };
    query.single = async () => answers.shift();
    return query;
  } };
  const persist = await loadAction('persistStableUpdate', {
    supabase, user: { id: 'admin' }, isQaDemoMode: false,
    resolveStableSettings: () => ({}), hasOwnProperty: (object, key) => Object.prototype.hasOwnProperty.call(object, key),
  });
  assert.equal((await persist('stable', { rideTypes: desired }, { id: 'stable', rideTypes: previous })).success, true);
  assert.equal(writes, 1);
});
