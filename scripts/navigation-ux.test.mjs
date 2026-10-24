import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function renderNavigation({ session = {}, params = {}, desktop = false } = {}) {
  const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }) };
  const Tabs = Object.assign(() => null, { Screen: 'TabScreen' });
  const modules = {
    react: { __esModule: true, default: React },
    'expo-router': { Tabs, useGlobalSearchParams: () => params },
    'react-native': { View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: value => value, hairlineWidth: 1 } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34 }) },
    '@/context/AuthContext': { useAuth: () => ({ session, loading: false }) },
    '@/hooks/useIsDesktopWeb': { useIsDesktopWeb: () => desktop },
    '@/components/theme': { theme: { colors: {}, fonts: {}, radii: {} } },
    '@/components/AppIcon': { AppIcon: 'AppIcon' },
    '@/components/DesktopNav': { DesktopNav: 'DesktopNav' },
    'expo-blur': { BlurView: 'BlurView' },
    '@expo/vector-icons': { Feather: 'Feather' },
  };
  const source = readFileSync(new URL('../app/(tabs)/_layout.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  new Function('require', 'exports', outputText)(name => modules[name] ?? { default: 'Svg' }, exports);
  return exports.default();
}
function find(node, type) {
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === type ? [node] : []), ...node.children.flatMap(child => find(child, type))];
}

test('five main tabs keep the account route available outside the tab bar', () => {
  const screens = find(renderNavigation(), 'TabScreen');
  const visible = screens.filter(screen => screen.props.options.href !== null);
  assert.deepEqual(visible.map(screen => screen.props.options.title), ['Idag', 'Hästar', 'Schema', 'Flöde', 'Chatt']);
  assert.equal(screens.find(screen => screen.props.name === 'profile')?.props.options.href, null);
});

test('onboarding hides the tab bar and unauthenticated sessions render no navigation', () => {
  const tree = renderNavigation({ params: { fromOnboarding: '1' } });
  const tabs = find(tree, tree.type)[0];
  assert.equal(tabs.props.screenOptions.tabBarStyle.display, 'none');
  assert.equal(find(renderNavigation({ session: null }), 'TabScreen').length, 0);
});
