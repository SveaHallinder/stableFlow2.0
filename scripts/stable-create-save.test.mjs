import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadAction(name, dependencies, options = {}) {
  const source = await readFile(new URL(options.file ?? '../context/AppDataContext.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === (options.component ?? 'AppDataProvider'));
  const declaration = provider.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === name);
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

const settings = { dayLogic: 'box', eventVisibility: {}, arena: {}, onboarding: {} };
const stable = { id: 'request-id', name: 'Nya stallet', settings, rideTypes: [] };
function dependencies(overrides = {}) {
  return {
    stateRef: { current: { currentStableId: 'old-stable', currentUserId: 'owner', stables: [], users: { owner: { id: 'owner', membership: [] } } } },
    user: { id: 'owner' }, ensurePermission: () => ({ success: true }), generateId: () => 'unexpected-new-id',
    createDefaultStableSettings: () => settings, resolveStableSettings: row => row.settings,
    dispatch() {}, trackDataWrite: promise => Promise.resolve(promise).catch(() => {}),
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
    ...overrides,
  };
}

test('stable creation waits for all receipts before adding the stable or local owner membership', async () => {
  let finish;
  const operation = new Promise(resolve => { finish = resolve; });
  const dispatched = [];
  const action = await loadAction('upsertStable', dependencies({
    dispatch: action => dispatched.push(action), persistStableUpsert: () => operation,
  }));
  const result = action({ name: stable.name, requestId: stable.id });
  const beforeAcknowledgement = dispatched.length;
  finish({ success: false, reason: 'QA owner membership acknowledgement missing' });
  assert.equal(beforeAcknowledgement, 0);
  assert.equal((await result).success, false);
  assert.equal(dispatched.length, 0);
});

test('stable creation reuses its request ID and dispatches the canonical acknowledgement', async () => {
  const dispatched = [];
  const action = await loadAction('upsertStable', dependencies({
    dispatch: action => dispatched.push(action),
    persistStableUpsert: async next => { assert.equal(next.id, stable.id); return { success: true, data: { ...stable, location: 'Serverplats' } }; },
  }));
  const result = await action({ name: stable.name, requestId: stable.id });
  assert.equal(result.success, true);
  assert.equal(dispatched.find(action => action.type === 'STABLE_UPSERT')?.payload.location, 'Serverplats');
});

test('stable creation shares the stable settings write lock', async () => {
  let writes = 0;
  const action = await loadAction('upsertStable', dependencies({
    pendingDataWrites: { current: new Set(['stable:request-id']) },
    persistStableUpsert: async () => { writes++; return { success: true, data: stable }; },
  }));
  assert.equal((await action({ name: stable.name, requestId: stable.id })).success, false);
  assert.equal(writes, 0);
});

test('stable persistence rejects a missing stable acknowledgement before creating membership or chat', async () => {
  const tables = [];
  const query = { insert() { return this; }, upsert() { return this; }, select() { return this; }, single() { return this; }, abortSignal() { return this; }, then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve); } };
  const persist = await loadAction('persistStableUpsert', {
    user: { id: 'owner' }, isQaDemoMode: false, console: { warn() {} }, reportPersistErrorRef: { current() {} },
    supabase: { from: table => { tables.push(table); return query; } },
  });
  assert.equal((await persist(stable, true, 'owner'))?.success, false);
  assert.deepEqual(tables, ['stables']);
});

const stableRow = { id: stable.id, name: stable.name, description: null, location: null, farm_id: null, settings, ride_types: [], created_by: 'owner' };
const memberRow = { stable_id: stable.id, user_id: 'owner', role: 'admin', access: 'owner', rider_role: 'owner' };
const chatRow = { id: stable.id, stable_id: stable.id, title: stable.name, is_group: true, created_by_user_id: 'owner' };
async function persistFixture(answers, nextStable = stable, input = { name: nextStable.name }) {
  const calls = [];
  const persist = await loadAction('persistStableUpsert', {
    user: { id: 'owner' }, isQaDemoMode: false, console: { warn() {} },
    supabase: { from(table) {
      const query = {};
      for (const method of ['insert', 'update', 'upsert', 'select', 'eq', 'abortSignal']) query[method] = (...args) => { if (method !== 'abortSignal') calls.push({ table, method, args }); return query; };
      query.single = async () => answers.shift();
      return query;
    } },
  });
  return { result: await persist(nextStable, true, 'owner', input), calls };
}

