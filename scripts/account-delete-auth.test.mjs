import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { createClient, navigatorLock, processLock } from '@supabase/supabase-js';
import ts from 'typescript';

const actor = '11111111-1111-4111-8111-111111111111';

test('two SDK instances serialize password-login storage writes with account cleanup', async () => {
  const capturedRead = deferred();
  const releaseRead = deferred();
  let hold = false;
  let held = false;
  const project = `offline-concurrent-${++fixtureNumber}`;
  const first = await loadStorage({ realSdk: true, project, intercept: (operation, key, _value, values) => {
    if (hold && !held && operation === 'get' && key.endsWith('-auth-token-user')) {
      held = true;
      const snapshot = values.get(key);
      capturedRead.resolve();
      return releaseRead.promise.then(() => snapshot);
    }
  } });
  await first.supabase.auth.getSession();
  const second = await loadStorage({ realSdk: true, project, sharedValues: first.values,
    fetchStub: async (input, init) => {
      assert.match(String(input), /\/auth\/v1\/token\?grant_type=password$/);
      assert.equal(init.method, 'POST');
      return new globalThis.Response(JSON.stringify(session(other)), { headers: { 'content-type': 'application/json' } });
    } });
  await second.supabase.auth.getSession();
  hold = true;
  const cleanup = first.clearDeletedAccountSession(actor);
  await capturedRead.promise;
  const login = second.supabase.auth.signInWithPassword({ email: 'offline-other@example.test', password: 'offline-password' });
  let loginFinished = false;
  login.then(() => { loginFinished = true; });
  await flush();
  assert.equal(loginFinished, false, 'SDK password login must wait at the storage mutation boundary.');
  releaseRead.resolve();
  assert.equal(await cleanup, true);
  assert.equal((await login).data.session.user.id, other);
  assert.equal((await second.supabase.auth.getSession()).data.session.user.id, other);
  assert.equal(JSON.parse(first.values.get(first.key)).user.id, other);
});

test('a different SDK session holding the auth lock is preserved before cleanup enters storage', async () => {
  const requestStarted = deferred();
  const releaseRequest = deferred();
  const project = `offline-auth-lock-${++fixtureNumber}`;
  const first = await loadStorage({ realSdk: true, project });
  await first.supabase.auth.getSession();
  const second = await loadStorage({ realSdk: true, project, sharedValues: first.values,
    fetchStub: async input => {
      assert.match(String(input), /\/auth\/v1\/user$/);
      requestStarted.resolve();
      await releaseRequest.promise;
      return new globalThis.Response(JSON.stringify(session(other).user), { headers: { 'content-type': 'application/json' } });
    } });
  await second.supabase.auth.getSession();
  const login = second.supabase.auth.setSession({ access_token: session(other).access_token, refresh_token: 'offline-refresh' });
  await requestStarted.promise;
  const removals = first.calls.filter(([operation]) => operation === 'remove').length;
  const cleanup = first.clearDeletedAccountSession(actor);
  await flush();
  releaseRequest.resolve();
  assert.equal((await login).data.session.user.id, other);
  assert.equal(await cleanup, false);
  assert.equal(first.calls.filter(([operation]) => operation === 'remove').length, removals);
  assert.equal((await second.supabase.auth.getSession()).data.session.user.id, other);
});

test('an OS-hung cleanup releases the auth lock at deadline so installed SDK session reads fail fast', { timeout: 2000 }, async () => {
  const pending = deferred();
  let hold = false;
  let held = false;
  const fixture = await loadStorage({ realSdk: true, intercept: (operation, key, _value, values) => {
    if (hold && !held && operation === 'get' && key.endsWith('-auth-token')) {
      held = true;
      const snapshot = values.get(key);
      return pending.promise.then(() => snapshot);
    }
  } });
  await fixture.supabase.auth.getSession();
  hold = true;
  const cleanup = fixture.clearDeletedAccountSession(actor);
  const rejected = assert.rejects(cleanup, /timed out/);
  await flush();
  fixture.timers.find(timer => timer.delay === 10_000).callback();
  await rejected;
  await flush();
  await assert.rejects(fixture.supabase.auth.getSession(), /storage is still busy/);
  await assert.rejects(fixture.clearDeletedAccountSession(actor), /storage is still busy/);
  pending.resolve();
  await flush();
  assert.ok(!fixture.calls.some(([operation]) => operation === 'remove'), 'Late storage resolution must not continue deletion.');
});

