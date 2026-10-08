import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { URL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

// Full production component callbacks run in a synthetic hook/RN adapter. The
// installed Supabase SDK uses only this deferred mock fetch, never a real account.
const source = await readFile(new URL('../app/settings/notifications.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('notifications.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ast.statements.filter(ts.isImportDeclaration).flatMap(node => {
  const clause = node.importClause;
  return [clause?.name?.text, ...(clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
    ? clause.namedBindings.elements.map(item => item.name.text) : [])].filter(Boolean);
});
const body = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast))
  .join('\n').replace('export default function', 'function');
const compiled = ts.transpileModule(`export default ({ ${[...names, 'console'].join(', ')} }) => {
  ${body}; return NotificationSettingsScreen;
};`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
const factory = (await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`)).default;
const actor = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const aPrefs = { messages: false, assignments: true, feed: false, reminders: true };
const bPrefs = { messages: true, assignments: false, feed: true, reminders: false };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
function mount({ userId = actor, platform = 'ios', permission = 'granted', permissionResult = true, registrationResult = true } = {}) {
  const slots = [], pending = [], requests = [], registrations = [], permissionChecks = [], logs = [], lateSetters = [];
  let cursor = 0, tree, currentUserId = userId, mounted = true, permissionCalls = 0, saveThrow = null;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => {
        if (!mounted) lateSetters.push(index);
        slots[index].value = typeof next === 'function' ? next(slots[index].value) : next;
      }];
    },
    useRef(value) { const index = cursor++; slots[index] ??= { value: { current: value } }; return slots[index].value; },
    useEffect(callback, deps) {
      const index = cursor++, old = slots[index];
      if (!same(old?.deps, deps)) {
        const slot = { callback, deps, cleanup: undefined }; slots[index] = slot;
        pending.push(() => { old?.cleanup?.(); slot.cleanup = callback(); });
      }
    },
    useMemo(callback, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { value: callback(), deps };
      return slots[index].value;
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { value: callback, deps };
      return slots[index].value;
    },
  };
  const sdk = createClient('https://notification-prefs-fixture.invalid', 'synthetic-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.hostname, 'notification-prefs-fixture.invalid');
      assert.equal(url.pathname, '/rest/v1/notification_preferences');
      const held = deferred();
      requests.push({ ...held, method: init.method, userId: url.searchParams.get('user_id')?.replace(/^eq\./, ''),
        body: init.body ? JSON.parse(init.body) : null, conflict: url.searchParams.get('on_conflict') });
      return held.promise;
    } },
  });
  const dependencies = {
    React, Platform: { OS: platform }, StyleSheet: { create: value => value, hairlineWidth: 1 },
    theme: { colors: {}, gradients: { background: ['#fff', '#eee'] } }, radius: { lg: 16, full: 999 },
    useAuth: () => ({ user: currentUserId ? { id: currentUserId } : null }),
    useAppData: () => ({ state: { currentStableId: 'synthetic-stable' }, derived: { getMissedAssignmentsForStable: () => [] } }),
    useRouter: () => ({ push() {}, back() {} }), useIsDesktopWeb: () => false, formatShortDate: value => value,
    getPermissionStatus: async () => {
      permissionChecks.push(currentUserId);
      return typeof permission === 'function' ? permission(currentUserId) : permission;
    },
    requestPermission: async () => { permissionCalls++; return typeof permissionResult === 'function' ? permissionResult() : permissionResult; },
    registerPushToken: async id => { registrations.push(id); return typeof registrationResult === 'function' ? registrationResult() : registrationResult; },
    supabase: { from(table) { const query = sdk.from(table); if (saveThrow) query.upsert = () => { throw saveThrow; }; return query; } },
    console: { warn: (...args) => logs.push(args) },
  };
  for (const name of names) if (!(name in dependencies)) dependencies[name] = name;
  const Component = factory(dependencies);
  const render = () => { cursor = 0; tree = Component(); while (pending.length) pending.shift()(); return tree; };
  const nodes = () => {
    const found = [];
    const visit = node => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== 'object' || !('type' in node)) return;
      found.push(node); visit(typeof node.type === 'function' ? node.type(node.props) : node.props.children);
    };
    visit(tree); return found;
  };
  const textOf = value => {
    if (Array.isArray(value)) return value.map(textOf).join(' ');
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (!value || typeof value !== 'object' || !('type' in value)) return '';
    return textOf(typeof value.type === 'function' ? value.type(value.props) : value.props.children);
  };
  const fixture = {
    render, requests, registrations, permissionChecks, logs, lateSetters,
    tick: async () => {
      await setImmediate(); if (mounted) render();
      // A render can start a reload effect; let its actual SDK fetch also begin.
      await setImmediate(); if (mounted) render();
    },
    setUser: id => { currentUserId = id; render(); },
    switches: () => nodes().filter(node => node.type === 'Switch'),
    switch: label => nodes().find(node => node.type === 'Switch' && node.props.accessibilityLabel === label),
    button: label => nodes().find(node => node.type === 'TouchableOpacity'
      && (node.props.accessibilityLabel === label || textOf(node.props.children).trim() === label)),
    text: () => textOf(tree),
    reads: () => requests.filter(item => item.method === 'GET'),
    writes: () => requests.filter(item => item.method === 'POST'),
    permissionCalls: () => permissionCalls,
    load: (index, prefs) => fixture.reads()[index].resolve(new globalThis.Response(JSON.stringify(prefs ? [prefs] : []), { headers: { 'Content-Type': 'application/json' } })),
    fail: (request, status = 403) => request.resolve(new globalThis.Response(JSON.stringify({ code: '42501', message: 'synthetic-private-provider', details: 'synthetic-private-token' }), { status, headers: { 'Content-Type': 'application/json' } })),
    acknowledge: request => request.resolve(new globalThis.Response(null, { status: 204 })),
    throwSave: error => { saveThrow = error; },
    unmount: () => { mounted = false; slots.forEach(slot => slot?.cleanup?.()); },
    replayEffects: () => { const effects = slots.filter(slot => slot?.callback); effects.forEach(slot => slot.cleanup?.()); effects.forEach(slot => { slot.cleanup = slot.callback(); }); },
  };
  render(); return fixture;
}
async function ready(options, prefs = aPrefs) { const f = mount(options); await f.tick(); f.load(0, prefs); await f.tick(); return f; }
const disabled = f => assert.ok(f.switches().every(node => node.props.disabled));
const values = f => f.switches().map(node => node.props.value);

test('confirmed preferences and verified missing row preserve defaults, mapping and upsert conflict key', async () => {
  for (const prefs of [aPrefs, null]) {
    const f = await ready({}, prefs);
    assert.deepEqual(values(f), prefs ? [false, true, true] : [true, true, true]);
    assert.equal(f.reads()[0].userId, actor);
    const saving = f.switch('Viktiga stallnotiser').props.onValueChange(); await f.tick();
    assert.equal(f.writes()[0].body.user_id, actor); assert.equal(f.writes()[0].body.reminders, false);
    assert.equal(f.writes()[0].conflict, 'user_id'); f.acknowledge(f.writes()[0]); await saving; await f.tick();
    assert.equal(f.switch('Viktiga stallnotiser').props.value, false);
  }
});

test('late A read cannot replace verified B prefs or contaminate B write', async () => {
  const f = mount(); await f.tick(); f.setUser(other); await f.tick();
  f.load(1, bPrefs); await f.tick(); f.load(0, aPrefs); await f.tick();
  assert.deepEqual(values(f), [true, false, false]);
  const saving = f.switch('Meddelanden').props.onValueChange(); await f.tick();
  assert.equal(f.writes()[0].body.user_id, other); assert.equal(f.writes()[0].body.assignments, false);
  assert.equal(f.writes()[0].body.reminders, false); f.acknowledge(f.writes()[0]); await saving;
});

test('A/B/A uses the new A load epoch and ignores the original A response', async () => {
  const f = mount(); await f.tick(); f.setUser(other); await f.tick(); f.setUser(actor); await f.tick();
  f.load(2, bPrefs); await f.tick(); f.load(0, aPrefs); f.load(1, aPrefs); await f.tick();
  assert.deepEqual(values(f), [true, false, false]);
});

test('unmount suppresses preference response setters and logging', async () => {
  const f = mount(); await f.tick(); f.unmount(); f.fail(f.reads()[0]); await f.tick();
  assert.deepEqual(f.lateSetters, []); assert.deepEqual(f.logs, []);
});

test('StrictMode cleanup/setup ignores first read and allows second setup', async () => {
  const f = mount(); await f.tick(); f.replayEffects(); await f.tick();
  f.load(0, aPrefs); await f.tick(); disabled(f); f.load(1, bPrefs); await f.tick();
  assert.deepEqual(values(f), [true, false, false]);
});

for (const failure of ['HTTP error', 'network exception']) test('unconfirmed ' + failure + ' disables writes, shows safe error and supports explicit reload', async () => {
  const f = mount(); await f.tick();
  if (failure === 'HTTP error') f.fail(f.reads()[0]); else f.reads()[0].reject(new Error('synthetic-private-token'));
  await f.tick(); disabled(f); assert.match(f.text(), /Kunde inte läsa notisinställningarna/);
  await f.switch('Meddelanden').props.onValueChange(); assert.equal(f.writes().length, 0);
  f.button('Läs in igen').props.onPress(); await f.tick(); disabled(f); f.load(1, bPrefs); await f.tick();
  assert.deepEqual(values(f), [true, false, false]); assert.doesNotMatch(JSON.stringify(f.logs), /synthetic-private/);
});

test('sparse or non-boolean preference rows fail closed instead of enabling defaults', async () => {
  for (const malformed of [{ messages: true }, { ...aPrefs, reminders: 'synthetic-private-string' }]) {
    const f = mount(); await f.tick(); f.load(0, malformed); await f.tick(); disabled(f);
    assert.match(f.text(), /Kunde inte läsa notisinställningarna/);
    assert.doesNotMatch(f.text() + JSON.stringify(f.logs), /synthetic-private/);
    await f.switch('Meddelanden').props.onValueChange(); assert.equal(f.writes().length, 0);
  }
});

test('missing UID performs no preference or permission request and leaves switches disabled', async () => {
  const f = mount({ userId: null, permission: 'undetermined' }); await f.tick(); disabled(f);
  assert.equal(f.requests.length, 0); assert.equal(f.button('Aktivera push-notiser'), undefined);
  await f.switch('Meddelanden').props.onValueChange(); assert.equal(f.requests.length, 0);
});

test('two clicks before rerender dispatch only one write and stay locked until acknowledgement', async () => {
  const f = await ready(); const click = f.switch('Meddelanden').props.onValueChange;
  const first = click(), second = click(); await f.tick(); const count = f.writes().length; disabled(f);
  f.writes().forEach(f.acknowledge); await Promise.all([first, second]); await f.tick();
  assert.equal(count, 1); assert.ok(f.switches().every(node => !node.props.disabled));
  const next = click(); await f.tick(); assert.equal(f.writes()[1].body.messages, false);
  f.acknowledge(f.writes()[1]); await next;
});

test('known save error restores current confirmed prefs with visible safe error and supports another attempt', async () => {
  const f = await ready(); const saving = f.switch('Meddelanden').props.onValueChange; const pending = saving();
  await f.tick(); f.fail(f.writes()[0]); await pending; await f.tick();
  assert.deepEqual(values(f), [false, true, true]); assert.match(f.text(), /Kunde inte spara notisinställningarna/);
  assert.ok(f.switches().every(node => !node.props.disabled)); assert.doesNotMatch(JSON.stringify(f.logs), /synthetic-private/);
  const retry = f.switch('Meddelanden').props.onValueChange(); await f.tick(); f.acknowledge(f.writes()[1]); await retry; await f.tick();
  assert.doesNotMatch(f.text(), /Kunde inte spara/);
});

for (const failure of ['network exception', 'thrown upsert']) test('uncertain save ' + failure + ' stays locked until explicit verified reload', async () => {
  const f = await ready(); if (failure === 'thrown upsert') f.throwSave(new Error('synthetic-private-upsert'));
  const saving = f.switch('Meddelanden').props.onValueChange().then(() => null, error => error); await f.tick();
  if (failure === 'network exception') f.writes()[0].reject(new Error('synthetic-private-network'));
  assert.equal(await saving, null); await f.tick(); disabled(f); assert.match(f.text(), /Det gick inte att bekräfta sparningen/);
  const count = f.writes().length; await f.switch('Schemaändringar').props.onValueChange(); assert.equal(f.writes().length, count);
  f.button('Läs in igen').props.onPress(); await f.tick(); f.load(1, bPrefs); await f.tick();
  assert.deepEqual(values(f), [true, false, false]); assert.ok(f.switches().every(node => !node.props.disabled));
});

for (const status of [408, 500, 503]) test('uncertain HTTP ' + status + ' save stays locked; committed values are recovered by explicit reload', async () => {
  const f = await ready(); const saving = f.switch('Meddelanden').props.onValueChange(); await f.tick();
  // Synthetic server commits the body, then reports failure. The UI cannot infer rollback.
  const committed = { ...f.writes()[0].body }; f.fail(f.writes()[0], status); await saving; await f.tick();
  disabled(f); assert.match(f.text(), /Det gick inte att bekräfta sparningen/);
  assert.doesNotMatch(f.text() + JSON.stringify(f.logs), /Dina tidigare inställningar gäller|synthetic-private/);
  f.button('Läs in igen').props.onPress(); await f.tick(); f.load(1, committed); await f.tick();
  assert.equal(f.switch('Meddelanden').props.value, true); assert.ok(f.switches().every(node => !node.props.disabled));
});

test('malformed body, noninteger status or non-DB rejection cannot acknowledge a save', async () => {
  for (const variant of ['body', 'fractional', 'NaN', 'unknown-code']) {
    const f = await ready(); const saving = f.switch('Meddelanden').props.onValueChange(); await f.tick();
    const body = variant === 'body' ? { unexpected: 'synthetic-private-response' }
      : variant === 'unknown-code' ? { code: 'synthetic-private-code', message: 'synthetic-private-response' } : null;
    const response = new globalThis.Response(body ? JSON.stringify(body) : null, {
      status: variant === 'unknown-code' ? 403 : 200, headers: { 'Content-Type': 'application/json' },
    });
    // Deliberately corrupt a mock transport response; the installed SDK still processes it.
    if (variant === 'fractional' || variant === 'NaN') Object.defineProperty(response, 'status', {
      value: variant === 'fractional' ? 200.5 : NaN,
    });
    f.writes()[0].resolve(response); await saving; await f.tick(); disabled(f);
    assert.match(f.text(), /Det gick inte att bekräfta sparningen/);
    assert.doesNotMatch(f.text() + JSON.stringify(f.logs), /synthetic-private/);
  }
});

for (const sequence of ['B', 'B/A']) test('late failed A save cannot rollback or unlock current ' + sequence + ' epoch', async () => {
  const f = await ready(); const saving = f.switch('Meddelanden').props.onValueChange(); await f.tick();
  f.setUser(other); await f.tick(); if (sequence === 'B/A') { f.setUser(actor); await f.tick(); }
  f.load(f.reads().length - 1, bPrefs); await f.tick();
  const currentSaving = f.switch('Meddelanden').props.onValueChange(); await f.tick();
  f.fail(f.writes()[0]); await saving; await f.tick(); disabled(f);
  assert.deepEqual(values(f), [false, false, false]); assert.doesNotMatch(f.text(), /Kunde inte spara/);
  f.acknowledge(f.writes()[1]); await currentSaving; await f.tick();
  assert.ok(f.switches().every(node => !node.props.disabled));
});

test('unmount suppresses pending save rollback, UI errors and logging', async () => {
  const f = await ready(); const saving = f.switch('Meddelanden').props.onValueChange(); await f.tick();
  f.unmount(); f.fail(f.writes()[0]); await saving; await f.tick(); assert.deepEqual(f.lateSetters, []); assert.deepEqual(f.logs, []);
});

test('captured retry from A cannot reload current B context', async () => {
  const f = mount(); await f.tick(); f.fail(f.reads()[0]); await f.tick(); const retry = f.button('Läs in igen').props.onPress;
  f.setUser(other); await f.tick(); f.load(1, bPrefs); await f.tick(); const count = f.reads().length;
  retry(); await f.tick(); assert.equal(f.reads().length, count); assert.deepEqual(values(f), [true, false, false]);
});

test('new permission grant registers the captured current UID; failed registration has clear retry', async () => {
  let registered = false;
  const f = await ready({ permission: 'undetermined', registrationResult: () => registered });
  await f.button('Aktivera push-notiser').props.onPress(); await f.tick(); assert.deepEqual(f.registrations, [actor]);
  assert.match(f.text(), /enheten kunde inte registreras/); registered = true;
  await f.button('Försök registrera igen').props.onPress(); await f.tick(); assert.deepEqual(f.registrations, [actor, actor]);
  assert.doesNotMatch(f.text(), /enheten kunde inte registreras/);
});

test('late permission grant after A/B/A or unmount does not register or write current UI', async () => {
  for (const unmount of [false, true]) {
    const grant = deferred(); const f = await ready({ permission: 'undetermined', permissionResult: () => grant.promise });
    const pending = f.button('Aktivera push-notiser').props.onPress();
    if (unmount) f.unmount(); else { f.setUser(other); await f.tick(); f.setUser(actor); await f.tick(); }
    grant.resolve(true); await pending; await f.tick(); assert.deepEqual(f.registrations, []); assert.deepEqual(f.lateSetters, []);
  }
});

test('fresh permission check on UID change ignores stale A denied result after B grant', async () => {
  const A = deferred(), B = deferred();
  const f = mount({ permission: id => id === actor ? A.promise : B.promise }); await f.tick();
  f.setUser(other); await f.tick(); assert.deepEqual(f.permissionChecks, [actor, other]);
  f.load(1, bPrefs); B.resolve('granted'); await f.tick(); A.resolve('denied'); await f.tick();
  assert.ok(f.switches().every(node => !node.props.disabled)); assert.doesNotMatch(f.text(), /Du har nekat/);
});

test('explicit current-account permission grant supersedes an earlier pending status check', async () => {
  const status = deferred(); const f = await ready({ permission: () => status.promise });
  await f.button('Aktivera push-notiser').props.onPress(); await f.tick(); assert.deepEqual(f.registrations, [actor]);
  status.resolve('denied'); await f.tick();
  assert.doesNotMatch(f.text(), /Du har nekat push-notiser/); assert.ok(f.switches().every(node => !node.props.disabled));
});

test('preference reload preserves a pending current-account permission registration result', async () => {
  const registration = deferred();
  const f = mount({ permission: 'undetermined', registrationResult: () => registration.promise });
  await f.tick(); f.fail(f.reads()[0]); await f.tick();
  const pending = f.button('Aktivera push-notiser').props.onPress(); await f.tick();
  assert.deepEqual(f.registrations, [actor]); f.button('Läs in igen').props.onPress(); await f.tick();
  f.load(1, aPrefs); await f.tick(); registration.resolve(false); await pending; await f.tick();
  assert.match(f.text(), /enheten kunde inte registreras/);
});

test('denied permission and simulator have honest copy; simulator has no activation action; web keeps informational copy', async () => {
  const simulator = await ready({ permission: 'simulator' }); disabled(simulator);
  assert.match(simulator.text(), /Push-notiser fungerar inte i simulator\./); assert.equal(simulator.button('Aktivera push-notiser'), undefined);
  assert.equal(simulator.permissionCalls(), 0); assert.deepEqual(simulator.registrations, []);
  const denied = await ready({ permission: 'denied' }); assert.match(denied.text(), /Du har nekat push-notiser/);
  const web = mount({ platform: 'web' }); await web.tick(); assert.equal(web.switches().length, 0);
  assert.match(web.text(), /Vanliga flödesinlägg skickar inga push-notiser\./);
});
