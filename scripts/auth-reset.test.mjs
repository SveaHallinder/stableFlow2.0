import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

async function compileFactory(source, dependencies) {
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => { ${source} };`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

async function sourceAst(file) {
  return ts.createSourceFile(file, await readFile(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

async function resetCallback(name, dependencies) {
  const ast = await sourceAst('../app/(auth)/reset.tsx');
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) {
      callback = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(callback, `Actual reset callback ${name} must exist`);
  const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && !node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))
    .map(node => node.getText(ast)).join('\n');
  return compileFactory(`${helpers}\nreturn (${callback.getText(ast)});`, dependencies);
}

async function resetSessionEffect(dependencies) {
  const ast = await sourceAst('../app/(auth)/reset.tsx');
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'React.useEffect'
      && node.arguments[0].getText(ast).includes('const setSession =')) effect = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(effect, 'Actual session verification effect must exist');
  return compileFactory(`return (${effect.getText(ast)});`, dependencies);
}

async function gate(name, segments, overrides = {}) {
  const ast = await sourceAst('../app/_layout.tsx');
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  const redirects = [];
  const dependencies = {
    React: { Fragment: 'Fragment', createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }), useEffect: callback => callback() },
    useAuth: () => ({ session: { user: { id: 'offline-user' } }, loading: false, initializationError: null }),
    useAppData: () => ({ hydrating: false, refreshing: false, refreshError: null,
      derived: { canManageOnboardingAny: true, onboardingComplete: false },
      state: { currentStableId: null, currentUserId: 'offline-user' }, actions: { refreshData() {} } }),
    useSegments: () => segments, useGlobalSearchParams: () => ({}),
    useRouter: () => ({ replace: route => redirects.push(route) }),
    View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator', TouchableOpacity: 'TouchableOpacity',
    StyleSheet: { absoluteFillObject: {} }, loadingStyles: {}, errorStyles: {},
    ...overrides,
  };
  const render = await compileFactory(`return (${declaration.getText(ast)});`, dependencies);
  return { redirects, tree: render({ children: 'Offline reset form' }) };
}

function textNodes(tree) {
  if (!tree || typeof tree !== 'object') return [tree].filter(value => typeof value === 'string');
  return tree.children.flatMap(textNodes);
}

test('actual AuthGate keeps authenticated reset while normal login still redirects', async () => {
  assert.deepEqual((await gate('AuthGate', ['(auth)', 'reset'])).redirects, []);
  assert.deepEqual((await gate('AuthGate', ['(auth)', 'index'])).redirects, ['/(tabs)']);
  assert.deepEqual((await gate('AuthGate', ['(tabs)', 'index'], {
    useAuth: () => ({ session: null, loading: false, initializationError: null }),
  })).redirects, ['/(auth)']);
});

test('actual OnboardingGate keeps reset usable during incomplete onboarding, hydration and refresh errors', async () => {
  assert.deepEqual((await gate('OnboardingGate', ['(auth)', 'reset'])).redirects, []);
  const result = await gate('OnboardingGate', ['(auth)', 'reset'], {
    useAppData: () => ({ hydrating: true, refreshing: true, refreshError: 'Offline stable fetch failed',
      derived: { canManageOnboardingAny: true, onboardingComplete: false },
      state: { currentStableId: null, currentUserId: null }, actions: {} }),
  });
  assert.ok(textNodes(result.tree).includes('Offline reset form'));
  assert.ok(!textNodes(result.tree).includes('Kunde inte hämta stallet'));
  assert.ok(!textNodes(result.tree).includes('Hämtar ditt stall…'));
  assert.deepEqual((await gate('OnboardingGate', ['(tabs)', 'index'])).redirects, ['/(onboarding)/setup']);
});

function sdkFixture() {
  const user = { id: '60000000-0000-4000-8000-000000000002', aud: 'authenticated', role: 'authenticated',
    email: 'offline-reset@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-10-07T07:00:00Z' };
  const token = (id = user.id, nonce = 'initial') => [
    { alg: 'HS256', typ: 'JWT' }, { sub: id, exp: 4102444800, nonce },
  ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.' + Buffer.from('offline-signature').toString('base64url');
  const storage = new Map();
  const requests = [];
  const controls = { failStorage: false, rejectUser: false, rejectVerificationResponse: false, rejectUpdateResponse: false, user, nonce: 0 };
  const fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push({ method: init?.method ?? 'GET', path: url.pathname });
    let body = controls.user;
    let status = 200;
    if (url.pathname === '/auth/v1/user' && controls.rejectUser) {
      status = 401;
      body = { message: 'private-token invalid link', code: 'bad_jwt' };
    } else if (url.pathname === '/auth/v1/token') {
      body = { access_token: token(controls.user.id, String(++controls.nonce)), refresh_token: 'offline-refresh',
        expires_in: 3600, token_type: 'bearer', user: controls.user };
    } else if (url.pathname === '/auth/v1/logout') body = {};
    else assert.equal(url.pathname, '/auth/v1/user', 'Unexpected backend traffic must fail the offline fixture');
    const response = new globalThis.Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if ((init?.method === 'PUT' && controls.rejectUpdateResponse) || (init?.method !== 'PUT' && controls.rejectVerificationResponse)) {
      response.json = async () => { throw new Error('private-token-and-password response failure'); };
    }
    return response;
  };
  const sdk = createClient('https://offline-reset.example.test', 'offline-anon', {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, storage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => {
        if (controls.failStorage && /-auth-token$/.test(key)) throw new Error('private-token-and-password storage failure');
        storage.set(key, value);
      },
      removeItem: key => storage.delete(key),
    } },
    global: { fetch },
  });
  return { sdk, user, token: token(), controls, requests, fetch };
}

function callbackFixture(fixture) {
  const busy = [];
  const errors = [];
  const ready = [];
  const logs = [];
  const routes = [];
  const messages = [];
  const deps = {
    accessToken: fixture.token, refreshToken: 'offline-refresh', sessionReady: false, settingSession: false, linkError: null,
    verifiedSessionRef: { current: null },
    verifiedOriginRef: { current: 'web' }, activeSessionRef: { current: null }, linkVersionRef: { current: 0 },
    hasPasswordRecoverySession: session => Boolean(session),
    setSettingSession: value => busy.push(value), setSessionReady: value => ready.push(value),
    setLinkError: value => errors.push(value), setFormError: value => errors.push(value),
    setSubmitting: value => busy.push(value),
    submitting: false, password: 'OfflineNewPassword123!', confirmPassword: 'OfflineNewPassword123!',
    supabase: fixture.sdk, supabaseConfig: { isConfigured: true },
    console: { warn: (...args) => logs.push(args) },
    router: { replace: route => routes.push(route) }, toast: { showToast: (...args) => messages.push(args) },
  };
  return { busy, errors, ready, logs, routes, messages, deps };
}

test('actual reset verification catches an installed transient SDK exception and releases verification', async () => {
  const fixture = sdkFixture();
  await fixture.sdk.auth.getSession();
  fixture.controls.rejectVerificationResponse = true;
  const result = callbackFixture(fixture);
  result.deps.verifyRecoverySession = (await boundPasswordFactory(fixture.fetch)).verifyRecoverySession;
  await (await resetCallback('setSession', result.deps))();
  assert.equal(result.busy.at(-1), false);
  assert.ok(!result.ready.includes(true));
  assert.match(result.errors.at(-1), /länken|länk/i);
  assert.match(result.logs.at(-1)?.[0], /^\[auth reset\]/);
  assert.doesNotMatch(JSON.stringify(result.logs), /private-token|OfflineNewPassword|offline-reset@example/);
});

test('actual verification effect stops automatically retrying a rejected link', async () => {
  const fixture = sdkFixture();
  await fixture.sdk.auth.getSession();
  fixture.controls.rejectUser = true;
  const result = callbackFixture(fixture);
  result.deps.verifyRecoverySession = (await boundPasswordFactory(fixture.fetch)).verifyRecoverySession;
  await (await resetCallback('setSession', result.deps))();
  const count = fixture.requests.length;
  assert.equal(count, 1);
  const effect = await resetSessionEffect({ ...result.deps, linkError: result.errors.at(-1) });
  effect();
  await fixture.sdk.auth.getSession();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.requests.length, count, 'A failed link must await a new valid URL, not loop after settingSession becomes false');
});

test('actual password update preserves the draft after a transient SDK exception and accepts a confirmed retry', async () => {
  const fixture = sdkFixture();
  const { data, error } = await fixture.sdk.auth.setSession({ access_token: fixture.token, refresh_token: 'offline-refresh' });
  assert.equal(error, null);
  const result = callbackFixture(fixture);
  result.deps.sessionReady = true;
  result.deps.verifiedSessionRef.current = data.session;
  result.deps.updateRecoveryPassword = (await boundPasswordFactory(fixture.fetch)).updateRecoveryPassword;
  fixture.controls.rejectUpdateResponse = true;
  const update = await resetCallback('handleUpdatePassword', result.deps);
  await update();
  assert.equal(result.busy.at(-1), false);
  assert.deepEqual(result.routes, []);
  assert.ok(!result.messages.some(([, type]) => type === 'success'));
  assert.match(result.errors.at(-1), /bekräftas|uppdatera/);
  assert.equal(result.deps.password, 'OfflineNewPassword123!');
  assert.equal(result.deps.confirmPassword, 'OfflineNewPassword123!');
  assert.match(result.logs.at(-1)?.[0], /^\[auth reset\]/);
  assert.doesNotMatch(JSON.stringify(result.logs), /private-token|OfflineNewPassword|offline-reset@example/);
  fixture.controls.rejectUpdateResponse = false;
  await update();
  assert.deepEqual(result.routes, ['/(tabs)']);
  assert.equal(result.messages.at(-1)?.[1], 'success');
  assert.equal(fixture.requests.filter(row => row.method === 'PUT').length, 2);
});

async function recoveryProofFactory() {
  const ast = await sourceAst('../lib/supabase.ts');
  const statements = ast.statements.filter(node => {
    if (ts.isVariableStatement(node)) return node.declarationList.declarations.some(item => ['passwordRecoverySession', 'passwordRecoverySubscribers'].includes(item.name.getText(ast)));
    if (ts.isFunctionDeclaration(node)) return ['hasPasswordRecoverySession', 'subscribePasswordRecovery'].includes(node.name?.text);
    return ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
      && node.expression.expression.getText(ast) === 'supabase.auth.onAuthStateChange';
  }).map(node => node.getText(ast).replace(/^export /, '')).join('\n');
  assert.match(statements, /function hasPasswordRecoverySession/, 'Actual early recovery proof must exist');
  return compileFactory(`return (supabase, deletedAccountIds = new Set()) => { ${statements}\nreturn { hasPasswordRecoverySession, subscribePasswordRecovery }; };`, {});
}

test('actual SDK consumes the web hash before a later provider while the early proof notifies a mounted view', async () => {
  const attachProof = await recoveryProofFactory();
  const original = { window: globalThis.window, document: globalThis.document, BroadcastChannel: globalThis.BroadcastChannel };
  const fixture = sdkFixture();
  const location = new URL(`http://localhost:8081/reset#access_token=${fixture.token}&refresh_token=offline-refresh&expires_in=3600&token_type=bearer&type=recovery`);
  const document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  globalThis.window = { location, document, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} } };
  globalThis.document = document;
  globalThis.BroadcastChannel = undefined;
  let sdk;
  try {
    sdk = createClient('https://offline-web-recovery.example.test', 'offline-anon', {
      auth: { autoRefreshToken: false, detectSessionInUrl: true, storage: {
        values: new Map(), getItem(key) { return this.values.get(key) ?? null; },
        setItem(key, value) { this.values.set(key, value); }, removeItem(key) { this.values.delete(key); },
      } },
      global: { fetch: async () => new globalThis.Response(JSON.stringify(fixture.user), {
        status: 200, headers: { 'content-type': 'application/json' },
      }) },
    });
    const proof = attachProof(sdk);
    let notifications = 0;
    const unsubscribe = proof.subscribePasswordRecovery(() => { notifications += 1; });
    const received = new Promise(resolve => sdk.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') resolve(); }));
    const { data, error } = await sdk.auth.getSession();
    assert.equal(error, null);
    assert.equal(location.hash, '', 'The installed SDK must consume the link before the screen reads it');
    await received;
    assert.ok(notifications > 0, 'The proof event must wake a view even if its session object did not change');
    assert.equal(proof.hasPasswordRecoverySession(data.session), true);
    let lateRecoveryEvents = 0;
    const { data: late } = sdk.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') lateRecoveryEvents += 1; });
    await sdk.auth.getSession();
    assert.equal(lateRecoveryEvents, 0, 'A provider subscribing after recovery cannot recover the consumed URL event');
    assert.equal(proof.hasPasswordRecoverySession((await sdk.auth.getSession()).data.session), true);
    late.subscription.unsubscribe();
    unsubscribe();
  } finally {
    sdk?.auth.stopAutoRefresh();
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test('recovery proof binds the active SDK session, survives same-user refresh and clears on normal auth transitions', async () => {
  const fixture = sdkFixture();
  const retired = new Set();
  const proof = (await recoveryProofFactory())(fixture.sdk, retired);
  let session = (await fixture.sdk.auth.setSession({ access_token: fixture.token, refresh_token: 'offline-refresh' })).data.session;
  assert.equal(proof.hasPasswordRecoverySession(session), false, 'Explicit native setSession must not manufacture a web PASSWORD_RECOVERY event');
  await fixture.sdk.auth._notifyAllSubscribers('PASSWORD_RECOVERY', session);
  assert.equal(proof.hasPasswordRecoverySession(session), true);
  const stale = session;
  session = (await fixture.sdk.auth.refreshSession()).data.session;
  assert.equal(proof.hasPasswordRecoverySession(session), true);
  assert.equal(proof.hasPasswordRecoverySession(stale), false);
  await fixture.sdk.auth.updateUser({ password: 'OfflineNewPassword123!' });
  assert.equal(proof.hasPasswordRecoverySession(session), false);
  await fixture.sdk.auth._notifyAllSubscribers('PASSWORD_RECOVERY', session);
  await fixture.sdk.auth.signOut({ scope: 'local' });
  assert.equal(proof.hasPasswordRecoverySession(session), false);
  fixture.controls.user = { ...fixture.user, id: '60000000-0000-4000-8000-000000000003' };
  const other = (await fixture.sdk.auth.signInWithPassword({ email: 'other@example.test', password: 'OfflineFixture123!' })).data.session;
  assert.equal(proof.hasPasswordRecoverySession(other), false);
  await fixture.sdk.auth._notifyAllSubscribers('PASSWORD_RECOVERY', stale);
  assert.equal(proof.hasPasswordRecoverySession(other), false, 'A late recovery for A cannot prove the active session B');
  retired.add(stale.user.id);
  assert.equal(proof.hasPasswordRecoverySession(stale), false, 'A retired account cannot regain recovery proof');
});

async function boundPasswordFactory(fetch, sdk = { auth: { onAuthStateChange() {} } }, retired = new Set()) {
  const ast = await sourceAst('../lib/supabase.ts');
  const source = ast.statements.filter(node => {
    if (ts.isVariableStatement(node)) return node.declarationList.declarations.some(item => ['passwordRecoverySession', 'passwordRecoverySubscribers', 'passwordRecoveryAttempt'].includes(item.name.getText(ast)));
    if (ts.isFunctionDeclaration(node)) return ['hasPasswordRecoverySession', 'subscribePasswordRecovery', 'consumePasswordRecoverySession', 'createRecoveryClient', 'verifyRecoverySession', 'updateRecoveryPassword'].includes(node.name?.text);
    return ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
      && node.expression.expression.getText(ast) === 'supabase.auth.onAuthStateChange';
  }).map(node => node.getText(ast).replace(/^export /, '')).join('\n');
  assert.match(source, /function updateRecoveryPassword/, 'Actual account-bound password helper must exist');
  return compileFactory(`${source}\nreturn { verifyRecoverySession, updateRecoveryPassword, hasPasswordRecoverySession, subscribePasswordRecovery };`, {
    createClient, createTimeoutFetch: value => value, fetch,
    supabaseUrl: 'https://offline-bound-recovery.example.test', supabaseAnonKey: 'offline-anon', authStorageKey: 'offline-bound',
    supabase: sdk, deletedAccountIds: retired,
  });
}

test('password update remains bound to verified A when another SDK session changes to B between reads', async () => {
  const fixture = sdkFixture();
  const { data } = await fixture.sdk.auth.setSession({ access_token: fixture.token, refresh_token: 'offline-refresh' });
  const expected = data.session;
  const userB = { ...fixture.user, id: '60000000-0000-4000-8000-000000000003' };
  let primaryReads = 0;
  const getSession = fixture.sdk.auth.getSession.bind(fixture.sdk.auth);
  fixture.sdk.auth.getSession = async () => {
    const result = await getSession();
    primaryReads += 1;
    fixture.controls.user = userB;
    await fixture.sdk.auth.signInWithPassword({ email: 'other@example.test', password: 'OfflineFixture123!' });
    return result;
  };
  const writes = [];
  const bound = await boundPasswordFactory(async (input, init) => {
    assert.equal(new URL(String(input)).pathname, '/auth/v1/user');
    const jwt = new globalThis.Headers(init.headers).get('authorization').split(' ')[1];
    const subject = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url')).sub;
    assert.equal(subject, expected.user.id, 'Every transient verification/write must use verified A');
    if (init.method === 'PUT') writes.push(subject);
    return new globalThis.Response(JSON.stringify(fixture.user), { headers: { 'content-type': 'application/json' } });
  });
  const result = callbackFixture(fixture);
  result.deps.sessionReady = true;
  result.deps.verifiedSessionRef.current = expected;
  result.deps.updateRecoveryPassword = bound.updateRecoveryPassword;
  await (await resetCallback('handleUpdatePassword', result.deps))();
  assert.equal(primaryReads, 2);
  assert.deepEqual(writes, [expected.user.id]);
  assert.equal((await getSession()).data.session.user.id, userB.id, 'The transient update must leave active B storage intact');
  assert.equal(result.messages.at(-1)?.[1], 'success');
  assert.deepEqual(result.routes, ['/(auth)']);
});

test('actual SDK focus recovery preserves the exact recovery session while a fresh normal login clears it', async () => {
  const fixture = sdkFixture();
  const proof = (await recoveryProofFactory())(fixture.sdk);
  const { data } = await fixture.sdk.auth.setSession({ access_token: fixture.token, refresh_token: 'offline-refresh' });
  await fixture.sdk.auth._notifyAllSubscribers('PASSWORD_RECOVERY', data.session);
  await fixture.sdk.auth._recoverAndRefresh();
  assert.equal(proof.hasPasswordRecoverySession(data.session), true, 'Hidden-to-visible uses the same SDK SIGNED_IN session');
  const login = await fixture.sdk.auth.signInWithPassword({ email: 'offline-reset@example.test', password: 'OfflineFixture123!' });
  assert.equal(proof.hasPasswordRecoverySession(login.data.session), false, 'New login token cannot inherit recovery');
});

for (const mismatch of ['verification', 'receipt']) {
  test(`isolated recovery rejects another user in the ${mismatch} without consuming the proof`, async () => {
    const fixture = sdkFixture();
    const { data } = await fixture.sdk.auth.setSession({ access_token: fixture.token, refresh_token: 'offline-refresh' });
    const writes = [];
    const bound = await boundPasswordFactory(async (input, init) => {
      assert.equal(new URL(String(input)).pathname, '/auth/v1/user');
      const updating = init.method === 'PUT';
      if (updating) writes.push('PUT');
      const user = (mismatch === 'verification' && !updating) || (mismatch === 'receipt' && updating)
        ? { ...fixture.user, id: '60000000-0000-4000-8000-000000000003' } : fixture.user;
      return new globalThis.Response(JSON.stringify(user), { headers: { 'content-type': 'application/json' } });
    }, fixture.sdk);
    await fixture.sdk.auth._notifyAllSubscribers('PASSWORD_RECOVERY', data.session);
    await assert.rejects(bound.updateRecoveryPassword(data.session, 'OfflineNewPassword123!'), /account/);
    assert.deepEqual(writes, mismatch === 'verification' ? [] : ['PUT']);
    assert.equal(bound.hasPasswordRecoverySession(data.session), true);
    assert.equal((await fixture.sdk.auth.getSession()).data.session.user.id, fixture.user.id);
  });
}

test('confirmed isolated recovery consumes only its exact proof and notifies a mounted form', async () => {
  const fixture = sdkFixture();
  const { data } = await fixture.sdk.auth.setSession({ access_token: fixture.token, refresh_token: 'offline-refresh' });
  const bound = await boundPasswordFactory(fixture.fetch, fixture.sdk);
  await fixture.sdk.auth._notifyAllSubscribers('PASSWORD_RECOVERY', data.session);
  let notifications = 0;
  const unsubscribe = bound.subscribePasswordRecovery(() => { notifications += 1; });
  await bound.updateRecoveryPassword(data.session, 'OfflineNewPassword123!');
  assert.equal(bound.hasPasswordRecoverySession(data.session), false);
  assert.equal(notifications, 1);
  assert.equal((await fixture.sdk.auth.getSession()).data.session.access_token, data.session.access_token, 'Primary session storage remains untouched');
  unsubscribe();
});

test('confirmed A update leaves a new B recovery proof and active B session untouched', async () => {
  const fixture = sdkFixture();
  const { data } = await fixture.sdk.auth.setSession({ access_token: fixture.token, refresh_token: 'offline-refresh' });
  const expected = data.session;
  const userB = { ...fixture.user, id: '60000000-0000-4000-8000-000000000003' };
  let other;
  let bound;
  bound = await boundPasswordFactory(async (input, init) => {
    assert.equal(new URL(String(input)).pathname, '/auth/v1/user');
    if (init.method === 'PUT') {
      fixture.controls.user = userB;
      other = (await fixture.sdk.auth.signInWithPassword({ email: 'other@example.test', password: 'OfflineFixture123!' })).data.session;
      await fixture.sdk.auth._notifyAllSubscribers('PASSWORD_RECOVERY', other);
    }
    return new globalThis.Response(JSON.stringify(fixture.user), { headers: { 'content-type': 'application/json' } });
  }, fixture.sdk);
  await fixture.sdk.auth._notifyAllSubscribers('PASSWORD_RECOVERY', expected);
  await bound.updateRecoveryPassword(expected, 'OfflineNewPassword123!');
  assert.equal(bound.hasPasswordRecoverySession(other), true);
  assert.equal((await fixture.sdk.auth.getSession()).data.session.user.id, userB.id);
});

test('a late explicit recovery verification for A preserves a newer primary SDK login B', async () => {
  const fixture = sdkFixture();
  await fixture.sdk.auth.getSession();
  const userB = { ...fixture.user, id: '60000000-0000-4000-8000-000000000003' };
  let release;
  let entered;
  const requested = new Promise(resolve => { entered = resolve; });
  const response = new Promise(resolve => { release = resolve; });
  const bound = await boundPasswordFactory(async (input, init) => {
    assert.equal(new URL(String(input)).pathname, '/auth/v1/user');
    assert.equal(init.method, 'GET');
    entered();
    return response;
  }, fixture.sdk);
  const result = callbackFixture(fixture);
  result.deps.verifyRecoverySession = bound.verifyRecoverySession;
  const verification = (await resetCallback('setSession', result.deps))();
  await requested;
  fixture.controls.user = userB;
  const other = (await fixture.sdk.auth.signInWithPassword({ email: 'other@example.test', password: 'OfflineFixture123!' })).data.session;
  await fixture.sdk.auth._notifyAllSubscribers('PASSWORD_RECOVERY', other);
  release(new globalThis.Response(JSON.stringify(fixture.user), { headers: { 'content-type': 'application/json' } }));
  await verification;
  assert.equal(result.deps.verifiedSessionRef.current.user.id, fixture.user.id);
  assert.equal(result.deps.verifiedOriginRef.current, 'link');
  assert.equal(result.ready.at(-1), true);
  assert.equal((await fixture.sdk.auth.getSession()).data.session.user.id, userB.id);
  assert.equal(bound.hasPasswordRecoverySession(other), true, 'An A link verification cannot consume B recovery proof');
});

test('a verified explicit link updates without a primary login and returns to login after confirmation', async () => {
  const fixture = sdkFixture();
  const bound = await boundPasswordFactory(fixture.fetch, fixture.sdk);
  const verified = await bound.verifyRecoverySession({ access_token: fixture.token, refresh_token: 'offline-refresh' });
  assert.equal((await fixture.sdk.auth.getSession()).data.session, null);
  const result = callbackFixture(fixture);
  result.deps.sessionReady = true;
  result.deps.verifiedOriginRef.current = 'link';
  result.deps.verifiedSessionRef.current = verified;
  result.deps.updateRecoveryPassword = bound.updateRecoveryPassword;
  await (await resetCallback('handleUpdatePassword', result.deps))();
  assert.equal(result.messages.at(-1)?.[1], 'success');
  assert.deepEqual(result.routes, ['/(auth)']);
  assert.equal((await fixture.sdk.auth.getSession()).data.session, null, 'Public recovery must not create a primary login');
  assert.equal(fixture.requests.filter(row => row.method === 'PUT').length, 1);
});

test('an older pending explicit link cannot replace a newer link verification', async () => {
  const fixture = sdkFixture();
  let release;
  let entered;
  const requested = new Promise(resolve => { entered = resolve; });
  const response = new Promise(resolve => { release = resolve; });
  const bound = await boundPasswordFactory(async () => { entered(); return response; });
  const result = callbackFixture(fixture);
  result.deps.verifyRecoverySession = bound.verifyRecoverySession;
  const verification = (await resetCallback('setSession', result.deps))();
  await requested;
  result.deps.linkVersionRef.current += 1;
  release(new globalThis.Response(JSON.stringify(fixture.user), { headers: { 'content-type': 'application/json' } }));
  await verification;
  assert.equal(result.deps.verifiedSessionRef.current, null);
  assert.ok(!result.ready.includes(true));
  assert.equal(result.busy.at(-1), false);
});
