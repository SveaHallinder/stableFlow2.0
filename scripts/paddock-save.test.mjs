import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
async function loadAction(name, dependencies, moduleFunction = false) {
  const declaration = moduleFunction
    ? ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
    : provider.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
      .find(node => node.name.getText(ast) === name);
  const callback = moduleFunction ? declaration.getText(ast) : declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(
    `export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`,
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  );
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

const paddock = {
  id: 'paddock', stableId: 'stable', name: 'Sommarhagen', horseNames: ['  Gammal Mira  ', null],
  horseIds: ['horse-mira'], revision: 1, linksReady: true, season: 'summer', updatedAt: '2026-10-06T12:00:00Z',
};
const input = { ...paddock, expectedRevision: 1 };
function dependencies(overrides = {}) {
  let nextId = 0;
  return {
    stateRef: { current: {
      currentUserId: 'user', currentStableId: 'stable', paddocks: [paddock], paddockLinksReady: true,
      horses: [{ id: 'horse-mira', stableId: 'stable' }, { id: 'horse-twin', stableId: 'stable' }, { id: 'foreign', stableId: 'other' }],
    } },
    ensurePermission: () => ({ success: true }), generateId: () => `request-${++nextId}`, dispatch() {},
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 }, paddockSaveAttempts: { current: new Map() },
    ...overrides,
  };
}

function acknowledged(parameters) {
  return {
    id: parameters.p_paddock_id, stable_id: parameters.p_stable_id, name: parameters.p_name,
    horse_names: [...paddock.horseNames], horse_ids: [...parameters.p_horse_ids].sort(),
    season: parameters.p_season, image_url: parameters.p_image_url,
    revision: (parameters.p_expected_revision ?? 0) + 1,
    request_id: parameters.p_request_id, last_save_request_id: parameters.p_request_id,
    updated_at: '2026-10-06T12:00:01Z',
  };
}
function persistenceDependencies(reply, overrides = {}) {
  return {
    isQaDemoMode: false, user: { id: 'user' }, console: { warn() {} }, dispatch() {},
    getUploadableImage: image => image, isRemoteUri: uri => uri.startsWith('https://'),
    supabase: {
      from() { assert.fail('Paddock persistence must use the atomic RPC'); },
      rpc(name, parameters) {
        return { abortSignal() { return this; }, then(resolve, reject) {
          return Promise.resolve().then(() => reply(name, parameters)).then(resolve, reject);
        } };
      },
    },
    ...overrides,
  };
}

test('paddock save waits for acknowledgement and retains the row, lock and draft on failure', async () => {
  let finish;
  const operation = new Promise(resolve => { finish = resolve; });
  const dispatched = [];
  const deps = dependencies({ dispatch: action => dispatched.push(action), persistPaddockUpsert: () => operation });
  const action = await loadAction('upsertPaddock', deps);
  const result = action({ ...input, name: 'Ny hage' });
  assert.equal(dispatched.length, 0);
  assert.equal(deps.pendingDataWrites.current.has('paddock:paddock'), true);
  finish({ success: false, reason: 'QA no acknowledgement' });
  assert.equal((await result).success, false);
  assert.equal(dispatched.length, 0);
  assert.equal(deps.pendingDataWrites.current.size, 0);
  assert.deepEqual(deps.stateRef.current.paddocks, [paddock]);
});

test('save forwards the draft revision even after refresh and dispatches only the canonical row', async () => {
  const dispatched = [];
  const canonical = { ...paddock, revision: 2, image: { uri: 'https://example.test/paddock.jpg' } };
  const deps = dependencies({
    dispatch: action => dispatched.push(action),
    persistPaddockUpsert: async (next, image, expectedRevision) => {
      assert.equal(expectedRevision, 1);
      assert.deepEqual(next.horseNames, paddock.horseNames);
      return { success: true, data: canonical };
    },
  });
  deps.stateRef.current.paddocks = [{ ...paddock, revision: 3 }];
  assert.equal((await (await loadAction('upsertPaddock', deps))(input)).success, true);
  assert.deepEqual(dispatched, [{ type: 'PADDOCK_UPSERT', payload: canonical }]);
});

