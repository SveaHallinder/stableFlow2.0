import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

async function disclosure(pending) {
  const source = await readFile(new URL('../app/(tabs)/feed.tsx', import.meta.url), 'utf8');
  const parsed = ts.createSourceFile('feed.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'handleToggleGroupManager') callback = node.initializer.arguments[0].getText(parsed);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.ok(callback, 'actual group disclosure must guard an in-flight mutation');
  const code = ts.transpileModule(`export default ${callback}`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  const changed = [];
  new Function('exports', 'groupSavingRef', 'publishingRef', 'setShowGroupManager', code)(module.exports, { current: pending.group }, { current: pending.post }, change => changed.push(change(true)));
  return { run: module.exports.default, changed };
}

for (const pending of [{ group: true, post: false }, { group: false, post: true }]) {
  test(`group recovery stays open during ${pending.group ? 'group save' : 'post publish'}`, async () => {
    const { run, changed } = await disclosure(pending);
    run();
    assert.deepEqual(changed, []);
  });
}
test('group manager can close after requests settle', async () => {
  const { run, changed } = await disclosure({ group: false, post: false });
  run();
  assert.deepEqual(changed, [false]);
});
