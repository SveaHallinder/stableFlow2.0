import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
const declaration = provider.body.statements.filter(ts.isVariableStatement)
  .flatMap(node => [...node.declarationList.declarations])
  .find(node => node.name.getText(ast) === 'persistAssignmentHistory');

async function loadCallback(dependencies) {
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(
    `export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`,
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  );
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

const assignment = {
  id: 'qa-assignment', stableId: 'qa-stable', label: 'Lunchfodring', time: '12:00',
};

test('qaDemo assignment history never calls the backend even with a demo user', async () => {
  const callback = await loadCallback({
    isQaDemoMode: true, user: { id: 'qa-user' },
    supabase: { from() { assert.fail('qaDemo must not write assignment history'); } },
    generateId() { assert.fail('qaDemo must return before preparing a backend history row'); },
    reportPersistError() { assert.fail('qaDemo must not report a backend persistence error'); },
  });
  await callback(assignment, 'assigned');
  await callback(assignment, 'completed');
});

test('normal authenticated assignment history still writes the real payload', async () => {
  const calls = [];
  const callback = await loadCallback({
    isQaDemoMode: false, user: { id: 'user' }, generateId: () => 'history-id',
    supabase: { from(table) { return { async insert(payload) { calls.push({ table, payload }); return { error: null }; } }; } },
    reportPersistError() { assert.fail('successful history persistence must not report an error'); },
  });
  await callback(assignment, 'completed');
  assert.deepEqual(calls, [{ table: 'assignment_history', payload: {
    id: 'history-id', stable_id: assignment.stableId, assignment_id: assignment.id,
    label: 'Lunchfodring 12:00', action: 'completed',
  } }]);
});

test('normal assignment history retains persistence error reporting', async () => {
  const error = { code: 'QA_OFFLINE', message: 'Synthetic history failure' };
  const reported = [];
  const callback = await loadCallback({
    isQaDemoMode: false, user: { id: 'user' }, generateId: () => 'history-id',
    supabase: { from() { return { async insert() { return { error }; } }; } },
    reportPersistError: (...args) => reported.push(args),
  });
  await callback(assignment, 'assigned');
  assert.deepEqual(reported, [['Kunde inte spara passhistorik', error]]);
});
