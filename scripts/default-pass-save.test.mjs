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

for (const member of [false, true]) {
  test(`${member ? 'member' : 'own'} default-pass failure never enables automatic assignment`, async () => {
    const dispatched = [];
    const user = { id: 'user', defaultPasses: [], membership: [{ stableId: 'stable' }] };
    const action = await loadAction(member ? 'toggleMemberDefaultPass' : 'toggleDefaultPass', {
      stateRef: { current: { currentStableId: 'stable', currentUserId: user.id, users: { user } } },
      defaultPassesStableId: { current: 'stable' }, ensurePermission: () => ({ success: true }),
      dispatch: value => dispatched.push(value), trackDataWrite() {},
      pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
      persistDefaultPassToggle: async () => ({ success: false, reason: 'QA no receipt' }),
    });
    const result = member ? await action({ userId: user.id, stableId: 'stable', weekday: 1, slot: 'Lunch' }) : await action(1, 'Lunch');
    assert.equal(result.success, false);
    assert.deepEqual(dispatched, []);
  });
}

test('a default-pass acknowledgement after switching stables does not leak the old selection', async () => {
  const dispatched = [];
  const stateRef = { current: { currentStableId: 'old-stable', currentUserId: 'user', users: { user: { id: 'user', defaultPasses: [] } } } };
  const action = await loadAction('toggleDefaultPass', {
    stateRef, defaultPassesStableId: { current: 'old-stable' }, dispatch: value => dispatched.push(value), trackDataWrite() {},
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
    persistDefaultPassToggle: async () => { stateRef.current.currentStableId = 'new-stable'; return { success: true }; },
  });
  assert.equal((await action(1, 'Lunch')).success, true);
  assert.deepEqual(dispatched, []);
});

for (const success of [false, true, 'partial']) {
  test(`stored pre-membership defaults are cleared only after confirmation (${success})`, async () => {
    const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
    const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let callback;
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'React.useEffect' && node.arguments[0]?.getText(ast).includes('const applyDraft = async')) callback = node.arguments[0];
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(callback);
    const state = { currentStableId: 'stable', currentUserId: 'user', users: { user: { id: 'user', defaultPasses: [] } } };
    const dispatched = [];
    let clears = 0;
    let retained;
    const dependencies = {
      state, stateRef: { current: state }, hydrating: false, refreshing: false,
      loadDefaultPassDraft: async () => success === 'partial' ? [{ weekday: 1, slot: 'Lunch' }, { weekday: 2, slot: 'Lunch' }] : [{ weekday: 1, slot: 'Lunch' }],
      saveDefaultPassDraft: async (_userId, draft) => { retained = draft; return true; },
      clearDefaultPassDraft: async () => { clears++; },
      persistDefaultPassToggle: async input => success === true || (success === 'partial' && input.weekday === 1) ? { success: true } : { success: false, reason: 'QA failure' },
      pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
      dispatch: value => dispatched.push(value), reportPersistErrorRef: { current() {} },
    };
    const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback.getText(ast)})();`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
    const run = (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default;
    run(dependencies);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(clears, success === true ? 1 : 0);
    if (success === 'partial') assert.deepEqual(retained, [{ weekday: 2, slot: 'Lunch' }]);
    assert.equal(dispatched.length, success ? 1 : 0);
    assert.equal(dependencies.pendingDataWrites.current.size, 0);
  });
}
