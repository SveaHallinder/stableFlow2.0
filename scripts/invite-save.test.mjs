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
