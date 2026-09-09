import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
async function loadAction(dependencies, name = 'completePlannedRide') {
  const declaration = provider.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(ast) === name);
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  return module.default(dependencies);
}

function fixture(overrides = {}) {
  const existing = { id: 'planned-ride', stableId: 'stable', horseId: 'horse', date: '2026-09-08', rideTypeId: 'type', status: 'planned' };
  const dispatched = [];
  let generated = 0;
  const dependencies = {
    stateRef: { current: { currentUserId: 'rider', plannedRides: [existing], rideLogs: [], stables: [{ id: 'stable' }] } },
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
    ensurePlannedRideAccess: () => ({ success: true }),
    ensurePermission: () => ({ success: true }),
    generateId: () => `generated-${++generated}`,
    dispatch: action => dispatched.push(action),
    persistRideLogInsert: async log => log,
    persistPlannedRideUpsert: async ride => ride,
    trackDataWrite: promise => promise.catch(() => {}),
    console: { warn() {} },
    ...overrides,
  };
  return { dependencies, dispatched, existing };
}

test('completion waits for log acknowledgement before linking the plan and blocks duplicate requests', async () => {
  let release;
  let logWrites = 0;
  let planWrites = 0;
  const { dependencies, dispatched } = fixture({
    persistRideLogInsert: async log => { logWrites += 1; await new Promise(resolve => { release = resolve; }); return log; },
    persistPlannedRideUpsert: async ride => { planWrites += 1; return ride; },
  });
  const action = await loadAction(dependencies);
  const first = action({ id: 'planned-ride', length: '45 min' });
  try {
    assert.equal(logWrites, 1);
    assert.equal(planWrites, 0, 'Plan FK update must wait for the acknowledged log');
    assert.equal(dispatched.length, 0, 'No local success before both writes are confirmed');
    const duplicate = await action({ id: 'planned-ride', length: '45 min' });
    assert.equal(duplicate.success, false);
    assert.equal(logWrites, 1);
  } finally { release?.(); }
  assert.equal((await first).success, true);
  assert.equal(planWrites, 1);
  assert.equal(dependencies.pendingDataWrites.current.size, 0);
});

test('failed plan acknowledgement keeps a stable log identity across retries', async () => {
  const logIds = [];
  let planWrites = 0;
  const { dependencies, dispatched } = fixture({
    persistRideLogInsert: async log => { logIds.push(log.id); return log; },
    persistPlannedRideUpsert: async ride => { planWrites += 1; if (planWrites === 1) throw new Error('QA lost plan acknowledgement'); return ride; },
  });
  const action = await loadAction(dependencies);
  const first = await action({ id: 'planned-ride', length: '45 min' });
  assert.equal(first.success, false);
  assert.equal(dispatched.filter(action => action.type === 'PLANNED_RIDE_UPSERT').length, 0);
  assert.equal((await action({ id: 'planned-ride', length: '45 min' })).success, true);
  assert.deepEqual(logIds, ['planned-ride', 'planned-ride']);
  assert.equal(dependencies.pendingDataWrites.current.size, 0);
});

function persistenceFixture(answers) {
  const calls = [];
  const supabase = { from(table) {
    const query = {};
    for (const method of ['insert', 'update', 'upsert', 'select', 'eq', 'is', 'abortSignal']) {
      query[method] = (...args) => { if (method !== 'abortSignal') calls.push({ table, method, args }); return query; };
    }
    query.single = async () => answers.shift();
    return query;
  } };
  return { calls, dependencies: { supabase, user: { id: 'rider' }, isQaDemoMode: false,
    AbortController: globalThis.AbortController, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    reportPersistError() {} } };
}