test('unchanged retry reuses its request receipt, changed selection creates a new request', async () => {
  const calls = [];
  const deps = dependencies({ persistPaddockUpsert: async (next, image, expectedRevision, attempt) => {
    calls.push({ id: next.id, requestId: attempt.requestId, expectedRevision });
    return { success: false };
  } });
  const action = await loadAction('upsertPaddock', deps);
  await action(input); await action(input); await action({ ...input, horseIds: ['horse-twin'] });
  assert.equal(calls[0].requestId, calls[1].requestId);
  assert.notEqual(calls[1].requestId, calls[2].requestId);
  assert.deepEqual(calls.map(call => call.id), [paddock.id, paddock.id, paddock.id]);
});

test('new paddock retains the editor-provided UUID and null create revision across retries', async () => {
  const calls = [];
  const deps = dependencies({ persistPaddockUpsert: async (next, image, revision, attempt) => {
    calls.push({ next, revision, requestId: attempt.requestId }); return { success: false };
  } });
  const action = await loadAction('upsertPaddock', deps);
  const create = { ...input, id: 'editor-create-id', expectedRevision: null };
  await action(create); await action(create);
  assert.deepEqual(calls.map(call => [call.next.id, call.revision]), [['editor-create-id', null], ['editor-create-id', null]]);
  assert.equal(calls[0].requestId, calls[1].requestId);
  assert.deepEqual(calls[0].next.horseNames, []);
});

test('invalid IDs, legacy readiness and missing draft revision fail before persistence', async (t) => {
  for (const [label, change, stateChange] of [
    ['duplicate', { horseIds: ['horse-mira', 'horse-mira'] }], ['unknown', { horseIds: ['missing'] }],
    ['foreign stable', { horseIds: ['foreign'] }], ['old input', { horseIds: undefined }],
    ['no revision', { expectedRevision: undefined }], ['zero revision', { expectedRevision: 0 }],
    ['wrong paddock stable', { stableId: 'other' }], ['global legacy', {}, { paddockLinksReady: false }],
    ['legacy row', {}, { paddocks: [{ ...paddock, linksReady: false }] }],
  ]) await t.test(label, async () => {
    let writes = 0;
    const deps = dependencies({ persistPaddockUpsert: async () => { writes++; } });
    Object.assign(deps.stateRef.current, stateChange);
    assert.equal((await (await loadAction('upsertPaddock', deps))({ ...input, ...change })).success, false);
    assert.equal(writes, 0);
  });
});

test('save and delete share an in-flight lock and deletion forwards the captured revision', async () => {
  let writes = 0;
  const deps = dependencies({
    pendingDataWrites: { current: new Set(['paddock:paddock']) },
    persistPaddockDelete: async (next, revision) => { assert.equal(revision, 1); writes++; return { success: false }; },
    persistPaddockUpsert: async () => { writes++; return { success: false }; },
  });
  const remove = await loadAction('deletePaddock', deps);
  assert.equal((await remove(paddock.id, 1)).success, false);
  assert.equal((await (await loadAction('upsertPaddock', deps))(input)).success, false);
  assert.equal(writes, 0);
  deps.pendingDataWrites.current.clear();
  deps.stateRef.current.paddocks = [{ ...paddock, revision: 3 }];
  assert.equal((await remove(paddock.id, 1)).success, false);
  assert.equal(writes, 1);
});

