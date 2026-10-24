import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

const validationSource = await readFile(new URL('../lib/dateValidation.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(validationSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const validators = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

async function loadAction(name, dependencies) {
  const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const provider = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
  const declaration = provider.body.statements.filter(ts.isVariableStatement)
    .flatMap((node) => [...node.declarationList.declarations]).find((node) => node.name.getText(ast) === name);
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  return module.default(dependencies);
}

for (const name of ['createAssignment', 'updateAssignment']) {
  for (const invalid of [{ date: '2026-02-30' }, { time: '25:61' }]) {
    test(`${name} rejects ${JSON.stringify(invalid)} before persistence`, async () => {
      let writes = 0;
      const existing = { id: 'assignment', stableId: 'stable', date: '2026-09-08', slot: 'Morning', label: 'Morgon', time: '07:00', status: 'open' };
      const persist = async () => { writes += 1; return { error: null }; };
      const action = await loadAction(name, {
        ...validators,
        stateRef: { current: { currentStableId: 'stable', currentUserId: 'user', assignments: [existing] } },
        ensurePermission: () => ({ success: true }),
        persistAssignmentInsert: persist,
        persistAssignmentUpdate: persist,
        persistAssignmentHistory: async () => {},
        dispatch: () => {},
        generateId: () => 'generated-assignment',
        slotTitles: { Morning: 'Morgon' },
        slotDefaultTimes: { Morning: '07:00' },
        slotIcons: { Morning: 'sun' },
      });
      const result = await action({ id: existing.id, date: existing.date, slot: existing.slot, ...invalid });
      assert.equal(result.success, false);
      assert.match(result.reason, 'date' in invalid ? /giltigt datum/i : /tid.*HH:MM/i);
      assert.equal(writes, 0, 'Invalid input must never reach persistence');
    });
  }
}

test('reassigning one recurring occurrence preserves its series and other occurrences', async () => {
  const existing = { id: 'occurrence-a', seriesId: 'series', stableId: 'stable', date: '2026-11-03', slot: 'Morning', label: 'Morgon', time: '07:00', status: 'assigned', assigneeId: 'member-a' };
  const other = { ...existing, id: 'occurrence-b', date: '2026-11-04' };
  const writes = [];
  const dispatched = [];
  const action = await loadAction('updateAssignment', {
    ...validators,
    stateRef: { current: { currentUserId: 'owner', assignments: [existing, other], users: {
      'member-b': { membership: [{ stableId: 'stable', role: 'rider' }] },
    } } },
    ensurePermission: stableId => {
      assert.equal(stableId, 'stable');
      return { success: true };
    },
    persistAssignmentUpdate: async (id, updates) => { writes.push({ id, updates }); return { error: null }; },
    persistAssignmentHistory: async () => {}, dispatch: event => dispatched.push(event),
  });
  const result = await action({ id: existing.id, assigneeId: 'member-b' });
  assert.equal(result.success, true);
  assert.equal(result.data.assigneeId, 'member-b');
  assert.equal(result.data.seriesId, 'series');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].id, 'occurrence-a');
  assert.equal(writes[0].updates.seriesId, undefined);
  assert.deepEqual(dispatched.map(event => event.payload.id), ['occurrence-a']);
  assert.equal(other.assigneeId, 'member-a');
});

test('date and time validation accepts leap days and rejects overflow', () => {
  for (const value of ['2028-02-29', '2026-12-31', '0001-01-01']) assert.equal(validators.isValidISODate(value), true, value);
  for (const value of ['2026-02-30', '2026-13-01', '0000-01-01', '2026-2-3']) assert.equal(validators.isValidISODate(value), false, value);
  for (const value of ['00:00', '23:59', '07:05']) assert.equal(validators.isValidTime(value), true, value);
  for (const value of ['24:00', '12:60', '7:05', '']) assert.equal(validators.isValidTime(value), false, value);
});

for (const name of ['createAssignment', 'updateAssignment']) {
  for (const target of ['member', 'outsider', null]) {
    test(`${name}: explicit responsible member ${target ?? 'open'} is validated and persisted`, async () => {
      const existing = { id: 'assignment', stableId: 'stable', date: '2026-10-20', slot: 'Morning', label: 'Morgon', time: '07:00', status: 'assigned', assigneeId: 'user' };
      const writes = [];
      const action = await loadAction(name, {
        ...validators,
        stateRef: { current: { currentStableId: 'stable', currentUserId: 'user', assignments: [existing], users: {
          member: { membership: [{ stableId: 'stable', role: 'rider' }] },
          outsider: { membership: [{ stableId: 'other-stable', role: 'rider' }] },
        } } },
        ensurePermission: () => ({ success: true }),
        persistAssignmentInsert: async row => { writes.push(row); return { error: null }; },
        persistAssignmentUpdate: async (_id, row) => { writes.push(row); return { error: null }; },
        persistAssignmentHistory: async () => {}, dispatch: () => {}, generateId: () => 'new-assignment',
        slotTitles: { Morning: 'Morgon' }, slotDefaultTimes: { Morning: '07:00' }, slotIcons: { Morning: 'sun' },
      });
      const result = await action({ id: existing.id, date: existing.date, slot: 'Morning', assigneeId: target });
      assert.equal(result.success, target !== 'outsider');
      assert.equal(writes.length, target === 'outsider' ? 0 : 1);
      if (writes.length) {
        assert.equal(writes[0].assigneeId, target ?? undefined);
        assert.equal(writes[0].status, target ? 'assigned' : 'open');
        assert.equal(writes[0].assignedVia, target ? 'manual' : undefined);
      }
    });
  }
}
