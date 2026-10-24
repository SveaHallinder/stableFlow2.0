import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('Context.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
const variables = provider.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]);
const callback = name => variables.find(node => node.name.getText(ast) === name).initializer.arguments[0].getText(ast);
const modelSource = await readFile(new URL('../lib/memberGroups.ts', import.meta.url), 'utf8');
const model = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(modelSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`);
const group = { id: 'group', chatKind: 'custom', stableId: 'stable', title: 'Teamet', participantIds: ['me', 'peer'], participantRoles: { me: 'owner', peer: 'member' }, description: 'Hemligt', timeAgo: '' };

async function fixture(overrides = {}) {
  const dispatched = [], writes = [];
  const deps = { ...model, user: { id: 'me' }, stateRef: { current: { currentUserId: 'me', sessionUserId: 'me', currentStableId: 'stable',
    users: { me: { membership: [{ stableId: 'stable' }] } }, blockedUserIds: [], messages: [group], conversations: { group: [{ id: 'message', authorId: 'peer' }] } } },
    recurringScopeRef: { current: {} }, chatReadScope: { current: { epoch: 0, userId: 'me' } },
    dataWriteVersion: { current: 0 }, pendingDataWrites: { current: new Set() }, isQaDemoMode: false, supabase: {},
    dispatch: action => { dispatched.push(action); if (action.type === 'CONVERSATION_REMOVE') { deps.stateRef.current.messages = []; deps.stateRef.current.conversations = {}; } },
    loadMemberGroupAccess: async () => ({ success: true, data: null }),
    verifyMemberGroupAccess: async () => false,
    persistConversationMessage: async message => { writes.push(message); return { success: true, data: message }; },
    requestChatReadReceipt: async () => { writes.push('read'); return { success: true, data: {} }; },
    peerMessageIds: () => ['message'], chatUnreadIds: () => [], generateId: () => 'request', formatTimeAgo: () => 'nu', ...overrides };
  const names = ['verifyMemberGroupAccess', 'sendConversationMessage', 'markConversationRead'];
  const code = `export default ({${Object.keys(deps).join(',')}})=>({${names.map(name => `${name}:(${callback(name)})`).join(',')}});`;
  const module = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`);
  return { ...module.default(deps), deps, dispatched, writes };
}

test('confirmed custom revocation clears preview, cached messages and read metadata', async () => {
  const f = await fixture();
  assert.equal(await f.verifyMemberGroupAccess('group'), false);
  assert.equal(f.dispatched[0].type, 'CONVERSATION_REMOVE');
  assert.deepEqual(f.deps.stateRef.current.messages, []);
  assert.deepEqual(f.deps.stateRef.current.conversations, {});
});

test('network failures do not fabricate revocation or allow send/read with unverified access', async () => {
  const f = await fixture({ loadMemberGroupAccess: async () => ({ success: false, reason: 'Network' }) });
  assert.equal(await f.verifyMemberGroupAccess('group'), false);
  assert.equal(f.dispatched.length, 0);
  assert.equal((await f.sendConversationMessage('group', 'Texten finns kvar')).success, false);
  assert.equal((await f.markConversationRead('group', ['message'])).success, false);
  assert.equal(f.writes.length, 0);
});

test('late custom access response from a prior stable epoch cannot erase a newer chat', async () => {
  let finish;
  const delayed = new Promise(resolve => { finish = resolve; });
  const f = await fixture({ loadMemberGroupAccess: () => delayed });
  const pending = f.verifyMemberGroupAccess('group');
  f.deps.recurringScopeRef.current = {};
  finish({ success: true, data: null });
  assert.equal(await pending, false);
  assert.equal(f.dispatched.length, 0);
});

test('a confirmed message from a custom group removed during send cannot resurrect its preview', async () => {
  let finish;
  const delayed = new Promise(resolve => { finish = resolve; });
  const f = await fixture({ verifyMemberGroupAccess: async () => true, persistConversationMessage: () => delayed });
  const pending = f.sendConversationMessage('group', 'Hej', 'request');
  await Promise.resolve();
  f.deps.stateRef.current.messages = [];
  finish({ success: true, data: { id: 'request', conversationId: 'group', authorId: 'me', text: 'Hej', timestamp: '2026-10-24T10:00:00Z' } });
  assert.equal((await pending).success, false);
  assert.equal(f.dispatched.length, 0);
});

test('realtime custom messages require fresh access and discard replies after scope ABA', async () => {
  const effect = provider.body.statements.find(node => ts.isExpressionStatement(node) && node.getText(ast).includes(".channel('messages-realtime')")).expression.arguments[0].getText(ast);
  for (const outcome of ['denied', 'epoch']) {
    let receive, finish;
    const access = new Promise(resolve => { finish = resolve; });
    const f = await fixture({ verifyMemberGroupAccess: () => access });
    const channel = { on(_event, _filter, handler) { receive = handler; return this; }, subscribe() { return this; } };
    f.deps.supabase = { channel: () => channel, removeChannel() {} };
    const { outputText } = ts.transpileModule(`export default ({${Object.keys(f.deps).join(',')}})=>(${effect});`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
    const loaded = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
    const cleanup = loaded.default(f.deps)();
    receive({ new: { id: 'incoming', conversation_id: 'group', author_id: 'peer', text: 'Hemligt', created_at: '2026-10-24T10:00:00Z' } });
    if (outcome === 'epoch') f.deps.recurringScopeRef.current = {};
    finish(outcome === 'epoch');
    await Promise.resolve(); await Promise.resolve();
    assert.equal(f.dispatched.length, 0);
    cleanup();
  }
});
