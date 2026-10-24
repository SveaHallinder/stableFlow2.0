import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

let model = {};
try {
  const source = await readFile(new URL('../lib/memberGroups.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  model = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
} catch (error) { if (error.code !== 'ENOENT') throw error; }

const receipt = { id: 'chat', chatKind: 'custom', stableId: 'stable', title: 'Kvällsteamet',
  participantIds: ['me', 'peer', 'third'], participantRoles: { me: 'owner', peer: 'member', third: 'member' }, createdByUserId: 'me' };
const state = { currentUserId: 'me', currentStableId: 'stable', users: {
  me: { membership: [{ stableId: 'stable' }] }, peer: { membership: [{ stableId: 'stable' }] },
  third: { membership: [{ stableId: 'other' }] },
} };

test('chat kind falls back only when the server column is absent and rejects unknown kinds', () => {
  assert.equal(typeof model.resolveChatKind, 'function');
  assert.equal(model.resolveChatKind({ is_group: true }), 'stable');
  assert.equal(model.resolveChatKind({ is_group: false }), 'direct');
  assert.equal(model.resolveChatKind({ chat_kind: 'custom', is_group: true }), 'custom');
  for (const chat_kind of [null, '', 'future', 'CUSTOM']) assert.equal(model.resolveChatKind({ chat_kind, is_group: true }), undefined);
});

test('legacy stable selectors only fall back for an explicitly missing chat_kind column', () => {
  assert.equal(typeof model.isMissingChatKindColumn, 'function');
  assert.equal(model.isMissingChatKindColumn({ code: '42703', message: 'column conversations.chat_kind does not exist' }), true);
  assert.equal(model.isMissingChatKindColumn({ code: 'PGRST204', message: "Could not find the 'chat_kind' column" }), true);
  for (const error of [null, { code: '42501', message: 'chat_kind denied' }, { code: '42703', message: 'another column does not exist' }, { code: '08006' }]) assert.equal(model.isMissingChatKindColumn(error), false);
});

test('a custom preview needs both explicit participation and current same-stable membership', () => {
  assert.equal(typeof model.hasCustomChatAccess, 'function');
  assert.equal(model.hasCustomChatAccess(receipt, state), true);
  assert.equal(model.hasCustomChatAccess({ ...receipt, participantIds: ['peer'] }, state), false);
  assert.equal(model.hasCustomChatAccess(receipt, { ...state, currentStableId: 'other' }), false);
  assert.equal(model.hasCustomChatAccess(receipt, { ...state, users: {} }), false);
});

test('custom receipts reject missing owner, duplicate or extra IDs, wrong scope and legacy objects', () => {
  assert.equal(typeof model.parseMemberGroupReceipt, 'function');
  assert.deepEqual(model.parseMemberGroupReceipt(receipt, 'me', 'stable', 'chat'), receipt);
  for (const invalid of [
    { ...receipt, chatKind: undefined }, { ...receipt, stableId: 'other' }, { ...receipt, id: 'other' },
    { ...receipt, participantIds: ['peer', 'third'] }, { ...receipt, participantIds: ['me', 'me'] },
    { ...receipt, participantRoles: { me: 'member', peer: 'member', third: 'member' } },
    { ...receipt, participantRoles: { ...receipt.participantRoles, peer: 'owner' } },
    { ...receipt, participantRoles: { ...receipt.participantRoles, outsider: 'member' } },
  ]) assert.equal(model.parseMemberGroupReceipt(invalid, 'me', 'stable', 'chat'), undefined);
});

test('creator account deletion keeps valid transferred groups usable with explicit null attribution', () => {
  const transferred = { ...receipt, createdByUserId: null, participantIds: ['peer', 'third'], participantRoles: { peer: 'owner', third: 'member' } };
  assert.deepEqual(model.parseMemberGroupReceipt(transferred, 'peer', 'stable', 'chat'), transferred);
  assert.equal(model.parseMemberGroupReceipt({ ...transferred, createdByUserId: undefined }, 'peer', 'stable', 'chat'), undefined);
});

test('server RPC parameters use the approved atomic endpoint and never fall back to table writes', async () => {
  assert.equal(typeof model.requestMemberGroup, 'function');
  const calls = [];
  const client = { rpc(name, params) { calls.push({ name, params }); return { abortSignal() { return Promise.resolve({ data: receipt, error: null }); } }; } };
  const params = { expected_user_id: 'me', request_id: 'chat', target_stable_id: 'stable', group_title: 'Kvällsteamet', participant_ids: ['peer', 'third'] };
  assert.deepEqual(await model.requestMemberGroup(client, 'create_member_group', params), { success: true, data: receipt });
  assert.deepEqual(calls, [{ name: 'create_member_group', params }]);
  const missing = { rpc() { return { abortSignal() { return Promise.resolve({ data: null, error: { code: 'PGRST202' } }); } }; } };
  assert.equal((await model.requestMemberGroup(missing, 'create_member_group', params)).success, false);
});

test('custom access revalidation requires a visible custom row and explicit current participant', async () => {
  assert.equal(typeof model.loadMemberGroupAccess, 'function');
  for (const available of [true, false]) {
    const client = { from(table) {
      const query = { select() { return this; }, eq() { return this; }, abortSignal() { return this; },
        maybeSingle() { return Promise.resolve({ error: null, data: available ? { id: 'chat', stable_id: 'stable', chat_kind: 'custom', title: receipt.title, created_by_user_id: 'me' } : null }); },
        then(resolve) { resolve({ error: null, data: receipt.participantIds.map(user_id => ({ user_id, member_role: receipt.participantRoles[user_id] })) }); } };
      assert.ok(['conversations', 'conversation_members'].includes(table)); return query;
    } };
    const result = await model.loadMemberGroupAccess(client, 'me', 'stable', 'chat');
    assert.equal(result.success, true);
    assert.deepEqual(result.data, available ? receipt : null);
  }
});

test('only the typed last-active-participant leave error can request deletion confirmation', async () => {
  for (const [endpoint, code, details, expected] of [
    ['leave_member_group', '40001', '{"requiresDeletionConfirmation":true}', true],
    ['leave_member_group', '40001', '{}', false],
    ['leave_member_group', '42501', '{"requiresDeletionConfirmation":true}', false],
    ['manage_member_group', '40001', '{"requiresDeletionConfirmation":true}', false],
    ['leave_member_group', '40001', 'invalid', false],
  ]) {
    const client = { rpc() { return { abortSignal() { return Promise.resolve({ data: null, error: { code, details } }); } }; } };
    const result = await model.requestMemberGroup(client, endpoint, {});
    assert.equal(result.requiresDeletionConfirmation === true, expected);
  }
});
