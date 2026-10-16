import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const require = createRequire(new URL('package.json', root));
const ts = require('typescript');
const equalDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

function fixture(platform = 'ios') {
  let rendering;
  const opens = [], cache = new Map();
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: value => rendering.state(value),
    useRef: value => rendering.ref(value),
    useCallback: (fn, deps) => rendering.memo(() => fn, deps),
    useMemo: (fn, deps) => rendering.memo(fn, deps),
    useLayoutEffect: (fn, deps) => rendering.effect(fn, deps),
  };
  const native = { Platform: { OS: platform },
    StyleSheet: { create: styles => styles, flatten: style => Array.isArray(style) ? Object.assign({}, ...style) : style } };
  for (const name of ['Modal', 'Text', 'TouchableOpacity', 'View', 'TextInput']) native[name] = name;
  const sdk = { __esModule: true, default: 'NativePicker', DateTimePickerAndroid: {
    open: options => opens.push(options), dismiss: async () => true,
  } };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const source = readFileSync(new URL(relative, root), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
    } });
    const module = { exports: {} };
    const resolve = name => name === 'react' ? react : name === 'react-native' ? native
      : name === '@react-native-community/datetimepicker' ? sdk
      : name.startsWith('@/') ? load(name.slice(2) + '.ts')
      : assert.fail('Unexpected component dependency: ' + name);
    vm.runInNewContext('(function(require,module,exports){' + outputText + '\n})', { Date, console },
      { filename: relative })(resolve, module, module.exports);
    cache.set(relative, module.exports);
    return module.exports;
  }
  const Field = load('components/DateTimeField.native.tsx').DateTimeField;
  const Web = load('components/DateTimeField.tsx').DateTimeField;
  class Driver {
    constructor(props) { this.props = props; this.slots = []; this.live = true; this.flush(); }
    state(initial) {
      const i = this.cursor++, slot = this.slots[i] ??= { value: initial };
      return [slot.value, value => {
        assert.ok(this.live, 'A stale picker must not update an unmounted field');
        const next = typeof value === 'function' ? value(slot.value) : value;
        if (!Object.is(next, slot.value)) { slot.value = next; this.dirty = true; }
      }];
    }
    ref(value) { return this.slots[this.cursor++] ??= { current: value }; }
    memo(fn, deps) {
      const i = this.cursor++;
      if (!equalDeps(this.slots[i]?.deps, deps)) this.slots[i] = { value: fn(), deps };
      return this.slots[i].value;
    }
    effect(setup, deps) {
      const i = this.cursor++, old = this.slots[i];
      if (!old) this.slots[i] = { setup, deps, pending: true, effect: true };
      else if (!equalDeps(old.deps, deps)) Object.assign(old, { setup, deps, pending: true });
    }
    flush(patch) {
      this.props = { ...this.props, ...patch };
      for (let i = 0; i < 12; i++) {
        this.cursor = 0; this.dirty = false; rendering = this; this.tree = Field(this.props);
        for (const slot of this.slots) if (slot.effect && slot.pending) {
          slot.cleanup?.(); slot.pending = false; slot.cleanup = slot.setup();
        }
        if (!this.dirty) return;
      }
      assert.fail('The synthetic component did not settle');
    }
    act(callback) { callback(); this.flush(); }
    unmount() { this.live = false; for (const slot of this.slots) if (slot.effect) slot.cleanup?.(); }
  }
  return { Web, opens, field: props => {
    const changes = [];
    const driver = new Driver({ label: 'Testfält', mode: 'time', value: '07:05', scopeKey: 'horse-A',
      onChangeText: value => changes.push(value), ...props });
    return { driver, changes };
  } };
}
function find(tree, predicate) {
  if (Array.isArray(tree)) { for (const node of tree) { const match = find(node, predicate); if (match) return match; } }
  else if (tree && typeof tree === 'object') return predicate(tree) ? tree : find(tree.props?.children, predicate);
}
const button = (driver, suffix = '') => find(driver.tree,
  node => node.type === 'TouchableOpacity' && node.props.accessibilityLabel === 'Testfält' + suffix);
const picker = driver => find(driver.tree, node => node.type === 'NativePicker');
const event = type => ({ type, nativeEvent: { timestamp: 0, utcOffset: 0 } });
const open = driver => driver.act(() => button(driver).props.onPress());
const choose = (driver, date) => driver.act(() => picker(driver).props.onChange(event('set'), date));
const press = (driver, suffix) => driver.act(() => button(driver, suffix).props.onPress());

