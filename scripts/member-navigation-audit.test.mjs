import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

async function sourceAst(file) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
async function execute(callback, dependencies) {
  const { outputText } = ts.transpileModule(`export default ({${Object.keys(dependencies).join(',')}}) => (${callback});`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}
async function loadCallback(file, name, dependencies) {
  const ast = await sourceAst(file);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) callback = node.initializer.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(callback, `Missing callback ${name}`);
  return execute(callback, dependencies);
}
async function backPress(file, dependencies) {
  const ast = await sourceAst(file);
  let callback;
  function visit(node) {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(ast) === 'HeaderIconButton') {
      const attrs = node.attributes.properties;
      if (attrs.some(attr => attr.name?.getText(ast) === 'accessibilityLabel' && attr.initializer?.getText(ast) === '"Tillbaka"')) {
        callback = attrs.find(attr => attr.name?.getText(ast) === 'onPress')?.initializer?.expression;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(callback, 'Back button must remain reachable');
  if (ts.isIdentifier(callback)) {
    let declaration;
    function resolve(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === callback.getText(ast)) declaration = node.initializer.arguments[0]; ts.forEachChild(node, resolve); }
    resolve(ast);
    assert.ok(declaration, 'Back handler must use the actual screen callback');
    callback = declaration;
  }
  return execute(callback.getText(ast), dependencies);
}

test('members Back falls back to a route the current user can open', async () => {
  for (const owner of [false, true]) {
    const routes = [];
    const callback = await loadCallback('app/members/index.tsx', 'handleExit', {
      router: { canGoBack: () => false, replace: route => routes.push(route) }, Platform: { OS: 'web' },
      derived: { canManageOnboardingAny: owner },
    });
    callback();
    assert.deepEqual(routes, ['/menu']);
  }
});
for (const file of ['app/settings/index.tsx', 'app/settings/account.tsx', 'app/settings/notifications.tsx']) {
  test(`${file} Back has a safe profile fallback without history`, async () => {
    const events = [];
    const router = { canGoBack: () => false, back: () => events.push('back'), replace: route => events.push(route) };
    const handleBack = () => router.canGoBack() ? router.back() : router.replace('/profile');
    (await backPress(file, { router, handleBack }))();
    assert.deepEqual(events, ['/profile']);
  });
}

test('ordinary members can accept another invitation without gaining owner onboarding access', async () => {
  const ast = await sourceAst('app/(onboarding)/_layout.tsx');
  let effect;
  function visit(node) { if (ts.isCallExpression(node) && node.expression.getText(ast) === 'React.useEffect') effect = node.arguments[0].getText(ast); ts.forEachChild(node, visit); }
  visit(ast);
  for (const route of ['join', 'setup', 'farm']) {
    const redirects = [];
    const callback = await execute(effect, { loading: false, hydrating: false, session: {}, canManageOnboarding: false, segments: ['(onboarding)', route], isJoinRoute: route === 'join', router: { replace: target => redirects.push(target) } });
    callback();
    assert.deepEqual(redirects, route === 'join' ? [] : ['/']);
  }
});

test('member Ring opens the system dialer and reports an unavailable number or failed opening', async () => {
  for (const [phoneUrl, reject] of [['tel:+46701234567', false], [undefined, false], ['tel:+46701234567', true]]) {
    const opened = [], notices = [];
    const callback = await loadCallback('app/members/[id].tsx', 'handleCall', {
      phoneUrl, Linking: { openURL: async url => { opened.push(url); if (reject) throw new Error('dialer missing'); } },
      toast: { showToast: (...args) => notices.push(args) }, console: { warn() {} },
    });
    await callback();
    assert.deepEqual(opened, phoneUrl ? [phoneUrl] : []);
    if (!phoneUrl || reject) assert.ok(notices.length > 0);
    else assert.equal(notices.length, 0);
  }
});

test('generic member role changes clear the stale custom role in both list and profile', async () => {
  for (const [file, name, args] of [['app/members/index.tsx', 'handleRoleCycle', ['member', 'stable', 'staff']], ['app/members/[id].tsx', 'handleRoleCycle', []]]) {
    const changes = [];
    const callback = await loadCallback(file, name, {
      roleOrder: ['admin', 'staff', 'rider'], member: { id: 'member' }, membership: { role: 'staff', customRole: 'Anställd' }, stableId: 'stable', canManageMembers: true, canManageMembersStable: () => true,
      runMemberChange: operation => operation(), actions: { updateMemberRole: input => { changes.push(input); return Promise.resolve({ success: true }); } },
    });
    await callback(...args);
    assert.deepEqual(changes, [{ userId: 'member', stableId: 'stable', role: 'rider', customRole: undefined }]);
  }
});

test('Mitt stall horse management opens the focused horses section', async () => {
  const ast = await sourceAst('app/admin/index.tsx');
  let initializer;
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'adminLinks') initializer = node.initializer.getText(ast); ts.forEachChild(node, visit); }
  visit(ast);
  const links = await execute(initializer, {});
  const horses = links.find(link => link.title === 'Hästar & boxar');
  assert.equal(horses.route, '/stables');
  assert.deepEqual(horses.params, { section: 'horses' });
});

