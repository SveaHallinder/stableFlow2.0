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
