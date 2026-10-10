import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const require = createRequire(new URL('package.json', root));
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const A = id(1), B = id(2), S = id(3), OTHER = id(4), SERIES = id(5);
const edit = { seriesId: SERIES, label: 'Kvällsarbete', startTime: '17:00', endTime: '18:30' };
const row = (n, changes = {}) => ({ id: id(n), stableId: S, seriesId: SERIES, date: '2099-08-06',
  label: 'Morgonarbete', time: '07:00', slot: 'Morning', icon: 'sun', note: 'Behåll anteckningen. Slut: 08:00',
  status: 'open', ...changes });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const warnings = [];
const safeConsole = { warn: (...args) => warnings.push(args) };
const cache = new Map();
function load(relative, overrides = {}) {
  if (!Object.keys(overrides).length && cache.has(relative)) return cache.get(relative);
  const text = readFileSync(new URL(relative, root), 'utf8');
  const { outputText } = ts.transpileModule(text, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } });
  const module = { exports: {} };
  vm.runInNewContext('(function(require,module,exports){' + outputText + '\n})',
    { Date, Intl, console: safeConsole, AbortController: globalThis.AbortController, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }, { filename: relative })(name => {
    if (name in overrides) return overrides[name];
    if (name.startsWith('@/')) return load(name.slice(2) + (existsSync(new URL(name.slice(2) + '.ts', root)) ? '.ts' : '.tsx'));
    if (name.startsWith('.')) { const url = new URL(name, new URL(relative, root));
      return load(url.href + (existsSync(new URL(url.href + '.ts')) ? '.ts' : '.tsx')); }
    return require(name);
  }, module, module.exports);
  if (!Object.keys(overrides).length) cache.set(relative, module.exports);
  return module.exports;
}
const helper = load('lib/recurringSeries.ts');
const validators = load('lib/dateValidation.ts');
const { MAX_RECURRING_ASSIGNMENTS_PER_BATCH } = load('lib/schedule.ts');
const text = readFileSync(new URL('context/AppDataContext.tsx', root), 'utf8');
const ast = ts.createSourceFile('AppDataContext.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
const declaration = (nodes, name) => nodes.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
  .find(node => node.name.getText(ast) === name);
const topNames = ['resolveSlotFromTime', 'addDays', 'toISODate', 'getWeekdayIndex', 'formatMinutesToTime',
  'parseTimeToMinutes', 'calculateDurationMinutes', 'addMinutesToTime', 'extractEndTimeFromNote', 'buildRecurringAssignmentKey'];
const tops = topNames.map(name => ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)?.getText(ast)).filter(Boolean).join('\n');
const constants = ['slotIcons', 'ASSIGNMENT_NOTE_METADATA_REGEX', 'DEFAULT_ASSIGNMENT_DURATION_MINUTES']
  .map(name => 'const ' + declaration(ast.statements, name).getText(ast) + ';').join('\n');
function action(name, dependencies) {
  const node = declaration(provider.body.statements, name);
  assert.ok(node, 'Actual provider callback missing: ' + name);
  const source = `${tops}\n${constants}\nexport default ({ ${Object.keys(dependencies).join(',')} }) => (${node.initializer.arguments[0].getText(ast)});`;
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  vm.runInNewContext('(function(module,exports){' + outputText + '\n})',
    { Date, console: safeConsole }, { filename: name + '.actual.ts' })(module, module.exports);
  return module.exports.default(dependencies);
}
function context(assignments = [], demo = true, client = {}) {
  const stateRef = { current: { currentStableId: S, currentUserId: A, sessionUserId: A, assignments } };
  const recurringScopeRef = { current: { userId: A, sessionUserId: A, viewerId: A, stableId: S } };
  const dispatched = [], pendingDataWrites = { current: new Set() };
  const deps = { ...validators, ...helper, MAX_RECURRING_ASSIGNMENTS_PER_BATCH, stateRef, recurringScopeRef,
    user: { id: A }, ensurePermission: () => ({ success: true }), pendingDataWrites,
    dataWriteVersion: { current: 0 }, isQaDemoMode: demo, supabase: client,
    dispatch: event => { dispatched.push(event); } };
  return { stateRef, recurringScopeRef, dispatched, pendingDataWrites, deps,
    editSeries: action('updateRecurringAssignmentSeries', deps) };
}
function wire(rows) {
  return rows.map(assignment => ({ id: assignment.id, stable_id: assignment.stableId, series_id: assignment.seriesId,
    date: assignment.date, label: edit.label, time: edit.startTime, slot: 'Evening', icon: 'moon',
    note: 'Behåll anteckningen. Slut: 18:30', status: 'open', assignee_id: null, completed_at: null,
    declined_by_user_ids: [] }));
}
const receipt = rows => ({ user_id: A, stable_id: S, series_id: SERIES, updated_count: rows.length, assignments: wire(rows) });
function sdk(response) {
  const calls = [];
  const client = createClient('https://recurring-fixture.invalid', 'synthetic-public-key', { auth: {
    persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
  }, global: { fetch: async (url, options) => {
    assert.equal(new URL(url).pathname, '/rest/v1/rpc/update_future_open_assignment_series');
    calls.push(JSON.parse(options.body));
    const data = await response();
    return new globalThis.Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } } });
  return { client, calls };
}

