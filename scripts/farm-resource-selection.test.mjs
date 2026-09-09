import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

test('resource settings retain a deliberately selected farm after refreshing the original stable', async () => {
  const source = await readFile(new URL('../app/(onboarding)/arena.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('arena.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'React.useEffect' && node.arguments[0]?.getText(ast).includes('const nextFarmId')) effect = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(effect);
  const changes = [];
  const dependencies = { hasFarms: true, activeFarmId: 'chosen-farm', activeStable: { farmId: 'original-farm' },
    farms: [{ id: 'original-farm' }, { id: 'chosen-farm' }], setActiveFarmId: value => changes.push(value) };
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${effect.getText(ast)})();`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
  assert.deepEqual(changes, []);
});
