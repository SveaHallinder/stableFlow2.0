import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { createClient, navigatorLock, processLock } from '@supabase/supabase-js';
import ts from 'typescript';

// Production callbacks, session storage and the installed SDK use only synthetic
// Auth transports. These tests never change a real password or email address.
const actor = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let fixtureNumber = 0;
function session(id) {
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: id, exp: 4102444800 }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.synthetic-signature';
  return { access_token: token, refresh_token: 'synthetic-refresh', expires_at: 4102444800,
    expires_in: 3600, token_type: 'bearer', user: { id, aud: 'authenticated', role: 'authenticated',
      email: id === actor ? 'synthetic-a@example.test' : 'synthetic-b@example.test',
      app_metadata: {}, user_metadata: {}, created_at: '2026-10-07T00:00:00Z' } };
}
async function loadCallback(kind, dependencies) {
  const source = await readFile(new URL('../app/settings/account.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('account.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AccountSettingsScreen');
  const declaration = component.body.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === `handleChange${kind}`);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${declaration.initializer.arguments[0].getText(ast)});`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}
async function setup() {
  const values = new Map();
  const project = `synthetic-security-${++fixtureNumber}`;
  const key = `sb-${project}-auth-token`;
  const captured = deferred();
  const releaseCapture = deferred();
  const verifying = deferred();
  const releaseVerification = deferred();
  const controls = { rejectStorage: false, rejectResponse: false, serverError: false,
    pauseCapture: false, captureHeld: false, pauseVerification: false, verificationHeld: false,
    verificationId: null, acknowledgementId: null };
  const requests = [];
  const fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/token') {
      assert.equal(init.method, 'POST');
      return new globalThis.Response(JSON.stringify(session(other)), { headers: { 'content-type': 'application/json' } });
    }
    assert.equal(url.pathname, '/auth/v1/user', 'Unexpected backend traffic must fail the offline fixture');
    const updating = init?.method === 'PUT';
    const authorization = new globalThis.Headers(init.headers).get('authorization');
    assert.ok([actor, other].some(id => authorization === `Bearer ${session(id).access_token}`));
    const id = authorization === `Bearer ${session(actor).access_token}` ? actor : other;
    requests.push({ method: init?.method ?? 'GET', id, attributes: updating ? JSON.parse(init.body) : null, url: url.href });
    if (!updating && controls.pauseVerification && !controls.verificationHeld) {
      controls.verificationHeld = true;
      verifying.resolve();
      await releaseVerification.promise;
    }
    const rejected = updating && controls.serverError;
    const response = new globalThis.Response(JSON.stringify(rejected
      ? { message: 'private-password-and-token provider failure', code: 'validation_failed' }
      : session((updating ? controls.acknowledgementId : controls.verificationId) ?? id).user), {
      status: rejected ? 400 : 200, headers: { 'content-type': 'application/json' },
    });
    if (updating && controls.rejectResponse) response.json = async () => { throw new Error('private-password-and-token response failure'); };
    return response;
  };
  const source = await readFile(new URL('../lib/supabase.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('supabase.ts', source, ts.ScriptTarget.Latest, true);
  const body = ast.statements.filter(node => !ts.isImportDeclaration(node))
    .map(node => node.getText(ast).replace(/^export\s+/, '')).join('\n');
  const sdkDependencies = {
    navigatorLock, processLock, Platform: { OS: 'ios' }, Constants: {},
    SecureStore: {
      getItemAsync: async storageKey => {
        if (controls.rejectStorage && storageKey === key) throw new Error('private-password-and-token storage failure');
        if (controls.pauseCapture && !controls.captureHeld && storageKey === key) {
          controls.captureHeld = true;
          captured.resolve();
          await releaseCapture.promise;
        }
        return values.get(storageKey) ?? null;
      },
      setItemAsync: async (storageKey, value) => { values.set(storageKey, value); },
      deleteItemAsync: async storageKey => { values.delete(storageKey); },
    },
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: `https://${project}.example.test`, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon' } },
    __DEV__: false, fetch, createTimeoutFetch: transport => transport,
    createClient: (url, anon, options) => createClient(url, anon, {
      ...options, auth: { ...options.auth, autoRefreshToken: false, detectSessionInUrl: false },
    }),
  };
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(sdkDependencies).join(', ')} }) => {
    ${body}
    return { supabase, updateAccountSecurity, markDeletedAccountSession };
  };`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const module = (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(sdkDependencies);
  await module.supabase.auth.getSession();
  const initialized = await module.supabase.auth.setSession(session(actor));
  assert.equal(initialized.error, null);
  const state = { busy: [], messages: [], logs: [], resets: 0,
    security: { userId: actor, newPassword: 'SyntheticPassword123!', confirmPassword: 'SyntheticPassword123!', newEmail: 'synthetic-new@example.test' } };
  const dependencies = {
    savingPassword: false, savingEmail: false, security: state.security, user: session(actor).user,
    securityAccountRef: { current: { userId: actor } }, updateAccountSecurity: module.updateAccountSecurity,
    setSavingPassword: value => state.busy.push(value), setSavingEmail: value => state.busy.push(value),
    setSecurity: update => { state.resets += 1; state.security = typeof update === 'function' ? update(state.security) : update; },
    toast: { showToast: (...args) => state.messages.push(args) },
    authRedirectUrl: path => `https://synthetic.example.test/${path}`,
    console: { warn: (...args) => state.logs.push(args) },
  };
  return { ...module, state, dependencies, controls, requests, values, key, captured, releaseCapture, verifying, releaseVerification,
    loginOther: async () => {
      const result = await module.supabase.auth.signInWithPassword({ email: 'synthetic-b@example.test', password: 'synthetic-login' });
      assert.equal(result.data.user.id, other);
    } };
}
function assertRetainedError(fixture, original) {
  assert.deepEqual(fixture.state.busy, [true, false]);
  assert.deepEqual(fixture.state.security, original);
  assert.equal(fixture.state.resets, 0);
  assert.deepEqual(fixture.state.messages.map(([, severity]) => severity), ['error']);
  assert.doesNotMatch(JSON.stringify(fixture.state.logs), /private-password-and-token|SyntheticPassword|synthetic-a@|synthetic-new@|synthetic-refresh/);
}
for (const kind of ['Password', 'Email']) {
  test(`${kind.toLowerCase()} update recovers after actual SDK session capture rejects storage and permits a verified retry`, async () => {
    const fixture = await setup();
    const original = { ...fixture.state.security };
    fixture.controls.rejectStorage = true;
    const callback = await loadCallback(kind, fixture.dependencies);
    await callback();
    assertRetainedError(fixture, original);
    assert.match(fixture.state.logs[0][0], kind === 'Password' ? /^\[account password\]/ : /^\[account email\]/);
    assert.equal(fixture.requests.filter(request => request.method === 'PUT').length, 0);
    fixture.controls.rejectStorage = false;
    await callback();
    assert.deepEqual(fixture.state.busy, [true, false, true, false]);
    assert.deepEqual(fixture.state.messages.map(([, severity]) => severity), ['error', 'success']);
    assert.deepEqual(fixture.state.security, kind === 'Password'
      ? { ...original, newPassword: '', confirmPassword: '' } : { ...original, newEmail: '' });
    const writes = fixture.requests.filter(request => request.method === 'PUT');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].id, actor);
    assert.equal(writes[0].attributes[kind === 'Password' ? 'password' : 'email'], kind === 'Password' ? original.newPassword : original.newEmail);
    if (kind === 'Email') assert.match(writes[0].url, /redirect_to=https%3A%2F%2Fsynthetic\.example\.test%2Fconfirm/);
  });
  for (const failure of ['rejectResponse', 'serverError']) {
    test(`${kind.toLowerCase()} update retains its draft after isolated SDK ${failure}`, async () => {
      const fixture = await setup();
      const original = { ...fixture.state.security };
      fixture.controls[failure] = true;
      await (await loadCallback(kind, fixture.dependencies))();
      assertRetainedError(fixture, original);
      assert.doesNotMatch(JSON.stringify(fixture.state.messages), /private-password-and-token/);
    });
  }
  test(`${kind.toLowerCase()} update cannot change B when B signs in while actual SDK session capture is waiting`, async () => {
    const fixture = await setup();
    const original = { ...fixture.state.security };
    fixture.controls.pauseCapture = true;
    const update = (await loadCallback(kind, fixture.dependencies))();
    await fixture.captured.promise;
    await fixture.loginOther();
    const persisted = fixture.values.get(fixture.key);
    fixture.releaseCapture.resolve();
    await update;
    assertRetainedError(fixture, original);
    assert.equal(fixture.requests.filter(request => request.method === 'PUT').length, 0);
    assert.equal(fixture.values.get(fixture.key), persisted);
  });
  for (const failure of [false, true]) {
    test(`late ${kind.toLowerCase()} ${failure ? 'failure' : 'success'} for A preserves B's SDK session and form`, async () => {
      const fixture = await setup();
      fixture.controls.pauseVerification = true;
      const update = (await loadCallback(kind, fixture.dependencies))();
      await fixture.verifying.promise;
      await fixture.loginOther();
      const persisted = fixture.values.get(fixture.key);
      fixture.dependencies.securityAccountRef.current = { userId: other };
      fixture.state.security = { userId: other, newPassword: 'B draft', confirmPassword: 'B draft', newEmail: 'b-draft@example.test' };
      const bDraft = { ...fixture.state.security };
      fixture.controls.serverError = failure;
      fixture.releaseVerification.resolve();
      await update;
      assert.deepEqual(fixture.requests.filter(request => request.method === 'PUT').map(request => request.id), [actor]);
      assert.equal(fixture.values.get(fixture.key), persisted);
      assert.deepEqual(fixture.state.security, bDraft);
      assert.equal(fixture.state.resets, 0);
      assert.deepEqual(fixture.state.messages, []);
      assert.deepEqual(fixture.state.busy, [true]);
    });
  }
  for (const mismatch of ['verificationId', 'acknowledgementId']) {
    test(`${kind.toLowerCase()} update cannot acknowledge a different server UID in ${mismatch}`, async () => {
      const fixture = await setup();
      const original = { ...fixture.state.security };
      const persisted = fixture.values.get(fixture.key);
      fixture.controls[mismatch] = other;
      await (await loadCallback(kind, fixture.dependencies))();
      assertRetainedError(fixture, original);
      assert.equal(fixture.requests.filter(request => request.method === 'PUT').length, mismatch === 'verificationId' ? 0 : 1);
      assert.equal(fixture.values.get(fixture.key), persisted);
    });
  }
  test(`${kind.toLowerCase()} update cannot write to an account retired during server verification`, async () => {
    const fixture = await setup();
    const original = { ...fixture.state.security };
    fixture.controls.pauseVerification = true;
    const update = (await loadCallback(kind, fixture.dependencies))();
    await fixture.verifying.promise;
    fixture.markDeletedAccountSession(actor);
    fixture.releaseVerification.resolve();
    await update;
    assertRetainedError(fixture, original);
    assert.equal(fixture.requests.filter(request => request.method === 'PUT').length, 0);
  });
  test(`a late ${kind.toLowerCase()} acknowledgement cannot clear a newer A draft after A to B to A`, async () => {
    const fixture = await setup();
    fixture.controls.pauseVerification = true;
    const update = (await loadCallback(kind, fixture.dependencies))();
    await fixture.verifying.promise;
    fixture.dependencies.securityAccountRef.current = { userId: other };
    fixture.dependencies.securityAccountRef.current = { userId: actor };
    fixture.state.security = { userId: actor, newPassword: 'New A draft', confirmPassword: 'New A draft', newEmail: 'new-a@example.test' };
    const newDraft = { ...fixture.state.security };
    fixture.releaseVerification.resolve();
    await update;
    assert.deepEqual(fixture.state.security, newDraft);
    assert.deepEqual(fixture.state.messages, []);
    assert.deepEqual(fixture.state.busy, [true]);
  });
  test(`a ${kind.toLowerCase()} draft from A cannot be submitted in B's first render before reset`, async () => {
    const fixture = await setup();
    await fixture.loginOther();
    fixture.dependencies.user = session(other).user;
    fixture.dependencies.securityAccountRef.current = { userId: other };
    await (await loadCallback(kind, fixture.dependencies))();
    assert.equal(fixture.requests.filter(request => request.method === 'PUT').length, 0);
    assert.deepEqual(fixture.state.busy, []);
    assert.deepEqual(fixture.state.messages, []);
  });
}

