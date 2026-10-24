import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const readHelpers = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/chatReadReceipts.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: readHelpers, exports: readHelpers.exports });

function fixture({ owner = true, viewer = 'me', participants = ['me', 'a', 'b'], confirmations = [], screen = 'group' } = {}) {
  const hooks = [], calls = [], created = [], left = [], prompts = [], routes = [];
  const controls = { hydrating: false, authUserId: viewer };
  let cursor = 0, nextId = 0;
  const state = {
    currentUserId: viewer, sessionUserId: viewer, currentStableId: 'stable', blockedUserIds: ['blocked'], conversations: {},
    stables: [{ id: 'stable', name: 'Mitt stall' }],
    users: Object.fromEntries([['me', 'Jag', 'stable'], ['a', 'Anna', 'stable'], ['b', 'Bo', 'stable'], ['c', 'Cilla', 'stable'], ['foreign', 'Fel stall', 'other'], ['blocked', 'Blockerad', 'stable']].map(([id, name, stableId]) => [id, { id, name, membership: [{ stableId, role: 'admin', access: 'owner' }] }])),
    messages: [{ id: 'group', title: 'Fodergänget', group: true, chatKind: 'custom', stableId: 'stable', participantIds: participants, participantRoles: Object.fromEntries(participants.map(id => [id, id === (owner ? viewer : 'a') ? 'owner' : 'member'])) }],
  };
  const React = {
    createElement: (type, props, ...children) => typeof type === 'function' ? type({ ...props, children }) : ({ type, props: { ...props, children } }),
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial; return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return hooks[i] ??= { current: initial }; },
    memo: component => component, useMemo: calculate => calculate(), useCallback: callback => callback, useEffect() {},
  };
  let response = { success: false, reason: 'Testfel. Försök igen.' };
  const respond = async input => { calls.push(input); return typeof response === 'function' ? response(input) : response; };
  const actions = { createMemberGroup: respond, manageMemberGroup: respond, leaveMemberGroup: respond };
  const native = new Proxy({ AppState: { currentState: 'active' }, Platform: { OS: 'web' }, StyleSheet: { create: value => value, hairlineWidth: 1 } }, { get: (target, key) => target[key] ?? key });
  const require = name => {
    if (name === 'react') return React;
    if (name === 'react-native') return native;
    if (name === '@/context/AppDataContext') return { useAppData: () => ({ state, actions, hydrating: controls.hydrating, derived: { permissions: {} } }) };
    if (name === '@/context/AuthContext') return { useAuth: () => ({ user: { id: controls.authUserId } }) };
    if (name === 'expo-router') return { useRouter: () => ({ push: route => routes.push(route), replace: route => routes.push(route), canGoBack: () => false }), useLocalSearchParams: () => ({ id: 'group' }) };
    if (name === 'expo-router/react-navigation') return { useIsFocused: () => true };
    if (name === '@/hooks/useIsDesktopWeb') return { useIsDesktopWeb: () => false };
    if (name === '@/components/ToastProvider') return { useToast: () => ({ showToast() {} }) };
    if (name === '@/lib/chatReadReceipts') return readHelpers.exports;
    if (name === '@/components/theme') return { theme: { colors: {}, fonts: {}, gradients: { background: [] } } };
    if (name === '@/design/system') return { systemPalette: {} };
    if (name === '@/design/tokens') return { radius: {}, space: {} };
    if (name === '@/lib/ids') return { generateId: () => `request-${++nextId}` };
    if (name === '@/lib/confirm') return { confirmAction: async prompt => { prompts.push(prompt); return confirmations.length ? confirmations.shift() : true; } };
    return new Proxy({}, { get: (_, key) => key });
  };
  const module = { exports: {} };
  const file = screen === 'messages' ? 'app/(tabs)/messages.tsx' : screen === 'chat' ? 'app/chat/[id].tsx' : 'components/MemberGroupModal.tsx';
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, { module, exports: module.exports, require, console });
  const render = (name = screen === 'group' ? 'MemberGroupCreateForm' : 'default') => { cursor = 0; return module.exports[name]({ conversationId: 'group', onCreated: item => created.push(item), onLeft: () => left.push(true), onClose() {} }); };
  return { state, controls, calls, created, left, prompts, routes, render, response(value) { response = value; } };
}
function all(node) { if (Array.isArray(node)) return node.flatMap(all); if (!node || typeof node !== 'object') return []; return [node, ...all(node.props?.children), ...all(node.props?.primaryAction)]; }
function find(tree, label) { return all(tree).find(node => node.props?.accessibilityLabel === label); }
function validGroup(f) { let tree = f.render(); find(tree, 'Gruppnamn').props.onChangeText('Fodergänget'); tree = f.render(); find(tree, 'Välj Anna').props.onPress(); tree = f.render(); find(tree, 'Välj Bo').props.onPress(); return f.render(); }

