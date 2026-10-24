import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadFlow() {
  let source = '';
  try { source = await readFile(new URL('../lib/onboarding-flow.ts', import.meta.url), 'utf8'); } catch {}
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const flow = await loadFlow();
const saved = { layoutConfirmed: true, hasStable: true, resourcesComplete: true, hasHorse: true, hasAssignment: true };

test('registration-created stable still asks owner to choose the layout', () => {
  assert.equal(typeof flow.getOwnerOnboardingStep, 'function');
  assert.equal(flow.getOwnerOnboardingStep({ ...saved, layoutConfirmed: false, resourcesComplete: false }), 0);
});
test('next onboarding task follows the saved stable, resource, horse and pass gates', () => {
  assert.equal(typeof flow.getOwnerOnboardingStep, 'function');
  assert.equal(flow.getOwnerOnboardingStep({ ...saved, hasStable: false }), 1);
  assert.equal(flow.getOwnerOnboardingStep({ ...saved, resourcesComplete: false }), 1);
  assert.equal(flow.getOwnerOnboardingStep({ ...saved, hasHorse: false }), 2);
  assert.equal(flow.getOwnerOnboardingStep({ ...saved, hasAssignment: false }), 3);
  assert.equal(flow.getOwnerOnboardingStep(saved), 4);
});
test('single-stable selection reuses a saved stable instead of opening duplicate creation', () => {
  assert.equal(typeof flow.getOnboardingLayoutRoute, 'function');
  assert.equal(flow.getOnboardingLayoutRoute('single', true), '/(onboarding)/arena');
  assert.equal(flow.getOnboardingLayoutRoute('single', false), '/(onboarding)/create-stable');
  assert.equal(flow.getOnboardingLayoutRoute('farm', true), '/(onboarding)/farm');
});
test('farm draft reuses only owner-managed stables and preserves their identifiers', () => {
  assert.equal(typeof flow.getReusableOnboardingStables, 'function');
  const stables = [{ id: 'own', name: 'Mitt stall' }, { id: 'other', name: 'Annat stall' }, { id: 'farm', name: 'Redan kopplat', farmId: 'existing-farm' }];
  const membership = [{ stableId: 'own', role: 'admin', access: 'owner' }, { stableId: 'other', role: 'rider', access: 'view' }, { stableId: 'farm', role: 'admin', access: 'owner' }];
  assert.deepEqual(flow.getReusableOnboardingStables(stables, membership), [stables[0]]);
});
test('workspace owner access is independent of device platform and rejects staff/read members', () => {
  assert.equal(typeof flow.canOpenOwnerWorkspace, 'function');
  for (const platform of ['ios', 'android', 'web']) {
    assert.equal(flow.canOpenOwnerWorkspace({ canManageOnboardingAny: true }, platform), true);
    assert.equal(flow.canOpenOwnerWorkspace({ canManageOnboardingAny: false }, platform), false);
  }
});
test('finishing onboarding always opens Idag', () => {
  assert.equal(flow.ONBOARDING_FINISH_ROUTE, '/(tabs)');
});

async function loadCallback(file, component, name, dependencies) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === component).body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === name);
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

test('farm onboarding links the existing stable without recreating or resetting its settings', async () => {
  const writes = [];
  const errors = [];
  const existing = { id: 'saved-stable', name: 'Stallet', location: 'Åkersberga', settings: { onboarding: { resourcesComplete: true } } };
  const save = await loadCallback('../app/(onboarding)/farm.tsx', 'OnboardingFarm', 'handleSave', {
    savingRef: { current: false }, setSaving() {}, setSaveError: message => errors.push(message),
    farmName: 'Min gård', stablesDraft: [{ id: existing.id, name: 'Stallet', adminType: 'self', adminEmail: '' }],
    state: { currentUserId: 'owner', stables: [existing] }, farmIdRef: { current: 'farm' },
    isQaDemoMode: true, generateId: () => 'unexpected', router: { replace() {} }, returnTo: '/setup',
    console: { warn() {} }, toast: { showToast() {} },
    actions: {
      upsertFarm: async () => ({ success: true, data: { id: 'farm' } }),
      updateStable: async input => { writes.push(input); return { success: true, data: { ...existing, farmId: 'farm' } }; },
      upsertStable: async input => { writes.push({ unwantedCreate: input }); return { success: true, data: { id: input.requestId } }; },
      setCurrentStable() {},
    },
  });
  await save();
  assert.deepEqual(writes, [{ id: existing.id, updates: { name: 'Stallet', farmId: 'farm' } }]);
  assert.deepEqual(errors, [null]);
});

