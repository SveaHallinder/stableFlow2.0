import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadAction(dependencies) {
  const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
  const declaration = provider.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === 'sendConversationMessage');
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

for (const succeeds of [false, true]) {
  test(`chat appends only a confirmed message (${succeeds ? 'success' : 'failure'})`, async () => {
    let finish;
    const operation = new Promise(resolve => { finish = resolve; });
    const dispatched = [];
    const pending = new Set();
    const saved = { id: 'request-id', conversationId: 'chat', authorId: 'user', text: 'Hej', timestamp: '2026-09-08T08:00:00Z', status: 'sent' };
    const action = await loadAction({
      stateRef: { current: { currentUserId: 'user', currentStableId: 'stable', messages: [{ id: 'chat', title: 'Stallet' }] } },
      dispatch: action => dispatched.push(action), generateId: () => 'generated-id', formatTimeAgo: () => 'nu',
      pendingDataWrites: { current: pending }, dataWriteVersion: { current: 0 },
      trackDataWrite: () => {}, persistConversationMessage: message => { assert.equal(message.id, 'request-id'); return operation; },
    });
    const result = action('chat', ' Hej ', 'request-id');
    assert.equal(dispatched.length, 0);
    assert.equal(pending.size, 1);
    finish(succeeds ? { success: true, data: saved } : { success: false, reason: 'Network failure' });
    assert.equal((await result).success, succeeds);
    assert.equal(dispatched.length, succeeds ? 1 : 0);
    assert.equal(pending.size, 0);
    if (succeeds) assert.deepEqual(dispatched[0].payload.message, saved);
  });
}