test('recurring series: actual create callback retains one durable series UUID across a lost acknowledgement retry', async () => {
  let n = 20;
  const batches = [], dispatched = [];
  const dependencies = { ...validators, MAX_RECURRING_ASSIGNMENTS_PER_BATCH,
    stateRef: { current: { currentStableId: S, currentUserId: A, assignments: [] } },
    recurringDurationById: { current: new Map() }, pendingRecurringBatches: { current: new Map() },
    ensurePermission: () => ({ success: true }), generateId: () => id(n++),
    persistAssignmentBatchInsert: async rows => { batches.push(rows); return { error: batches.length === 1 ? new Error('synthetic lost ack') : null }; },
    persistAssignmentHistory: async () => {}, dispatch: event => dispatched.push(event) };
  const create = action('createRecurringAssignments', dependencies);
  const input = { title: 'Morgonarbete', startTime: '07:00', durationMinutes: 60,
    dateFrom: '2099-08-06', dateTo: '2099-08-06', weekdays: [3], slotsCount: 2 };
  // Use the real date weekday instead of assuming a fixture weekday.
  input.weekdays = [(new Date('2099-08-06T00:00:00').getDay() + 6) % 7];
  assert.equal((await create(input)).success, false);
  assert.equal((await create(input)).success, true);
  assert.equal(batches[0].length, 2);
  assert.equal(batches[0][0].seriesId, batches[0][0].id);
  assert.equal(batches[0][1].seriesId, batches[0][0].seriesId);
  assert.deepEqual(batches[1], batches[0]);
  assert.equal(dispatched.length, 2);
});

test('recurring series: future preview protects assigned, completed, started, invalid-time and legacy rows in Stockholm', () => {
  const now = new Date('2026-10-08T10:00:00Z');
  assert.equal(helper.isFutureOpenSeriesAssignment(row(20, { date: '2026-10-08', time: '12:01' }), now), true);
  for (const changes of [{ status: 'assigned', assigneeId: B }, { status: 'completed' }, { completedAt: '2026-10-01T00:00:00Z' },
    { assigneeId: B }, { date: '2026-10-07' }, { date: '2026-10-08', time: '12:00' },
    { time: 'okänd' }, { seriesId: undefined }, { date: '2026-02-30' }]) {
    assert.equal(helper.isFutureOpenSeriesAssignment(row(20, changes), now), false, JSON.stringify(changes));
  }
});

test('recurring series: actual demo edit touches only future open rows in the selected stable/series, preserving free notes and statuses', async () => {
  const records = [row(20), row(21, { status: 'assigned', assigneeId: B }), row(22, { status: 'completed' }),
    row(23, { date: '2020-01-01' }), row(24, { stableId: OTHER }), row(25, { seriesId: id(99) }), row(26, { time: '?' })];
  const before = globalThis.structuredClone(records), ctx = context(records);
  const result = await ctx.editSeries(edit);
  assert.equal(result.success, true);
  assert.deepEqual(result.data.map(value => value.id), [id(20)]);
  assert.match(result.data[0].note, /^Behåll anteckningen\. Slut: 18:30$/);
  assert.equal(ctx.dispatched.length, 1);
  assert.equal(ctx.dispatched[0].payload.updates.status, undefined);
  assert.equal(ctx.dispatched[0].payload.updates.assigneeId, undefined);
  assert.equal(ctx.dispatched[0].payload.updates.completedAt, undefined);
  assert.deepEqual(records, before, 'Planning must not mutate the source state');
});