for (const actor of ['rider', 'another-rider']) {
  test(`duplicate log recovery validates immutable payload and actor ${actor}`, async () => {
    const log = { id: 'planned-ride', stableId: 'stable', horseId: 'horse', date: '2026-09-08', rideTypeId: 'type', length: '45 min', createdByUserId: 'rider' };
    const row = { id: log.id, stable_id: log.stableId, horse_id: log.horseId, date: log.date,
      ride_type_id: log.rideTypeId, length: log.length, note: null, created_by_user_id: actor };
    const { calls, dependencies } = persistenceFixture([{ error: { code: '23505' }, data: null }, { error: null, data: row }]);
    const persist = await loadAction(dependencies, 'persistRideLogInsert');
    if (actor === 'rider') assert.deepEqual(await persist(log, true), { ...log, note: undefined });
    else await assert.rejects(persist(log, true), /samma uppgifter och ryttare/);
    assert.equal(calls.filter(call => call.method === 'insert').length, 1);
    assert.equal(calls.filter(call => ['update', 'upsert'].includes(call.method)).length, 0);
  });
}

for (const status of ['done', 'cancelled']) {
  test(`completion recovery handles server status ${status} without overwriting it`, async () => {
    const existing = { id: 'planned-ride', stableId: 'stable', horseId: 'horse', date: '2026-09-08', status: 'planned' };
    const ride = { ...existing, status: 'done', completedRideLogId: existing.id };
    const row = { id: ride.id, stable_id: ride.stableId, horse_id: ride.horseId, date: ride.date,
      status, completed_ride_log_id: status === 'done' ? ride.id : null };
    const { calls, dependencies } = persistenceFixture([{ error: { code: 'PGRST116' }, data: null }, { error: null, data: row }]);
    const persist = await loadAction(dependencies, 'persistPlannedRideUpsert');
    if (status === 'done') assert.equal((await persist(ride, existing)).completedRideLogId, ride.id);
    else await assert.rejects(persist(ride, existing), /ändrats eller avbokats/);
    assert.equal(calls.filter(call => call.method === 'update').length, 1);
    assert.ok(calls.some(call => call.method === 'eq' && call.args[0] === 'status' && call.args[1] === 'planned'));
    assert.equal(calls.filter(call => call.method === 'upsert').length, 0);
  });
}

for (const name of ['createPlannedRide', 'updatePlannedRide', 'deletePlannedRide']) {
  test(`${name} rejects failed server writes without optimistic local changes`, async () => {
    const { dependencies, dispatched } = fixture({
      isValidISODate: () => true, isValidTime: () => true,
      persistPlannedRideUpsert: async () => { throw new Error('QA unavailable'); },
      persistPlannedRideDelete: async () => { throw new Error('QA unavailable'); },
    });
    dependencies.stateRef.current.currentStableId = 'stable';
    dependencies.stateRef.current.horses = [{ id: 'horse', stableId: 'stable' }];
    const action = await loadAction(dependencies, name);
    const input = name === 'createPlannedRide'
      ? { requestId: 'planned-new', stableId: 'stable', horseId: 'horse', date: '2026-09-08' }
      : name === 'updatePlannedRide' ? { id: 'planned-ride', updates: { status: 'cancelled' } } : 'planned-ride';
    assert.equal((await action(input)).success, false);
    assert.equal(dispatched.length, 0);
  });
}

for (const name of ['updatePlannedRide', 'deletePlannedRide']) {
  test(`${name} cannot race an in-flight completion of the same ride`, async () => {
    let writes = 0;
    const { dependencies } = fixture({
      isValidISODate: () => true, isValidTime: () => true,
      persistPlannedRideUpsert: async ride => { writes += 1; return ride; },
      persistPlannedRideDelete: async () => { writes += 1; },
    });
    dependencies.pendingDataWrites.current.add('planned-ride:planned-ride');
    const action = await loadAction(dependencies, name);
    assert.equal((await action(name === 'updatePlannedRide' ? { id: 'planned-ride', updates: { status: 'cancelled' } } : 'planned-ride')).success, false);
    assert.equal(writes, 0);
  });
}

test('completion requires ride-log permission even when the user owns the planned horse', async () => {
  let writes = 0;
  const { dependencies } = fixture({
    ensurePermission: () => ({ success: false, reason: 'Du saknar behörighet att logga ridpass.' }),
    persistRideLogInsert: async log => { writes += 1; return log; },
  });
  const action = await loadAction(dependencies);
  assert.equal((await action({ id: 'planned-ride' })).success, false);
  assert.equal(writes, 0);
});
