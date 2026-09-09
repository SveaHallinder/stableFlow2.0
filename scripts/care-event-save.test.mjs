import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
async function loadAction(name, dependencies) {
  const declaration = provider.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(ast) === name);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${declaration.initializer.arguments[0].getText(ast)});`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

for (const name of ['createCareEvent', 'updateCareEvent', 'completeCareEvent', 'deleteCareEvent']) {
  test(`${name} rejects missing server acknowledgement and preserves existing state`, async () => {
    const dispatched = [];
    const event = { id: 'care', stableId: 'stable', horseIds: ['horse'], title: 'Skoning', type: 'farrier', date: '2026-09-08', status: 'planned' };
    const dependencies = {
      stateRef: { current: { currentStableId: 'stable', currentUserId: 'user', careEvents: [event], horses: [{ id: 'horse', stableId: 'stable' }] } },
      ensureCareEventAccess: () => ({ success: true }), isValidISODate: () => true, isValidTime: () => true,
      generateId: () => 'new-care', dispatch: action => dispatched.push(action), console: { warn() {} },
      pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
      trackDataWrite: promise => promise.catch(() => {}),
      persistCareEventUpsert: async () => { throw new Error('QA no acknowledgement'); },
      persistCareEventDelete: async () => { throw new Error('QA no acknowledgement'); },
    };
    const action = await loadAction(name, dependencies);
    const input = name === 'createCareEvent' ? { ...event, requestId: 'new-care' }
      : name === 'updateCareEvent' ? { id: event.id, updates: { status: 'cancelled' } }
        : name === 'completeCareEvent' ? { id: event.id, note: 'Behåll slutkommentaren' } : event.id;
    assert.equal((await action(input)).success, false);
    assert.equal(dispatched.length, 0);
  });
}

function persistenceFixture(answers) {
  const calls = [];
  const supabase = { from(table) {
    const query = {};
    for (const method of ['insert', 'update', 'select', 'eq', 'abortSignal']) {
      query[method] = (...args) => { if (method !== 'abortSignal') calls.push({ table, method, args }); return query; };
    }
    query.single = async () => answers.shift();
    return query;
  } };
  return { calls, dependencies: { supabase, user: { id: 'user' }, isQaDemoMode: false,
    AbortController: globalThis.AbortController, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout } };
}

test('care create retry recovers the same persisted ID without overwriting the event', async () => {
  const event = { id: 'care', stableId: 'stable', horseIds: ['horse'], title: 'Skoning', type: 'farrier', date: '2026-09-08', status: 'planned' };
  const row = { id: event.id, stable_id: event.stableId, horse_ids: event.horseIds, title: event.title,
    type: event.type, date: event.date, status: event.status, time: null, contact_id: null, responsible_user_id: null, note: null, completed_at: null };
  const { calls, dependencies } = persistenceFixture([{ data: null, error: { code: '23505' } }, { data: row, error: null }]);
  const persist = await loadAction('persistCareEventUpsert', dependencies);
  assert.equal((await persist(event)).id, event.id);
  assert.equal(calls.filter(call => call.method === 'insert').length, 1);
  assert.equal(calls.filter(call => call.method === 'update').length, 0);
});

test('care completion retry preserves the original server timestamp after a lost acknowledgement', async () => {
  const existing = { id: 'care', stableId: 'stable', horseIds: ['horse'], date: '2026-09-08', status: 'planned' };
  const event = { ...existing, status: 'done', note: 'Nya skor', completedAt: '2026-09-08T12:30:00.000Z' };
  const row = { id: event.id, stable_id: event.stableId, horse_ids: event.horseIds, date: event.date,
    status: 'done', note: event.note, completed_at: '2026-09-08T12:00:00+00:00' };
  const { calls, dependencies } = persistenceFixture([{ data: null, error: { code: 'PGRST116' } }, { data: row, error: null }]);
  const persist = await loadAction('persistCareEventUpsert', dependencies);
  const saved = await persist(event, existing, { status: 'done', note: event.note, completedAt: event.completedAt });
  assert.equal(saved.completedAt, row.completed_at);
  assert.ok(calls.some(call => call.method === 'eq' && call.args[0] === 'status' && call.args[1] === 'planned'));
  const fields = calls.find(call => call.method === 'update').args[0];
  assert.deepEqual(Object.keys(fields).sort(), ['completed_at', 'note', 'status', 'updated_at']);
});