test('actual owner workspace renders its management UI on native and keeps the role guard', async () => {
  const { default: vm } = await import('node:vm');
  const source = await readFile(new URL('../app/admin/index.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('admin.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const implementation = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n');
  const { outputText } = ts.transpileModule(implementation, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
  function render(owner, selectedAction = null) {
    let stateIndex = 0;
    const context = {
      exports: {},
      React: { createElement: (type, props, ...children) => ({ type: typeof type === 'function' ? type.name : type, props, children }), useMemo: fn => fn(), useState: initial => [stateIndex++ === 0 ? selectedAction : typeof initial === 'function' ? initial() : initial, () => {}], useRef: value => ({ current: value }), useCallback: fn => fn, useEffect() {} },
      Platform: { OS: 'ios' }, StyleSheet: { create: value => value, hairlineWidth: 1 },
      theme: { colors: {}, gradients: { background: ['#fff', '#fff'] } }, radius: {},
      useRouter: () => ({ replace() {}, push() {} }), useToast: () => ({ showToast() {} }), useIsDesktopWeb: () => false,
      useAppData: () => ({ state: { currentUserId: 'owner', currentStableId: 's', stables: [{ id: 's', name: 'Stallet' }], farms: [], horses: [], users: { owner: { name: 'Ägare', membership: [{ stableId: 's', role: owner ? 'admin' : 'rider', access: owner ? 'owner' : 'view' }] } }, paddockLinksReady: true }, actions: {}, derived: { canManageOnboardingAny: owner } }),
      canOpenOwnerWorkspace: flow.canOpenOwnerWorkspace,
    };
    for (const name of ['View', 'Text', 'TouchableOpacity', 'ScrollView', 'SafeAreaView', 'LinearGradient', 'TextInput', 'Feather', 'ScreenHeader', 'DesktopNav', 'StableSwitcher', 'Card', 'HeaderIconButton', 'InviteReceipt', 'StableInviteList']) context[name] = name;
    vm.runInNewContext(outputText, context);
    return JSON.stringify(context.exports.default());
  }
  assert.match(render(true), /Mitt stall/);
  assert.doesNotMatch(render(true), /\"type\":\"TextInput\"/);
  assert.equal((render(true, 'invite').match(/\"type\":\"TextInput\"/g) ?? []).length, 2);
  assert.equal((render(true, 'horse').match(/\"type\":\"TextInput\"/g) ?? []).length, 1);
  assert.doesNotMatch(render(true, 'invite'), /\"placeholder\":\"Stallnamn\"/);
  assert.doesNotMatch(render(true), /Admin finns på webben/);
  assert.match(render(false), /Du har inte adminbehörighet/);
  assert.doesNotMatch(render(false), /Bjud in medlem/);
});

test('editing stable details returns to the mounted resource editor so unsaved answers survive', async () => {
  const source = await readFile(new URL('../app/(onboarding)/arena.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('arena.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onPress' && node.initializer?.getText(ast).includes('/(onboarding)/stable-details')) callback = node.initializer.expression;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(callback);
  const { outputText } = ts.transpileModule(`export default router => (${callback.getText(ast)})();`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const routes = [];
  (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default({ push: route => routes.push(route) });
  assert.deepEqual(routes, ['/(onboarding)/stable-details']);
});

test('actual onboarding footer exposes next, back, skip and later as named buttons', async () => {
  const { default: vm } = await import('node:vm');
  const source = await readFile(new URL('../components/OnboardingShell.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('shell.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const implementation = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n');
  const { outputText } = ts.transpileModule(implementation, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
  const context = {
    exports: {}, React: { createElement: (type, props, ...children) => ({ type, props, children }), useCallback: fn => fn },
    StyleSheet: { create: value => value, hairlineWidth: 1 }, theme: { colors: {} }, radius: {},
    useRouter: () => ({}), useAppData: () => ({ actions: {} }),
    ONBOARDING_FINISH_ROUTE: flow.ONBOARDING_FINISH_ROUTE, OWNER_ONBOARDING_STEPS: ['Upplägg', 'Ditt stall', 'Hästar', 'Första passet'],
  };
  for (const name of ['View', 'Text', 'TouchableOpacity', 'ScrollView', 'SafeAreaView', 'Feather', 'ScreenHeader', 'HeaderIconButton']) context[name] = name;
  vm.runInNewContext(outputText, context);
  const tree = context.exports.OnboardingShell({ title: 'Redo', step: 4, total: 4, nextLabel: 'Öppna Idag', onNext() {}, onBack() {}, onSkip() {}, disableNext: true });
  const touches = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'TouchableOpacity') touches.push(node.props);
    for (const child of node.children ?? []) visit(child);
  }
  visit(tree);
  assert.equal(touches.length, 4);
  for (const label of ['Öppna Idag', 'Tillbaka', 'Hoppa över', 'Gör senare']) {
    const button = touches.find(props => props.accessibilityRole === 'button' && props.accessibilityLabel === label);
    assert.ok(button, `Missing named button: ${label}`);
    if (label === 'Öppna Idag') assert.equal(button.accessibilityState.disabled, true);
  }
});

test('actual onboarding layout choices expose their names as buttons', async () => {
  const { default: vm } = await import('node:vm');
  const source = await readFile(new URL('../app/(onboarding)/layout.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('layout.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const implementation = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n');
  const { outputText } = ts.transpileModule(implementation, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
  const context = {
    exports: {}, React: { createElement: (type, props, ...children) => ({ type, props, children }), useCallback: fn => fn },
    StyleSheet: { create: value => value, hairlineWidth: 1 }, theme: { colors: {} }, radius: {},
    useRouter: () => ({}), useAppData: () => ({ state: { stables: [], currentStableId: '' } }),
    useOnboarding: () => ({ setHasFarm() {}, setMode() {} }), getOnboardingLayoutRoute: flow.getOnboardingLayoutRoute,
  };
  for (const name of ['View', 'Text', 'TouchableOpacity', 'OnboardingShell', 'Card']) context[name] = name;
  vm.runInNewContext(outputText, context);
  const buttons = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'TouchableOpacity') buttons.push(node.props);
    for (const child of node.children ?? []) visit(child);
  }
  visit(context.exports.default());
  assert.equal(buttons.length, 2);
  for (const label of ['Ett stall', 'Gård med flera stall']) assert.ok(buttons.some(props => props.accessibilityRole === 'button' && props.accessibilityLabel === label), `Missing named layout button: ${label}`);
});

test('actual resource questions expose named selected buttons and stable choices', async () => {
  const { default: vm } = await import('node:vm');
  const source = await readFile(new URL('../app/(onboarding)/arena.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('arena.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const implementation = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n');
  const { outputText } = ts.transpileModule(implementation, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
  const context = {
    exports: {}, React: { createElement: (type, props, ...children) => ({ type, props, children }), useCallback: fn => fn, useMemo: fn => fn(), useEffect() {}, useRef: value => ({ current: value }), useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}] },
    StyleSheet: { create: value => value, hairlineWidth: 1 }, theme: { colors: {} }, radius: {},
    useRouter: () => ({}), useToast: () => ({}), useLocalSearchParams: () => ({}),
    useAppData: () => ({ state: { currentUserId: 'owner', users: { owner: { membership: [{ role: 'admin', access: 'owner', stableId: 's' }] } }, stables: [{ id: 's', name: 'Mitt stall' }, { id: 'other', name: 'Annat stall' }], currentStableId: 's', farms: [] }, actions: {} }),
    resolveStableSettings: () => ({ arena: { hasArena: false, hasRoundPen: false } }),
  };
  for (const name of ['View', 'Text', 'TouchableOpacity', 'OnboardingShell', 'Card']) context[name] = name;
  vm.runInNewContext(outputText, context);
  const buttons = [];
  function visit(node) {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object') return;
    if (node.type === 'TouchableOpacity') buttons.push(node.props);
    for (const child of node.children ?? []) visit(child);
  }
  visit(context.exports.default());
  for (const label of ['Ridhus: Ja', 'Ridhus: Nej', 'Volt: Ja', 'Volt: Nej', 'Välj stall Mitt stall', 'Välj stall Annat stall']) {
    const button = buttons.find(props => props.accessibilityRole === 'button' && props.accessibilityLabel === label);
    assert.ok(button, `Missing named resource button: ${label}`);
    assert.equal(button.accessibilityState.selected, label.endsWith('Nej') || label === 'Välj stall Mitt stall');
  }
});
