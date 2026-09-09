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

for (const name of ['createStableAlert', 'resolveStableAlert']) {
  test(`${name} leaves important notices unchanged until acknowledged`, async () => {
    let finish;
    const operation = new Promise(resolve => { finish = resolve; });
    const notice = { id: 'alert', stableId: 'stable', title: 'Vatten avstängt', severity: 'urgent' };
    const dispatched = [];
    const action = await loadAction(name, {
      stateRef: { current: { currentStableId: 'stable', currentUserId: 'user', stableAlerts: [notice] } },
      ensureStableAlertAccess: () => ({ success: true }), dispatch: action => dispatched.push(action),
      generateId: () => 'alert', trackDataWrite: () => {}, pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
      persistStableAlertUpsert: () => operation,
    });
    const result = action(name === 'createStableAlert' ? notice : notice.id);
    assert.equal(dispatched.length, 0);
    finish({ success: false, reason: 'Network failure' });
    assert.equal((await result).success, false);
    assert.equal(dispatched.length, 0);
  });
}