test('recurring series: 365 demo edits succeed; 366 fail before dispatch and release the pending guard', async () => {
  for (const count of [MAX_RECURRING_ASSIGNMENTS_PER_BATCH, MAX_RECURRING_ASSIGNMENTS_PER_BATCH + 1]) {
    const ctx = context(Array.from({ length: count }, (_, i) => row(1000 + i)));
    const result = await ctx.editSeries(edit);
    assert.equal(result.success, count === 365);
    assert.equal(ctx.dispatched.length, count === 365 ? 365 : 0);
    assert.equal(ctx.pendingDataWrites.current.size, 0);
  }
});

test('recurring series: installed SDK sends exact own scope and commits local metadata only after complete validated receipt', async () => {
  const wait = deferred();
  const { client, calls } = sdk(() => wait.promise), ctx = context([row(20)], false, client);
  const promise = ctx.editSeries(edit);
  await tick(); assert.equal(ctx.dispatched.length, 0);
  wait.resolve(receipt([row(20)]));
  assert.equal((await promise).success, true);
  assert.deepEqual(calls[0], { p_expected_user_id: A, p_stable_id: S, p_series_id: SERIES,
    p_label: edit.label, p_start_time: edit.startTime, p_end_time: edit.endTime });
  assert.equal(ctx.dispatched[0].payload.updates.time, '17:00');
  assert.equal(ctx.pendingDataWrites.current.size, 0);
});

test('recurring series: malformed/foreign/protected SDK receipts fail closed with fixed logs and no local success', async () => {
  for (const corrupt of [data => { data.user_id = B; }, data => { data.updated_count = 2; },
    data => { data.assignments[0].status = 'assigned'; }, data => { data.assignments[0].assignee_id = B; },
    data => { data.assignments[0].completed_at = '2026-01-01'; }, data => { data.assignments[0].series_id = id(99); },
    data => { data.assignments[0].note = 'untrusted private provider marker'; }]) {
    const data = receipt([row(20)]); corrupt(data);
    const { client } = sdk(async () => data), ctx = context([row(20)], false, client);
    assert.equal((await ctx.editSeries(edit)).success, false);
    assert.equal(ctx.dispatched.length, 0);
  }
  assert.equal(JSON.stringify(warnings).includes('private provider marker'), false);
});

test('recurring series: A/B/A or unmount late receipt cannot dispatch; a newer local claim remains intact', async () => {
  for (const transition of ['aba', 'unmount', 'claim']) {
    const wait = deferred(), { client } = sdk(() => wait.promise), ctx = context([row(20)], false, client);
    const promise = ctx.editSeries(edit); await tick();
    if (transition === 'aba') ctx.recurringScopeRef.current = { ...ctx.recurringScopeRef.current };
    if (transition === 'unmount') ctx.recurringScopeRef.current = null;
    if (transition === 'claim') ctx.stateRef.current.assignments[0] = row(20, { status: 'assigned', assigneeId: B });
    wait.resolve(receipt([row(20)]));
    const result = await promise;
    assert.equal(result.success, transition === 'claim');
    assert.equal(ctx.dispatched.length, 0);
    assert.equal(ctx.pendingDataWrites.current.size, 0);
  }
});

