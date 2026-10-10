import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

const root = new URL('../', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, root), 'utf8');
}

async function loadScheduleModule() {
  const source = await readProjectFile('lib/schedule.ts');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const encoded = Buffer.from(outputText).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

function groupedDay(isoDate) {
  return {
    isoDate,
    date: new Date(`${isoDate}T00:00:00`),
    assignments: [],
  };
}

test('new assignment dates start today even when the schedule contains old days', async () => {
  const { generateDateOptions } = await loadScheduleModule();
  const options = generateDateOptions(
    [
      groupedDay('2026-05-04'),
      groupedDay('2026-05-05'),
      groupedDay('2026-05-06'),
      groupedDay('2026-05-07'),
      groupedDay('2026-05-08'),
    ],
    { referenceDate: new Date('2026-08-06T12:00:00') },
  );

  assert.equal(options[0]?.value, '2026-08-06');
  assert.deepEqual(
    options.map((option) => option.value),
    ['2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10'],
  );
});

test('editing keeps an explicitly included historical date visible and selected first', async () => {
  const { generateDateOptions } = await loadScheduleModule();
  const options = generateDateOptions(
    [
      groupedDay('2026-08-06'),
      groupedDay('2026-08-07'),
      groupedDay('2026-08-08'),
      groupedDay('2026-08-09'),
      groupedDay('2026-08-10'),
    ],
    {
      includeDates: ['2026-05-04'],
      referenceDate: new Date('2026-08-06T12:00:00'),
    },
  );

  assert.equal(options[0]?.value, '2026-05-04');
  assert.ok(options.some((option) => option.value === '2026-08-06'));
});

test('calendar week selection prefers today, then future, then latest history', async () => {
  const { findInitialWeekIndex } = await loadScheduleModule();
  const weeks = [
    { start: new Date('2026-05-04T00:00:00'), end: new Date('2026-05-10T23:59:59') },
    { start: new Date('2026-08-03T00:00:00'), end: new Date('2026-08-09T23:59:59') },
    { start: new Date('2026-08-17T00:00:00'), end: new Date('2026-08-23T23:59:59') },
  ];

  assert.equal(findInitialWeekIndex(weeks, new Date('2026-08-06T12:00:00')), 1);
  assert.equal(findInitialWeekIndex([weeks[0], weeks[2]], new Date('2026-08-06T12:00:00')), 1);
  assert.equal(findInitialWeekIndex([weeks[0]], new Date('2026-08-06T12:00:00')), 0);
});

test('calendar week selection includes the whole Sunday when week end is a calendar date', async () => {
  const { findInitialWeekIndex } = await loadScheduleModule();
  const weeks = [
    { start: new Date('2026-10-05T00:00:00'), end: new Date('2026-10-11T00:00:00') },
    { start: new Date('2026-10-12T00:00:00'), end: new Date('2026-10-18T00:00:00') },
  ];

  for (const time of ['00:00:00', '12:00:00', '23:59:59']) {
    const referenceDate = new Date(`2026-10-11T${time}`);
    const originalTime = referenceDate.getTime();
    assert.equal(findInitialWeekIndex(weeks, referenceDate), 0, time);
    assert.equal(referenceDate.getTime(), originalTime, 'Week selection must not mutate its reference date');
  }
  assert.equal(findInitialWeekIndex(weeks, new Date('2026-10-12T12:00:00')), 1);
});

test('calendar week selection keeps Sundays across daylight saving and year boundaries', async () => {
  const { findInitialWeekIndex } = await loadScheduleModule();
  for (const [monday, sunday, nextMonday, nextSunday] of [
    ['2026-03-23', '2026-03-29', '2026-03-30', '2026-04-05'],
    ['2026-10-19', '2026-10-25', '2026-10-26', '2026-11-01'],
    ['2026-12-28', '2027-01-03', '2027-01-04', '2027-01-10'],
  ]) {
    const weeks = [
      { start: new Date(`${monday}T00:00:00`), end: new Date(`${sunday}T00:00:00`) },
      { start: new Date(`${nextMonday}T00:00:00`), end: new Date(`${nextSunday}T00:00:00`) },
    ];
    assert.equal(findInitialWeekIndex(weeks, new Date(`${sunday}T23:59:59`)), 0, sunday);
    assert.equal(findInitialWeekIndex(weeks, new Date(`${nextMonday}T00:00:00`)), 1, nextMonday);
  }
});

test('calendar synthesizes the current week and claim is server-conditional before local success', async () => {
  const [calendar, profile, context] = await Promise.all([
    readProjectFile('app/(tabs)/calendar.tsx'),
    readProjectFile('app/(tabs)/profile.tsx'),
    readProjectFile('context/AppDataContext.tsx'),
  ]);

  assert.match(calendar, /todayWeekKey/);
  assert.match(calendar, /await actions\.claimAssignment\(assignmentId\)/);
  assert.match(profile, /await actions\.claimAssignment\(assignmentId\)/);
  assert.match(context, /\.eq\('status', 'open'\)/);
  assert.match(context, /\.is\('assignee_id', null\)/);
  assert.match(context, /claimed: Boolean\(data\?\.length\)/);
  const claimPersistStart = context.indexOf('const persistAssignmentClaim =');
  const claimPersistEnd = context.indexOf('const persistOwnAssignmentUpdate =', claimPersistStart);
  assert.doesNotMatch(context.slice(claimPersistStart, claimPersistEnd), /\.maybeSingle\(\)/);
  assert.match(context, /await persistAssignmentClaim\(assignment\.id/);
  assert.match(context, /pendingAssignmentClaimIdsRef\.current\.has\(assignmentId\)/);
  assert.match(calendar, /disabled=\{isClaiming\}/);
  assert.match(profile, /disabled=\{isPending\}/);

  const claimStart = context.indexOf('const claimAssignment =');
  const claimEnd = context.indexOf('const declineAssignment =', claimStart);
  const claimSource = context.slice(claimStart, claimEnd);
  assert.ok(
    claimSource.indexOf('await persistAssignmentClaim') < claimSource.indexOf("type: 'ASSIGNMENT_UPDATE'"),
    'claim must be persisted atomically before local success is dispatched',
  );
});

test('partial calendar weeks include every day and keep the existing assignments', async () => {
  const { fillWeekDays, formatShortWeekday } = await loadScheduleModule();
  const monday = new Date('2026-09-07T00:00:00');
  const existing = { ...groupedDay('2026-09-08'), assignments: [{ id: 'lunch' }] };
  const days = fillWeekDays(monday, [existing]);
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((day) => day.isoDate), [
    '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13',
  ]);
  assert.equal(days[1], existing);
  assert.equal(days[0].assignments.length, 0);
  assert.equal(formatShortWeekday(monday), 'mån');
});
