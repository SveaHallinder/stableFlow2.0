import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

const source = await readFile(new URL('../app/(tabs)/calendar.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('calendar.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'findVisibleCalendarAssignment');
const { outputText } = ts.transpileModule(`${declaration?.getText(ast)}\nexport { findVisibleCalendarAssignment };`, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { findVisibleCalendarAssignment } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('calendar assignment detail only resolves a current stable assignment for its member', () => {
  const assignments = [{ id: 'own', stableId: 'stable-a' }, { id: 'other', stableId: 'stable-b' }];
  assert.equal(findVisibleCalendarAssignment(assignments, 'own', 'stable-a', true), assignments[0]);
  assert.equal(findVisibleCalendarAssignment(assignments, 'other', 'stable-a', true), undefined);
  assert.equal(findVisibleCalendarAssignment(assignments, 'own', 'stable-a', false), undefined);
  assert.equal(findVisibleCalendarAssignment(assignments, 'missing', 'stable-a', true), undefined);
  assert.equal(findVisibleCalendarAssignment(assignments, undefined, 'stable-a', true), undefined);
});

test('new pass starts on the selected agenda date', async () => {
  const screen = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'CalendarScreen');
  const declaration = screen.body.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(ast) === 'handleCreateSlot');
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ selectedAgendaDate, setAssignmentModal }) => (${callback});`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  const values = [];
  module.default({ selectedAgendaDate: '2026-11-03', setAssignmentModal: value => values.push(value) })();
  assert.deepEqual(values, [{ visible: true, mode: 'create', date: '2026-11-03' }]);
});

for (const [name, expected] of [['handleNextWeek', '2026-10-26'], ['handlePrevWeek', '2026-10-12']]) {
  test(`${name} browses the adjacent week even when it has no saved assignments`, async () => {
    const screen = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'CalendarScreen');
    const declaration = screen.body.statements.filter(ts.isVariableStatement)
      .flatMap(node => [...node.declarationList.declarations])
      .find(node => node.name.getText(ast) === name);
    const callback = declaration.initializer.arguments[0].getText(ast);
    const { outputText } = ts.transpileModule(`export default ({ activeWeek, weekNavigationScope, setWeekNavigation, setSelectedAgendaDate, toISODate, weekGroups, setWeekIndex }) => (${callback});`, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    const module = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
    const navigation = [];
    const selectedDates = [];
    module.default({
      activeWeek: { start: new Date('2026-10-19T12:00:00') }, weekNavigationScope: 'account:stable',
      setWeekNavigation: value => navigation.push(value), setSelectedAgendaDate: value => selectedDates.push(value),
      toISODate: value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`,
      weekGroups: [{ start: new Date('2026-10-19T12:00:00') }], setWeekIndex() {},
    })();
    assert.deepEqual(navigation, [{ scope: 'account:stable', date: expected }]);
    assert.deepEqual(selectedDates, [expected]);
  });
}

test('browsing an empty future week renders seven dates without inventing assignments', async () => {
  const scheduleSource = await readFile(new URL('../lib/schedule.ts', import.meta.url), 'utf8');
  const scheduleCode = ts.transpileModule(scheduleSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const schedule = await import(`data:text/javascript;base64,${Buffer.from(scheduleCode).toString('base64')}`);
  const screen = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'CalendarScreen');
  const declaration = screen.body.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(ast) === 'weekGroups');
  const callback = declaration.initializer.arguments[0].getText(ast);
  const helpers = ['startOfWeek', 'endOfWeek'].map(name => ast.statements
    .find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast)).join('\n');
  const { outputText } = ts.transpileModule(`${helpers}\nexport default ({ groupedDays, todayIso, browsedWeekDate, fillWeekDays, toISODate }) => (${callback})();`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  const original = { id: 'saved-pass', date: '2026-10-20' };
  const weeks = module.default({
    groupedDays: [{ isoDate: original.date, date: new Date(`${original.date}T12:00:00`), assignments: [original] }],
    todayIso: '2026-10-24', browsedWeekDate: '2027-01-04',
    fillWeekDays: schedule.fillWeekDays, toISODate: schedule.toISODate,
  });
  const future = weeks.find(week => schedule.toISODate(week.start) === '2027-01-04');
  assert.deepEqual(future.days.map(day => day.isoDate), ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08', '2027-01-09', '2027-01-10']);
  assert.deepEqual(future.days.flatMap(day => day.assignments), []);
  assert.deepEqual(weeks.flatMap(week => week.days.flatMap(day => day.assignments)), [original]);
});
