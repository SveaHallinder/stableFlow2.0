import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { URL } from 'node:url';
import ts from 'typescript';

// Execute the actual hook with a synthetic native emitter and SDK-session
// boundary. No provider, device, account or network request is made.
const source = await readFile(new URL('../hooks/usePushNotifications.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('usePushNotifications.ts', source, ts.ScriptTarget.Latest, true);
const body = ast.statements.filter(node => !ts.isImportDeclaration(node))
  .map(node => node.getText(ast)).join('\n').replace(/\bexport /g, '');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const event = (recipient = A, id = 'notification-1', screen = 'messages') => ({
  actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
  notification: { request: { identifier: id, content: { data: { recipientUserId: recipient, screen } } } },
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

async function mount({ userId = A, platform = 'ios', ready = true, initialResponse = null, registration = async () => true,
  session = async id => ({ data: { session: id ? { user: { id } } : null }, error: null }) } = {}) {
  const slots = [], effects = [], listeners = [], routes = [], registrations = [], logs = [];
  let cursor = 0, currentUserId = userId, navigationReady = ready, lastResponse = initialResponse, clears = 0, initialReads = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const useEffect = (callback, deps) => {
    const index = cursor++, old = slots[index];
    if (!same(old?.deps, deps)) {
      const slot = { deps, callback }; slots[index] = slot;
      effects.push(() => { old?.cleanup?.(); slot.cleanup = callback(); });
    }
  };
  const dependencies = {
    Platform: { OS: platform },
    useRef: current => { const index = cursor++; slots[index] ??= { current }; return slots[index]; },
    useMemo: (callback, deps) => {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: callback() };
      return slots[index].value;
    },
    useEffect, useLayoutEffect: useEffect,
    Notifications: {
      addNotificationResponseReceivedListener: callback => {
        const listener = { callback, removed: false, remove() { this.removed = true; } };
        listeners.push(listener); return listener;
      },
      getLastNotificationResponse: () => { initialReads++; return lastResponse; },
      clearLastNotificationResponse: () => { clears++; lastResponse = null; },
    },
    supabase: { auth: { getSession: () => session(currentUserId) } },
    router: { push: path => routes.push(path) },
    registerPushToken: (id, isCurrent) => { registrations.push(id); return registration(id, isCurrent); },
    console: { warn: (...args) => logs.push(args) },
  };
  const output = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => {
    ${body}; return { usePushNotifications,
      hasFailure: typeof hasPushRegistrationFailure === 'function' ? hasPushRegistrationFailure : () => false,
      subscribe: typeof subscribePushRegistrationFailure === 'function' ? subscribePushRegistrationFailure : () => () => {},
      clearFailure: typeof clearPushRegistrationFailure === 'function' ? clearPushRegistrationFailure : () => {} };
  };`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const api = (await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)).default(dependencies);
  const render = () => { cursor = 0; api.usePushNotifications(currentUserId, navigationReady); while (effects.length) effects.shift()(); };
  render();
  return {
    ...api, routes, registrations, logs, listeners,
    tick: () => setImmediate(),
    setUser: id => { currentUserId = id; render(); },
    setReady: value => { navigationReady = value; render(); },
    setLast: value => { lastResponse = value; },
    emit: value => { lastResponse = value; return listeners.at(-1).callback(value); },
    unmount: () => slots.forEach(slot => slot.cleanup?.()),
    clears: () => clears, initialReads: () => initialReads,
    replayEffects: () => {
      const live = slots.filter(slot => slot.callback);
      live.forEach(slot => slot.cleanup?.()); live.forEach(slot => { slot.cleanup = slot.callback(); });
    },
  };
}

test('bootstrap false publishes an account-bound failure and a successful current retry can clear it', async () => {
  const held = deferred();
  const f = await mount({ registration: () => held.promise });
  const changes = []; const unsubscribe = f.subscribe(() => changes.push(f.hasFailure(A)));
  held.resolve(false); await f.tick();
  assert.equal(f.hasFailure(A), true);
  assert.equal(f.hasFailure(B), false);
  assert.deepEqual(changes, [true]);
  f.clearFailure(B); assert.equal(f.hasFailure(A), true);
  f.clearFailure(A); assert.equal(f.hasFailure(A), false);
  unsubscribe(); f.unmount();
});

test('late registration failures from A/B/A or unmount cannot publish a current failure', async () => {
  for (const unmount of [false, true]) {
    const held = deferred(); let attempts = 0;
    const f = await mount({ registration: () => ++attempts === 1 ? held.promise : Promise.resolve(true) });
    if (unmount) f.unmount(); else { f.setUser(B); f.setUser(A); }
    held.resolve(false); await f.tick();
    assert.equal(f.hasFailure(A), false); assert.equal(f.hasFailure(B), false);
  }
});

test('an earlier pending bootstrap failure cannot replace a successful explicit registration retry', async () => {
  const held = deferred(); const f = await mount({ registration: () => held.promise });
  f.clearFailure(A); held.resolve(false); await f.tick();
  assert.equal(f.hasFailure(A), false);
});

test('the last native tap waits for the authenticated user and is consumed only once', async () => {
  const response = event();
  const f = await mount({ userId: null, initialResponse: response });
  await f.tick(); assert.deepEqual(f.routes, []);
  f.setUser(A); await f.tick();
  assert.deepEqual(f.routes, ['/messages']); assert.equal(f.clears(), 1);
  await f.emit(response); await f.tick();
  assert.deepEqual(f.routes, ['/messages']);
  f.replayEffects(); await f.tick(); assert.deepEqual(f.routes, ['/messages']);
  assert.equal(f.clears(), 2);
});

test('cold-start routing waits for navigator readiness without blocking device registration or consuming the tap', async () => {
  const f = await mount({ ready: false, initialResponse: event(), registration: async () => false });
  await f.tick();
  assert.deepEqual(f.registrations, [A]); assert.equal(f.hasFailure(A), true);
  assert.deepEqual(f.routes, []); assert.equal(f.initialReads(), 0); assert.equal(f.clears(), 0);
  f.setReady(true); await f.tick();
  assert.deepEqual(f.routes, ['/messages']); assert.equal(f.clears(), 1);
  assert.deepEqual(f.registrations, [A]);
});

test('initial and live callbacks deduplicate the same native response while SDK verification is pending', async () => {
  const verified = deferred(); const response = event();
  const f = await mount({ initialResponse: response, session: () => verified.promise });
  const live = f.emit(response);
  const duplicate = f.emit(response);
  verified.resolve({ data: { session: { user: { id: A } } }, error: null });
  await Promise.all([live, duplicate]); await f.tick();
  assert.deepEqual(f.routes, ['/messages']); assert.equal(f.clears(), 1);
});

test('StrictMode setup can resume the initial tap while the retired listener still awaits its session', async () => {
  const verified = deferred();
  const f = await mount({ initialResponse: event(), session: () => verified.promise });
  f.replayEffects();
  verified.resolve({ data: { session: { user: { id: A } } }, error: null });
  await f.tick();
  assert.deepEqual(f.routes, ['/messages']); assert.equal(f.clears(), 1);
});

test('an earlier verified tap never clears a newer native response', async () => {
  const verified = deferred();
  const f = await mount({ session: () => verified.promise });
  const first = f.emit(event());
  f.setLast(event(A, 'newer-notification', 'calendar'));
  verified.resolve({ data: { session: { user: { id: A } } }, error: null });
  await first;
  assert.deepEqual(f.routes, ['/messages']); assert.equal(f.clears(), 0);
  await f.emit(event(A, 'newer-notification', 'calendar'));
  assert.deepEqual(f.routes, ['/messages', '/calendar']); assert.equal(f.clears(), 1);
});

test('a foreign-account initial tap is discarded and never replayed after an A/B/A switch', async () => {
  const f = await mount({ userId: B, initialResponse: event(A) });
  await f.tick(); assert.deepEqual(f.routes, []);
  f.setUser(A); await f.tick(); assert.deepEqual(f.routes, []);
});

test('an old tap callback cannot route after A/B/A or unmount while reading the SDK session', async () => {
  for (const unmount of [false, true]) {
    const verified = deferred(); const f = await mount({ session: () => verified.promise });
    const pending = f.emit(event());
    if (unmount) f.unmount(); else { f.setUser(B); f.setUser(A); }
    verified.resolve({ data: { session: { user: { id: A } } }, error: null });
    await pending; await f.tick(); assert.deepEqual(f.routes, []);
  }
});

test('notification routing keeps the SDK account fence and existing safe destinations', async () => {
  const foreign = await mount({ session: async () => ({ data: { session: { user: { id: B } } }, error: null }) });
  await foreign.emit(event(A)); assert.deepEqual(foreign.routes, []);
  const own = await mount();
  await own.emit(event(A, 'calendar-response', 'calendar'));
  await own.emit(event(A, 'unknown-response', '/admin'));
  assert.deepEqual(own.routes, ['/calendar']);
});

test('web bootstrap never registers, reads or listens for native notifications', async () => {
  const f = await mount({ platform: 'web', initialResponse: event() }); await f.tick();
  assert.deepEqual(f.registrations, []); assert.equal(f.initialReads(), 0); assert.deepEqual(f.listeners, []);
});

test('a slower earlier tap never replaces the destination of the latest tap', async () => {
  const firstSession = deferred(); let reads = 0;
  const f = await mount({ session: () => ++reads === 1 ? firstSession.promise
    : Promise.resolve({ data: { session: { user: { id: A } } }, error: null }) });
  const first = f.emit(event(A, 'older-tap', 'messages'));
  await f.emit(event(A, 'latest-tap', 'calendar'));
  assert.deepEqual(f.routes, ['/calendar']);
  firstSession.resolve({ data: { session: { user: { id: A } } }, error: null });
  await first;
  assert.deepEqual(f.routes, ['/calendar']);
});

test('stale Auth props cannot consume the next account tap before SDK identity agrees', async () => {
  const f = await mount({ userId: A, initialResponse: event(B),
    session: async () => ({ data: { session: { user: { id: B } } }, error: null }) });
  await f.tick(); assert.equal(f.clears(), 0);
  f.setUser(B); await f.tick();
  assert.deepEqual(f.routes, ['/messages']);
});
