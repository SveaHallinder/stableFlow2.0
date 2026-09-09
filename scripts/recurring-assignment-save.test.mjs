import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadAction(dependencies) {
  const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
  const declaration = provider.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === 'createRecurringAssignments');
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

function setup(persist) {
  let ids = 0;
  const dispatched = [];
  const deps = {
    stateRef: { current: { currentStableId: 'stable', currentUserId: 'user', assignments: [] } },
    ensurePermission: () => ({ success: true }), DEFAULT_ASSIGNMENT_DURATION_MINUTES: 60,
    isValidISODate: value => value === '2026-09-08', isValidTime: value => value === '07:00',
    recurringDurationById: { current: new Map() }, pendingRecurringBatches: { current: new Map() },
    buildRecurringAssignmentKey: (...args) => args.join('|'), generateId: () => `pass-${++ids}`,
    resolveSlotFromTime: () => 'Morning', slotIcons: { Morning: 'sun' }, getWeekdayIndex: () => 1,
    toISODate: () => '2026-09-08', addDays: date => new Date(date.getTime() + 86400000),
    addMinutesToTime: () => '08:30', parseTimeToMinutes: () => 420,
    persistAssignmentBatchInsert: persist, persistAssignmentHistory: async () => {}, dispatch: action => dispatched.push(action),
  };
  const input = { title: 'Morgonarbete', startTime: '07:00', durationMinutes: 90, dateFrom: '2026-09-08', dateTo: '2026-09-08', weekdays: [1], slotsCount: 1 };
  return { deps, input, dispatched };
}

test('recurring passes remain absent while the batch is pending or failed', async () => {
  let finish;
  const operation = new Promise(resolve => { finish = resolve; });
  const { deps, input, dispatched } = setup(() => operation);
  const action = await loadAction(deps);
  const result = action(input);
  assert.equal(dispatched.length, 0);
  finish({ error: new Error('network failed') });
  assert.equal((await result).success, false);
  assert.equal(dispatched.length, 0);
});

test('batch retry reuses IDs and persists the configured end time', async () => {
  const batches = [];
  const { deps, input, dispatched } = setup(async rows => {
    batches.push(rows);
    return { error: batches.length === 1 ? new Error('acknowledgement lost') : null };
  });
  const action = await loadAction(deps);
  assert.equal((await action(input)).success, false);
  assert.equal((await action(input)).success, true);
  assert.equal(batches[0][0].id, batches[1][0].id);
  assert.equal(batches[1][0].note, 'Slut: 08:30');
  assert.equal(dispatched.filter(action => action.type === 'ASSIGNMENT_ADD').length, 1);
});