test('lost creation acknowledgements recover stable, owner and chat without overwriting records', async () => {
  const duplicate = { error: { code: '23505' }, data: null };
  const { result, calls } = await persistFixture([duplicate, { data: stableRow }, duplicate, { data: memberRow }, duplicate, { data: chatRow }]);
  assert.equal(result.success, true);
  assert.equal(calls.some(call => ['upsert', 'update'].includes(call.method)), false);
  assert.deepEqual(calls.filter(call => call.method === 'insert').map(call => call.table), ['stables', 'stable_members', 'conversations']);
});

for (const changed of ['stable owner', 'membership']) {
  test(`creation retry refuses changed ${changed} instead of overwriting it`, async () => {
    const duplicate = { error: { code: '23505' }, data: null };
    const answers = changed === 'stable owner'
      ? [duplicate, { data: { ...stableRow, created_by: 'another-owner' } }]
      : [{ data: stableRow }, duplicate, { data: { ...memberRow, access: 'view', role: 'rider' } }];
    const { result, calls } = await persistFixture(answers);
    assert.equal(result.success, false);
    assert.equal(calls.some(call => ['upsert', 'update'].includes(call.method)), false);
    assert.equal(calls.some(call => call.table === 'conversations'), false);
  });
}

test('an unconfirmed owner membership stops creation before chat', async () => {
  const { result, calls } = await persistFixture([{ data: stableRow }, { data: null }]);
  assert.equal(result.success, false);
  assert.equal(calls.some(call => call.table === 'conversations'), false);
});


test('a retained creation draft can change its name after a lost acknowledgement without duplicating the stable', async () => {
  const nextStable = { ...stable, name: 'Korrigerat stallnamn' };
  const serverSettings = { ...settings, dayLogic: 'loose' };
  const { result, calls } = await persistFixture([
    { error: { code: '23505' }, data: null },
    { data: { ...stableRow, settings: serverSettings } },
    { data: { ...stableRow, name: nextStable.name, settings: serverSettings } },
    { data: memberRow },
    { data: chatRow },
  ], nextStable, { name: nextStable.name });
  assert.equal(result.success, true);
  assert.equal(result.data.id, stable.id);
  assert.equal(result.data.settings.dayLogic, 'loose');
  const updates = calls.filter(call => call.table === 'stables' && call.method === 'update');
  assert.deepEqual(updates.map(call => call.args[0]), [{ name: nextStable.name }]);
  assert.ok(calls.some(call => call.table === 'stables' && call.method === 'eq' && call.args[0] === 'created_by' && call.args[1] === 'owner'));
});


test('farm creation retry can correct its name while preserving remote arena settings', async () => {
  const farm = { id: 'farm-request', name: 'Ursprungligt gårdnamn', location: null, has_indoor_arena: true, arena_note: 'Behåll', created_by: 'owner' };
  const answers = [{ data: null, error: { code: '23505' } }, { data: farm }, { data: { ...farm, name: 'Korrigerat gårdnamn' } }];
  const calls = [];
  const errors = [];
  let stableCreates = 0;
  const action = await loadAction('handleSave', {
    savingRef: { current: false }, farmIdRef: { current: farm.id }, farmName: 'Korrigerat gårdnamn',
    stablesDraft: [{ id: stable.id, name: stable.name, adminType: 'self', adminEmail: '' }],
    setSaving() {}, setSaveError: error => { if (error) errors.push(error); }, state: { currentUserId: 'owner' },
    isQaDemoMode: false, generateId: () => 'unexpected-id', console: { warn() {} }, toast: { showToast() {} },
    actions: {
      upsertFarm: input => {
        assert.equal(input.hasIndoorArena, true);
        assert.equal(input.arenaNote, 'Behåll');
        return { success: true, data: farm };
      },
      upsertStable: async input => { assert.equal(input.requestId, stable.id); stableCreates++; return { success: true, data: stable }; },
      setCurrentStable() {},
    }, router: { replace() {} }, returnTo: '/setup',
    supabase: { from(table) {
      const query = {};
      for (const method of ['insert', 'update', 'select', 'eq']) query[method] = (...args) => { calls.push({ table, method, args }); return query; };
      query.single = async () => answers.shift();
      return query;
    } },
  }, { file: '../app/(onboarding)/farm.tsx', component: 'OnboardingFarm' });
  await action();
  assert.equal(errors.length, 0);
  assert.equal(stableCreates, 1);
  assert.deepEqual(calls.filter(call => call.method === 'update').map(call => call.args[0]), [{ name: 'Korrigerat gårdnamn' }]);
  assert.ok(calls.some(call => call.method === 'eq' && call.args[0] === 'created_by' && call.args[1] === 'owner'));
});