test('Min profil exposes Back, members and joining another stable before the legacy pass grid', async () => {
  const { default: vm } = await import('node:vm');
  const ast = await sourceAst('app/(tabs)/profile.tsx');
  const implementation = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n');
  const { outputText } = ts.transpileModule(implementation, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
  const routes = [];
  const currentUser = { id: 'member', name: 'Medlem', membership: [{ stableId: 'stable', role: 'rider', access: 'view' }], horses: [], awayNotices: [], defaultPasses: [] };
  const context = {
    exports: {}, React: { createElement: (type, props, ...children) => ({ type, props, children }), memo: fn => fn, useMemo: fn => fn(), useCallback: fn => fn, useEffect() {}, useRef: value => ({ current: value }), useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}] },
    StyleSheet: { create: value => value, hairlineWidth: 1 }, theme: { colors: {}, tints: {}, radii: {}, fonts: {}, gradients: { background: [] } }, radius: {}, surfacePresets: {}, roleLabels: { rider: 'Ryttare' },
    useRouter: () => ({ canGoBack: () => false, replace: route => routes.push(route), push: route => routes.push(route) }), useToast: () => ({}), useIsDesktopWeb: () => false, useLocalSearchParams: () => ({}),
    useAppData: () => ({ state: { currentUserId: 'member', users: { member: currentUser }, currentStableId: 'stable', stables: [{ id: 'stable', name: 'Mitt stall' }] }, actions: {}, derived: { canManageOnboardingAny: false, upcomingAssignmentsForUser: [] } }),
  };
  for (const name of ['View', 'Text', 'TouchableOpacity', 'ScrollView', 'LinearGradient', 'SafeAreaView', 'Feather', 'ScreenHeader', 'HeaderIconButton', 'Card', 'Avatar', 'StableSwitcher', 'RefreshControl', 'Pill', 'HorseIcon', 'LocationIcon', 'PhoneIcon']) context[name] = name;
  vm.runInNewContext(outputText, context);
  const nodes = [];
  function visit(node) { if (Array.isArray(node)) { node.forEach(visit); return; } if (!node || typeof node !== 'object') return; nodes.push(node); for (const child of node.children ?? []) visit(child); }
  visit(context.exports.default());
  const header = nodes.find(node => node.type === 'ScreenHeader');
  assert.equal(header.props.title, 'Min profil');
  assert.equal(header.props.subtitle, currentUser.name);
  assert.ok(header.props.left, 'Profile must expose a visible Back control');
  header.props.left.props.onPress();
  assert.deepEqual(routes, ['/menu']);
  const members = nodes.find(node => node.props?.accessibilityLabel === 'Öppna medlemmar');
  const join = nodes.find(node => node.props?.accessibilityLabel === 'Gå med i annat stall');
  assert.ok(members);
  assert.ok(join);
  assert.ok(nodes.indexOf(members) < nodes.findIndex(node => node.props?.accessibilityLabel === 'Morgon, Mån'));
  join.props.onPress();
  assert.equal(routes.at(-1), '/(onboarding)/join');
  assert.ok(nodes.some(node => node.props?.style?.flexWrap === 'wrap'), 'Weekday choices intentionally wrap at narrow widths');
});