test('create group uses accepted same-stable checkboxes, includes creator and enforces two other participants', () => {
  const f = fixture(); let tree = f.render();
  assert.equal(find(tree, 'Skapa grupp').props.disabled, true);
  assert.equal(find(tree, 'Välj Anna').props.accessibilityRole, 'checkbox');
  for (const name of ['Jag', 'Fel stall', 'Blockerad']) assert.equal(find(tree, `Välj ${name}`), undefined);
  tree = validGroup(f);
  assert.equal(find(tree, 'Skapa grupp').props.disabled, false);
  assert.equal(find(tree, 'Välj Anna').props.accessibilityState.checked, true);
});

test('group create keeps draft and request ID on failure, blocks duplicate requests, and opens only a confirmed result', async () => {
  const f = fixture(); validGroup(f);
  await find(f.render(), 'Skapa grupp').props.onPress();
  assert.equal(f.created.length, 0);
  assert.equal(find(f.render(), 'Gruppnamn').props.value, 'Fodergänget');
  assert.ok(all(f.render()).some(node => node.props?.accessibilityRole === 'alert'));
  const requestId = f.calls[0].requestId;
  let resolve;
  f.response(() => new Promise(done => { resolve = done; }));
  const submit = find(f.render(), 'Skapa grupp').props.onPress;
  const pending = submit(); await submit();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].requestId, requestId);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1].participantIds)), ['a', 'b']);
  resolve({ success: true, data: { ...f.state.messages[0], id: 'confirmed' } }); await pending;
  assert.equal(f.created[0].id, 'confirmed');
});

test('late create after stable A to B to A cannot open the old group', async () => {
  const f = fixture(); validGroup(f); let resolve;
  f.response(() => new Promise(done => { resolve = done; }));
  const pending = find(f.render(), 'Skapa grupp').props.onPress();
  f.state.currentStableId = 'other'; f.render(); f.state.currentStableId = 'stable'; f.render();
  resolve({ success: true, data: { ...f.state.messages[0], id: 'old' } }); await pending;
  assert.equal(f.created.length, 0);
});

test('a stall admin who is a normal participant gets leave but no owner management controls', () => {
  const f = fixture({ owner: false }); const tree = f.render('MemberGroupModal');
  assert.ok(find(tree, 'Lämna grupp'));
  assert.ok(all(tree).some(node => node.type === 'Text' && node.props?.children?.includes('Pushnotiser för egna grupper är inte aktiverade ännu. Meddelandena finns i appen.')));
  for (const label of ['Ändra gruppnamn', 'Lägg till deltagare', 'Överlåt ansvar', 'Ta bort Bo']) assert.equal(find(tree, label), undefined);
});

test('adding a participant requires history disclosure and preserves the selection for retry', async () => {
  const f = fixture(); let tree = f.render('MemberGroupModal');
  find(tree, 'Lägg till deltagare').props.onPress(); tree = f.render('MemberGroupModal');
  find(tree, 'Välj Cilla').props.onPress(); tree = f.render('MemberGroupModal');
  await find(tree, 'Lägg till valda deltagare').props.onPress();
  assert.match(f.prompts[0].message, /tidigare meddelanden/);
  assert.match(f.prompts[0].message, /Cilla/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].addUserIds)), ['c']);
  assert.equal(find(f.render('MemberGroupModal'), 'Välj Cilla').props.accessibilityState.checked, true);
});

test('owner must select a successor before leaving, while the last participant explicitly confirms group deletion', async () => {
  const f = fixture(); let tree = f.render('MemberGroupModal');
  await find(tree, 'Lämna grupp').props.onPress(); tree = f.render('MemberGroupModal');
  assert.equal(find(tree, 'Bekräfta och lämna grupp').props.disabled, true);
  find(tree, 'Välj Anna som gruppansvarig').props.onPress(); tree = f.render('MemberGroupModal');
  f.response({ success: true, data: { conversationId: 'group', left: true, deleted: false } });
  await find(tree, 'Bekräfta och lämna grupp').props.onPress();
  assert.equal(f.calls[0].transferOwnerTo, 'a'); assert.equal(f.left.length, 1);
  assert.equal(f.calls[0].confirmDelete, false);
  const last = fixture({ participants: ['me'], confirmations: [false] });
  await find(last.render('MemberGroupModal'), 'Lämna grupp').props.onPress();
  assert.equal(last.prompts[0].destructive, true); assert.match(last.prompts[0].message, /Fodergänget/); assert.match(last.prompts[0].message, /raderas/);
  assert.equal(last.calls.length, 0);
  const confirmedLast = fixture({ participants: ['me'] });
  confirmedLast.response({ success: true, data: { conversationId: 'group', left: true, deleted: true } });
  await find(confirmedLast.render('MemberGroupModal'), 'Lämna grupp').props.onPress();
  assert.equal(confirmedLast.calls[0].confirmDelete, true);
  assert.equal(confirmedLast.left.length, 1);
});

