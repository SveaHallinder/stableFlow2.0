import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

async function loadModule(source) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const { MAX_RECURRING_ASSIGNMENTS_PER_BATCH } = await loadModule(await readFile(new URL('../lib/schedule.ts', import.meta.url), 'utf8'));
const validators = await loadModule(await readFile(new URL('../lib/dateValidation.ts', import.meta.url), 'utf8'));
const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helpers = [
  'addDays', 'toISODate', 'getWeekdayIndex', 'resolveSlotFromTime', 'parseTimeToMinutes',
  'formatMinutesToTime', 'calculateDurationMinutes', 'addMinutesToTime',
  'extractEndTimeFromNote', 'buildRecurringAssignmentKey',
].map(name => ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast)).join('\n');
const constants = ['DEFAULT_ASSIGNMENT_DURATION_MINUTES', 'ASSIGNMENT_NOTE_METADATA_REGEX', 'slotIcons']
  .map(name => ast.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(ast) === name)).map(node => `const ${node.getText(ast)};`).join('\n');
const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
const declaration = provider.body.statements.filter(ts.isVariableStatement)
  .flatMap(node => [...node.declarationList.declarations])
  .find(node => node.name.getText(ast) === 'createRecurringAssignments');
const callback = declaration.initializer.arguments[0].getText(ast);

async function setup(persist = async () => ({ error: null }), assignments = []) {
  let generatedIds = 0;
  const batches = [];
  const dispatched = [];
  const history = [];
  const dependencies = {
    ...validators,
    MAX_RECURRING_ASSIGNMENTS_PER_BATCH,
    stateRef: { current: { currentStableId: 'stable', currentUserId: 'user', assignments } },
    ensurePermission: () => ({ success: true }),
    recurringDurationById: { current: new Map() }, pendingRecurringBatches: { current: new Map() },
    generateId: () => `pass-${++generatedIds}`,
    persistAssignmentBatchInsert: async rows => { batches.push(rows); return persist(rows); },
    persistAssignmentHistory: async row => { history.push(row); },
    dispatch: action => {
      dispatched.push(action);
      if (action.type === 'ASSIGNMENT_ADD') assignments.push(action.payload);
    },
  };
  const module = await loadModule(`${helpers}\n${constants}\nexport default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`);
  return {
    action: module.default(dependencies), dependencies, batches, dispatched, history,
    generatedIds: () => generatedIds,
    input: { title: 'Mockning', startTime: '07:00', durationMinutes: 90,
      dateFrom: '2026-10-07', dateTo: '2026-10-07', weekdays: [2], slotsCount: 1 },
  };
}

function assertNoWrites(fixture) {
  assert.equal(fixture.generatedIds(), 0);
  assert.deepEqual(fixture.batches, []);
  assert.deepEqual(fixture.dispatched, []);
  assert.deepEqual(fixture.history, []);
  assert.equal(fixture.dependencies.pendingRecurringBatches.current.size, 0);
  assert.equal(fixture.dependencies.recurringDurationById.current.size, 0);
}

test('recurring total limit rejects before UUIDs, pending state or writes', async () => {
  const fixture = await setup();
  const result = await fixture.action({ ...fixture.input,
    dateTo: '2026-10-08', weekdays: [2, 3], slotsCount: Math.floor(MAX_RECURRING_ASSIGNMENTS_PER_BATCH / 2) + 1 });
  assert.equal(result.success, false);
  assert.match(result.reason, /Minska antal pass eller välj kortare datumintervall/);
  assertNoWrites(fixture);
});

test('exactly the limit of new recurring passes is persisted and confirmed', async () => {
  const fixture = await setup();
  const result = await fixture.action({ ...fixture.input, slotsCount: MAX_RECURRING_ASSIGNMENTS_PER_BATCH });
  assert.deepEqual(result, { success: true, data: { createdCount: MAX_RECURRING_ASSIGNMENTS_PER_BATCH, skippedCount: 0 } });
  assert.equal(fixture.batches.length, 1);
  assert.equal(fixture.batches[0].length, MAX_RECURRING_ASSIGNMENTS_PER_BATCH);
  assert.equal(new Set(fixture.batches[0].map(row => row.id)).size, MAX_RECURRING_ASSIGNMENTS_PER_BATCH);
  assert.ok(fixture.batches[0].every(row => row.note === 'Slut: 08:30'));
  assert.equal(fixture.dispatched.length, MAX_RECURRING_ASSIGNMENTS_PER_BATCH);
});