async function renderMemberScreen(file, { owner, phone, desktop = false } = {}) {
  const { default: vm } = await import('node:vm');
  const ast = await sourceAst(file);
  const implementation = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n');
  const { outputText } = ts.transpileModule(implementation, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
  const events = [];
  const stateValues = [];
  let stateIndex = 0;
  const viewer = { id: 'viewer', name: 'Du', membership: [{ stableId: 'stable', role: owner ? 'admin' : 'rider', access: owner ? 'owner' : 'view' }], defaultPasses: [], awayNotices: [] };
  const member = { id: 'member', name: 'Lisa', phone, membership: [{ stableId: 'stable', role: 'rider', access: 'view' }], defaultPasses: [], awayNotices: [] };
  const context = {
    exports: {}, React: { createElement: (type, props, ...children) => ({ type, props, children }), useMemo: fn => fn(), useCallback: fn => fn, useEffect() {}, useRef: value => ({ current: value }), useState: initial => { const index = stateIndex++; if (!(index in stateValues)) stateValues[index] = typeof initial === 'function' ? initial() : initial; return [stateValues[index], value => { stateValues[index] = typeof value === 'function' ? value(stateValues[index]) : value; }]; } },
    StyleSheet: { create: value => value, hairlineWidth: 1 }, theme: { colors: { primaryText: '#111111', inverseText: '#ffffff', surface: '#ffffff' }, fonts: {}, gradients: { background: [] }, tints: {} }, radius: {}, space: {}, webStickyStyle: {}, roleLabels: { admin: 'Admin', staff: 'Personal', rider: 'Ryttare' }, roleOrder: ['admin', 'staff', 'rider'], accessLabels: {},
    useRouter: () => ({ push: route => events.push(route) }), useToast: () => ({ showToast() {} }), useIsDesktopWeb: () => desktop, useWindowDimensions: () => ({ width: desktop ? 1440 : 390 }), useLocalSearchParams: () => ({ id: 'member' }), Linking: { openURL: async url => events.push(url) },
    useAppData: () => ({ state: { currentUserId: 'viewer', users: { viewer, member }, currentStableId: 'stable', stables: [{ id: 'stable', name: 'Mitt stall' }], horses: [], blockedUserIds: [] }, actions: {}, derived: { canManageOnboardingAny: owner, permissions: { canManageMembers: owner } } }),
  };
  for (const name of ['View', 'Text', 'TouchableOpacity', 'TextInput', 'ScrollView', 'LinearGradient', 'SafeAreaView', 'Feather', 'ScreenHeader', 'HeaderIconButton', 'Card', 'Avatar', 'StableSwitcher', 'Pill', 'DesktopNav']) context[name] = name;
  vm.runInNewContext(outputText, context);
  const render = () => {
    stateIndex = 0;
    const nodes = [];
    function visit(node) { if (Array.isArray(node)) { node.forEach(visit); return; } if (!node || typeof node !== 'object') return; nodes.push(node); for (const child of node.children ?? []) visit(child); }
    visit(context.exports.default());
    return nodes;
  };
  return { nodes: render(), events, render };
}

test('actual member phone action sanitizes the available number and disables unavailable contact data', async () => {
  const available = await renderMemberScreen('app/members/[id].tsx', { owner: true, phone: '+46 (70) 123-45-67' });
  const call = available.nodes.find(node => node.props?.accessibilityLabel === 'Ring Lisa');
  assert.ok(call);
  assert.equal(call.props.disabled, false);
  assert.equal(call.children[1].props.style.color, '#111111', 'Dialer label remains readable on its white button');
  await call.props.onPress();
  assert.deepEqual(available.events, ['tel:+46701234567']);
  const unavailable = await renderMemberScreen('app/members/[id].tsx', { owner: false });
  assert.equal(unavailable.nodes.find(node => node.props?.accessibilityLabel === 'Telefonnummer inte tillgängligt').props.disabled, true);
});

test('actual members header exposes the complete invite flow only to an owner', async () => {
  const owner = await renderMemberScreen('app/members/index.tsx', { owner: true });
  const header = owner.nodes.find(node => node.type === 'ScreenHeader');
  assert.equal(header.props.primaryAction.props.accessibilityLabel, 'Bjud in medlem');
  header.props.primaryAction.props.onPress();
  assert.deepEqual(JSON.parse(JSON.stringify(owner.events)), [{ pathname: '/(onboarding)/invite-members', params: { returnTo: '/members' } }]);
  const member = await renderMemberScreen('app/members/index.tsx', { owner: false });
  assert.equal(member.nodes.find(node => node.type === 'ScreenHeader').props.primaryAction, null);
});

test('ordinary mobile members reach search and profiles before opening extra filters, then can reset an active filter', async () => {
  const screen = await renderMemberScreen('app/members/index.tsx', { owner: false });
  let nodes = screen.nodes;
  const find = label => nodes.find(node => node.props?.accessibilityLabel === label);
  const hasText = text => nodes.some(node => node.type === 'Text' && node.children.includes(text));
  assert.equal(nodes.filter(node => node.type === 'TextInput').length, 1);
  assert.ok(find('Sök medlemmar'));
  assert.equal(find('Filter').props.accessibilityRole, 'button');
  assert.equal(find('Filter').props.accessibilityState.expanded, false);
  assert.equal(find('Filter').props.accessibilityState.selected, false);
  assert.equal(hasText('Roll'), false);
  assert.equal(hasText('Häst'), false);
  assert.equal(find('Rensa filter'), undefined);
  const profile = find('Öppna profil för Lisa');
  assert.equal(profile.props.accessibilityRole, 'button');
  profile.props.onPress();
  assert.deepEqual(JSON.parse(JSON.stringify(screen.events)), [{ pathname: '/members/[id]', params: { id: 'member', stableId: 'stable' } }]);
  assert.equal(nodes.some(node => node.props?.accessibilityLabel === 'Ta bort Lisa från stallet'), false);
  find('Sök medlemmar').props.onChangeText('Lisa');
  nodes = screen.render();
  assert.equal(find('Sök medlemmar').props.value, 'Lisa');
  assert.equal(find('Öppna profil för Du'), undefined);
  assert.ok(find('Rensa filter'));
  find('Filter').props.onPress();
  nodes = screen.render();
  assert.equal(find('Filter').props.accessibilityState.expanded, true);
  assert.equal(hasText('Roll'), true);
  assert.equal(hasText('Häst'), true);
  nodes.find(node => node.type === 'TouchableOpacity' && node.children.some(child => child?.type === 'Pill' && child.children.some(text => text?.children?.includes('Personal')))).props.onPress();
  nodes = screen.render();
  assert.equal(find('Filter').props.accessibilityState.selected, true);
  assert.equal(find('Öppna profil för Lisa'), undefined);
  find('Rensa filter').props.onPress();
  nodes = screen.render();
  assert.equal(find('Sök medlemmar').props.value, '');
  assert.equal(find('Filter').props.accessibilityState.selected, false);
  assert.ok(find('Öppna profil för Lisa'));
  assert.ok(find('Öppna profil för Du'));
});

test('desktop keeps its expanded filter aside and profile buttons do not wrap owner action buttons', async () => {
  const { nodes } = await renderMemberScreen('app/members/index.tsx', { owner: true, desktop: true });
  assert.ok(nodes.some(node => node.type === 'Text' && node.children.includes('Roll')));
  assert.ok(nodes.some(node => node.type === 'Text' && node.children.includes('Häst')));
  assert.equal(nodes.filter(node => node.type === 'TextInput').length, 1);
  const profile = nodes.find(node => node.props?.accessibilityLabel === 'Öppna profil för Lisa');
  assert.equal(profile.props.accessibilityRole, 'button');
  const hasNestedAction = node => Boolean(node.children?.some(child => child?.props?.accessibilityRole === 'button' || hasNestedAction(child ?? {})));
  assert.equal(hasNestedAction(profile), false);
  assert.ok(nodes.some(node => node.props?.accessibilityLabel === 'Ta bort Lisa från stallet'));
});
