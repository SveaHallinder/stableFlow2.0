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

const farm = { id: 'farm', name: 'Gården', location: 'Skåne', hasIndoorArena: true, arenaNote: 'Behåll' };
function dependencies(overrides = {}) {
  return {
    stateRef: { current: { currentStableId: 'stable', farms: [farm] } }, user: { id: 'owner' },
    ensurePermission: () => ({ success: true }), generateId: () => 'unexpected-id',
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
    dispatch() {}, trackDataWrite: promise => Promise.resolve(promise).catch(() => {}), ...overrides,
  };
}

test('farm save waits for acknowledgement before offering the farm to stable forms', async () => {
  let finish;
  const operation = new Promise(resolve => { finish = resolve; });
  const dispatched = [];
  const save = await loadAction('upsertFarm', dependencies({
    dispatch: action => dispatched.push(action), persistFarmUpsert: () => operation,
  }));
  const result = save({ requestId: 'farm-request', name: 'Ny gård' });
  const beforeAcknowledgement = dispatched.length;
  finish({ success: false, reason: 'QA missing acknowledgement' });
  assert.equal(beforeAcknowledgement, 0);
  assert.equal((await result).success, false);
  assert.equal(dispatched.length, 0);
});

test('farm edits preserve omitted fields and dispatch the canonical server row', async () => {
  const dispatched = [];
  const confirmed = { ...farm, hasIndoorArena: false };
  const save = await loadAction('upsertFarm', dependencies({
    dispatch: action => dispatched.push(action),
    persistFarmUpsert: async next => { assert.equal(next.name, farm.name); assert.equal(next.arenaNote, farm.arenaNote); return { success: true, data: confirmed }; },
  }));
  assert.equal((await save({ id: farm.id, hasIndoorArena: false })).success, true);
  assert.deepEqual(dispatched, [{ type: 'FARM_UPSERT', payload: confirmed }]);
});

test('farm writes share a per-farm pending lock', async () => {
  let writes = 0;
  const save = await loadAction('upsertFarm', dependencies({
    pendingDataWrites: { current: new Set(['farm:farm']) },
    persistFarmUpsert: async () => { writes++; return { success: true, data: farm }; },
  }));
  assert.equal((await save(farm)).success, false);
  assert.equal(writes, 0);
});

test('already acknowledged onboarding farm hydration skips another network write', async () => {
  let writes = 0;
  const save = await loadAction('upsertFarm', dependencies({ persistFarmUpsert: async () => { writes++; return { success: true, data: farm }; } }));
  assert.equal((await save(farm, { skipPersist: true, skipPermission: true })).success, true);
  assert.equal(writes, 0);
});

async function persistFixture(answers, input, existing = true) {
  const calls = [];
  const persist = await loadAction('persistFarmUpsert', {
    user: { id: 'owner' }, isQaDemoMode: false, console: { warn() {} }, reportPersistErrorRef: { current() {} },
    supabase: { from(table) {
      const query = {};
      for (const method of ['insert', 'update', 'upsert', 'select', 'eq', 'abortSignal']) query[method] = (...args) => { if (method !== 'abortSignal') calls.push({ table, method, args }); return query; };
      query.single = async () => answers.shift();
      query.then = resolve => Promise.resolve(answers.shift()).then(resolve);
      return query;
    } },
  });
  return { result: await persist({ ...farm, ...input }, input, existing), calls };
}

test('farm persistence rejects an empty receipt', async () => {
  const { result } = await persistFixture([{ data: null, error: null }], { name: farm.name });
  assert.equal(result?.success, false);
});

test('farm updates send only the edited field with a creator guard', async () => {
  const row = { id: farm.id, name: farm.name, location: farm.location, has_indoor_arena: false, arena_note: farm.arenaNote, created_by: 'owner' };
  const { result, calls } = await persistFixture([{ data: row }], { hasIndoorArena: false });
  assert.equal(result?.success, true);
  assert.deepEqual(calls.filter(call => call.method === 'update').map(call => call.args[0]), [{ has_indoor_arena: false }]);
  assert.ok(calls.some(call => call.method === 'eq' && call.args[0] === 'created_by' && call.args[1] === 'owner'));
});

test('resource onboarding awaits farm and stable actions with only dirty fields', async () => {
  const calls = [];
  const stable = { id: 'stable', farmId: farm.id, name: 'Stallet' };
  const save = await loadAction('handleSave', {
    saving: false, savingRef: { current: false }, dirtyResourceRef: { current: new Set(['hasArena']) },
    draftScopeRef: { current: 'farm:farm' }, scopeKey: 'farm:farm', setSaving() {}, setSaveError() {},
    useFarmResources: true, activeFarmId: farm.id, activeStableId: stable.id, activeFarm: farm, activeStable: stable,
    farmStables: [stable], stables: [stable], manageableStableIds: new Set([stable.id]), draft: { hasArena: false, hasRoundPen: true },
    toast: { showToast() {} }, console: { warn() {} }, isQaDemoMode: false,
    supabase: { from() { throw new Error('Resource writes must use acknowledged actions'); } },
    actions: {
      upsertFarm: async (input, options) => { calls.push('farm'); assert.equal(options, undefined); assert.deepEqual(input, { id: farm.id, hasIndoorArena: false, accessStableId: stable.id }); return { success: true, data: farm }; },
      updateStable: async (input, options) => { calls.push('stable'); assert.equal(options, undefined); assert.deepEqual(input.updates, { settings: { arena: { hasArena: false }, onboarding: { resourcesComplete: true } } }); return { success: false, reason: 'QA no final acknowledgement' }; },
    },
  }, { file: '../app/(onboarding)/arena.tsx', component: 'OnboardingResources' });
  assert.equal(await save(), false);
  assert.deepEqual(calls, ['farm', 'stable']);
});

test('farm creation retry corrects only its supplied name after a lost acknowledgement', async () => {
  const row = { id: farm.id, created_by: 'owner', name: farm.name, location: 'Ny serverplats', has_indoor_arena: true, arena_note: 'Ny serverinfo' };
  const { result, calls } = await persistFixture([
    { data: null, error: { code: '23505' } }, { data: row }, { data: { ...row, name: 'Korrigerad gård' } },
  ], { name: 'Korrigerad gård' }, false);
  assert.equal(result.success, true);
  assert.equal(result.data.location, row.location);
  assert.equal(result.data.arenaNote, row.arena_note);
  assert.deepEqual(calls.filter(call => call.method === 'update').map(call => call.args[0]), [{ name: 'Korrigerad gård' }]);
});