async function loadSecurityEffect(dependencies) {
  const source = await readFile(new URL('../app/settings/account.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('account.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AccountSettingsScreen');
  const effect = component.body.statements.filter(ts.isExpressionStatement).map(node => node.expression)
    .find(node => ts.isCallExpression(node) && node.expression.getText(ast) === 'React.useEffect'
      && node.arguments[0].getText(ast).includes("newPassword: '', confirmPassword: '', newEmail: ''")).arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${effect});`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

test('actual account-change effect clears old security drafts and releases both waiting states', async () => {
  const fixture = await setup();
  fixture.dependencies.user = session(other).user;
  const effect = await loadSecurityEffect(fixture.dependencies);
  const cleanup = effect();
  assert.deepEqual(fixture.state.security, { userId: other, newPassword: '', confirmPassword: '', newEmail: '' });
  assert.deepEqual(fixture.state.busy, [false, false]);
  cleanup();
  assert.equal(fixture.dependencies.securityAccountRef.current.userId, undefined);
  const strictModeCleanup = effect();
  assert.equal(fixture.dependencies.securityAccountRef.current.userId, other);
  strictModeCleanup();
});

for (const kind of ['Password', 'Email']) {
  for (const failure of [false, true]) {
    test(`unmounted ${kind.toLowerCase()} ${failure ? 'failure' : 'success'} cannot publish a toast or setter in the next account`, async () => {
      const fixture = await setup();
      const original = { ...fixture.state.security };
      const cleanup = (await loadSecurityEffect(fixture.dependencies))();
      Object.assign(fixture.state.security, original);
      fixture.controls.pauseVerification = true;
      const update = (await loadCallback(kind, fixture.dependencies))();
      await fixture.verifying.promise;
      cleanup();
      await fixture.loginOther();
      const persisted = fixture.values.get(fixture.key);
      const stateAtUnmount = JSON.parse(JSON.stringify(fixture.state));
      fixture.controls.serverError = failure;
      fixture.releaseVerification.resolve();
      await update;
      assert.deepEqual(fixture.state.security, stateAtUnmount.security);
      assert.deepEqual(fixture.state.busy, stateAtUnmount.busy);
      assert.equal(fixture.state.resets, stateAtUnmount.resets);
      assert.deepEqual(fixture.state.messages, []);
      assert.equal(fixture.values.get(fixture.key), persisted);
    });
  }
}
