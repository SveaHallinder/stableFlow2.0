import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function fixture() {
  const routes = [], calls = [], hooks = [];
  let cursor = 0;
  const state = {
    currentUserId: 'me', sessionUserId: 'me', currentStableId: 'stable-a', blockedUserIds: ['blocked'], conversations: {},
    stables: [{ id: 'stable-a', name: 'Mitt stall' }],
    users: Object.fromEntries([
      ['me', 'Jag', 'stable-a'], ['peer', 'Åsa Öberg', 'stable-a'], ['foreign', 'Fel stall', 'stable-b'], ['blocked', 'Blockerad', 'stable-a'],
    ].map(([id, name, stableId]) => [id, { id, name, membership: [{ stableId }] }])),
    messages: [{ id: 'stable-chat', title: 'Mitt stall', stableId: 'stable-a', group: true, readMessageIds: [], unreadMessageIds: [] }],
  };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), memo: component => component,
    useState(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial; return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return hooks[index] ??= { current: initial }; },
    useMemo: calculate => calculate(), useCallback: callback => callback, useEffect() {},
  };
  let response = { success: true, data: 'private-chat' };
  const actions = { async createPrivateConversation(id) { calls.push(id); return typeof response === 'function' ? response() : response; }, async refreshData() {} };
  const native = new Proxy({ StyleSheet: { create: value => value, hairlineWidth: 1 } }, { get: (target, key) => target[key] ?? key });
  const require = name => {
    if (name === 'react') return React;
    if (name === 'react-native') return native;
    if (name === 'expo-router') return { useRouter: () => ({ push: route => routes.push(route) }) };
    if (name === '@/context/AppDataContext') return { useAppData: () => ({ state, actions, derived: { permissions: {} } }) };
    if (name === '@/components/theme') return { theme: { colors: {}, fonts: {} } };
    if (name === '@/design/tokens') return { radius: {}, space: {} };
    if (name === '@/design/system') return { systemPalette: {} };
    if (name === '@/hooks/useIsDesktopWeb') return { useIsDesktopWeb: () => false };
    return new Proxy({}, { get: (_, key) => key });
  };
  const module = { exports: {} };
  const source = readFileSync(new URL('../app/(tabs)/messages.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, { module, exports: module.exports, require, console });
  const render = () => { cursor = 0; return module.exports.default(); };
  return { state, routes, calls, render, response(value) { response = value; } };
}
function all(node) {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!node || typeof node !== 'object') return [];
  return [node, ...all(node.props?.children), ...all(node.props?.primaryAction)];
}
function find(tree, label) { return all(tree).find(node => node.props?.accessibilityLabel === label); }
function open(f) {
  const action = all(f.render()).find(node => node.props?.label === 'Ny chatt');
  assert.ok(action, 'new chat must have a visible text entry');
  action.props.onPress();
  return f.render();
}

test('Ny chatt offers accepted current-stable peers and keeps the real stable chat visible', () => {
  const f = fixture(); const tree = open(f);
  assert.ok(find(tree, 'Starta privat chatt med Åsa Öberg'));
  for (const name of ['Jag', 'Fel stall', 'Blockerad']) assert.equal(find(tree, `Starta privat chatt med ${name}`), undefined);
  const stableChat = all(tree).find(node => node.props?.item?.id === 'stable-chat');
  assert.ok(stableChat, 'existing stable conversation stays in the actual list');
});

test('new chat member search matches Swedish names and never broadens stable scope', () => {
  const f = fixture(); let tree = open(f);
  find(tree, 'Sök medlem för ny chatt').props.onChangeText('åSA');
  assert.ok(find(f.render(), 'Starta privat chatt med Åsa Öberg'));
  find(f.render(), 'Sök medlem för ny chatt').props.onChangeText('Fel stall');
  assert.equal(find(f.render(), 'Starta privat chatt med Fel stall'), undefined);
});

test('private creation failure retains chooser and query; success navigates only to confirmed ID', async () => {
  const f = fixture(); open(f); f.response({ success: false, reason: 'Testfel. Försök igen.' });
  find(f.render(), 'Sök medlem för ny chatt').props.onChangeText('Åsa');
  await find(f.render(), 'Starta privat chatt med Åsa Öberg').props.onPress();
  assert.equal(f.routes.length, 0);
  assert.equal(find(f.render(), 'Sök medlem för ny chatt').props.value, 'Åsa');
  assert.ok(all(f.render()).some(node => node.props?.accessibilityRole === 'alert' && node.props.children.includes('Testfel. Försök igen.')));
  f.response({ success: true, data: 'confirmed-chat' });
  await find(f.render(), 'Starta privat chatt med Åsa Öberg').props.onPress();
  assert.equal(f.routes[0].pathname, '/chat/[id]');
  assert.equal(f.routes[0].params.id, 'confirmed-chat');
});

test('late chat acknowledgement after stable switch cannot navigate', async () => {
  const f = fixture(); open(f); let resolve;
  f.response(() => new Promise(done => { resolve = done; }));
  const request = find(f.render(), 'Starta privat chatt med Åsa Öberg').props.onPress();
  f.state.currentStableId = 'stable-b'; f.render();
  resolve({ success: true, data: 'old-chat' }); await request;
  assert.equal(f.routes.length, 0);
});

test('old chooser acknowledgement after stable ABA cannot navigate', async () => {
  const f = fixture(); open(f); let resolve;
  f.response(() => new Promise(done => { resolve = done; }));
  const request = find(f.render(), 'Starta privat chatt med Åsa Öberg').props.onPress();
  f.state.currentStableId = 'stable-b'; f.render();
  f.state.currentStableId = 'stable-a'; f.render();
  resolve({ success: true, data: 'old-chat' }); await request;
  assert.equal(f.routes.length, 0);
});

test('double press starts one private-conversation request', async () => {
  const f = fixture(); open(f); let resolve;
  f.response(() => new Promise(done => { resolve = done; }));
  const action = find(f.render(), 'Starta privat chatt med Åsa Öberg').props.onPress;
  const first = action(); await action();
  assert.deepEqual(f.calls, ['peer']);
  resolve({ success: false, reason: 'Försök igen.' }); await first;
});
