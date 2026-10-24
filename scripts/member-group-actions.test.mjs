import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
const variables = provider.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]);
const declaration = variables.find(node => node.name.getText(ast) === 'changeMemberGroup');
const reducer = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'reducer').getText(ast);
const modelSource = await readFile(new URL('../lib/memberGroups.ts', import.meta.url), 'utf8');
const model = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(modelSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`);

async function setup({ result, state = {}, demo = false } = {}) {
  assert.ok(declaration, 'The approved custom-group action must exist');
  const calls = [], dispatched = [];
  const receipt = { id: 'group', chatKind: 'custom', stableId: 'stable', title: 'Teamet', participantIds: ['me', 'peer', 'third'], participantRoles: { me: 'owner', peer: 'member', third: 'member' }, createdByUserId: 'me' };
  const current = { currentUserId: 'me', sessionUserId: 'me', currentStableId: 'stable', blockedUserIds: [],
    users: Object.fromEntries(['me', 'peer', 'third'].map(id => [id, { id, membership: [{ stableId: 'stable' }] }])), messages: [], conversations: {}, ...state };
  const deps = { ...model, stateRef: { current }, user: { id: 'me' },
    recurringScopeRef: { current: { userId: 'me', sessionUserId: 'me', viewerId: 'me', stableId: 'stable' } },
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 }, isQaDemoMode: demo,
    supabase: {}, formatTimeAgo: () => 'nu',
    requestMemberGroup: async (_client, endpoint, params) => { calls.push({ endpoint, params }); return result ? result(receipt) : { success: true, data: receipt }; },
    chatUnreadIds: () => [], console: { warn() {} },
  };
  let actionReducer;
  deps.dispatch = action => { dispatched.push(action); deps.stateRef.current = actionReducer(deps.stateRef.current, action); };
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(deps).join(', ')} }) => { ${reducer}; return { action: (${declaration.initializer.arguments[0].getText(ast)}), reducer }; };`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const loaded = (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(deps);
  actionReducer = loaded.reducer;
  return { ...loaded, deps, calls, dispatched, receipt };
}
const input = { requestId: 'group', stableId: 'stable', title: ' Teamet ', participantIds: ['peer', 'third'] };

test('a confirmed removal deletes both the custom preview and its cached message/read history', async () => {
  const fixture = await setup();
  const current = { ...fixture.deps.stateRef.current, messages: [{ id: 'group', unreadMessageIds: ['secret'] }, { id: 'keep' }], conversations: { group: [{ id: 'secret' }], keep: [] } };
  const next = fixture.reducer(current, { type: 'CONVERSATION_REMOVE', payload: { conversationId: 'group' } });
  assert.deepEqual(next.messages, [{ id: 'keep' }]);
  assert.deepEqual(next.conversations, { keep: [] });
});

test('group creation validates same-stable accepted users and publishes only the confirmed atomic receipt', async () => {
  const fixture = await setup();
  const result = await fixture.action('create', input);
  assert.equal(result.success, true);
  assert.equal(fixture.calls[0].endpoint, 'create_member_group');
  assert.deepEqual(fixture.calls[0].params, { expected_user_id: 'me', request_id: 'group', target_stable_id: 'stable', group_title: 'Teamet', participant_ids: ['peer', 'third'] });
  assert.equal(fixture.deps.stateRef.current.messages[0].chatKind, 'custom');
  assert.deepEqual(result.data.participantRoles, fixture.receipt.participantRoles);
});

test('pending invitations, outsiders, blocked users and fewer than three members never call the group RPC', async () => {
  for (const invalid of [{ ...input, participantIds: ['peer'] }, { ...input, participantIds: ['peer', 'stranger'] }, { ...input, stableId: 'other' }, { ...input, title: 'x' }]) {
    const fixture = await setup();
    assert.equal((await fixture.action('create', invalid)).success, false);
    assert.equal(fixture.calls.length, 0);
  }
  const blocked = await setup({ state: { blockedUserIds: ['peer'] } });
  assert.equal((await blocked.action('create', input)).success, false);
});

test('a rejected or malformed group receipt preserves state and releases pending guard for retry', async () => {
  for (const result of [() => ({ success: false, reason: 'Synthetic failure' }), receipt => ({ success: true, data: { ...receipt, participantIds: ['me'] } })]) {
    const fixture = await setup({ result });
    assert.equal((await fixture.action('create', input)).success, false);
    assert.equal(fixture.dispatched.length, 0);
    assert.equal(fixture.deps.pendingDataWrites.current.size, 0);
  }
});

test('an A to B to A scope epoch change rejects a late group receipt and concurrent create only calls once', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const fixture = await setup({ result: async receipt => { await pending; return { success: true, data: receipt }; } });
  const first = fixture.action('create', input);
  assert.equal((await fixture.action('create', input)).success, false);
  fixture.deps.recurringScopeRef.current = { ...fixture.deps.recurringScopeRef.current };
  finish();
  assert.equal((await first).success, false);
  assert.equal(fixture.dispatched.length, 0);
  assert.equal(fixture.calls.length, 1);
});

test('only the explicit group owner can manage, while any participant can leave and purge cached history', async () => {
  const base = await setup();
  const preview = { ...base.receipt, group: true, description: 'Hej', timeAgo: '' };
  const member = await setup({ state: { messages: [{ ...preview, participantRoles: { me: 'member', peer: 'owner', third: 'member' } }] } });
  assert.equal((await member.action('manage', { conversationId: 'group', title: 'Annat' })).success, false);
  assert.equal(member.calls.length, 0);
  const owner = await setup({ state: { messages: [preview] } });
  assert.equal((await owner.action('manage', { conversationId: 'group', removeUserIds: ['me'] })).success, false);
  const leave = await setup({ state: { messages: [preview], conversations: { group: [{ id: 'secret' }] } }, result: () => ({ success: true, data: { id: 'group', left: true, deleted: false } }) });
  assert.equal((await leave.action('leave', { conversationId: 'group' })).success, true);
  assert.equal(leave.deps.stateRef.current.messages.length, 0);
  assert.equal(leave.deps.stateRef.current.conversations.group, undefined);
});

test('QA demo group actions stay local and still enforce owner and membership rules', async () => {
  const fixture = await setup({ demo: true });
  assert.equal((await fixture.action('create', input)).success, true);
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.deps.stateRef.current.messages[0].chatKind, 'custom');
  const managed = await fixture.action('manage', { conversationId: 'group', title: 'Nytt team' });
  assert.equal(managed.success, true, JSON.stringify(managed));
  assert.equal(fixture.deps.stateRef.current.messages[0].title, 'Nytt team');
  assert.equal((await fixture.action('leave', { conversationId: 'group' })).success, true);
  assert.equal(fixture.calls.length, 0);
});

test('the last participant cannot delete a group through a previously confirmed ordinary leave', async () => {
  const base = await setup();
  const last = { ...base.receipt, participantIds: ['me'], participantRoles: { me: 'owner' } };
  const fixture = await setup({ demo: true, state: { messages: [last], conversations: { group: [{ id: 'keep' }] } } });
  assert.equal((await fixture.action('leave', { conversationId: 'group' })).success, false);
  assert.equal(fixture.deps.stateRef.current.messages.length, 1);
  assert.equal((await fixture.action('leave', { conversationId: 'group', confirmDelete: true })).success, true);
  assert.equal(fixture.deps.stateRef.current.messages.length, 0);
});