test('remove and transfer state exact consequences, and lost group ownership prevents a stale management callback', async () => {
  const f = fixture();
  await find(f.render('MemberGroupModal'), 'Ta bort Bo').props.onPress();
  assert.match(f.prompts[0].message, /Bo.*Fodergänget/);
  assert.match(f.prompts[0].message, /Redan läst eller kopierat innehåll kan inte återkallas/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].removeUserIds)), ['b']);
  const staleRemove = find(f.render('MemberGroupModal'), 'Ta bort Bo').props.onPress;
  f.state.messages[0].participantRoles.me = 'member'; f.render('MemberGroupModal');
  await staleRemove(); assert.equal(f.calls.length, 1);
  const transfer = fixture();
  find(transfer.render('MemberGroupModal'), 'Överlåt ansvar').props.onPress();
  find(transfer.render('MemberGroupModal'), 'Välj Bo som gruppansvarig').props.onPress();
  await find(transfer.render('MemberGroupModal'), 'Bekräfta överlåtelse').props.onPress();
  assert.equal(transfer.calls[0].transferOwnerTo, 'b');
  assert.match(transfer.prompts[0].message, /Du blir vanlig deltagare/);
});

test('group-name validation and search do not alter chosen members or permit more than fifty participants', () => {
  const f = fixture(); validGroup(f);
  find(f.render(), 'Gruppnamn').props.onChangeText(' ');
  assert.equal(find(f.render(), 'Skapa grupp').props.disabled, true);
  find(f.render(), 'Gruppnamn').props.onChangeText('Foder');
  find(f.render(), 'Sök deltagare till gruppen').props.onChangeText('cIlLa');
  assert.ok(find(f.render(), 'Välj Cilla'));
  assert.equal(find(f.render(), 'Välj Anna'), undefined);
  find(f.render(), 'Sök deltagare till gruppen').props.onChangeText('');
  assert.equal(find(f.render(), 'Välj Anna').props.accessibilityState.checked, true);
  for (let index = 0; index < 55; index++) f.state.users[`extra-${index}`] = { id: `extra-${index}`, name: `Extra ${index}`, membership: [{ stableId: 'stable' }] };
  for (let index = 0; index < 47; index++) find(f.render(), `Välj Extra ${index}`).props.onPress();
  assert.equal(find(f.render(), 'Välj Extra 50').props.disabled, true);
  assert.equal(find(f.render(), 'Skapa grupp').props.disabled, false);
});

test('chat list separates real stable chat from custom groups and keeps both new-chat modes available', () => {
  const f = fixture({ screen: 'messages' });
  f.state.messages.push({ id: 'stable-chat', title: 'Mitt stall', chatKind: 'stable', group: true, stableId: 'stable' });
  let tree = f.render();
  find(tree, 'Egna grupper').props.onPress(); tree = f.render();
  assert.ok(find(tree, 'Öppna konversation med Fodergänget'));
  assert.equal(find(tree, 'Öppna konversation med Mitt stall'), undefined);
  find(tree, 'Stallchatt').props.onPress(); tree = f.render();
  assert.ok(find(tree, 'Öppna konversation med Mitt stall'));
  assert.equal(find(tree, 'Öppna konversation med Fodergänget'), undefined);
  all(tree).find(node => node.props?.label === 'Ny chatt').props.onPress(); tree = f.render();
  assert.ok(find(tree, 'Privat chatt')); assert.ok(find(tree, 'Egen grupp'));
  const close = find(tree, 'Stäng ny chatt').props.onPress;
  const form = all(tree).find(node => node.type === 'MemberGroupCreateForm');
  form.props.onBusyChange(true); close();
  assert.ok(find(f.render(), 'Stäng ny chatt'), 'A pending group request cannot discard its draft through an older close callback');
  assert.equal(f.routes.length, 0);
  form.props.onCreated({ id: 'confirmed', title: 'Fodergänget' });
  assert.equal(f.routes[0].params.id, 'confirmed');
});

