import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

const root = new URL('../', import.meta.url);

// Execute the screen's actual callback/component without importing Expo's runtime.
async function loadScreenCallback(path, name, scope) {
  const source = await readFile(new URL(path, root), 'utf8');
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === name) {
      callback = node.initializer.arguments[0].getText(parsed);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.ok(callback, `Missing screen callback: ${name}`);
  const { outputText } = ts.transpileModule(`export default ${callback}`, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
    },
  });
  const exports = {};
  new Function('exports', ...Object.keys(scope), outputText)(exports, ...Object.values(scope));
  return exports.default;
}

test('Idag selects the next assignment from the current stable', async () => {
  const local = { id: 'local', stableId: 'local', assigneeId: 'user', status: 'assigned', date: '2026-10-06', time: '12:00' };
  const foreign = { ...local, id: 'foreign', stableId: 'foreign', time: '07:00' };
  const select = await loadScreenCallback('app/(tabs)/index.tsx', 'myAssignedUpcoming', {
    assignments: [foreign, local], activeAssignments: [local], currentUserId: 'user', todayIso: '2026-10-06',
  });
  assert.deepEqual(select(), [local]);
});

for (const passView of ['mine', 'open']) {
  test(`${passView} finds matching days after seven other pass days and keeps the seven-day limit`, async () => {
    const groupedDays = Array.from({ length: 16 }, (_, index) => ({
      isoDate: `2026-10-${String(index + 6).padStart(2, '0')}`,
      assignments: [{
        status: passView === 'open' && index >= 7 ? 'open' : 'assigned',
        assigneeId: passView === 'open' && index >= 7 ? undefined : passView === 'mine' && index >= 7 ? 'user' : 'other',
      }],
    }));
    const select = await loadScreenCallback('app/(tabs)/calendar.tsx', 'upcomingDayGroups', {
      groupedDays, passView, currentUserId: 'user', todayIso: '2026-10-06',
    });
    const days = select();
    assert.equal(days.length, 7);
    assert.equal(days[0].isoDate, '2026-10-13');
    assert.equal(days[6].isoDate, '2026-10-19');
  });
}

test('calendar passes no action handlers to guests without parent callbacks', async () => {
  const React = {
    createElement: (type, props, ...children) => typeof type === 'function'
      ? type({ ...props, children }) : { type, props, children },
  };
  const scope = {
    React, styles: {}, palette: {}, View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity',
    ActivityIndicator: 'ActivityIndicator', Card: 'Card', Feather: () => null,
  };
  const ScheduleIcon = await loadScreenCallback('app/(tabs)/calendar.tsx', 'ScheduleIcon', scope);
  const RegularDayCard = await loadScreenCallback('app/(tabs)/calendar.tsx', 'RegularDayCard', { ...scope, ScheduleIcon });
  const tree = RegularDayCard({
    day: 'tis', date: '6', isoDate: '2026-10-06', openSlots: 1, mineSlots: 1, mode: 'all', events: [],
    openAssignments: [{ id: 'open', slot: 'Lunch' }], claimingAssignmentIds: new Set(),
    savingAssignmentIds: new Set(), assignmentSaveErrors: {},
    slots: [
      { id: 'mine', label: 'Mine', icon: 'sun', status: 'assigned', isMine: true },
      { id: 'open', label: 'Open', icon: 'clock', status: 'open', isMine: false },
      { id: 'other', label: 'Other', icon: 'moon', status: 'assigned', isMine: false },
    ],
  });
  const buttons = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'TouchableOpacity') buttons.push(node);
    for (const child of node.children ?? []) {
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(tree);
  assert.equal(buttons.length, 0);
});