test('date/time field: web forwards date and time edits through the actual callback', () => {
  const { Web } = fixture();
  for (const [mode, value] of [['date', '2026-03-29'], ['time', '23:59']]) {
    const changes = [];
    const input = Web({ label: 'Testfält', mode, value, scopeKey: 'horse-A', onChangeText: next => changes.push(next) });
    assert.equal(input.props.value, value);
    input.props.onChangeText(''); input.props.onChangeText(value);
    assert.deepEqual(changes, ['', value]);
  }
});

test('date/time field: iOS cancel preserves empty time and Klar/Rensa commit explicitly', () => {
  const { driver, changes } = fixture().field({ value: '', allowClear: true });
  try {
    open(driver); choose(driver, new Date(2000, 0, 15, 0, 5));
    assert.deepEqual(changes, []); press(driver, ', avbryt'); assert.deepEqual(changes, []);
    open(driver); choose(driver, new Date(2000, 0, 15, 23, 59)); press(driver, ', klar');
    assert.deepEqual(changes, ['23:59']);
    driver.flush({ value: '23:59' }); press(driver, ', rensa'); assert.deepEqual(changes, ['23:59', '']);
  } finally { driver.unmount(); }
});

test('date/time field: Android dismiss, duplicate set and unmounted events do not change the draft', () => {
  const { field, opens } = fixture('android');
  const { driver, changes } = field({ mode: 'date', value: '2026-03-29' });
  open(driver); driver.act(() => opens.at(-1).onChange(event('dismissed')));
  assert.deepEqual(changes, []);
  open(driver); const accept = opens.at(-1).onChange;
  driver.act(() => accept(event('set'), new Date(2026, 2, 29, 12)));
  driver.act(() => accept(event('set'), new Date(2026, 2, 30, 12)));
  assert.deepEqual(changes, ['2026-03-29']);
  open(driver); const late = opens.at(-1).onChange; driver.unmount();
  late(event('set'), new Date(2026, 2, 31, 12)); assert.deepEqual(changes, ['2026-03-29']);
});

test('date/time field: old Klar cannot write into another horse with the same value', () => {
  const { driver, changes } = fixture().field(); const nextChanges = [];
  try {
    open(driver); choose(driver, new Date(2000, 0, 15, 10, 5));
    const oldKlar = button(driver, ', klar').props.onPress;
    driver.flush({ scopeKey: 'horse-B', onChangeText: next => nextChanges.push(next) });
    driver.act(oldKlar); assert.deepEqual(changes, []); assert.deepEqual(nextChanges, []);
    open(driver); choose(driver, new Date(2000, 0, 15, 12, 30)); press(driver, ', klar');
    assert.deepEqual(nextChanges, ['12:30']);
  } finally { driver.unmount(); }
});

test('date/time field: same-horse inline callback rerender preserves the selected time', () => {
  const { driver, changes } = fixture().field(); const nextChanges = [];
  try {
    open(driver); choose(driver, new Date(2000, 0, 15, 8, 45));
    driver.flush({ onChangeText: next => nextChanges.push(next) }); press(driver, ', klar');
    assert.deepEqual(changes, []); assert.deepEqual(nextChanges, ['08:45']);
  } finally { driver.unmount(); }
});

test('date/time field: changed mode/value/availability and unmount reject captured controls', () => {
  for (const patch of [{ mode: 'date' }, { value: '08:00' }, { active: false }, { editable: false }, null]) {
    const { driver, changes } = fixture().field({ allowClear: true });
    open(driver); choose(driver, new Date(2000, 0, 15, 9, 15));
    const oldKlar = button(driver, ', klar').props.onPress;
    const oldClear = button(driver, ', rensa').props.onPress;
    if (patch) driver.flush(patch); else driver.unmount();
    oldKlar(); oldClear(); assert.deepEqual(changes, []);
    if (patch) driver.unmount();
  }
});

test('date/time field: local dates roundtrip across daylight-saving zones', () => {
  if (process.env.STABLEFLOW_DATE_TIME_TZ_CASE !== '1') {
    for (const TZ of ['Europe/Stockholm', 'America/Los_Angeles', 'Pacific/Auckland']) {
      const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap',
        '--test-name-pattern=local dates roundtrip', fileURLToPath(import.meta.url)], {
        encoding: 'utf8', timeout: 15000,
        env: { PATH: process.env.PATH ?? '', TZ, STABLEFLOW_DATE_TIME_TZ_CASE: '1' },
      });
      assert.match(output, /^# pass 1$/m, TZ);
    }
    return;
  }
  const { field } = fixture();
  for (const value of ['2026-03-08', '2026-03-29', '2026-04-05', '2026-09-27', '2026-10-25', '2026-11-01']) {
    const { driver, changes } = field({ mode: 'date', value });
    try {
      open(driver); assert.equal(picker(driver).props.value.getHours(), 12);
      press(driver, ', klar'); assert.deepEqual(changes, [value]);
    } finally { driver.unmount(); }
  }
});
