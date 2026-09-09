import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadEffect() {
  const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'React.useEffect' && node.arguments[0]?.getText(ast).includes('hasDefaultPass(user, weekday, assignment.slot)')) effect = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(effect);
  const script = `export function run(deps) { const { hydrating, refreshing, state, stateRef, toISODate, resolvePermissions, getWeekdayIndex, hasDefaultPass, dispatch, persistAssignmentUpdate, pendingDataWrites, defaultPassesStableId, autoAssignmentAttempts, isQaDemoMode } = deps; return (${effect.getText(ast)})(); }`;
  const { outputText } = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).run;
}
function setup() {
  const assignment = { id: 'pass', stableId: 'stable', date: '2026-09-08', slot: 'Lunch', status: 'open' };
  const state = { currentStableId: 'stable', currentUserId: 'user', assignments: [assignment], users: { user: { id: 'user' } } };
  const dispatched = [];
  let finish;
  const operation = new Promise(resolve => { finish = resolve; });
  const writes = [];
  return { finish, dispatched, writes, deps: {
    hydrating: false, refreshing: false, state, stateRef: { current: state },
    toISODate: () => '2026-09-08', resolvePermissions: () => ({ canManageAssignments: true, canClaimAssignments: true }),
    getWeekdayIndex: () => 1, hasDefaultPass: () => true,
    dispatch: action => dispatched.push(action), persistAssignmentUpdate: (...args) => { writes.push(args); return operation; },
    pendingDataWrites: { current: new Set() }, defaultPassesStableId: { current: 'stable' },
    autoAssignmentAttempts: { current: new Map() }, isQaDemoMode: false,
  } };
}

test('default assignment waits for confirmation and does not display a failed assignment', async () => {
  const run = await loadEffect();
  const { deps, writes, dispatched, finish } = setup();
  run(deps);
  assert.equal(writes.length, 1);
  assert.equal(dispatched.length, 0, 'Pending writes must leave the pass open');
  finish({ error: new Error('network failed') });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dispatched.length, 0);
});

test('default assignment dispatches only after acknowledgement', async () => {
  const run = await loadEffect();
  const { deps, dispatched, finish } = setup();
  run(deps);
  finish({ error: null });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].payload.updates.status, 'assigned');
});

test('switching stable never applies defaults hydrated for the previous stable', async () => {
  const run = await loadEffect();
  const { deps, writes } = setup();
  deps.defaultPassesStableId.current = 'previous-stable';
  run(deps);
  assert.equal(writes.length, 0);
});
