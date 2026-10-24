import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function renderScreen(path, { owner = false, canGoBack = false, pathname = '/' } = {}) {
  const calls = [];
  const router = { push: route => calls.push(['push', route]), replace: route => calls.push(['replace', route]), back: () => calls.push(['back']), canGoBack: () => canGoBack };
  const React = { Fragment: 'Fragment', createElement: (type, props, ...children) => {
    const nextProps = { ...props, children: children.flat(Infinity) };
    return typeof type === 'function' ? type(nextProps) : { type, props: nextProps, children: nextProps.children };
  } };
  const modules = {
    react: { __esModule: true, default: React },
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'ScrollView', StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { useRouter: () => router, usePathname: () => pathname, useGlobalSearchParams: () => ({}) },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '@/hooks/useIsDesktopWeb': { useIsDesktopWeb: () => false },
    '@/context/AppDataContext': { useAppData: () => ({ state: { currentUserId: 'me', currentStableId: 'stable', stables: [{ id: 'stable', name: 'Stallet' }], users: { me: { name: 'Test Person', membership: [] } } }, derived: { canManageOnboardingAny: true, permissions: { canManageOnboarding: owner } } }) },
    '@/components/theme': { theme: { colors: {}, fonts: {} } },
    '@/design/system': { systemFonts: {}, systemPalette: {} },
    '@/components/Primitives': { Card: 'Card', HeaderIconButton: 'HeaderIconButton', HeaderActionButton: 'HeaderActionButton' },
    '@/components/Avatar': { Avatar: 'Avatar' },
    '@/components/AppIcon': { AppIcon: 'AppIcon' },
    '@/components/DesktopNav': { DesktopNav: 'DesktopNav' },
    '@/components/ScreenHeader': { ScreenHeader: 'ScreenHeader' },
  };
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  new Function('require', 'exports', outputText)(name => modules[name] ?? { default: 'Svg' }, exports);
  return { tree: path.includes('ScreenHeader') ? exports.ScreenHeader({ title: 'Idag' }) : exports.default(), calls };
}

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...(node.children ?? []).flatMap(nodes)];
}

test('root header names the menu and opens a discoverable destination', () => {
  const { tree, calls } = renderScreen('components/ScreenHeader.tsx');
  const button = nodes(tree).find(node => node.props?.accessibilityLabel === 'Öppna meny');
  assert.ok(button, 'An unlabeled avatar must not be the only navigation entry');
  assert.ok(nodes(button).some(node => node.children?.includes('Meny')));
  button.props.onPress();
  assert.deepEqual(calls, [['push', '/menu']]);
});

test('menu exposes profile, horses, members and conversations to ordinary members', () => {
  const { tree, calls } = renderScreen('app/menu.tsx');
  for (const [label, route] of [['Min profil', '/profile'], ['Hästar', '/stable-horses'], ['Medlemmar', '/members'], ['Chatt', '/messages']]) {
    const button = nodes(tree).find(node => node.props?.accessibilityLabel === label);
    assert.ok(button, `Missing ${label}`);
    button.props.onPress();
    assert.deepEqual(calls.at(-1), ['push', route]);
  }
  assert.ok(!nodes(tree).some(node => node.props?.accessibilityLabel === 'Mitt stall'), 'Owning a different stable must not expose current-stable owner tools');
});

test('current stable owner can open management and menu has a safe Back fallback', () => {
  const { tree, calls } = renderScreen('app/menu.tsx', { owner: true });
  const management = nodes(tree).find(node => node.props?.accessibilityLabel === 'Mitt stall');
  assert.ok(management);
  management.props.onPress();
  assert.deepEqual(calls.at(-1), ['push', '/admin']);
  const header = nodes(tree).find(node => node.type === 'ScreenHeader');
  const back = header.props.left;
  back.props.onPress();
  assert.deepEqual(calls.at(-1), ['replace', '/']);
  const withHistory = renderScreen('app/menu.tsx', { canGoBack: true });
  nodes(withHistory.tree).find(node => node.type === 'ScreenHeader').props.left.props.onPress();
  assert.deepEqual(withHistory.calls, [['back']]);
});
