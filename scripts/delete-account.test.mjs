import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

const actor = '11111111-1111-1111-1111-111111111111';
const stable = '33333333-3333-3333-3333-333333333333';

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
        from: table => {
          calls.push(['from', table]);
          const filters = {};
          let head = false;
          const query = {
            select: (...args) => { calls.push(['select', ...args]); head = args[1]?.head === true; return query; },
            eq: (field, value) => { calls.push(['eq', field, value]); filters[field] = value; return query; },
            then: (resolve, reject) => {
              if (!head) return Promise.resolve(overrides.ownerResult ?? { data: [{ stable_id: stable }], error: null }).then(resolve, reject);
              const result = filters.role === 'admin' && filters.access === 'owner'
                ? overrides.countResult ?? { count: 2, error: null }
                : { count: overrides.memberCount ?? 1, error: null };
              return Promise.resolve(result).then(resolve, reject);
            },
          };
          return query;
        },
        auth: { admin: { deleteUser: async uid => { calls.push(['deleteUser', uid]);
          if (overrides.throwDelete) throw overrides.throwDelete;
          const error = overrides.deleteError ?? null;
          return overrides.deleteResult ?? { data: { user: error ? null : { id: uid } }, error }; } } },
      };
    },
  };
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => { ${body} };`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
  return { handler: capture.handler, calls, logs };
}

function request(method = 'POST', authorization = 'Bearer synthetic-user-jwt') {
  return new globalThis.Request('https://synthetic.example.test/functions/v1/delete-account', {
    method, headers: authorization ? { Authorization: authorization } : {},
    ...(method === 'POST' ? { body: JSON.stringify({ uid: '22222222-2222-2222-2222-222222222222' }) } : {}),
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

test('delete-account blocks the last owner even when the stable has only one member', async () => {
  const { handler, calls } = await loadHandler({ countResult: { count: 1, error: null }, memberCount: 1 });
  const response = await handler(request());
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'sole_owner', stable_id: stable });
  assertNoDeletion(calls);
});

test('delete-account fails closed on absent or malformed owner rows', async () => {
  for (const data of [null, undefined, {}, [null], [{ stable_id: null }]]) {
    const { handler, calls, logs } = await loadHandler({ ownerResult: { data, error: null } });
    const response = await handler(request());
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'lookup_failed' });
    assertNoDeletion(calls);
    assert.match(logs[0][0], /^\[delete account\]/);
  }
});

test('delete-account fails closed on an unverified owner count', async () => {
  for (const count of [null, undefined, -1, 1.5, NaN, Infinity]) {
    const { handler, calls } = await loadHandler({ countResult: { count, error: null } });
    const response = await handler(request());
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'lookup_failed' });
    assertNoDeletion(calls);
  }
});

test('delete-account reports and safely logs failed guard reads without deleting', async () => {
  const error = { code: 'synthetic_lookup_failure', message: 'synthetic-secret-must-not-be-logged' };
  for (const overrides of [{ ownerResult: { data: null, error } }, { countResult: { count: null, error } }]) {
    const { handler, calls, logs } = await loadHandler(overrides);
    const response = await handler(request());
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'lookup_failed' });
    assertNoDeletion(calls);
    assert.match(logs[0][0], /^\[delete account\]/);
    assert.doesNotMatch(JSON.stringify(logs), /synthetic-secret/);
  }
});

test('delete-account uses the verified caller and performs no public cleanup before Auth deletion', async () => {
  const { handler, calls } = await loadHandler();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
  assert.deepEqual(calls.filter(([method]) => method === 'deleteUser'), [['deleteUser', actor]]);
  assert.ok(calls.filter(([method]) => method === 'from').every(([, table]) => table === 'stable_members'));
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'role' && call[2] === 'admin'));
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'access' && call[2] === 'owner'));
});

test('delete-account allows a verified empty owner list', async () => {
  const { handler, calls } = await loadHandler({ ownerResult: { data: [], error: null } });
  assert.equal((await handler(request())).status, 200);
  assert.deepEqual(calls.filter(([method]) => method === 'deleteUser'), [['deleteUser', actor]]);
});

test('delete-account cannot acknowledge deletion without the same Auth user id', async () => {
  for (const data of [null, { user: null }, { user: { id: '22222222-2222-2222-2222-222222222222' } }]) {
    const { handler, calls, logs } = await loadHandler({ deleteResult: { data, error: null } });
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
  } });
  const response = await handler(request());
  assert.equal(response.status, 500);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(await response.json(), { error: 'delete_failed' });
  assert.match(logs[0][0], /^\[delete account\]/);
  assert.doesNotMatch(JSON.stringify(logs), /synthetic-secret/);
});

test('delete-account contains unexpected exceptions and missing server configuration', async () => {
  for (const overrides of [{ throwDelete: new Error('synthetic-secret-must-not-be-logged') },
    { throwClient: new Error('synthetic-secret-must-not-be-logged') }, { environment: { SUPABASE_SERVICE_ROLE_KEY: undefined } }]) {
    const { handler, logs } = await loadHandler(overrides);
    const response = await handler(request());
    assert.equal(response.status, 500);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
    assert.match(logs[0][0], /^\[delete account\]/);
    assert.doesNotMatch(JSON.stringify(logs), /synthetic-secret/);
  }
});