test('custom chat exposes group information and removes the composer when participant access is revoked', () => {
  const f = fixture({ screen: 'chat' }); let tree = f.render();
  assert.ok(find(tree, 'Gruppinformation'));
  find(tree, 'Gruppinformation').props.onPress(); tree = f.render();
  assert.equal(all(tree).find(node => node.type === 'MemberGroupModal').props.conversationId, 'group');
  f.state.messages[0].participantIds = ['a', 'b']; tree = f.render();
  assert.equal(find(tree, 'Meddelande'), undefined);
  assert.ok(find(tree, 'Till chattar'));
  find(tree, 'Till chattar').props.onPress(); assert.equal(f.routes.at(-1), '/messages');
});

test('authoritative last-active-member failure offers a separate delete confirmation even when the roster still has inactive participants', async () => {
  const f = fixture();
  delete f.state.users.a; delete f.state.users.b;
  await find(f.render('MemberGroupModal'), 'Lämna grupp').props.onPress();
  let tree = f.render('MemberGroupModal');
  assert.equal(find(tree, 'Bekräfta och lämna grupp').props.disabled, false, 'Missing successor profiles must allow the server to recheck access without allowing implicit deletion');
  f.response({ success: false, reason: 'Du är sista aktiva medlem.', requiresDeletionConfirmation: true });
  await find(tree, 'Bekräfta och lämna grupp').props.onPress(); tree = f.render('MemberGroupModal');
  assert.equal(f.calls[0].confirmDelete, false);
  assert.ok(find(tree, 'Bekräfta radering av grupp'));
  f.response({ success: true, data: { conversationId: 'group', left: true, deleted: true } });
  await find(tree, 'Bekräfta radering av grupp').props.onPress();
  assert.equal(f.calls[1].confirmDelete, true); assert.equal(f.calls[1].transferOwnerTo, undefined);
  assert.match(f.prompts.at(-1).message, /Fodergänget.*meddelanden raderas/);
  assert.equal(f.left.length, 1);
  const generic = fixture({ owner: false });
  await find(generic.render('MemberGroupModal'), 'Lämna grupp').props.onPress();
  assert.equal(find(generic.render('MemberGroupModal'), 'Bekräfta radering av grupp'), undefined, 'A generic failure never grants the deletion-confirmation path');
});

test('custom history is hidden immediately during hydration after a stable or authenticated actor change', () => {
  for (const change of ['stable', 'actor']) {
    const f = fixture({ screen: 'chat' });
    f.state.conversations.group = [{ id: 'message', authorId: 'a', text: 'Cached private group history' }];
    f.controls.hydrating = true;
    if (change === 'stable') f.state.currentStableId = 'other'; else f.controls.authUserId = 'another-account';
    const tree = f.render();
    assert.equal(find(tree, 'Meddelande'), undefined);
    assert.equal(all(tree).some(node => node.props?.children?.includes('Cached private group history')), false);
    assert.ok(find(tree, 'Till chattar'));
  }
});

test('known empty chat history has a welcoming empty state while unloaded history stays explicit', () => {
  const f = fixture({ screen: 'chat' });
  f.state.conversations.group = [];
  Object.assign(f.state.messages[0], { readMessageIds: [], unreadMessageIds: [] });
  assert.ok(all(f.render()).some(node => node.props?.children?.includes('Inga meddelanden ännu. Skriv det första meddelandet.')));
  delete f.state.conversations.group;
  assert.equal(all(f.render()).some(node => node.props?.children?.includes('Inga meddelanden ännu. Skriv det första meddelandet.')), false);
});

test('confirmed leave routes to chats after its acknowledgement removes the preview, while actor or stable ABA cannot navigate', async () => {
  for (const scopeChange of ['none', 'stable', 'actor']) {
    const f = fixture({ screen: 'chat' });
    find(f.render(), 'Gruppinformation').props.onPress();
    const modal = all(f.render()).find(node => node.type === 'MemberGroupModal');
    assert.equal(typeof modal.props.onLeaveGroup, 'function');
    let resolve;
    f.response(() => { f.state.messages = []; f.render(); return new Promise(done => { resolve = done; }); });
    const request = modal.props.onLeaveGroup({ conversationId: 'group', transferOwnerTo: 'a', confirmDelete: false });
    assert.ok(find(f.render(), 'Till chattar'), 'The action has already removed the preview before returning its confirmed receipt');
    if (scopeChange === 'stable') { f.state.currentStableId = 'other'; f.render(); f.state.currentStableId = 'stable'; f.render(); }
    if (scopeChange === 'actor') { f.controls.authUserId = 'another-account'; f.render(); f.controls.authUserId = 'me'; f.render(); }
    resolve({ success: true, data: { conversationId: 'group', left: true, deleted: false } });
    await request;
    assert.deepEqual(f.routes, scopeChange === 'none' ? ['/messages'] : []);
  }
});
