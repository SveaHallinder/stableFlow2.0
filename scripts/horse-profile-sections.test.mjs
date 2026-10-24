import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { URL } from 'node:url';
import ts from 'typescript';

function screenHarness() {
  const values = [];
  let cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value; }];
    },
    useCallback: callback => callback,
  };
  const horse = { id: 'horse-1', name: 'Cinder', stableId: 'stable-1', ownerUserId: 'owner' };
  const state = { horses: [horse], currentStableId: 'stable-1', currentUserId: 'owner', users: {}, stables: [], paddocks: [], horseDayStatuses: [], rideLogs: [], feedPlans: [], feedChecks: [], plannedRides: [], careEvents: [], externalContacts: [] };
  const native = new Proxy({ StyleSheet: { create: value => value, hairlineWidth: 1 } }, { get: (target, key) => target[key] ?? key });
  const colors = new Proxy({}, { get: (_, key) => String(key) });
  const require = name => {
    if (name === 'react') return React;
    if (name === 'react-native') return native;
    if (name === 'expo-router') return { useLocalSearchParams: () => ({ id: horse.id }), useRouter: () => ({ canGoBack: () => true }) };
    if (name === '@/context/AppDataContext') return { useAppData: () => ({ state, derived: { permissions: {} }, actions: {} }) };
    if (name === '@/context/AuthContext') return { useAuth: () => ({ user: { id: 'owner' } }) };
    if (name === '@/components/theme') return { theme: { colors, gradients: { background: [] }, fonts: {} } };
    if (name === '@/design/tokens') return { color: {}, radius: {} };
    if (name === '@/hooks/useIsDesktopWeb') return { useIsDesktopWeb: () => false };
    if (name === '@/components/ToastProvider') return { useToast: () => ({}) };
    if (name === '@/lib/horseAccess') return { getResponsibleUsersForHorse: () => [] };
    if (name === '@/lib/paddockLinks') return { getHorsePaddocks: () => [], hasUnconfirmedPaddockLinks: () => false };
    if (name === '@/lib/horseAge') return { getHorseAge: () => 7 };
    if (name === '@/lib/schedule') return { toISODate: () => '2026-10-23' };
    return new Proxy({}, { get: (_, key) => key });
  };
  const module = { exports: {} };
  const source = readFileSync(new URL('../app/horses/[id].tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, { module, exports: module.exports, require });
  const render = () => { cursor = 0; return module.exports.default(); };
  return { render };
}
function findAll(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(item => findAll(item, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...findAll(node.props?.children, predicate)];
}

test('horse sections switch focus while keeping all editors mounted for unsaved drafts', () => {
  const screen = screenHarness();
  let tree = screen.render();
  const tabs = findAll(tree, node => node.props?.accessibilityRole === 'tab');
  assert.deepEqual(tabs.map(tab => tab.props.accessibilityLabel), ['Översikt', 'Foder', 'Ridning', 'Vård']);
  assert.equal(tabs[0].props.accessibilityState.selected, true);
  tabs[1].props.onPress();
  tree = screen.render();
  const panels = findAll(tree, node => node.props?.testID?.startsWith('horse-section-'));
  assert.equal(panels.length, 4);
  assert.equal(panels.find(panel => panel.props.testID === 'horse-section-feed').props.accessibilityElementsHidden, false);
  assert.equal(panels.find(panel => panel.props.testID === 'horse-section-overview').props.accessibilityElementsHidden, true);
  const cards = findAll(tree, node => node.props?.title === 'Foderplan');
  assert.equal(cards.length, 1, 'feed editor remains mounted in its panel');
  assert.equal(findAll(tree, node => node.props?.title === 'Ridning/träning').length, 1, 'riding draft remains mounted');
});
