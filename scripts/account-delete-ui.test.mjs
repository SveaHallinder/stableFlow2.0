import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';
import { navigatorLock, processLock } from '@supabase/supabase-js';

const actor = '11111111-1111-4111-8111-111111111111';
const owner = '22222222-2222-4222-8222-222222222222';
let fixtureNumber = 0;
async function until(predicate) {
  for (let tick = 0; tick < 100 && !predicate(); tick++) await Promise.resolve();
  assert.ok(predicate(), 'The synthetic callback must reach the expected stage');
}

// Execute the real media validator/RPC reader. Only the transport and explicit
// complete-empty inventory below are synthetic; the media gate is not bypassed.
async function loadMediaHelpers(dependencies) {
  const source = await readFile(new URL('../lib/accountMedia.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('accountMedia.ts', source, ts.ScriptTarget.Latest, true);
  const body = ast.statements.filter(node => !ts.isImportDeclaration(node))
    .map(node => node.getText(ast).replace(/^export\s+/, '')).join('\n');
  const { outputText } = ts.transpileModule(`export default ({ supabase, supabaseConfig }) => {
    ${body}
    return { readOwnAccountMediaStatus };
  };`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

async function loadResumeHelpers(dependencies) {
  dependencies = { ...dependencies, ...await loadMediaHelpers(dependencies) };
  const source = await readFile(new URL('../lib/accountDeletionResume.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('accountDeletionResume.ts', source, ts.ScriptTarget.Latest, true);
  const body = ast.statements.filter(node => !ts.isImportDeclaration(node))
    .map(node => node.getText(ast).replace(/^export\s+/, '')).join('\n');
  const { outputText } = ts.transpileModule(`export default ({ Platform, SecureStore, navigatorLock, processLock, authStorageKey, supabase, readOwnAccountMediaStatus }) => {
    ${body}
    return { readAccountDeletionPlan, readOwnAccountDeletionStatus, persistAccountDeletionPlan, reserveAccountDeletionAttempt, reconcileAccountMediaJournal };
  };`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default({
    ...dependencies, navigatorLock, processLock, Platform: { OS: 'ios' },
  });
}

// Execute the real callback with synthetic responses; never invoke Supabase.
async function loadDeleteCallback(dependencies, kind = 'handleDeleteAccount') {
  dependencies = { ...dependencies, ...await loadResumeHelpers(dependencies) };
  const source = await readFile(new URL('../app/settings/account.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('account.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AccountSettingsScreen');
  const declaration = component.body.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === kind);
  const refresh = component.body.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === 'refreshDeletionReceipt');
  const mediaGate = component.body.statements.filter(ts.isVariableStatement).filter(node =>
    node.declarationList.declarations.some(node => ['mediaReceipt', 'mediaPending'].includes(node.name.getText(ast))))
    .map(node => node.getText(ast)).join('\n');
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => {
    ${mediaGate}
    const refreshDeletionReceipt = (${refresh.initializer.arguments[0].getText(ast)});
    return (${callback});
  };`, {
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

// Each legacy deletion fixture explicitly has a complete, empty own-file
// inventory while preserving its existing synthetic creator/owner scope.
function emptyMediaInventory(receipt) {
  return { user_id: receipt.user_id, complete: true, blocked_count: 0,
    requires_owner: receipt.requires_owner, affected_stable_count: receipt.affected_stable_count,
    replacement_owners: receipt.replacement_owners,
    own: { plan_id: null, plan_generation: null, reselect_allowed: false, reselect_blocked_reason: null,
      replacement_user_id: null, state: 'not_started', delete_count: 0, transfer_count: 0,
      copied_count: 0, removed_count: 0, next_copy_item_id: null, next_remove_item_id: null }, incoming: [] };
}

function setup(invoke, overrides = {}) {
  const state = { deleting: false, confirmingDelete: true, toasts: [], calls: [], logs: [], needsSessionCleanup: false,
    journal: new Map(), trace: [], mediaCalls: [], mediaInventory: undefined, deletionResume: { userId: actor, status: 'ready', plan: null, receipt: null } };
  const receipt = { user_id: actor, status: 'not_started', auth_present: true, profile_present: true,
    requires_owner: false, affected_stable_count: 0, replacement_owners: [], replacement_user_id: null, prepared_at: null };
  const dependencies = {
    deleting: false, confirmingDelete: true, deletingRef: { current: false }, deletedAccountRef: { current: null },
    user: { id: actor }, securityAccountRef: { current: { userId: actor } },
    deletionPlanRef: { current: null }, deletionResume: state.deletionResume, requiresOwner: false, selectedOwner: undefined,
    authStorageKey: `synthetic-delete-test-${++fixtureNumber}`,
    supabaseConfig: { url: 'https://fixture.supabase.co' },
    SecureStore: {
      getItemAsync: async key => state.journal.get(key) ?? null,
      setItemAsync: async (key, value) => { state.trace.push(['journal', JSON.parse(value)]); state.journal.set(key, value); },
    },
    AbortController: globalThis.AbortController, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    setDeleting: value => { state.deleting = value; },
    setConfirmingDelete: value => { state.confirmingDelete = value; },
    setNeedsSessionCleanup: value => { state.needsSessionCleanup = value; },
    setDeletionResume: update => {
      const next = typeof update === 'function' ? update(state.deletionResume) : update;
      Object.assign(state.deletionResume, next);
    },
    supabase: {
      rpc: (name, ...args) => {
        if (name === 'own_account_media_status') {
          assert.deepEqual(args, [{ p_project_url: 'https://fixture.supabase.co' }]);
          state.mediaCalls.push(args[0]);
          const query = Promise.resolve({ data: state.mediaInventory === undefined ? emptyMediaInventory(receipt) : state.mediaInventory, error: null });
          query.abortSignal = () => query; return query;
        }
        assert.equal(name, 'own_account_deletion_status'); assert.deepEqual(args, []);
        state.trace.push(['status']);
        const query = Promise.resolve({ data: receipt, error: null }); query.abortSignal = () => query; return query;
      },
      functions: { invoke: (...args) => { state.calls.push(['invoke', ...args]); return invoke(...args); } },
    },
    toast: { showToast: (...args) => state.toasts.push(args) },
    signOut: async () => { state.calls.push(['signOut']); },
    finishAccountDeletion: async id => { state.calls.push(['finishAccountDeletion', id]); return true; },
    router: { replace: route => state.calls.push(['replace', route]) },
    console: { warn: (...args) => state.logs.push(args) },
    ...overrides,
  };
  return { state, dependencies, receipt };
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

test('account deletion explains required or invalid replacement owners without claiming Auth deletion', async () => {
  for (const reason of ['owner_required', 'owner_invalid']) {
  const { state, dependencies } = setup(async () => ({ data: null, error: {
    context: new globalThis.Response(JSON.stringify({ error: reason }), { status: 409 }),
  } }));
  await (await loadDeleteCallback(dependencies))();
  assert.equal(state.deleting, false);
  assert.equal(state.confirmingDelete, false);
  assert.equal(state.toasts[0][1], 'error');
  assert.match(state.toasts[0][0], reason === 'owner_required' ? /Välj en ny ägare/ : /aktiva?.*ägare|aktivt konto/);
  assert.doesNotMatch(state.toasts[0][0], /fler medlemmar/);
  assert.ok(!state.calls.some(([method]) => method === 'signOut' || method === 'finishAccountDeletion'));
  }
});

test('account deletion waits for acknowledgement before reporting success and leaving the session', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const { state, dependencies } = setup(() => pending);
  const callback = await loadDeleteCallback(dependencies);
  const operation = callback();
  assert.equal(state.deleting, true);
  assert.equal(state.toasts.length, 0);
  await until(() => state.calls.length === 1);
  const options = state.calls[0][2];
  assert.equal(options.method, 'POST');
  assert.deepEqual(options.body, { expected_user_id: dependencies.user.id, replacement_user_id: null });
  assert.deepEqual(state.trace.map(([kind]) => kind), ['status', 'journal', 'journal']);
  assert.equal(dependencies.deletionPlanRef.current.attempts, 1);
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
  await until(() => Boolean(signal));
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
  const { state, dependencies } = setup(async () => ({ data: { deleted: true, user_id: actor }, error: null }), {
    signOut: () => new Promise(resolve => { release = resolve; }),
  });
  const operation = (await loadDeleteCallback(dependencies))();
  let completed = false;
  operation.then(() => { completed = true; });
  try {
    await until(() => completed);
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
    await until(() => Boolean(release));
    timers[0]();
    await until(() => completed);
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
    await until(() => Boolean(release));
    timers[0]();
    await until(() => completed);
    assert.equal(completed, true, 'Response parsing must obey the invocation deadline.');
    assertUnconfirmed(state);
  } finally {
    release?.({ error: 'offline-released' });
    await operation;
  }
});

test('local cleanup failure can be retried without invoking deletion again', async () => {
  let cleanups = 0;
  const { state, dependencies } = setup(async () => ({ data: { deleted: true, user_id: actor }, error: null }), {
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
    await until(() => state.calls.length === 1);
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
    data: { deleted: true, user_id: actor }, error: null,
  }), {
    setTimeout: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeout: timer => cleared.push(timer),
    finishAccountDeletion: () => ++cleanups === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve(true),
  });
  const callback = await loadDeleteCallback(dependencies);
  const operation = callback();
  await until(() => timers.some(timer => timer.delay === 10_000));
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
    data: { deleted: true, user_id: actor }, error: null,
  }), { finishAccountDeletion: async () => false });
  await (await loadDeleteCallback(dependencies))();
  assert.match(state.toasts[0][0], /kontot har ändrats/);
  assert.equal(state.toasts[0][1], 'error');
  assert.equal(state.needsSessionCleanup, false);
  assert.equal(dependencies.deletedAccountRef.current, null);
  assert.ok(!state.calls.some(([method]) => method === 'replace' || method === 'signOut'));
});

test('cleanup-only recovery survives a new account-screen mount for the same UID', async () => {
  const first = setup(async () => ({ data: { deleted: true, user_id: actor }, error: null }), {
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
  const recovery = await loadRecovery(actor, { id: 'other-account' });
  assert.equal(recovery.deletedAccountRef.current, null);
  assert.equal(recovery.state.needsSessionCleanup, false);
  recovery.update(actor, { id: actor });
  assert.equal(recovery.state.needsSessionCleanup, true);
  recovery.update(null, { id: 'other-account' });
  assert.equal(recovery.deletedAccountRef.current, null);
  assert.equal(recovery.state.needsSessionCleanup, false);
});

test('account deletion requires same-UID verified status and a chosen eligible successor before any reservation', async () => {
  for (const overrides of [
    { requiresOwner: true },
    { deletionResume: { userId: 'other-account', status: 'ready' } },
    { deletionResume: { userId: actor, status: 'unknown' } },
    { securityAccountRef: { current: { userId: 'other-account' } } },
  ]) {
    const { state, dependencies } = setup(() => assert.fail('An unverified plan must not dispatch'), overrides);
    await (await loadDeleteCallback(dependencies))();
    assert.equal(state.calls.length, 0); assert.equal(state.journal.size, 0);
  }
  for (const invalidStatus of [
    { user_id: owner },
    { requires_owner: true, affected_stable_count: 1, replacement_owners: [] },
  ]) {
    const { state, dependencies, receipt } = setup(() => assert.fail('Invalid fresh scope must not dispatch'), {
      requiresOwner: true, selectedOwner: { id: owner },
    });
    Object.assign(receipt, invalidStatus);
    await (await loadDeleteCallback(dependencies))();
    assert.equal(state.calls.length, 0); assert.equal(state.journal.size, 0);
    assert.equal(state.toasts.at(-1)[1], 'error');
  }
});

test('three manual reservations retain one owner and a reload cannot dispatch a fourth attempt', async () => {
  const { state, dependencies, receipt } = setup(async (_name, options) => {
    assert.deepEqual(options.body, { expected_user_id: actor, replacement_user_id: owner });
    assert.equal(dependencies.deletionPlanRef.current.attempts, state.calls.length);
    return { data: null, error: { context: new Error('Synthetic unknown delivery') } };
  }, { requiresOwner: true, selectedOwner: { id: owner } });
  Object.assign(receipt, { requires_owner: true, affected_stable_count: 1,
    replacement_owners: [{ user_id: owner, display_name: 'Synthetic owner' }] });
  for (let attempt = 1; attempt <= 3; attempt++) {
    await (await loadDeleteCallback(dependencies))();
    assert.equal(dependencies.deletionPlanRef.current.attempts, attempt);
    assert.equal(dependencies.deletionPlanRef.current.ownerId, owner);
  }
  await (await loadDeleteCallback(dependencies))();
  assert.equal(state.calls.length, 3); assert.match(state.toasts.at(-1)[0], /tre raderingsförsök/);
  const reloaded = setup(() => assert.fail('A persisted exhausted plan must not dispatch'), {
    authStorageKey: dependencies.authStorageKey, SecureStore: dependencies.SecureStore,
  });
  await (await loadDeleteCallback(reloaded.dependencies, 'handleCheckDeletionStatus'))();
  assert.equal(reloaded.dependencies.deletionPlanRef.current.attempts, 3);
  assert.equal(reloaded.dependencies.deletionPlanRef.current.ownerId, owner);
  await (await loadDeleteCallback(reloaded.dependencies))();
  assert.equal(reloaded.state.calls.length, 0);
});

test('journal write/readback failure cannot reserve or invoke account deletion', async () => {
  for (const rejectWrite of [true, false]) {
    const { state, dependencies } = setup(() => assert.fail('An unsaved plan must not dispatch'), {
      SecureStore: { getItemAsync: async () => null, setItemAsync: async () => {
        if (rejectWrite) throw new Error('Synthetic journal failure');
      } },
    });
    await (await loadDeleteCallback(dependencies))();
    assert.equal(state.calls.length, 0); assert.equal(state.needsSessionCleanup, false);
    assert.equal(state.toasts.at(-1)[1], 'error');
    assert.equal(dependencies.deletionPlanRef.current, null);
  }
});

test('a deferred Response body cannot mutate another account, a new A epoch or an unmounted screen', async () => {
  for (const userIds of [[owner], [owner, actor], [undefined]]) {
    let parsing, release;
    const started = new Promise(resolve => { parsing = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const response = new globalThis.Response(JSON.stringify({ error: 'owner_invalid' }), { status: 409 });
    const parse = response.json.bind(response);
    response.json = async () => { parsing(); await gate; return parse(); };
    const { state, dependencies } = setup(async () => ({ data: null, error: { context: response } }));
    const pending = (await loadDeleteCallback(dependencies))();
    await started;
    for (const userId of userIds) dependencies.securityAccountRef.current = { userId };
    release(); await pending;
    assert.equal(state.toasts.length, 0); assert.equal(state.deleting, true);
    assert.equal(state.confirmingDelete, true); assert.equal(dependencies.deletedAccountRef.current, null);
    assert.ok(!state.calls.some(([method]) => method === 'finishAccountDeletion' || method === 'replace'));
  }
});


test('unknown, incomplete or wrong-caller media cannot reserve a journal or invoke Auth deletion', async () => {
  for (const failure of ['unknown', 'incomplete', 'wrong-caller', 'blocked']) {
    const { state, dependencies, receipt } = setup(() => assert.fail('Unverified media must not dispatch Auth deletion'));
    const media = emptyMediaInventory(receipt);
    state.mediaInventory = failure === 'unknown' ? null : failure === 'incomplete'
      ? { ...media, complete: false } : failure === 'wrong-caller' ? { ...media, user_id: owner } : { ...media, blocked_count: 1 };
    await (await loadDeleteCallback(dependencies))();
    assert.equal(state.calls.length, 0); assert.equal(state.journal.size, 0);
    assert.equal(state.needsSessionCleanup, false); assert.equal(state.deleting, false);
    assert.equal(state.toasts.at(-1)[1], 'error');
    assert.deepEqual(state.mediaCalls, [{ p_project_url: 'https://fixture.supabase.co' }]);
  }
});

test('actual render-derived mediaPending stops a known blocked file before even rereading status', async () => {
  const { state, dependencies, receipt } = setup(() => assert.fail('Pending media must not dispatch Auth deletion'));
  dependencies.deletionResume.receipt = { ...receipt, media: { ...emptyMediaInventory(receipt), blocked_count: 1 } };
  await (await loadDeleteCallback(dependencies))();
  assert.equal(state.calls.length, 0); assert.equal(state.journal.size, 0);
  assert.equal(state.mediaCalls.length, 0); assert.equal(state.trace.length, 0);
});
