import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

async function sendCallback(dependencies) {
  const file = '../app/(auth)/forgot-password.tsx';
  const ast = ts.createSourceFile(file, await readFile(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleSend') callback = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(callback, 'Exercise the actual recovery-link callback.');
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback.getText(ast)});`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

function fixture(overrides = {}) {
  const busy = [], messages = [], errors = [], logs = [], toasts = [];
  const dependencies = {
    email: '  offline-forgot@example.test  ', submitting: false,
    supabaseConfig: { isConfigured: true },
    setSubmitting: value => busy.push(value), setMessage: value => messages.push(value),
    setFormError: value => errors.push(value),
    authRedirectUrl: () => 'http://localhost:8081/reset',
    toast: { showToast: (...args) => toasts.push(args) }, console: { warn: (...args) => logs.push(args) },
    ...overrides,
  };
  return { busy, messages, errors, logs, toasts, dependencies };
}

test('recovery-link form releases busy state after an installed SDK storage exception and can retry', async () => {
  let attempts = 0, rejectCleanup = false;
  const sdk = createClient('https://offline-forgot.example.test', 'offline-anon', {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, storage: {
      getItem: () => null, setItem() {}, removeItem(key) {
        if (rejectCleanup && key.endsWith('-code-verifier')) throw new Error('private-email-and-token cleanup failure');
      },
    } },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, '/auth/v1/recover');
      assert.equal(url.searchParams.get('redirect_to'), 'http://localhost:8081/reset');
      assert.equal(JSON.parse(init.body).email, 'offline-forgot@example.test');
      attempts += 1;
      return new globalThis.Response(JSON.stringify(attempts === 1 ? { message: 'private provider error', code: 'offline_failure' } : {}), {
        status: attempts === 1 ? 503 : 200, headers: { 'content-type': 'application/json' },
      });
    } },
  });
  await sdk.auth.getSession();
  rejectCleanup = true;
  const state = fixture({ supabase: sdk });
  const send = await sendCallback(state.dependencies);
  await send();
  assert.deepEqual(state.busy, [true, false]);
  assert.match(state.errors.at(-1), /försök igen/i);
  assert.equal(state.toasts.at(-1)?.[1], 'error');
  assert.equal(state.messages.at(-1), null, 'A failed request must not claim a link was sent.');
  assert.match(state.logs.at(-1)?.[0], /^\[auth forgot-password\]/);
  assert.doesNotMatch(JSON.stringify(state.logs), /private|offline-forgot@/);
  rejectCleanup = false;
  await send();
  assert.equal(attempts, 2);
  assert.equal(state.busy.at(-1), false);
  assert.equal(state.errors.at(-1), null);
  assert.match(state.messages.at(-1), /om adressen har ett konto/i);
  assert.equal(state.dependencies.email, '  offline-forgot@example.test  ');
});

for (const status of [503, 429]) {
  test(`recovery-link form handles SDK error ${status} without exposing provider details`, async () => {
    const state = fixture({ supabase: { auth: { resetPasswordForEmail: async () => ({ error: {
      name: 'AuthApiError', status, message: 'private-email-and-token provider detail',
    } }) } } });
    await (await sendCallback(state.dependencies))();
    assert.deepEqual(state.busy, [true, false]);
    assert.equal(state.toasts.at(-1)?.[1], 'error');
    assert.match(state.errors.at(-1), status === 429 ? /vänta en stund/i : /försök igen/i);
    assert.equal(state.messages.at(-1), null);
    assert.doesNotMatch(JSON.stringify([state.toasts, state.errors, state.logs]), /private-email-and-token|offline-forgot@/);
  });
}

test('invalid addresses and missing configuration do not request a recovery email', async () => {
  for (const overrides of [{ email: '' }, { email: 'invalid' }, { supabaseConfig: { isConfigured: false } }]) {
    let requests = 0;
    const state = fixture({ supabase: { auth: { resetPasswordForEmail: async () => { requests += 1; } } }, ...overrides });
    await (await sendCallback(state.dependencies))();
    assert.equal(requests, 0);
    assert.deepEqual(state.busy, []);
    assert.equal(state.toasts.at(-1)?.[1], 'error');
    assert.doesNotMatch(state.toasts.at(-1)?.[0], /Supabase|Expo|\.env/);
  }
});