test('actual RPC save preserves the raw archive and rejects incomplete or mismatched acknowledgement', async (t) => {
  const attempt = { requestId: 'save-request' };
  for (const [label, change] of [
    ['empty', () => null], ['wrong request', row => ({ ...row, request_id: 'other' })],
    ['wrong receipt', row => ({ ...row, last_save_request_id: 'other' })],
    ['stale version', row => ({ ...row, revision: 1 })], ['wrong horses', row => ({ ...row, horse_ids: ['horse-twin'] })],
    ['wrong stable', row => ({ ...row, stable_id: 'other' })], ['wrong image', row => ({ ...row, image_url: 'https://example.test/other' })],
    ['bad archive', row => ({ ...row, horse_names: [12] })], ['bad timestamp', row => ({ ...row, updated_at: 'invalid' })],
  ]) await t.test(label, async () => {
    const persist = await loadAction('persistPaddockUpsert', persistenceDependencies((name, parameters) => {
      assert.equal(name, 'save_paddock'); assert.equal(parameters.p_expected_revision, 1);
      assert.equal('p_horse_names' in parameters, false);
      return { data: change(acknowledged(parameters)), error: null };
    }));
    assert.equal((await persist(paddock, null, 1, attempt)).success, false);
  });
  const persist = await loadAction('persistPaddockUpsert', persistenceDependencies((name, parameters) => ({ data: acknowledged(parameters), error: null })));
  const result = await persist(paddock, null, 1, attempt);
  assert.equal(result.success, true);
  assert.deepEqual(result.data.horseNames, paddock.horseNames);
  assert.deepEqual(result.data.horseIds, paddock.horseIds);
  assert.equal(result.data.revision, 2);
});

test('lost save acknowledgement reuses the prepared image on retry', async () => {
  let uploads = 0;
  let requests = 0;
  const attempt = { requestId: 'save-request' };
  const persist = await loadAction('persistPaddockUpsert', persistenceDependencies((name, parameters) => {
    requests++;
    return { data: requests === 1 ? null : acknowledged(parameters), error: null };
  }, { uploadImageToStorage: async () => { uploads++; return { publicUrl: 'https://example.test/prepared.jpg' }; } }));
  assert.equal((await persist(paddock, { uri: 'file:///selected.jpg' }, 1, attempt)).success, false);
  assert.equal((await persist(paddock, { uri: 'file:///selected.jpg' }, 1, attempt)).success, true);
  assert.equal(uploads, 1);
  assert.equal(requests, 2);
});

test('save errors distinguish stale/deleted, permission and missing installation without logging draft data', async (t) => {
  for (const [code, expected] of [['40001', /Hagen har ändrats/], ['P0002', /Hagen har ändrats/], ['42501', /behörighet/], ['PGRST202', /behöver uppdateras/], ['23503', /Hästvalet/]]) {
    await t.test(code, async () => {
      const warnings = [];
      const persist = await loadAction('persistPaddockUpsert', persistenceDependencies(() => ({ data: null, error: { code, message: 'PRIVATE_INPUT' } }), { console: { warn: (...args) => warnings.push(args) } }));
      assert.match((await persist(paddock, null, 1, { requestId: 'save-request' })).reason, expected);
      assert.equal(JSON.stringify(warnings).includes('PRIVATE_INPUT'), false);
      assert.match(warnings[0][0], /^\[paddock save\]/);
    });
  }
});

test('delete requires its full RPC acknowledgement before removing the row', async () => {
  for (const row of [null, { id: paddock.id, stable_id: paddock.stableId, deleted: true, revision: 2 }]) {
    const remove = await loadAction('persistPaddockDelete', persistenceDependencies(() => ({ data: row, error: null })));
    assert.equal((await remove(paddock, 1)).success, false);
  }
  const removed = { id: paddock.id, stable_id: paddock.stableId, deleted: true, revision: 1 };
  const persist = await loadAction('persistPaddockDelete', persistenceDependencies((name, parameters) => {
    assert.equal(name, 'delete_paddock'); assert.equal(parameters.p_expected_revision, 1);
    return { data: removed, error: null };
  }));
  const dispatched = [];
  const remove = await loadAction('deletePaddock', dependencies({ persistPaddockDelete: persist, dispatch: action => dispatched.push(action) }));
  assert.equal((await remove(paddock.id, 1)).success, true);
  assert.deepEqual(dispatched, [{ type: 'PADDOCK_DELETE', payload: { id: paddock.id } }]);
});

