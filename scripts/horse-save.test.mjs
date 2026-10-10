import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadAction(name, dependencies) {
  const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
  const declaration = provider.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === name);
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

test('horse edits preserve omitted box and sleeping settings and wait for persistence', async () => {
  let finish;
  const operation = new Promise(resolve => { finish = resolve; });
  const horse = { id: 'horse', stableId: 'stable', name: 'Mira', boxNumber: '7', canSleepInside: true, note: 'Behåll' };
  const dispatched = [];
  const action = await loadAction('upsertHorse', {
    stateRef: { current: { horses: [horse] } }, ensurePermission: () => ({ success: true }),
    dispatch: action => dispatched.push(action), generateId: () => 'new-horse',
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 }, trackDataWrite: () => {},
    persistHorseUpsert: next => { assert.equal(next.boxNumber, '7'); assert.equal(next.canSleepInside, true); return operation; },
  });
  const result = action({ id: 'horse', stableId: 'stable', name: 'Mira II', note: '' });
  assert.equal(dispatched.length, 0);
  finish({ success: false, reason: 'Network failure' });
  assert.equal((await result).success, false);
  assert.equal(dispatched.length, 0);
});

test('confirmed horse uses server image and explicit cleared settings', async () => {
  const dispatched = [];
  const serverHorse = { id: 'horse', stableId: 'stable', name: 'Mira', image: { uri: 'https://example.test/photo.jpg' } };
  const action = await loadAction('upsertHorse', {
    stateRef: { current: { horses: [{ ...serverHorse, boxNumber: '7', canSleepInside: true }] } },
    ensurePermission: () => ({ success: true }), dispatch: action => dispatched.push(action), generateId: () => 'horse',
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 }, trackDataWrite: () => {},
    persistHorseUpsert: async next => { assert.equal(next.boxNumber, undefined); assert.equal(next.canSleepInside, false); return { success: true, data: serverHorse }; },
  });
  const result = await action({ id: 'horse', stableId: 'stable', name: 'Mira', boxNumber: '', canSleepInside: false });
  assert.equal(result.success, true);
  assert.deepEqual(dispatched, [{ type: 'HORSE_UPSERT', payload: serverHorse }]);
});

test('horse deletion waits for acknowledgement and preserves the horse on failure', async () => {
  const dispatched = [];
  const action = await loadAction('deleteHorse', {
    stateRef: { current: { horses: [{ id: 'horse', stableId: 'stable', name: 'Mira' }] } },
    ensurePermission: () => ({ success: true }), dispatch: action => dispatched.push(action),
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 }, trackDataWrite: () => {},
    persistHorseDelete: async () => ({ success: false, reason: 'QA missing acknowledgement' }),
  });
  assert.equal((await action('horse')).success, false);
  assert.equal(dispatched.length, 0);
});

test('horse deletion shares the in-flight horse-save lock', async () => {
  let deletes = 0;
  const action = await loadAction('deleteHorse', {
    stateRef: { current: { horses: [{ id: 'horse', stableId: 'stable' }] } },
    ensurePermission: () => ({ success: true }), dispatch() {},
    pendingDataWrites: { current: new Set(['horse:horse']) }, dataWriteVersion: { current: 0 }, trackDataWrite() {},
    persistHorseDelete: async () => { deletes += 1; return { success: true }; },
  });
  assert.equal((await action('horse')).success, false);
  assert.equal(deletes, 0);
});

const horseRow = {
  id: 'horse', stable_id: 'stable', name: 'Mira', owner_user_id: 'owner',
  box_number: '7', can_sleep_inside: true, gender: 'mare', age: 8, note: 'Behåll', image_url: null,
};

async function loadPersistence(row, capture = {}) {
  const query = {
    update(payload) { capture.payload = payload; return this; },
    upsert(payload) { capture.payload = payload; return this; },
    eq() { return this; }, select() { return this; }, abortSignal() { return this; },
    single: async () => ({ data: row, error: null }),
  };
  return loadAction('persistHorseUpsert', {
    isQaDemoMode: false, user: { id: 'user' }, supabase: { from: () => query },
    getUploadableImage: image => image, isRemoteUri: () => true,
    console: { warn() {} },
  });
}

test('horse persistence rejects a stale acknowledgement for each edited field', async (t) => {
  const edits = [
    ['name', 'Mira II', 'name'], ['ownerUserId', undefined, 'owner_user_id'],
    ['boxNumber', undefined, 'box_number'], ['canSleepInside', false, 'can_sleep_inside'],
    ['gender', 'gelding', 'gender'], ['age', 9, 'age'], ['note', undefined, 'note'],
    ['image', { uri: 'https://example.test/new-horse.jpg' }, 'image_url'],
  ];
  for (const [field, value, column] of edits) {
    await t.test(field, async () => {
      const capture = {};
      const persist = await loadPersistence(horseRow, capture);
      const horse = { id: 'horse', stableId: 'stable', name: 'Mira', [field]: value };
      const result = await persist(horse, { [field]: value }, true);
      assert.notEqual(capture.payload[column], horseRow[column]);
      assert.equal(result.success, false, `Stale ${column} must not confirm a save`);
      assert.match(result.reason, /uppgifter finns kvar/);
    });
  }
});

