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

for (const [name, helper, input, state] of [
  ['addDayEvent', 'persistDayEventInsert', { date: '2026-09-08', label: 'Notis' }, {}],
  ['removeDayEvent', 'persistDayEventDelete', 'notice', { dayEvents: [{ id: 'notice', stableId: 'stable' }] }],
  ['addArenaStatus', 'persistArenaStatusInsert', { date: '2026-09-08', label: 'Harvat' }, {}],
  ['removeArenaStatus', 'persistArenaStatusDelete', 'notice', { arenaStatuses: [{ id: 'notice', stableId: 'stable' }] }],
]) {
  test(`${name} preserves existing state when the server rejects the change`, async () => {
    const dispatched = [];
    const action = await loadAction(name, {
      stateRef: { current: { currentStableId: 'stable', currentUserId: 'user', ...state } },
      ensurePermission: () => ({ success: true }), isValidISODate: () => true, generateId: () => 'notice', trackDataWrite() {},
      pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 }, dispatch: value => dispatched.push(value),
      [helper]: async () => ({ success: false, reason: 'QA no receipt' }),
    });
    assert.equal((await action(input)).success, false);
    assert.deepEqual(dispatched, []);
  });
}