test('a missing save/delete RPC disables all paddock writes while retaining the draft, rows and groups', async () => {
  const reduce = await loadAction('reducer', {}, true);
  for (const [name, code] of [['persistPaddockUpsert', 'PGRST202'], ['persistPaddockDelete', '42883']]) {
    const deps = dependencies();
    deps.stateRef.current.groups = [{ id: 'user-created-group' }];
    const before = deps.stateRef.current;
    const persist = await loadAction(name, persistenceDependencies(() => ({ data: null, error: { code } }), {
      dispatch: action => { deps.stateRef.current = reduce(deps.stateRef.current, action); },
    }));
    const result = name === 'persistPaddockUpsert'
      ? await persist(paddock, null, 1, { requestId: 'save-request' }) : await persist(paddock, 1);
    assert.equal(result.success, false);
    assert.equal(deps.stateRef.current.paddockLinksReady, false);
    assert.equal(deps.stateRef.current.paddocks, before.paddocks);
    assert.equal(deps.stateRef.current.groups, before.groups);
    deps.persistPaddockUpsert = () => assert.fail('Known missing installation must prevent another write');
    assert.equal((await (await loadAction('upsertPaddock', deps))(input)).success, false);
  }
});

test('hung image, save and delete are bounded even when the transport ignores abort', async (t) => {
  for (const stage of ['image', 'save', 'delete']) await t.test(stage, async () => {
    let expire;
    let cleared = false;
    const never = new Promise(() => {});
    const deps = persistenceDependencies(() => never, {
      setTimeout: (callback, milliseconds) => { assert.equal(milliseconds, 15_000); expire = callback; return 1; },
      clearTimeout: () => { cleared = true; }, uploadImageToStorage: () => never,
    });
    const persist = await loadAction(stage === 'delete' ? 'persistPaddockDelete' : 'persistPaddockUpsert', deps);
    const operation = stage === 'delete' ? persist(paddock, 1)
      : persist(paddock, stage === 'image' ? { uri: 'file:///selected.jpg' } : null, 1, { requestId: 'save-request' });
    expire();
    const result = await operation;
    assert.equal(result.success, false);
    assert.match(result.reason, /kunde inte bekräftas/);
    assert.equal(cleared, true);
  });
});

test('canonical loader reads paddock and links together; only missing schema falls back to read-only legacy', async (t) => {
  for (const code of [null, 'PGRST200', 'PGRST205', '42P01', '42501', 'NETWORK']) await t.test(code ?? 'ready', async () => {
    const selects = [];
    const raw = { horse_names: ['  Saga  ', null] };
    const load = await loadAction('fetchPaddocks', {
      console: { warn() {} }, supabase: { from: table => ({ select: columns => ({ in: async (key, ids) => {
        assert.equal(table, 'paddocks'); assert.equal(key, 'stable_id'); assert.deepEqual(ids, ['stable']);
        selects.push(columns);
        return { data: !code || selects.length > 1 ? [raw] : null, error: code && selects.length === 1 ? { code } : null };
      } }) }) },
    }, true);
    const result = await load(['stable']);
    const missing = ['PGRST200', 'PGRST205', '42P01'].includes(code);
    assert.deepEqual(selects, missing ? ['*, paddock_horses(horse_id)', '*'] : ['*, paddock_horses(horse_id)']);
    assert.equal(result.linksReady, !code);
    if (missing || !code) assert.deepEqual(result.data[0].horse_names, raw.horse_names);
    else assert.equal(result.error.code, code);
  });
});
