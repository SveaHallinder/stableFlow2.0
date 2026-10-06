import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

// Execute the real callback with synthetic responses; never invoke Supabase.
async function loadDeleteCallback(dependencies) {
  const source = await readFile(new URL('../app/settings/account.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('account.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AccountSettingsScreen');
  const declaration = component.body.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === 'handleDeleteAccount');
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

function setup(invoke, overrides = {}) {
  const state = { deleting: false, confirmingDelete: true, toasts: [], calls: [], logs: [] };
  return { state, dependencies: {
    deleting: false, confirmingDelete: true, deletingRef: { current: false },
    AbortController: globalThis.AbortController, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    setDeleting: value => { state.deleting = value; },
    setConfirmingDelete: value => { state.confirmingDelete = value; },
    supabase: { functions: { invoke: (...args) => { state.calls.push(['invoke', ...args]); return invoke(...args); } } },
    toast: { showToast: (...args) => state.toasts.push(args) },
    signOut: async () => { state.calls.push(['signOut']); },
    router: { replace: route => state.calls.push(['replace', route]) },
    console: { warn: (...args) => state.logs.push(args) },
    ...overrides,
  } };
}

function assertUnconfirmed(state) {
  assert.equal(state.deleting, false);
  assert.equal(state.confirmingDelete, false);
  assert.equal(state.toasts.length, 1);
  assert.equal(state.toasts[0][1], 'error');
  assert.match(state.toasts[0][0], /bekräftas/);
  assert.ok(!state.calls.some(([method]) => method === 'signOut' || method === 'replace'));
}

test('account deletion recovers from a network/timeout error whose context is not a Response', async () => {
  const { state, dependencies } = setup(async () => ({ data: null, error: {
    name: 'FunctionsFetchError', context: new Error('Synthetic request timed out'),
  } }));
  await (await loadDeleteCallback(dependencies))();
  assertUnconfirmed(state);
});

test('account deletion catches a rejected invocation and resets the confirmation', async () => {
  const { state, dependencies } = setup(async () => { throw new Error('Synthetic invocation exception'); });
  await (await loadDeleteCallback(dependencies))();
  assertUnconfirmed(state);
  assert.match(state.logs[0][0], /^\[account delete\]/);
});

test('account deletion accepts only an explicit deleted=true acknowledgement', async () => {
  for (const data of [null, undefined, {}, { deleted: false }, { deleted: 'true' }, { skipped: 'not_configured' }]) {
    const { state, dependencies } = setup(async () => ({ data, error: null }));
    await (await loadDeleteCallback(dependencies))();
    assertUnconfirmed(state);
  }
});

test('account deletion handles an absent or malformed error response body', async () => {
  for (const context of [undefined, { json: 'not callable' }, { json: () => { throw new Error('Synthetic parser exception'); } },
    new globalThis.Response('Invalid JSON', { status: 500 })]) {
    const { state, dependencies } = setup(async () => ({ data: null, error: { context } }));
    await (await loadDeleteCallback(dependencies))();
    assertUnconfirmed(state);
  }
});

test('account deletion explains the last-owner block even for a one-member stable', async () => {
  const { state, dependencies } = setup(async () => ({ data: null, error: {
    context: new globalThis.Response(JSON.stringify({ error: 'sole_owner' }), { status: 409 }),
  } }));
  await (await loadDeleteCallback(dependencies))();
  assert.equal(state.deleting, false);
  assert.equal(state.confirmingDelete, false);
  assert.equal(state.toasts[0][1], 'error');
  assert.match(state.toasts[0][0], /Utse en ny ägare/);
  assert.doesNotMatch(state.toasts[0][0], /fler medlemmar/);
  assert.ok(!state.calls.some(([method]) => method === 'signOut'));
});

test('account deletion waits for acknowledgement before reporting success and leaving the session', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const { state, dependencies } = setup(() => pending);
  const callback = await loadDeleteCallback(dependencies);
  const operation = callback();
  assert.equal(state.deleting, true);
  assert.equal(state.toasts.length, 0);
  assert.equal(state.calls.length, 1);
  const options = state.calls[0][2];
  assert.equal(options.method, 'POST');
  assert.ok(options.signal instanceof globalThis.AbortSignal);
  finish({ data: { deleted: true }, error: null });
  await operation;
  assert.deepEqual(state.toasts, [['Ditt konto har raderats.', 'success']]);
  assert.deepEqual(state.calls, [['invoke', 'delete-account', options], ['signOut'], ['replace', '/(auth)']]);
  assert.equal(state.deleting, false);
  assert.equal(state.confirmingDelete, false);
});

test('account deletion aborts a never-responding invocation at 15 seconds with a fake timer', { timeout: 2000 }, async () => {
  const timers = [];
  const cleared = [];
  let signal;
  const { state, dependencies } = setup((_name, options) => new Promise(resolve => {
    signal = options.signal;
    signal?.addEventListener('abort', () => resolve({ data: null, error: {
      name: 'FunctionsFetchError', context: new Error('Synthetic aborted request'),
    } }), { once: true });
  }), {
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return 'fake-delete-timeout'; },
    clearTimeout: id => cleared.push(id),
  });
  const operation = (await loadDeleteCallback(dependencies))();
  assert.equal(state.deleting, true);
  assert.equal(state.toasts.length, 0);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 15_000);
  assert.equal(signal.aborted, false);
  timers[0].callback();
  await operation;
  assert.equal(signal.aborted, true);
  assert.deepEqual(cleared, ['fake-delete-timeout']);
  assert.equal(dependencies.deletingRef.current, false);
  assertUnconfirmed(state);
});

test('account deletion blocks a second confirmation before React can render', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const { state, dependencies } = setup(() => pending);
  const callback = await loadDeleteCallback(dependencies);
  const first = callback();
  const second = callback();
  try {
    assert.equal(state.calls.length, 1);
    assert.equal(dependencies.deletingRef.current, true);
  } finally {
    finish({ data: { deleted: true }, error: null });
    await Promise.all([first, second]);
  }
  assert.equal(dependencies.deletingRef.current, false);
});

test('account deletion requires confirmation and respects an in-flight deletion', async () => {
  for (const overrides of [{ confirmingDelete: false }, { deleting: true }]) {
    const { state, dependencies } = setup(() => { throw new Error('Should not invoke'); }, overrides);
    await (await loadDeleteCallback(dependencies))();
    assert.equal(state.calls.length, 0);
    assert.equal(state.toasts.length, 0);
  }
});