function modal(assignments = [row(20)], onSave = async () => ({ success: true, data: [row(20)] })) {
  let rendering;
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => rendering.state(initial), useRef: initial => rendering.ref(initial),
    useMemo: (fn, deps) => rendering.memo(fn, deps), useEffect: (setup, deps) => rendering.effect(setup, deps) };
  const native = { StyleSheet: { create: value => value } };
  for (const name of ['Modal', 'ScrollView', 'Text', 'TextInput', 'TouchableOpacity', 'View']) native[name] = name;
  const Component = load('components/RecurringSeriesModal.tsx', { react, 'react-native': native,
    '@/components/DateTimeField': { DateTimeField: 'DateTimeField' } }).RecurringSeriesModal;
  class Driver {
    constructor() { this.slots = []; this.live = true; this.closes = 0;
      this.props = { scopeKey: 'A:stable', assignments, onSave, onClose: () => this.closes++ }; this.flush(); }
    state(initial) { const i = this.cursor++, slot = this.slots[i] ??= { value: initial };
      return [slot.value, value => { assert.ok(this.live, 'No state setters after unmount'); slot.value = value; this.dirty = true; }]; }
    ref(initial) { return this.slots[this.cursor++] ??= { current: initial }; }
    memo(fn, deps) { const i = this.cursor++, old = this.slots[i];
      if (!old || deps.some((value, n) => !Object.is(value, old.deps[n]))) this.slots[i] = { deps, value: fn() };
      return this.slots[i].value; }
    effect(setup, deps) { const i = this.cursor++; if (!this.slots[i]) this.slots[i] = { setup, deps, effect: true, pending: true }; }
    flush() { for (let i = 0; i < 8; i++) { this.cursor = 0; this.dirty = false; rendering = this; this.tree = Component(this.props);
      for (const slot of this.slots) if (slot.effect && slot.pending) { slot.pending = false; slot.cleanup = slot.setup(); }
      if (!this.dirty) return; } assert.fail('Component did not settle'); }
    act(fn) { fn(); this.flush(); }
    unmount() { this.live = false; for (const slot of this.slots) if (slot.effect) slot.cleanup?.(); }
  }
  return new Driver();
}
function find(tree, predicate) {
  if (Array.isArray(tree)) { for (const node of tree) { const found = find(node, predicate); if (found) return found; } }
  else if (tree && typeof tree === 'object') return predicate(tree) ? tree : find(tree.props?.children, predicate);
}
const content = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(content).join(' ') : content(tree?.props?.children ?? '');
const saveButton = driver => find(driver.tree, node => node.type === 'TouchableOpacity' && content(node).match(/Spara framtida|Försök igen|Sparar/));
function calendarHost(input) {
  const source = readFileSync(new URL('app/(tabs)/calendar.tsx', root), 'utf8');
  const tree = ts.createSourceFile('calendar.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'CalendarScreen');
  const variable = name => fn.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(tree) === name);
  let element;
  const visit = node => { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'RecurringSeriesModal') element = node;
    ts.forEachChild(node, visit); };
  visit(fn); assert.ok(element, 'Actual calendar series element missing');
  let expression = element;
  while (!ts.isJsxExpression(expression.parent)) expression = expression.parent;
  const actual = `export default ({ assignments,currentStableId,state,authUser,actions,seriesEditor,canManageAssignments,setSeriesEditor }) => {
    const dateTimeScope = ${variable('dateTimeScope').initializer.getText(tree)};
    const activeAssignments = ${variable('activeAssignments').initializer.getText(tree)};
    return (${expression.parent.expression.getText(tree)}); };`;
  const compiled = ts.transpileModule(actual, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext('(function(module,exports){' + compiled + '\n})', {
    React: { useMemo: fn => fn(), createElement: (type, props) => ({ type, props }) }, RecurringSeriesModal: 'ActualSeriesModal',
  })(module, module.exports);
  return module.exports.default(input);
}
async function settled(driver) { await tick(); driver.flush(); }

