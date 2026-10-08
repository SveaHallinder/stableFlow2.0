import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

const actor = '11111111-1111-1111-1111-111111111111';
const replacement = '22222222-2222-2222-2222-222222222222';

// All environment values, Auth operations and database reads are local stubs.
async function loadHandler(overrides = {}) {
  const source = await readFile(new URL('../supabase/functions/delete-account/index.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('delete-account.ts', source, ts.ScriptTarget.Latest, true);
  const body = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n');
  const environment = { SUPABASE_URL: 'https://synthetic.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key',
    SUPABASE_ANON_KEY: 'synthetic-anon-key', ...overrides.environment };
  const calls = [];
  const logs = [];
  const capture = {};
  const dependencies = {
    Deno: { env: { get: name => environment[name] }, serve: handler => { capture.handler = handler; } },
    console: { error: (...args) => logs.push(args) },
    createClient: (_url, key) => {
      calls.push(['createClient']);
      if (overrides.throwClient) throw overrides.throwClient;
      if (key !== 'synthetic-service-key') return { auth: { getUser: async () =>
        overrides.userResult ?? { data: { user: { id: actor } }, error: null } } };
      return {
        rpc: async (name, args) => {
          calls.push(['rpc', name, args]);
          assert.equal(name, 'prepare_account_deletion');
          assert.equal(args.p_user_id, actor);
          if (overrides.throwPrepare) throw overrides.throwPrepare;
          return overrides.prepareResult ?? { data: { prepared: true, user_id: actor,
            replacement_user_id: args.p_replacement_user_id }, error: overrides.prepareError ?? null };
        },
        from: table => {
          calls.push(['from', table]);
          assert.equal(table, 'profiles');
          const query = {
            select: field => { calls.push(['select', field]); assert.equal(field, 'id'); return query; },
            eq: (field, value) => { calls.push(['eq', field, value]); assert.equal(field, 'id'); assert.equal(value, actor); return query; },
            maybeSingle: async () => overrides.profileReceipt ?? { data: null, error: null },
          };
          return query;
        },
        auth: { admin: {
          deleteUser: async uid => { calls.push(['deleteUser', uid]);
            if (overrides.throwDelete) throw overrides.throwDelete;
            const error = overrides.deleteError ?? null;
            return overrides.deleteResult ?? { data: { user: error ? null : { id: uid } }, error };
          },
          getUserById: async uid => {
            calls.push(['getUserById', uid]); assert.equal(uid, actor);
            return overrides.authReceipt ?? (overrides.authPresent
              ? { data: { user: { id: uid } }, error: null }
              : { data: { user: null }, error: { status: 404, code: 'user_not_found' } });
          },
        } },
      };
    },
  };
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => { ${body} };`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
  return { handler: capture.handler, calls, logs };
}

function request(method = 'POST', authorization = 'Bearer synthetic-user-jwt', body = { expected_user_id: actor }) {
  return new globalThis.Request('https://synthetic.example.test/functions/v1/delete-account', {
    method, headers: authorization ? { Authorization: authorization } : {},
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
}

function assertNoDeletion(calls) {
  assert.ok(!calls.some(([method]) => method === 'deleteUser'));
}

test('delete-account answers CORS preflight and rejects other methods without Auth calls', async () => {
  const { handler, calls } = await loadHandler();
  const preflight = await handler(request('OPTIONS'));
  assert.equal(preflight.status, 200);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal((await handler(request('GET'))).status, 405);
  assert.equal(calls.length, 0);
});

test('delete-account rejects a missing bearer token or invalid caller before admin access', async () => {
  const first = await loadHandler();
  assert.equal((await first.handler(request('POST', ''))).status, 401);
  assert.equal(first.calls.length, 0);
  const second = await loadHandler({ userResult: { data: null, error: new Error('Synthetic invalid JWT') } });
  assert.equal((await second.handler(request())).status, 401);
  assert.deepEqual(second.calls, [['createClient']]);
});

test('delete-account verifies the expected caller before any administrative read or deletion', async () => {
  const { handler, calls, logs } = await loadHandler();
  const response = await handler(request('POST', 'Bearer synthetic-other-session', { expected_user_id: 'other-account' }));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'account_changed' });
  assert.deepEqual(calls, [['createClient']]);
  assert.match(logs[0][0], /^\[delete account\]/);
  assert.doesNotMatch(JSON.stringify(logs), /other-account|synthetic-other-session/);
});

test('delete-account rejects a missing or malformed expected caller without administrative access', async () => {
  for (const body of [{}, null, { expected_user_id: 123 }, { expected_user_id: '' }, 'invalid JSON']) {
    const { handler, calls } = await loadHandler();
    const response = await handler(request('POST', 'Bearer synthetic-user-jwt', body));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
    assert.deepEqual(calls, [['createClient']]);
  }
});

test('delete-account blocks missing or invalid replacement owners through the preparation guard', async () => {
  for (const reason of ['owner_required', 'owner_invalid']) {
    const { handler, calls } = await loadHandler({ prepareError: { code: 'P0001', message: '[account delete] ' + reason } });
    const response = await handler(request());
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: reason });
    assertNoDeletion(calls);
    assert.deepEqual(calls.filter(([method]) => method === 'rpc'), [['rpc', 'prepare_account_deletion',
      { p_user_id: actor, p_replacement_user_id: null }]]);
  }
});

test('delete-account fails closed on absent or malformed preparation receipts', async () => {
  for (const data of [null, undefined, {}, [null], { prepared: true, user_id: actor },
    { prepared: true, user_id: actor, replacement_user_id: replacement }]) {
    const { handler, calls, logs } = await loadHandler({ prepareResult: { data, error: null } });
    const response = await handler(request());
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'lookup_failed' });
    assertNoDeletion(calls);
    assert.match(logs[0][0], /^\[delete account\]/);
  }
});

test('delete-account fails closed on an unverified prepared flag', async () => {
  for (const prepared of [null, undefined, false, -1, 1.5, NaN, Infinity, 'true']) {
    const { handler, calls } = await loadHandler({ prepareResult: { data: { prepared, user_id: actor, replacement_user_id: null }, error: null } });
    const response = await handler(request());
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'lookup_failed' });
    assertNoDeletion(calls);
  }
});

test('delete-account reports and safely logs failed guard reads without deleting', async () => {
  const error = { code: 'synthetic_lookup_failure', message: 'synthetic-secret-must-not-be-logged' };
  for (const prepareError of [error, { ...error, message: '[account delete] owner_invalid with private extra text' }]) {
    const { handler, calls, logs } = await loadHandler({ prepareError });
    const response = await handler(request());
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'lookup_failed' });
    assertNoDeletion(calls);
    assert.match(logs[0][0], /^\[delete account\]/);
    assert.doesNotMatch(JSON.stringify(logs), /synthetic-secret/);
  }
});

test('delete-account binds the verified caller and selected owner before fresh Auth/profile receipts', async () => {
  const { handler, calls } = await loadHandler();
  const response = await handler(request('POST', 'Bearer synthetic-user-jwt', { expected_user_id: actor, replacement_user_id: replacement }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true, user_id: actor });
  assert.deepEqual(calls.filter(([method]) => method === 'deleteUser'), [['deleteUser', actor]]);
  assert.deepEqual(calls.filter(([method]) => method === 'rpc'), [['rpc', 'prepare_account_deletion',
    { p_user_id: actor, p_replacement_user_id: replacement }]]);
  assert.ok(calls.findIndex(([method]) => method === 'rpc') < calls.findIndex(([method]) => method === 'deleteUser'));
  assert.deepEqual(calls.filter(([method]) => method === 'getUserById'), [['getUserById', actor]]);
  assert.deepEqual(calls.filter(([method]) => method === 'from'), [['from', 'profiles']]);
});

test('delete-account allows a verified preparation with no replacement required', async () => {
  const { handler, calls } = await loadHandler();
  assert.equal((await handler(request())).status, 200);
  assert.deepEqual(calls.filter(([method]) => method === 'deleteUser'), [['deleteUser', actor]]);
});

test('delete-account cannot acknowledge an unverified Auth removal or another deletion UID', async () => {
  for (const data of [null, { user: null }, { user: { id: '22222222-2222-2222-2222-222222222222' } }]) {
    const { handler, calls, logs } = await loadHandler({ deleteResult: { data, error: null }, authPresent: data?.user?.id !== replacement });
    const response = await handler(request());
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'delete_unconfirmed' });
    assert.deepEqual(calls.filter(([method]) => method === 'deleteUser'), [['deleteUser', actor]]);
    assert.match(logs[0][0], /^\[delete account\]/);
  }
});

test('delete-account reports an Auth failure with CORS and without logging secrets', async () => {
  const { handler, logs } = await loadHandler({ deleteError: {
    code: 'unexpected_failure', status: 500, message: 'synthetic-secret-must-not-be-logged',
  }, authPresent: true });
  const response = await handler(request());
  assert.equal(response.status, 500);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(await response.json(), { error: 'delete_unconfirmed' });
  assert.match(logs[0][0], /^\[delete account\]/);
  assert.doesNotMatch(JSON.stringify(logs), /synthetic-secret/);
});

test('delete-account contains unexpected exceptions and missing server configuration', async () => {
  for (const overrides of [{ throwDelete: new Error('synthetic-secret-must-not-be-logged'), authPresent: true },
    { throwClient: new Error('synthetic-secret-must-not-be-logged') }, { environment: { SUPABASE_SERVICE_ROLE_KEY: undefined } }]) {
    const { handler, logs } = await loadHandler(overrides);
    const response = await handler(request());
    assert.equal(response.status, 500);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
    assert.match(logs[0][0], /^\[delete account\]/);
    assert.doesNotMatch(JSON.stringify(logs), /synthetic-secret/);
  }
});

test('delete-account waits for both fresh receipts and rejects malformed Auth absence or an orphan profile', async () => {
  let confirmAuth, confirmProfile;
  const authReceipt = new Promise(resolve => { confirmAuth = resolve; });
  const profileReceipt = new Promise(resolve => { confirmProfile = resolve; });
  const pendingFixture = await loadHandler({ authReceipt, profileReceipt });
  let settled = false;
  const pending = pendingFixture.handler(request()).then(response => { settled = true; return response; });
  for (let tick = 0; tick < 30 && !pendingFixture.calls.some(([method]) => method === 'getUserById'); tick++) await Promise.resolve();
  assert.ok(pendingFixture.calls.some(([method]) => method === 'getUserById'));
  assert.equal(settled, false);
  confirmAuth({ data: { user: null }, error: { status: 404, code: 'user_not_found' } });
  await Promise.resolve(); assert.equal(settled, false);
  confirmProfile({ data: null, error: null }); assert.equal((await pending).status, 200);
  for (const overrides of [
    { authReceipt: { data: { user: null }, error: null } },
    { authReceipt: { data: { user: null }, error: { status: 404, code: 'unknown' } } },
    { authReceipt: { data: { user: null }, error: { status: 500, code: 'user_not_found' } } },
    { authReceipt: { data: { user: { id: replacement } }, error: { status: 404, code: 'user_not_found' } } },
    { profileReceipt: { data: { id: actor }, error: null } },
    { profileReceipt: { data: undefined, error: null } },
    { profileReceipt: { data: null, error: { code: '42501', message: 'synthetic-secret' } } },
  ]) {
    const { handler, logs } = await loadHandler(overrides);
    const response = await handler(request());
    assert.equal(response.status, 500); assert.deepEqual(await response.json(), { error: 'delete_unconfirmed' });
    assert.doesNotMatch(JSON.stringify(logs), /synthetic-secret/);
  }
});

test('delete-account reconciles lost Auth acknowledgements only with fresh Auth and profile absence', async () => {
  for (const overrides of [
    { deleteResult: { data: null, error: null } },
    { throwDelete: new Error('synthetic-secret transport after commit') },
    { deleteError: { code: 'unexpected_failure', message: 'synthetic-secret after commit' } },
  ]) {
    const { handler, calls, logs } = await loadHandler(overrides);
    const response = await handler(request());
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { deleted: true, user_id: actor });
    assert.deepEqual(calls.filter(([method]) => method === 'deleteUser'), [['deleteUser', actor]]);
    assert.deepEqual(calls.filter(([method]) => method === 'getUserById'), [['getUserById', actor]]);
    assert.doesNotMatch(JSON.stringify(logs), /synthetic-secret/);
  }
});