test('a cleanup lock callback that starts after its deadline performs no storage mutation', async () => {
  const fixture = await loadStorage();
  const started = deferred();
  const release = deferred();
  const blocker = processLock(`lock:${fixture.key}`, -1, async () => { started.resolve(); await release.promise; });
  await started.promise;
  const cleanup = fixture.clearDeletedAccountSession(actor);
  const rejected = assert.rejects(cleanup, /timed out/);
  await flush();
  fixture.timers.find(timer => timer.delay === 10_000).callback();
  await rejected;
  release.resolve();
  await blocker;
  await flush();
  assert.equal(fixture.calls.length, 0);
  assert.equal(JSON.parse(fixture.values.get(fixture.key)).user.id, actor);
});

const other = '22222222-2222-4222-8222-222222222222';
const flush = async () => { for (let tick = 0; tick < 30; tick++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function session(id) {
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: id, exp: 4102444800 }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.offline';
  return { access_token: token, refresh_token: 'offline-refresh', expires_at: 4102444800,
    expires_in: 3600, token_type: 'bearer', user: { id, aud: 'authenticated', role: 'authenticated',
      email: 'offline@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-10-07T00:00:00Z' } };
}
let fixtureNumber = 0;
async function loadStorage({ intercept, realSdk = false, sharedValues, project, fetchStub } = {}) {
  const source = await readFile(new URL('../lib/supabase.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('supabase.ts', source, ts.ScriptTarget.Latest, true);
  const body = ast.statements.filter(node => !ts.isImportDeclaration(node))
    .map(node => node.getText(ast).replace(/^export\s+/, '')).join('\n');
  const projectName = project ?? `offline-account-${++fixtureNumber}`;
  const key = `sb-${projectName}-auth-token`;
  const values = sharedValues ?? new Map([[key, JSON.stringify(session(actor))], [`${key}-user`, JSON.stringify({ user: session(actor).user })],
    [`${key}-code-verifier`, 'offline-verifier']]);
  const calls = [];
  const timers = [];
  const storage = {
    getItemAsync: async storageKey => {
      calls.push(['get', storageKey]);
      return intercept?.('get', storageKey, undefined, values) ?? values.get(storageKey) ?? null;
    },
    setItemAsync: async (storageKey, value) => {
      calls.push(['set', storageKey]);
      if (intercept) {
        const intercepted = intercept('set', storageKey, value, values);
        if (intercepted !== undefined) return intercepted;
      }
      values.set(storageKey, value);
    },
    deleteItemAsync: async storageKey => {
      calls.push(['remove', storageKey]);
      if (intercept) {
        const intercepted = intercept('remove', storageKey, undefined, values);
        if (intercepted !== undefined) return intercepted;
      }
      values.delete(storageKey);
    },
  };
  const dependencies = {
    navigatorLock, processLock,
    Platform: { OS: 'ios' }, Constants: {}, SecureStore: storage,
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: `https://${projectName}.example.test`,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'offline-anon-key' } }, __DEV__: false,
    createClient: (url, anon, options) => realSdk
      ? createClient(url, anon, { ...options, auth: { ...options.auth, autoRefreshToken: false, detectSessionInUrl: false } })
      : { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
    createTimeoutFetch: fetch => fetch,
    fetch: fetchStub ?? (async () => { assert.fail('No remote Auth or backend operation is allowed.'); }),
    setTimeout: (callback, delay) => { const timer = { callback, delay, cleared: false }; timers.push(timer); return timer; },
    clearTimeout: timer => { timer.cleared = true; },
  };
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => {
    ${body}
    return { authStorage, authStorageKey, clearDeletedAccountSession, markDeletedAccountSession, supabase };
  };`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const module = (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
  assert.equal(module.authStorageKey, key, 'Cleanup must use the SDK project key.');
  return { ...module, key, values, calls, timers };
}

async function loadProvider({ getSession, clear = async () => true, mark = () => {} } = {}) {
  const source = await readFile(new URL('../context/AuthContext.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('AuthContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AuthProvider');
  const states = [];
  const effects = [];
  let listener;
  const timers = [];
  const dependencies = {
    React: {
      useState: initial => { const index = states.length; states.push(initial);
        return [initial, value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
      useRef: current => ({ current }), useEffect: callback => effects.push(callback),
      useCallback: callback => callback, useMemo: callback => callback(), createElement: (_type, props) => props.value,
    },
    AuthContext: { Provider: 'Provider' }, isQaDemoMode: false,
    clearDeletedAccountSession: clear, createQaDemoSession: () => assert.fail('Not demo Auth.'),
    markDeletedAccountSession: mark,
    supabase: { auth: {
      getSession: getSession ?? (async () => ({ data: { session: session(actor) }, error: null })),
      onAuthStateChange: callback => { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      signOut: () => assert.fail('Account deletion must not call remote signOut.'),
    } },
    deregisterPushToken: () => assert.fail('Account deletion must not call push cleanup.'),
    setTimeout: callback => { timers.push(callback); return callback; }, clearTimeout: () => {},
    console: { warn() {} },
  };
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => {
    ${declaration.getText(ast).replace(/^export\s+/, '')}
    return AuthProvider({ children: null });
  };`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
  const value = (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
  const cleanup = effects[0]();
  await flush();
  return { value, states, emit: (...args) => listener(...args), cleanup, timers };
}

test('confirmed deletion physically removes all persisted Auth keys and installed SDK reads no session', async () => {
  const fixture = await loadStorage({ realSdk: true });
  assert.equal((await fixture.supabase.auth.getSession()).data.session.user.id, actor);
  assert.equal(await fixture.clearDeletedAccountSession(actor), true);
  for (const key of [fixture.key, `${fixture.key}-user`, `${fixture.key}-code-verifier`]) assert.equal(fixture.values.has(key), false);
  assert.equal((await fixture.supabase.auth.getSession()).data.session, null);
  const refresh = await fixture.supabase.auth.refreshSession();
  assert.equal(refresh.data.session, null);
  assert.equal(refresh.error?.name, 'AuthSessionMissingError');
  await fixture.authStorage.setItem(fixture.key, JSON.stringify(session(actor)));
  await fixture.authStorage.setItem(`${fixture.key}-user`, JSON.stringify({ user: session(actor).user }));
  assert.equal(fixture.values.has(fixture.key), false, 'Late refresh writes must not restore the deleted UID.');
  await fixture.authStorage.setItem(fixture.key, JSON.stringify(session(other)));
  assert.equal((await fixture.supabase.auth.getSession()).data.session.user.id, other, 'Another user may sign in normally.');
});

test('cleanup preserves another persisted account and refuses to claim local logout', async () => {
  const fixture = await loadStorage();
  fixture.values.set(fixture.key, JSON.stringify(session(other)));
  fixture.values.set(`${fixture.key}-user`, JSON.stringify({ user: session(other).user }));
  assert.equal(await fixture.clearDeletedAccountSession(actor), false);
  assert.equal(JSON.parse(fixture.values.get(fixture.key)).user.id, other);
  assert.ok(!fixture.calls.some(([operation]) => operation === 'remove'));
});

test('a local storage error leaves physical session present and repeated cleanup can recover', async () => {
  let fail = true;
  const fixture = await loadStorage({ intercept: (operation, key) => {
    if (operation === 'remove' && key.endsWith('-auth-token') && fail) {
      fail = false;
      throw new Error('Offline storage failure');
    }
  } });
  await assert.rejects(fixture.clearDeletedAccountSession(actor), /Offline storage failure/);
  assert.equal(fixture.values.has(fixture.key), true);
  assert.equal(await fixture.authStorage.getItem(fixture.key), null, 'The retired UID must not be exposed to a late refresh.');
  assert.equal(await fixture.clearDeletedAccountSession(actor), true);
  assert.equal(fixture.values.has(fixture.key), false);
});

for (const operation of ['get', 'remove', 'set']) {
  test(`never-settling native ${operation} is bounded and cannot erase a subsequent user after release`, { timeout: 2000 }, async () => {
    const pending = deferred();
    let held = false;
    const fixture = await loadStorage({ intercept: (actual, key, value, values) => {
      if (actual === operation && key.endsWith('-auth-token') && !held) {
        held = true;
        return pending.promise.then(() => {
          if (operation === 'set') values.set(key, value);
          if (operation === 'remove') values.delete(key);
          return operation === 'get' ? values.get(key) ?? null : undefined;
        });
      }
    } });
    const write = operation === 'set' ? fixture.authStorage.setItem(fixture.key, JSON.stringify(session(actor))) : null;
    await flush();
    const cleanup = fixture.clearDeletedAccountSession(actor);
    const rejected = assert.rejects(cleanup, /timed out/);
    await flush();
    const timer = fixture.timers.find(timer => timer.delay === 10_000);
    assert.ok(timer, 'Cleanup must have an actual 10-second deadline.');
    timer.callback();
    await rejected;
    assert.equal(timer.cleared, true);
    await assert.rejects(fixture.authStorage.setItem(fixture.key, JSON.stringify(session(other))), /storage is still busy/);
    await assert.rejects(fixture.clearDeletedAccountSession(actor), /storage is still busy/);
    pending.resolve();
    await write;
    await flush();
    await fixture.authStorage.setItem(fixture.key, JSON.stringify(session(other)));
    fixture.values.set(`${fixture.key}-user`, JSON.stringify({ user: session(other).user }));
    await flush();
    assert.equal(JSON.parse(fixture.values.get(fixture.key)).user.id, other);
    assert.equal(await fixture.clearDeletedAccountSession(actor), false);
    assert.equal(JSON.parse(fixture.values.get(fixture.key)).user.id, other);
  });
}

test('AuthProvider ignores late deleted-user events and preserves a different active session', async () => {
  const fixture = await loadProvider();
  assert.equal(fixture.states[0].user.id, actor);
  assert.equal(await fixture.value.finishAccountDeletion(actor), true);
  assert.equal(fixture.states[0], null);
  fixture.emit('TOKEN_REFRESHED', session(actor));
  assert.equal(fixture.states[0], null);
  fixture.emit('SIGNED_IN', session(other));
  assert.equal(fixture.states[0].user.id, other);
  assert.equal(await fixture.value.finishAccountDeletion(actor), false);
  assert.equal(fixture.states[0].user.id, other);
  fixture.cleanup();
});

test('AuthProvider keeps recovery visible after failed local cleanup and accepts another login', async () => {
  let attempts = 0;
  const fixture = await loadProvider({ clear: async () => { if (++attempts === 1) throw new Error('Offline storage error'); return true; } });
  await assert.rejects(fixture.value.finishAccountDeletion(actor), /Offline storage error/);
  fixture.emit('TOKEN_REFRESHED', session(actor));
  fixture.emit('SIGNED_OUT', null);
  assert.equal(fixture.states[0].user.id, actor, 'Storage failure must not look like a completed local logout.');
  assert.equal(fixture.states[4], actor, 'Recovery UID must survive screen navigation.');
  assert.equal(await fixture.value.finishAccountDeletion(actor), true);
  assert.equal(fixture.states[0], null);
  fixture.emit('SIGNED_IN', session(other));
  fixture.emit('SIGNED_OUT', null);
  assert.equal(fixture.states[0], null, 'Normal logout for a subsequent user still works.');
  fixture.cleanup();
});

test('a late initialization getSession cannot restore a confirmed deleted UID', async () => {
  const pending = deferred();
  const fixture = await loadProvider({ getSession: () => pending.promise });
  assert.equal(await fixture.value.finishAccountDeletion(actor), true);
  pending.resolve({ data: { session: session(actor) }, error: null });
  await flush();
  assert.equal(fixture.states[0], null);
  assert.equal(fixture.states[1], false);
  fixture.cleanup();
});

test('another user can sign in and sign out normally while the deleted account recovery was pending', async () => {
  const fixture = await loadProvider({ clear: async () => { throw new Error('Offline storage error'); } });
  await assert.rejects(fixture.value.finishAccountDeletion(actor), /Offline storage error/);
  fixture.emit('SIGNED_IN', session(other));
  assert.equal(fixture.states[0].user.id, other);
  assert.equal(fixture.states[4], null, 'Another user must not inherit account recovery.');
  fixture.emit('SIGNED_OUT', null);
  assert.equal(fixture.states[0], null);
  fixture.emit('TOKEN_REFRESHED', session(actor));
  assert.equal(fixture.states[0], null);
  fixture.cleanup();
});

test('the first acknowledgement of A while B is active retires A without erasing B, including late SDK writes', async () => {
  const storage = await loadStorage({ realSdk: true });
  await storage.supabase.auth.getSession();
  await storage.authStorage.setItem(storage.key, JSON.stringify(session(other)));
  storage.values.set(`${storage.key}-user`, JSON.stringify({ user: session(other).user }));
  const provider = await loadProvider({ getSession: () => storage.supabase.auth.getSession(),
    clear: storage.clearDeletedAccountSession, mark: storage.markDeletedAccountSession });
  assert.equal(provider.states[0].user.id, other);
  const removes = storage.calls.filter(([operation]) => operation === 'remove').length;
  assert.equal(await provider.value.finishAccountDeletion(actor), false);
  assert.equal(storage.calls.filter(([operation]) => operation === 'remove').length, removes);
  await storage.authStorage.setItem(storage.key, JSON.stringify(session(actor)));
  await storage.authStorage.setItem(`${storage.key}-user`, JSON.stringify({ user: session(actor).user }));
  assert.equal((await storage.supabase.auth.getSession()).data.session.user.id, other);
  assert.equal(provider.states[0].user.id, other);
  assert.equal(provider.states[4], null);
  provider.cleanup();
});