test('recurring series: actual modal provides empty state, keeps failed draft, allows retry and rejects stale/unmounted controls', async () => {
  assert.match(content(modal([]).tree), /Äldre pass utan serie-ID grupperas inte automatiskt/);
  // Reopen/reload uses actual callback + reducer results, not protected old defaults.
  const originalRows = [row(20), row(21, { date: '2099-08-07' }),
    row(22, { status: 'completed', label: 'Skyddat gammalt namn' }),
    row(23, { date: '2020-01-01', label: 'Historiskt gammalt namn' })];
  const ctx = context(originalRows);
  ctx.stateRef.current.assignmentHistory = [];
  const reducerNode = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'reducer');
  const compiled = ts.transpileModule('export default ' + reducerNode.getText(ast),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext('(function(module,exports){' + compiled + '\n})', { Date })(module, module.exports);
  const update = action('updateRecurringAssignmentSeries', { ...ctx.deps,
    dispatch: event => { ctx.stateRef.current = module.exports.default(ctx.stateRef.current, event); } });
  assert.equal((await update(edit)).success, true);
  for (const records of [ctx.stateRef.current.assignments, [...ctx.stateRef.current.assignments].reverse()]) {
    const reopened = modal(records);
    assert.equal(find(reopened.tree, node => node.type === 'TextInput').props.value, edit.label);
    const start = find(reopened.tree, node => node.type === 'DateTimeField' && node.props.label === 'Seriens starttid');
    assert.equal(start.props.value, edit.startTime);
    reopened.unmount();
  }
  assert.deepEqual(ctx.stateRef.current.assignments.slice(2), originalRows.slice(2));
  const chronological = modal([row(21, { date: '2099-08-07', label: 'Senare öppet pass' }), row(20)]);
  assert.equal(find(chronological.tree, node => node.type === 'TextInput').props.value, 'Morgonarbete');
  chronological.unmount();
  const protectedOnly = modal([row(22, { status: 'completed' })]);
  assert.match(content(protectedOnly.tree), /Inga ändringsbara pass visas här/);
  protectedOnly.unmount();
  // Real host memo + JSX expression: selected stall only and a new mount key.
  let staleWrites = 0;
  const scopeInput = { assignments: [row(24, { stableId: OTHER, seriesId: id(99), label: 'Annat stalls serie' }), row(20)],
    currentStableId: S, state: { sessionUserId: A, currentUserId: A, currentStableId: S }, authUser: { id: A },
    seriesEditor: { initialSeriesId: SERIES }, canManageAssignments: true, setSeriesEditor: () => {},
    actions: { updateRecurringAssignmentSeries: async () => { staleWrites++; return { success: true, data: [] }; } } };
  const hostA = calendarHost(scopeInput);
  assert.deepEqual(Array.from(hostA.props.assignments, value => value.stableId), [S]);
  const scopeA = modal(hostA.props.assignments, hostA.props.onSave);
  scopeA.props = { ...scopeA.props, ...hostA.props }; scopeA.flush();
  scopeA.act(() => find(scopeA.tree, node => node.type === 'TextInput').props.onChangeText('A:s gamla utkast'));
  const staleSave = saveButton(scopeA).props.onPress;
  const hostB = calendarHost({ ...scopeInput, currentStableId: OTHER, state: { ...scopeInput.state, currentStableId: OTHER } });
  assert.deepEqual(Array.from(hostB.props.assignments, value => value.stableId), [OTHER]);
  assert.notEqual(hostA.props.key, hostB.props.key); assert.equal(hostA.props.key, hostA.props.scopeKey);
  scopeA.unmount();
  const scopeB = modal(hostB.props.assignments, hostB.props.onSave); scopeB.props = { ...scopeB.props, ...hostB.props }; scopeB.flush();
  assert.equal(find(scopeB.tree, node => node.type === 'TextInput').props.value, 'Annat stalls serie');
  staleSave(); await tick(); assert.equal(staleWrites, 0); scopeB.unmount();
  assert.equal(calendarHost({ ...scopeInput, canManageAssignments: false }), null);
  let attempts = 0;
  const driver = modal([row(20)], async () => ++attempts === 1
    ? { success: false, reason: 'Syntetiskt sparfel, utkastet finns kvar.' } : { success: true, data: [row(20)] });
  const label = () => find(driver.tree, node => node.type === 'TextInput');
  driver.act(() => label().props.onChangeText('Utkast kvar'));
  driver.act(() => saveButton(driver).props.onPress()); await settled(driver);
  assert.equal(label().props.value, 'Utkast kvar'); assert.match(content(driver.tree), /Syntetiskt sparfel/);
  driver.act(() => saveButton(driver).props.onPress()); await settled(driver);
  assert.equal(attempts, 2); assert.match(content(driver.tree), /Uppdaterade 1 framtida öppna pass/);
  const oldSave = saveButton(driver).props.onPress; driver.unmount(); oldSave(); await tick();
  assert.equal(attempts, 2, 'Detached UI must never start a write');
  let switchedWrites = 0;
  const switched = modal([row(20), row(21, { seriesId: id(99), label: 'Annan serie' })], async () => {
    switchedWrites++; return { success: true, data: [row(20)] };
  });
  const oldLabel = find(switched.tree, node => node.type === 'TextInput').props.onChangeText;
  const oldSeriesSave = saveButton(switched).props.onPress;
  const radio = seriesId => find(switched.tree, node => node.props.accessibilityRole === 'radio' && node.props.key === seriesId);
  switched.act(() => radio(id(99)).props.onPress());
  switched.act(() => radio(SERIES).props.onPress());
  switched.act(() => oldLabel('Gammalt utkast')); oldSeriesSave(); await tick(); switched.flush();
  assert.equal(find(switched.tree, node => node.type === 'TextInput').props.value, 'Morgonarbete');
  assert.equal(switchedWrites, 0, 'Detached A callback must not write after A→B→A');
  switched.act(() => find(switched.tree, node => node.type === 'TextInput').props.onChangeText('Nytt utkast'));
  assert.equal(find(switched.tree, node => node.type === 'TextInput').props.value, 'Nytt utkast');
  switched.unmount();
  const wait = deferred(), pending = modal([row(20)], () => wait.promise);
  pending.act(() => saveButton(pending).props.onPress());
  pending.act(() => saveButton(pending).props.onPress());
  assert.equal(pending.closes, 0); pending.unmount(); wait.resolve({ success: false, reason: 'Late error' }); await tick();
});