test('horse persistence accepts confirmed edits without overwriting omitted fields', async () => {
  const capture = {};
  const row = { ...horseRow, note: null };
  const persist = await loadPersistence(row, capture);
  const result = await persist({ id: 'horse', stableId: 'stable', name: 'Mira', note: undefined }, { note: '' }, true);
  assert.equal(result.success, true);
  assert.deepEqual(capture.payload, { id: 'horse', stable_id: 'stable', note: null });
  assert.equal(result.data.boxNumber, '7');
  assert.equal(result.data.canSleepInside, true);
  assert.equal(result.data.note, undefined);
});

async function loadTimedPersistence(name) {
  const capture = { queries: 0, timers: [], cleared: [], logs: [] };
  const response = new Promise(resolve => { capture.finishRequest = resolve; });
  const image = new Promise(resolve => { capture.finishImage = resolve; });
  const query = {
    update(payload) { capture.payload = payload; return this; },
    upsert(payload) { capture.payload = payload; return this; },
    delete() { return this; }, eq() { return this; }, select() { return this; },
    abortSignal(signal) { capture.signal = signal; return this; },
    single: () => response,
    then: (...args) => response.then(...args),
  };
  const persist = await loadAction(name, {
    isQaDemoMode: false, user: { id: 'user' },
    supabase: { from() { capture.queries += 1; return query; } },
    getUploadableImage: value => value, isRemoteUri: uri => uri.startsWith('https://'),
    uploadImageToStorage: () => image,
    setTimeout(callback, delay) { capture.timers.push({ callback, delay }); return capture.timers.length; },
    clearTimeout: timer => capture.cleared.push(timer),
    console: { warn: (...args) => capture.logs.push(args) },
  });
  return { persist, capture };
}

async function settleMicrotasks() {
  for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
}

test('horse image preparation times out without starting a late save', async () => {
  const { persist, capture } = await loadTimedPersistence('persistHorseUpsert');
  let result;
  const operation = persist({ id: 'horse', stableId: 'stable', name: 'Mira' },
    { image: { uri: 'file:///synthetic-horse.jpg' } }, true).then(value => { result = value; });
  assert.equal(capture.queries, 0);
  assert.equal(capture.timers[0].delay, 15_000);
  capture.timers[0].callback();
  await settleMicrotasks();
  assert.equal(result?.success, false, 'The actual callback must settle at its deadline');
  assert.match(result.reason, /bekräftas/);
  assert.deepEqual(capture.cleared, [1]);
  assert.match(capture.logs[0][0], /^\[horse save\]/);
  capture.finishImage({ publicUrl: 'https://example.test/late-horse.jpg' });
  await operation;
  await settleMicrotasks();
  assert.equal(capture.queries, 0, 'A late upload must not start an expired save');
});

for (const [actionName, persistenceName] of [['upsertHorse', 'persistHorseUpsert'], ['deleteHorse', 'persistHorseDelete']]) {
  test(`${actionName} releases its lock and ignores a late acknowledgement after timeout`, async () => {
    const { persist, capture } = await loadTimedPersistence(persistenceName);
    const horse = { id: 'horse', stableId: 'stable', name: 'Mira' };
    const dispatched = [];
    const pendingDataWrites = { current: new Set() };
    const action = await loadAction(actionName, {
      stateRef: { current: { horses: [horse] } }, ensurePermission: () => ({ success: true }),
      dispatch: value => dispatched.push(value), generateId: () => 'new-horse',
      pendingDataWrites, dataWriteVersion: { current: 0 }, trackDataWrite() {},
      [persistenceName]: persist,
    });
    let result;
    const operation = (actionName === 'upsertHorse'
      ? action({ id: 'horse', stableId: 'stable', name: 'Mira II' }) : action('horse'))
      .then(value => { result = value; });
    assert.ok(pendingDataWrites.current.has('horse:horse'));
    capture.timers[0].callback();
    await settleMicrotasks();
    assert.equal(result?.success, false, 'Transport ignoring AbortSignal must not keep the UI pending');
    assert.match(result.reason, /bekräftas/);
    assert.equal(capture.signal.aborted, true);
    assert.equal(pendingDataWrites.current.size, 0);
    assert.deepEqual(dispatched, []);
    assert.deepEqual(capture.cleared, [1]);
    capture.finishRequest({ data: actionName === 'upsertHorse'
      ? { ...horseRow, name: 'Mira II' } : [{ id: 'horse' }], error: null });
    await operation;
    await settleMicrotasks();
    assert.deepEqual(dispatched, [], 'A late response must not change local horse state');
  });
}