test('duplicate existing passes do not count toward the new-pass limit', async () => {
  const slotsCount = Math.floor(MAX_RECURRING_ASSIGNMENTS_PER_BATCH / 2) + 1;
  const duplicateCount = slotsCount * 2 - MAX_RECURRING_ASSIGNMENTS_PER_BATCH;
  const existing = Array.from({ length: duplicateCount }, (_, index) => ({
    id: `existing-${index}`, stableId: 'stable', date: '2026-10-07', label: `Mockning #${index + 1}`,
    time: '07:00', note: 'Slut: 08:30', status: 'open', slot: 'Morning', icon: 'sun',
  }));
  const fixture = await setup(undefined, existing);
  const input = { ...fixture.input, dateTo: '2026-10-08', weekdays: [2, 3], slotsCount };
  assert.deepEqual(await fixture.action(input), {
    success: true, data: { createdCount: MAX_RECURRING_ASSIGNMENTS_PER_BATCH, skippedCount: duplicateCount },
  });
  assert.deepEqual(await fixture.action(input), {
    success: true, data: { createdCount: 0, skippedCount: slotsCount * 2 },
  });
  assert.equal(fixture.generatedIds(), MAX_RECURRING_ASSIGNMENTS_PER_BATCH);
  assert.equal(fixture.batches.length, 1);
});

for (const slotsCount of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_RECURRING_ASSIGNMENTS_PER_BATCH + 1]) {
  test(`invalid recurring count ${slotsCount} cannot allocate or write`, async () => {
    const fixture = await setup();
    const result = await fixture.action({ ...fixture.input, slotsCount });
    assert.equal(result.success, false);
    assert.match(result.reason, /helt antal pass/);
    assertNoWrites(fixture);
  });
}

for (const weekdays of [[], [99], [-1], [0.5], [Number.NaN], [Number.POSITIVE_INFINITY], null]) {
  test(`invalid recurring weekdays ${JSON.stringify(weekdays)} cannot allocate or write`, async () => {
    const fixture = await setup();
    const result = await fixture.action({ ...fixture.input, dateTo: '9999-12-31', weekdays });
    assert.equal(result.success, false);
    assert.match(result.reason, /veckodag/);
    assertNoWrites(fixture);
  });
}

test('absent recurring count defaults to one', async () => {
  const fixture = await setup();
  const result = await fixture.action({ ...fixture.input, slotsCount: undefined });
  assert.deepEqual(result, { success: true, data: { createdCount: 1, skippedCount: 0 } });
});

test('a failed batch keeps its IDs across a rejected oversized draft and a successful retry', async () => {
  let attempts = 0;
  const fixture = await setup(async () => ({ error: attempts++ === 0 ? new Error('Synthetic lost acknowledgement') : null }));
  assert.equal((await fixture.action(fixture.input)).success, false);
  const pending = [...fixture.dependencies.pendingRecurringBatches.current.values()][0];
  assert.equal((await fixture.action({ ...fixture.input, dateTo: '2026-10-08', weekdays: [2, 3],
    slotsCount: Math.floor(MAX_RECURRING_ASSIGNMENTS_PER_BATCH / 2) + 1 })).success, false);
  assert.equal(fixture.batches.length, 1);
  assert.equal([...fixture.dependencies.pendingRecurringBatches.current.values()][0], pending);
  assert.equal((await fixture.action(fixture.input)).success, true);
  assert.equal(fixture.generatedIds(), 1);
  assert.equal(fixture.batches[1][0].id, fixture.batches[0][0].id);
  assert.equal(fixture.dispatched.length, 1);
  assert.equal(fixture.dependencies.pendingRecurringBatches.current.size, 0);
});
