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

async function loadRecovery(pendingAccountDeletionId, user) {
  const source = await readFile(new URL('../app/settings/account.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('account.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AccountSettingsScreen');
  const declarations = component.body.statements.filter(ts.isVariableStatement).filter(node =>
    node.declarationList.declarations.some(declaration => ['deletedAccountRef', '[needsSessionCleanup, setNeedsSessionCleanup]'].includes(declaration.name.getText(ast))));
  const effect = component.body.statements.filter(ts.isExpressionStatement).map(node => node.expression)
    .find(node => ts.isCallExpression(node) && node.expression.getText(ast) === 'React.useEffect'
      && node.arguments[0].getText(ast).includes('pendingAccountDeletionId &&')).arguments[0].getText(ast);
  const state = {};
  const React = { useRef: current => ({ current }), useState: initial => {
    state.needsSessionCleanup = initial; return [initial, value => { state.needsSessionCleanup = value; }];
  } };
  const { outputText } = ts.transpileModule(`export default ({ React, pendingAccountDeletionId, user }) => {
    ${declarations.map(node => node.getText(ast)).join('\n')}
    return { deletedAccountRef, update: (pendingAccountDeletionId, user) => (${effect})() };
  };`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const recovery = (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`))
    .default({ React, pendingAccountDeletionId, user });
  return { ...recovery, state };
}

function setup(invoke, overrides = {}) {
  const state = { deleting: false, confirmingDelete: true, toasts: [], calls: [], logs: [], needsSessionCleanup: false };
  return { state, dependencies: {
    deleting: false, confirmingDelete: true, deletingRef: { current: false }, deletedAccountRef: { current: null },
    user: { id: 'offline-deleted-account' },
    AbortController: globalThis.AbortController, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    setDeleting: value => { state.deleting = value; },
    setConfirmingDelete: value => { state.confirmingDelete = value; },
    setNeedsSessionCleanup: value => { state.needsSessionCleanup = value; },
    supabase: { functions: { invoke: (...args) => { state.calls.push(['invoke', ...args]); return invoke(...args); } } },
    toast: { showToast: (...args) => state.toasts.push(args) },
    signOut: async () => { state.calls.push(['signOut']); },
    finishAccountDeletion: async id => { state.calls.push(['finishAccountDeletion', id]); return true; },
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
  for (const data of [null, undefined, {}, { deleted: false }, { deleted: 'true' }, { skipped: 'not_configured' },
    { deleted: true }, { deleted: true, user_id: 'other-account' }]) {
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
  assert.deepEqual(options.body, { expected_user_id: dependencies.user.id });
  assert.ok(options.signal instanceof globalThis.AbortSignal);
  finish({ data: { deleted: true, user_id: dependencies.user.id }, error: null });
  await operation;
  assert.deepEqual(state.toasts, [['Ditt konto har raderats.', 'success']]);
  assert.deepEqual(state.calls, [['invoke', 'delete-account', options], ['finishAccountDeletion', dependencies.user.id], ['replace', '/(auth)']]);
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

test('verified account deletion does not wait for remote logout or push cleanup', async () => {
  let release;
  const { state, dependencies } = setup(async () => ({ data: { deleted: true, user_id: 'offline-deleted-account' }, error: null }), {
    signOut: () => new Promise(resolve => { release = resolve; }),
  });
  const operation = (await loadDeleteCallback(dependencies))();
  let completed = false;
  operation.then(() => { completed = true; });
  try {
    for (let tick = 0; tick < 8; tick++) await Promise.resolve();
    assert.equal(completed, true, 'A verified deletion must finish without remote logout.');
    assert.ok(state.calls.some(([method]) => method === 'finishAccountDeletion'));
    assert.ok(state.calls.some(([method]) => method === 'replace'));
  } finally {
    release?.();
    await operation;
  }
});

test('the verification deadline settles a transport that ignores abort', async () => {
  const timers = [];
  let release;
  const { state, dependencies } = setup(() => new Promise(resolve => { release = resolve; }), {
    setTimeout: callback => { timers.push(callback); return 'offline-timeout'; }, clearTimeout: () => {},
  });
  const operation = (await loadDeleteCallback(dependencies))();
  let completed = false;
  operation.then(() => { completed = true; });
  try {
    timers[0]();
    for (let tick = 0; tick < 8; tick++) await Promise.resolve();
    assert.equal(completed, true, 'Abort alone does not settle a nonstandard transport.');
    assertUnconfirmed(state);
  } finally {
    release?.({ data: null, error: new Error('Offline released request') });
    await operation;
  }
});

test('the same verification deadline bounds an error body that never finishes', async () => {
  const timers = [];
  let release;
  const { state, dependencies } = setup(async () => ({ data: null, error: { context: {
    json: () => new Promise(resolve => { release = resolve; }),
  } } }), {
    setTimeout: callback => { timers.push(callback); return 'offline-timeout'; }, clearTimeout: () => {},
  });
  const operation = (await loadDeleteCallback(dependencies))();
  let completed = false;
  operation.then(() => { completed = true; });
  try {
    for (let tick = 0; tick < 4; tick++) await Promise.resolve();
    timers[0]();
    for (let tick = 0; tick < 8; tick++) await Promise.resolve();
    assert.equal(completed, true, 'Response parsing must obey the invocation deadline.');
    assertUnconfirmed(state);
  } finally {
    release?.({ error: 'offline-released' });
    await operation;
  }
});

test('local cleanup failure can be retried without invoking deletion again', async () => {
  let cleanups = 0;
  const { state, dependencies } = setup(async () => ({ data: { deleted: true, user_id: 'offline-deleted-account' }, error: null }), {
    finishAccountDeletion: async () => { cleanups++; if (cleanups === 1) throw new Error('Offline storage failure'); return true; },
  });
  const callback = await loadDeleteCallback(dependencies);
  await callback();
  assert.equal(state.needsSessionCleanup, true);
  assert.match(state.toasts[0][0], /Kontot har raderats.*sessionen/);
  assert.equal(state.toasts[0][1], 'error');
  assert.ok(!state.calls.some(([method]) => method === 'replace' || method === 'signOut'));
  dependencies.confirmingDelete = false;
  await callback();
  assert.equal(state.calls.filter(([method]) => method === 'invoke').length, 1);
  assert.equal(cleanups, 2);
  assert.ok(state.calls.some(([method]) => method === 'replace'));
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
    finish({ data: { deleted: true, user_id: dependencies.user.id }, error: null });
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

test('a never-settling local finalizer releases the UI at 10 seconds and retries cleanup only', async () => {
  const timers = [];
  const cleared = [];
  let cleanups = 0;
  let release;
  const { state, dependencies } = setup(async () => ({
    data: { deleted: true, user_id: 'offline-deleted-account' }, error: null,
  }), {
    setTimeout: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeout: timer => cleared.push(timer),
    finishAccountDeletion: () => ++cleanups === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve(true),
  });
  const callback = await loadDeleteCallback(dependencies);
  const operation = callback();
  for (let tick = 0; tick < 8; tick++) await Promise.resolve();
  assert.deepEqual(timers.map(timer => timer.delay), [15_000, 10_000]);
  timers[1].callback();
  await operation;
  assert.equal(state.deleting, false);
  assert.equal(dependencies.deletingRef.current, false);
  assert.equal(state.needsSessionCleanup, true);
  assert.match(state.toasts[0][0], /Kontot har raderats.*sessionen/);
  assert.ok(!state.calls.some(([method]) => method === 'replace'));
  await callback();
  release(true);
  assert.equal(state.calls.filter(([method]) => method === 'invoke').length, 1);
  assert.equal(cleanups, 2);
  assert.ok(state.calls.some(([method]) => method === 'replace'));
  assert.equal(cleared.length, 3);
});

test('a changed server caller or active local account cannot report logout or success', async () => {
  const { state: switched, dependencies: first } = setup(async () => ({ data: null, error: {
    context: new globalThis.Response(JSON.stringify({ error: 'account_changed' }), { status: 409 }),
  } }));
  await (await loadDeleteCallback(first))();
  assert.match(switched.toasts[0][0], /kontot har ändrats/);
  assert.ok(!switched.calls.some(([method]) => method === 'finishAccountDeletion' || method === 'replace'));
  const { state, dependencies } = setup(async () => ({
    data: { deleted: true, user_id: 'offline-deleted-account' }, error: null,
  }), { finishAccountDeletion: async () => false });
  await (await loadDeleteCallback(dependencies))();
  assert.match(state.toasts[0][0], /kontot har ändrats/);
  assert.equal(state.toasts[0][1], 'error');
  assert.equal(state.needsSessionCleanup, false);
  assert.equal(dependencies.deletedAccountRef.current, null);
  assert.ok(!state.calls.some(([method]) => method === 'replace' || method === 'signOut'));
});

test('cleanup-only recovery survives a new account-screen mount for the same UID', async () => {
  const first = setup(async () => ({ data: { deleted: true, user_id: 'offline-deleted-account' }, error: null }), {
    finishAccountDeletion: async () => { throw new Error('Offline storage failure'); },
  });
  await (await loadDeleteCallback(first.dependencies))();
  assert.equal(first.state.needsSessionCleanup, true);
  const recovery = await loadRecovery(first.dependencies.deletedAccountRef.current, first.dependencies.user);
  assert.equal(recovery.state.needsSessionCleanup, true);
  const second = setup(() => assert.fail('A new mount must retry only local cleanup.'), {
    confirmingDelete: false, deletedAccountRef: recovery.deletedAccountRef,
  });
  await (await loadDeleteCallback(second.dependencies))();
  assert.equal(second.state.calls.filter(([method]) => method === 'invoke').length, 0);
  assert.ok(second.state.calls.some(([method]) => method === 'replace'));
  assert.equal(first.state.calls.filter(([method]) => method === 'invoke').length, 1);
});

test('a different UID cannot inherit the deleted account recovery on mount or after an Auth update', async () => {
  const recovery = await loadRecovery('offline-deleted-account', { id: 'other-account' });
  assert.equal(recovery.deletedAccountRef.current, null);
  assert.equal(recovery.state.needsSessionCleanup, false);
  recovery.update('offline-deleted-account', { id: 'offline-deleted-account' });
  assert.equal(recovery.state.needsSessionCleanup, true);
  recovery.update(null, { id: 'other-account' });
  assert.equal(recovery.deletedAccountRef.current, null);
  assert.equal(recovery.state.needsSessionCleanup, false);
});
