import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

async function loadReducer() {
  const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const reducer = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'reducer');
  assert.ok(reducer, 'AppDataContext must expose its reducer function in source');
  const { outputText } = ts.transpileModule(`export ${reducer.getText(ast)}`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).reducer;
}

const reducerPromise = loadReducer();

test('confirmed horse status replaces the same stable/horse/date even when its ID changes', async () => {
  const reducer = await reducerPromise;
  const original = { id: 'status-first', stableId: 'stable', horseId: 'horse', date: '2026-09-07', hay: true };
  const otherRows = [
    { ...original, id: 'other-horse', horseId: 'another-horse' },
    { ...original, id: 'other-date', date: '2026-09-08' },
    { ...original, id: 'other-stable', stableId: 'another-stable' },
  ];
  let state = { horseDayStatuses: otherRows };
  state = reducer(state, { type: 'HORSE_DAY_STATUS_UPSERT', payload: original });
  const confirmed = { ...original, id: 'status-confirmed', water: true };
  state = reducer(state, { type: 'HORSE_DAY_STATUS_UPSERT', payload: confirmed });

  const matching = state.horseDayStatuses.filter((row) =>
    row.stableId === original.stableId && row.horseId === original.horseId && row.date === original.date,
  );
  assert.deepEqual(matching, [confirmed], 'Only the latest acknowledgement should be displayed');
  assert.equal(state.horseDayStatuses.length, otherRows.length + 1);
  for (const row of otherRows) {
    assert.deepEqual(state.horseDayStatuses.find((entry) => entry.id === row.id), row);
  }
});

test('confirmed feed check replaces the same horse/date/slot and preserves other checks', async () => {
  const reducer = await reducerPromise;
  const original = {
    id: 'feed-first', stableId: 'stable', horseId: 'horse', date: '2026-09-07', slot: 'morning',
    checkedAt: '2026-09-07T06:00:00Z',
  };
  const otherRows = [
    { ...original, id: 'other-horse', horseId: 'another-horse' },
    { ...original, id: 'other-slot', slot: 'lunch' },
    { ...original, id: 'other-date', date: '2026-09-08' },
  ];
  let state = { feedChecks: otherRows };
  state = reducer(state, { type: 'FEED_CHECK_UPSERT', payload: original });
  const confirmed = { ...original, id: 'feed-confirmed', deviationNote: 'Ersatt med torrhö' };
  state = reducer(state, { type: 'FEED_CHECK_UPSERT', payload: confirmed });

  const matching = state.feedChecks.filter((row) =>
    row.horseId === original.horseId && row.date === original.date && row.slot === original.slot,
  );
  assert.deepEqual(matching, [confirmed], 'Only the latest acknowledgement should be displayed');
  assert.equal(state.feedChecks.length, otherRows.length + 1);
  for (const row of otherRows) {
    assert.deepEqual(state.feedChecks.find((entry) => entry.id === row.id), row);
  }
});

test('late chat acknowledgement preserves newer incoming text and unread count without duplicates', async () => {
  const reducer = await reducerPromise;
  const older = { id: 'mine', text: 'Hej', timestamp: '2026-09-08T08:00:00Z' };
  const newer = { id: 'theirs', text: 'Jag kommer', timestamp: '2026-09-08T08:00:01Z' };
  const preview = { id: 'chat', description: newer.text, unreadCount: 1 };
  let state = { conversations: { chat: [newer] }, messages: [preview] };
  const action = { type: 'CONVERSATION_APPEND', payload: { conversationId: 'chat', message: older, preview: { ...preview, description: older.text, unreadCount: 0 } } };
  state = reducer(state, action);
  state = reducer(state, action);
  assert.deepEqual(state.conversations.chat, [older, newer]);
  assert.deepEqual(state.messages, [preview]);
});

test('acknowledging the same ride log twice keeps one row and preserves other logs', async () => {
  const reducer = await reducerPromise;
  const other = { id: 'other-log', horseId: 'other-horse' };
  const log = { id: 'planned-ride', horseId: 'horse', length: '45 min' };
  let state = { rideLogs: [other] };
  state = reducer(state, { type: 'RIDE_LOG_ADD', payload: log });
  state = reducer(state, { type: 'RIDE_LOG_ADD', payload: log });
  assert.deepEqual(state.rideLogs, [log, other]);
});

for (const [type, field] of [['ALERT_ADD', 'alerts'], ['DAY_EVENT_ADD', 'dayEvents'], ['ARENA_STATUS_ADD', 'arenaStatuses'], ['ARENA_BOOKING_ADD', 'arenaBookings']]) {
  test(`${type} retry after refresh shows the acknowledged record once`, async () => {
    const reducer = await reducerPromise;
    const existing = { id: 'same-record', label: 'Saved on server' };
    const other = { id: 'other-record', label: 'Keep this' };
    const confirmed = { ...existing, label: 'Confirmed' };
    const next = reducer({ [field]: [existing, other] }, { type, payload: confirmed });
    assert.deepEqual(next[field].filter(row => row.id === existing.id), [confirmed]);
    assert.deepEqual(next[field].find(row => row.id === other.id), other);
  });
}
