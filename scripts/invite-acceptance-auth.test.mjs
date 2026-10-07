import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

async function compileFactory(source, dependencies) {
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => { ${source} };`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

async function loadCallback(file, name, dependencies) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) callback = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && !node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))
    .map(node => node.getText(ast)).join('\n');
  return compileFactory(`${helpers}\nreturn (${callback.getText(ast)});`, dependencies);
}

async function loadPendingAuth(storage) {
  const source = await readFile(new URL('../lib/pendingAuth.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('pendingAuth.ts', source, ts.ScriptTarget.Latest, true);
  const body = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast).replace(/^export /, '')).join('\n');
  return compileFactory(`${body}\nreturn { savePendingJoinCode, loadPendingJoinCode, savePendingOwnerStable };`, {
    Platform: { OS: 'web' }, SecureStore: {}, globalThis: { localStorage: storage },
  });
}

function authFixture(overrides = {}) {
  const calls = [];
  const messages = [];
  const busy = [];
  const deps = {
    canSubmit: true, submitting: false, mode: 'signup', signupIntent: 'join', name: 'QA Invite',
    email: 'recipient@example.test', password: 'SyntheticTest123!', inviteCode: 'INVITE1', stableName: '',
    supabaseConfig: { isConfigured: true },
    setSubmitting: value => busy.push(value), setPendingConfirmEmail: value => calls.push(['confirm', value]),
    toast: { showToast: (message, type) => messages.push({ message, type }) },
    router: { replace: route => calls.push(['navigate', route]) },
    savePendingJoinCode: async (...args) => { calls.push(['saveCode', ...args]); return true; },
    savePendingOwnerStable: async () => true, clearPendingOwnerStable: async () => {},
    generateId: () => 'stable-id', authRedirectUrl: () => 'http://localhost:8081/confirm',
    console: { warn() {} },
    supabase: {
      auth: {
        signUp: async () => { calls.push(['signup']); return { data: { user: { id: 'user-id' }, session: {} }, error: null }; },
        signOut: async () => { calls.push(['signout']); },
      },
      rpc: async name => {
        calls.push(['rpc', name]);
        if (name === 'validate_invite') return { data: true, error: null };
        if (name === 'accept_pending_invites') return { data: 0, error: null };
        return { data: null, error: { message: 'Invalid join code' } };
      },
      from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
    },
    ...overrides,
  };
  return { calls, messages, busy, deps };
}

test('signup leaves invite acceptance to hydration when hydration already consumed the email invite', async () => {
  const { calls, deps } = authFixture();
  const submit = await loadCallback('../app/(auth)/index.tsx', 'handleSubmit', deps);
  await submit();
  assert.equal(calls.some(([name]) => name === 'signout'), false, 'a correctly accepted account must remain signed in');
  assert.deepEqual(calls.filter(([name]) => name === 'rpc'), [['rpc', 'validate_invite']]);
});

test('join signup durably binds the pending code to the email before an immediate auth event', async () => {
  const { calls, deps } = authFixture();
  const submit = await loadCallback('../app/(auth)/index.tsx', 'handleSubmit', deps);
  await submit();
  const savedIndex = calls.findIndex(([name]) => name === 'saveCode');
  assert.ok(savedIndex >= 0 && savedIndex < calls.findIndex(([name]) => name === 'signup'));
  assert.deepEqual(calls[savedIndex], ['saveCode', 'INVITE1', 'recipient@example.test']);
});

test('join signup does not create an account if the pending code cannot be stored', async () => {
  const { calls, deps, messages, busy } = authFixture({ savePendingJoinCode: async () => false });
  const submit = await loadCallback('../app/(auth)/index.tsx', 'handleSubmit', deps);
  await submit();
  assert.equal(calls.some(([name]) => name === 'signup'), false);
  assert.equal(messages.at(-1)?.type, 'error');
  assert.equal(busy.at(-1), false);
});

test('an email recipient can submit join signup without a separate code', async () => {
  const canSubmit = await loadCallback('../app/(auth)/index.tsx', 'canSubmit', {
    mode: 'signup', signupIntent: 'join', name: 'QA Invite', email: 'recipient@example.test',
    password: 'SyntheticTest123!', stableName: '', inviteCode: '',
  });
  assert.equal(canSubmit, true);
});

test('login with an unconfirmed email explains the confirmation step instead of wrong credentials', async () => {
  const { calls, deps, messages } = authFixture({ mode: 'login', supabase: {
    auth: { signInWithPassword: async () => ({ error: { code: 'email_not_confirmed', message: 'Email not confirmed' } }) },
  } });
  const submit = await loadCallback('../app/(auth)/index.tsx', 'handleSubmit', deps);
  await submit();
  assert.deepEqual(calls.find(([name]) => name === 'confirm'), ['confirm', 'recipient@example.test']);
  assert.match(messages.at(-1)?.message, /[Bb]ekräfta/);
});

test('login server outages retain the form and are not described as wrong credentials', async () => {
  const { deps, messages, busy } = authFixture({ mode: 'login', supabase: {
    auth: { signInWithPassword: async () => ({ error: { status: 503, message: 'Service temporarily unavailable' } }) },
  } });
  const submit = await loadCallback('../app/(auth)/index.tsx', 'handleSubmit', deps);
  await submit();
  assert.match(messages.at(-1)?.message, /servern|anslutning/);
  assert.equal(busy.at(-1), false);
});

test('login recovers when the installed Auth SDK rejects a session-storage write', async () => {
  const sensitive = 'Synthetic underlying storage failure with private-access-token';
  const logs = [];
  const sdk = createClient('https://offline-submit.example.test', 'offline-anon', {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, storage: {
      getItem: () => null, removeItem() {}, setItem() { throw new Error(sensitive); },
    } },
    global: { fetch: async input => {
      assert.match(String(input), /\/auth\/v1\/token\?grant_type=password$/);
      return new globalThis.Response(JSON.stringify({ access_token: 'offline-access', refresh_token: 'offline-refresh',
        expires_in: 3600, token_type: 'bearer', user: { id: 'offline-user', aud: 'authenticated',
          email: 'recipient@example.test', app_metadata: {}, user_metadata: {} } }),
      { status: 200, headers: { 'content-type': 'application/json' } });
    } },
  });
  await sdk.auth.getSession();
  const { deps, messages, busy, calls } = authFixture({ mode: 'login', supabase: sdk,
    console: { warn: (...args) => logs.push(args) } });
  await (await loadCallback('../app/(auth)/index.tsx', 'handleSubmit', deps))();
  assert.equal(busy.at(-1), false, 'A storage exception must release the login button.');
  assert.equal(messages.at(-1)?.type, 'error');
  assert.match(messages.at(-1)?.message, /försök igen/i);
  assert.ok(!messages.some(message => message.type === 'success'));
  assert.ok(!calls.some(([name]) => name === 'navigate'));
  assert.match(logs.at(-1)?.[0], /^\[auth submit\]/);
  assert.doesNotMatch(JSON.stringify(logs), /private-access-token|recipient@example|SyntheticTest123/);
});

for (const stage of ['invite lookup', 'owner signup', 'join signup']) {
  test(`signup recovers from a rejected ${stage} without losing its draft`, async () => {
    const logs = [];
    const fixture = authFixture({ signupIntent: stage === 'owner signup' ? 'create' : 'join',
      stableName: 'Offline stable', console: { warn: (...args) => logs.push(args) } });
    if (stage === 'invite lookup') fixture.deps.supabase.rpc = async () => { throw new Error('Synthetic private lookup error'); };
    else fixture.deps.supabase.auth.signUp = async () => { throw new Error('Synthetic private signup error'); };
    await (await loadCallback('../app/(auth)/index.tsx', 'handleSubmit', fixture.deps))();
    assert.equal(fixture.busy.at(-1), false);
    assert.equal(fixture.messages.at(-1)?.type, 'error');
    assert.ok(!fixture.messages.some(message => message.type === 'success'));
    assert.ok(!fixture.calls.some(([name]) => name === 'navigate' || name === 'confirm'));
    assert.equal(fixture.deps.name, 'QA Invite');
    assert.equal(fixture.deps.inviteCode, 'INVITE1');
    assert.match(logs.at(-1)?.[0], /^\[auth submit\]/);
    assert.doesNotMatch(JSON.stringify(logs), /private lookup|private signup|recipient@example|SyntheticTest123/);
  });
}

test('confirmation resend recovers from an exception and keeps the same recipient for retry', async () => {
  const busy = [];
  const messages = [];
  const logs = [];
  let attempts = 0;
  const deps = { pendingConfirmEmail: 'recipient@example.test', resending: false,
    setResending: value => busy.push(value), authRedirectUrl: () => 'http://localhost:8081/confirm',
    supabase: { auth: { resend: async args => {
      assert.equal(args.email, 'recipient@example.test');
      if (++attempts === 1) throw new Error('Synthetic private resend failure');
      return { error: null };
    } } }, toast: { showToast: (...args) => messages.push(args) }, console: { warn: (...args) => logs.push(args) } };
  const resend = await loadCallback('../app/(auth)/index.tsx', 'handleResendConfirmation', deps);
  await resend();
  assert.equal(busy.at(-1), false);
  assert.equal(messages.at(-1)?.[1], 'error');
  assert.match(logs.at(-1)?.[0], /^\[auth resend\]/);
  assert.doesNotMatch(JSON.stringify(logs), /private resend|recipient@example/);
  await resend();
  assert.equal(attempts, 2);
  assert.equal(busy.at(-1), false);
  assert.equal(messages.at(-1)?.[1], 'success');
});

function confirmFixture() {
  const errors = [];
  const verifying = [];
  const routes = [];
  return { errors, verifying, routes, deps: {
    setError: value => errors.push(value), setVerifying: value => verifying.push(value),
    router: { replace: route => routes.push(route) },
    supabase: { auth: { setSession: async () => ({ data: { session: {} }, error: null }) } },
    console: { warn() {} },
  } };
}

test('opening confirmation without a link ends the spinner with instructions', async () => {
  const { deps, errors, verifying, routes } = confirmFixture();
  const apply = await loadCallback('../app/(auth)/confirm.tsx', 'applyUrl', deps);
  await apply(null);
  assert.equal(verifying.at(-1), false);
  assert.match(errors.at(-1), /bekräftelselänk/);
  assert.equal(routes.length, 0);
});

test('an expired confirmation link has a readable Swedish error', async () => {
  const { deps, errors, verifying } = confirmFixture();
  const apply = await loadCallback('../app/(auth)/confirm.tsx', 'applyUrl', deps);
  await apply('stableflow://confirm#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  assert.match(errors.at(-1), /gått ut|ogiltig/);
  assert.equal(verifying.at(-1), false);
});

test('confirmation network failure leaves the link usable and ends the spinner', async () => {
  const { deps, errors, verifying, routes } = confirmFixture();
  deps.supabase.auth.setSession = async () => { throw new Error('Network request failed'); };
  const apply = await loadCallback('../app/(auth)/confirm.tsx', 'applyUrl', deps);
  await apply('stableflow://confirm#access_token=synthetic-access&refresh_token=synthetic-refresh');
  assert.match(errors.at(-1), /anslutning|försök igen/i);
  assert.equal(verifying.at(-1), false);
  assert.equal(routes.length, 0);
});

test('a pending join code can only be claimed by the signup email on this device', async () => {
  const values = new Map();
  const storage = { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key) ?? null };
  const pending = await loadPendingAuth(storage);
  assert.equal(await pending.savePendingJoinCode(' invite1 ', ' Recipient@Example.Test '), true);
  assert.equal(await pending.loadPendingJoinCode('another@example.test'), null);
  assert.equal(await pending.loadPendingJoinCode('recipient@example.test'), 'INVITE1');
  values.set('pending_join_code', 'UNBOUND-OLD-CODE');
  assert.equal(await pending.loadPendingJoinCode('recipient@example.test'), null);
});

test('unavailable web storage cannot be reported as a durable pending-auth write', async () => {
  const pending = await loadPendingAuth(undefined);
  assert.equal(await pending.savePendingJoinCode('INVITE1', 'recipient@example.test'), false);
  assert.equal(await pending.savePendingOwnerStable({ id: 'stable-id', name: 'QA Stable', email: 'recipient@example.test' }), false);
});

async function loadHydrationInviteBlock(dependencies) {
  const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
  const start = Math.min(source.indexOf('        const pendingJoinCode ='), source.indexOf('        const inviteResult ='));
  const end = source.indexOf('        const membershipResult =', start);
  assert.ok(start >= 0 && end > start);
  return compileFactory(`return async () => { ${source.slice(start, end)} };`, dependencies);
}

test('email invitation roles are accepted before trying a pending join code', async () => {
  const calls = [];
  const claim = await loadHydrationInviteBlock({
    authEmail: 'recipient@example.test',
    loadPendingJoinCode: async email => { calls.push(['load', email]); return 'INVITE1'; },
    clearPendingJoinCode: async () => { calls.push(['clear']); },
    supabase: { rpc: async name => {
      calls.push(['rpc', name]);
      return name === 'accept_pending_invites'
        ? { data: 1, error: null }
        : { data: null, error: { message: 'Invalid join code' } };
    } },
    console: { warn() {} }, showToast() {}, fail: reason => ({ success: false, reason }),
  });
  await claim();
  assert.deepEqual(calls.filter(([name]) => name === 'rpc'), [['rpc', 'accept_pending_invites'], ['rpc', 'accept_join_code']]);
  assert.deepEqual(calls.find(([name]) => name === 'load'), ['load', 'recipient@example.test']);
  assert.equal(calls.filter(([name]) => name === 'clear').length, 1);
});

test('accepting an email invite does not discard a generic code for another stable', async () => {
  const memberships = [];
  let cleared = false;
  const claim = await loadHydrationInviteBlock({
    authEmail: 'recipient@example.test', loadPendingJoinCode: async () => 'STABLE_B',
    clearPendingJoinCode: async () => { cleared = true; },
    supabase: { rpc: async (name, args) => {
      if (name === 'accept_pending_invites') {
        memberships.push({ stable: 'stable-a', role: 'staff', access: 'edit' });
        return { data: 1, error: null };
      }
      assert.equal(args.p_code, 'STABLE_B');
      memberships.push({ stable: 'stable-b', role: 'rider', access: 'view' });
      return { data: 'stable-b', error: null };
    } },
    console: { warn() {} }, fail: reason => ({ success: false, reason }),
  });
  await claim();
  assert.deepEqual(memberships, [
    { stable: 'stable-a', role: 'staff', access: 'edit' },
    { stable: 'stable-b', role: 'rider', access: 'view' },
  ]);
  assert.equal(cleared, true);
});

test('a generic code outage after email acceptance retains the code for retry', async () => {
  let cleared = false;
  const claim = await loadHydrationInviteBlock({
    authEmail: 'recipient@example.test', loadPendingJoinCode: async () => 'STABLE_B',
    clearPendingJoinCode: async () => { cleared = true; },
    supabase: { rpc: async name => name === 'accept_pending_invites'
      ? { data: 1, error: null }
      : { data: null, error: { message: 'Synthetic connection failure' } } },
    console: { warn() {} }, fail: reason => ({ success: false, reason }),
  });
  const result = await claim();
  assert.equal(result?.success, false);
  assert.equal(cleared, false);
});

test('an unavailable invite accept preserves the pending code and exposes retryable refresh failure', async () => {
  let cleared = false;
  const claim = await loadHydrationInviteBlock({
    authEmail: 'recipient@example.test', loadPendingJoinCode: async () => 'INVITE1',
    clearPendingJoinCode: async () => { cleared = true; },
    supabase: { rpc: async () => ({ data: null, error: { message: 'Network request failed' } }) },
    console: { warn() {} }, showToast() {}, fail: reason => ({ success: false, reason }),
  });
  const result = await claim();
  assert.equal(result?.success, false);
  assert.equal(cleared, false);
});

test('joining by code distinguishes an unavailable server from an invalid code', async () => {
  const join = await loadCallback('../context/AppDataContext.tsx', 'joinStableByCode', {
    supabase: { rpc: async () => ({ data: null, error: { message: 'Failed to fetch' } }) }, console: { warn() {} },
  });
  const result = await join('STABLE1');
  assert.equal(result.success, false);
  assert.match(result.reason, /anslutning|servern/i);
  assert.doesNotMatch(result.reason, /ogiltig/i);
});

test('an invalid join code explains requesting a new code', async () => {
  const join = await loadCallback('../context/AppDataContext.tsx', 'joinStableByCode', {
    supabase: { rpc: async () => ({ data: null, error: { message: 'Invalid join code' } }) }, console: { warn() {} },
  });
  const result = await join('INVALID');
  assert.match(result.reason, /ogiltig/);
  assert.match(result.reason, /ny kod|ny inbjudan/);
});

test('reloading pending invitations after a read failure preserves the displayed invitations', async () => {
  const lists = [];
  const load = await loadCallback('../app/(onboarding)/join.tsx', 'loadInvites', {
    setLoadingInvites() {}, setInvitesError() {}, setPendingInvites: rows => lists.push(rows),
    supabase: {
      auth: { getUser: async () => ({ data: { user: { email: 'recipient@example.test' } }, error: null }) },
      from: () => ({ select: () => ({ eq: () => ({ is: async () => ({ data: null, error: { message: 'Synthetic read failure' } }) }) }) }),
    }, console: { warn() {} },
  });
  await load();
  assert.equal(lists.length, 0, 'a failed fetch must not replace the last displayed invitations with an empty state');
});

test('an acceptance error remains visible after pending invitations refresh', async () => {
  const errors = [];
  const accept = await loadCallback('../app/(onboarding)/join.tsx', 'handleAcceptInvites', {
    pendingInvites: [{ id: 'invite-id' }], state: { stables: [] },
    setAcceptingInvites() {}, setInvitesError: value => errors.push(value),
    actions: { acceptPendingInvites: async () => ({ success: false, reason: 'Kunde inte acceptera inbjudningar. Försök igen.' }) },
    loadInvites: async () => errors.push(null),
  });
  await accept();
  assert.equal(errors.at(-1), 'Kunde inte acceptera inbjudningar. Försök igen.');
});
