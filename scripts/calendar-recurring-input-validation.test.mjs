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

const validators = await loadModule(await readFile(new URL('../lib/dateValidation.ts', import.meta.url), 'utf8'));

async function loadSubmit(dependencies) {
  const source = await readFile(new URL('../app/(tabs)/calendar.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('calendar.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const screen = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'CalendarScreen');
  const declaration = screen.body.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(ast) === 'handleCreateRecurringAssignments');
  const callback = declaration.initializer.arguments[0].getText(ast);
  const helpers = ['parseTimeToMinutes', 'calculateDurationMinutes'].map(name =>
    ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast),
  ).join('\n');
  const module = await loadModule(`${helpers}\nexport default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`);
  return module.default(dependencies);
}

async function setup(startTime, endTime) {
  const form = {
    dateFrom: '2026-10-07', dateTo: '2026-10-07', weekdays: [2],
    startTime, endTime, title: 'Mockning', slotsCount: '1', assignToMe: false,
  };
  const calls = [];
  const visibility = [];
  const errors = [];
  const draftUpdates = [];
  const submit = await loadSubmit({
    ...validators,
    recurringForm: form,
    actions: { createRecurringAssignments: async input => {
      calls.push(input);
      return { success: true, data: { createdCount: 1, skippedCount: 0 } };
    } },
    setRecurringModalVisible: value => visibility.push(value),
    setRecurringSaveError: value => errors.push(value),
    setRecurringForm: value => draftUpdates.push(value),
    toast: { showToast() {} },
  });
  return { submit, form, calls, visibility, errors, draftUpdates };
}

for (const [endTime, message] of [
  ['25:61', /giltig sluttid.*HH:MM/],
  ['07:00', /Sluttiden måste vara efter starttiden/],
  ['06:30', /Sluttiden måste vara efter starttiden/],
]) {
  test(`recurring modal retains its draft and rejects end ${endTime} before creating passes`, async () => {
    const { submit, form, calls, visibility, errors, draftUpdates } = await setup('07:00', endTime);
    await submit();
    assert.deepEqual(calls, [], 'Invalid explicit end must never create an assignment with a default duration');
    assert.deepEqual(visibility, [], 'Validation must not close the modal');
    assert.deepEqual(draftUpdates, [], 'Validation must retain the entered form');
    assert.equal(form.endTime, endTime);
    assert.match(errors.at(-1), message);
  });
}

for (const [startTime, endTime, durationMinutes] of [
  ['07:00', '', undefined],
  ['07:00', '08:30', 90],
  [' 07:00 ', ' 08:30 ', 90],
]) {
  test(`recurring modal preserves duration for ${JSON.stringify([startTime, endTime])}`, async () => {
    const { submit, calls, visibility, errors } = await setup(startTime, endTime);
    await submit();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].durationMinutes, durationMinutes);
    assert.equal(calls[0].startTime, '07:00');
    assert.deepEqual(visibility, [false]);
    assert.ok(errors.every(value => value === null));
  });
}
