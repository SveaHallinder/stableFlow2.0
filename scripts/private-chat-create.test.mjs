import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
const declaration = provider.body.statements.filter(ts.isVariableStatement)
  .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === 'createPrivateConversation');
const callback = declaration.initializer.arguments[0].getText(ast);
const reducer = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'reducer').getText(ast);

async function loadAction(dependencies) {
  const { outputText } = ts.transpileModule(`${reducer}\nexport default ({ ${Object.keys(dependencies).join(', ')} }) => ({ action: (${callback}), reducer });`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

async function setup({ state = {}, conversationResult, conversationReadResult, memberResult, memberReadResult,
  isQaDemoMode = false, timers = {}, delayDispatch = false, rejectMemberReturning = false } = {}) {
  const writes = [];
  const reads = [];
  const generatedIds = [];
  const dispatched = [];
  const logs = [];
  const serverConversations = new Map();
  const serverMembers = [];
  const dependencies = {
    stateRef: { current: { currentUserId: 'owner', sessionUserId: 'owner', currentStableId: 'stable',
      blockedUserIds: [], users: { peer: { id: 'peer', name: 'Medlem' } }, messages: [], conversations: {}, ...state } },
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
    privateConversationAttempts: { current: new Map() },
    isQaDemoMode, generateId: () => { const id = randomUUID(); generatedIds.push(id); return id; },
    console: { warn: (...args) => logs.push(args) },
    supabase: { from: table => {
      let payload;
      let columns;
      let single = false;
      const filters = {};
      const query = {
        insert(value) { payload = value; return this; },
        select(value) { columns = value; return this; },
        eq(column, value) { filters[column] = value; return this; },
        is(column, value) { filters[column] = value; return this; },
        abortSignal() { return this; }, single() { single = true; return this; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            (payload ? writes : reads).push({ table, payload, columns, filters });
            const defaultResult = () => {
              if (!payload) {
                const rows = table === 'conversations' ? [...serverConversations.values()] : serverMembers;
                const matching = rows.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value));
                return { data: single ? matching[0] ?? null : matching, error: null };
              }
              if (table === 'conversations') {
                // The server's own UUID default is independent of the client generator.
                const id = payload.id ?? randomUUID();
                if (serverConversations.has(id)) return { data: null, error: { code: '23505' } };
                const row = { ...payload, id, stable_id: payload.stable_id ?? null };
                serverConversations.set(id, row);
                return { data: row, error: null };
              }
              if (rejectMemberReturning && columns) return { data: null, error: { code: '42501' } };
              if (payload.some(row => serverMembers.some(saved => saved.conversation_id === row.conversation_id && saved.user_id === row.user_id))) {
                return { data: null, error: { code: '23505' } };
              }
              serverMembers.push(...payload);
              return { data: columns ? payload : null, error: null };
            };
            const handler = table === 'conversations'
              ? payload ? conversationResult : conversationReadResult
              : payload ? memberResult : memberReadResult;
            return handler ? handler({ payload, filters, defaultResult }) : defaultResult();
          }).then(resolve, reject);
        },
      };
      return query;
    } },
    ...timers,
  };
  let actionReducer;
  dependencies.dispatch = action => {
    dispatched.push(action);
    if (!delayDispatch) dependencies.stateRef.current = actionReducer(dependencies.stateRef.current, action);
  };
  const loaded = await loadAction(dependencies);
  actionReducer = loaded.reducer;
  return { action: loaded.action, reducer: actionReducer, dependencies, dispatched, writes, reads,
    logs, generatedIds, serverConversations, serverMembers };
}

for (const messages of [[], [{ id: 'own-message', authorId: 'owner', text: 'Hej' }]]) {
  test(`reopens a private chat by member IDs with ${messages.length ? 'only my message' : 'no messages'}`, async () => {
    const fixture = await setup({ state: {
      messages: [{ id: 'existing-chat', group: false, participantUserIds: ['owner', 'peer'] }],
      conversations: { 'existing-chat': messages },
    } });
    assert.deepEqual(await fixture.action('peer'), { success: true, data: 'existing-chat' });
    assert.equal(fixture.writes.length, 0);
    assert.equal(fixture.dispatched.length, 0);
  });
}

test('a confirmed new chat carries member IDs and can reopen before the peer replies', async () => {
  const fixture = await setup();
  const result = await fixture.action('peer');
  assert.equal(result.success, true);
  assert.deepEqual(fixture.dispatched[0].payload.preview.participantUserIds, ['owner', 'peer']);
  assert.deepEqual(await fixture.action('peer'), result);
  assert.equal(fixture.writes.filter(write => write.table === 'conversations').length, 1);
  assert.equal(fixture.dependencies.pendingDataWrites.current.size, 0);
});

test('a rejected member insert does not publish or navigate to an unusable chat and can retry', async () => {
  let attempts = 0;
  const fixture = await setup({ memberResult: ({ defaultResult }) => ++attempts === 1
    ? { data: null, error: { code: '42501', message: 'Synthetic membership rejected' } }
    : defaultResult() });
  const result = await fixture.action('peer');
  assert.equal(result.success, false);
  assert.match(result.reason, /Försök igen/);
  assert.equal(fixture.dispatched.length, 0);
  assert.equal(fixture.dependencies.pendingDataWrites.current.size, 0);
  assert.match(fixture.logs[0][0], /^\[chat create\]/);
  assert.equal((await fixture.action('peer')).success, true);
});

for (const mismatch of ['empty', 'missing-peer', 'another-chat']) {
  test(`a missing member acknowledgement (${mismatch}) cannot publish a chat`, async () => {
    const fixture = await setup({ memberReadResult: ({ defaultResult }) => {
      const result = defaultResult();
      return { data: mismatch === 'empty' ? [] : mismatch === 'missing-peer' ? result.data.slice(0, 1)
        : result.data.map(row => ({ ...row, conversation_id: 'another-chat' })), error: null };
    } });
    assert.equal((await fixture.action('peer')).success, false);
    assert.equal(fixture.dispatched.length, 0);
    assert.equal(fixture.dependencies.pendingDataWrites.current.size, 0);
  });
}

test('simultaneous creates for one peer issue one conversation insert', async () => {
  let finish;
  const operation = new Promise(resolve => { finish = resolve; });
  const fixture = await setup({ conversationResult: ({ defaultResult }) => operation.then(defaultResult) });
  const first = fixture.action('peer');
  const second = fixture.action('peer');
  try {
    assert.equal(fixture.dependencies.pendingDataWrites.current.size, 1);
  } finally { finish(); }
  assert.equal((await second).success, false);
  assert.equal((await first).success, true);
  assert.equal(fixture.writes.filter(write => write.table === 'conversations').length, 1);
  assert.equal(fixture.dependencies.pendingDataWrites.current.size, 0);
});

for (const stage of ['conversation', 'members']) {
  test(`a thrown ${stage} SDK error returns retry feedback and releases the guard`, async () => {
    const fail = () => { throw new Error('Synthetic transport/storage failure'); };
    const fixture = await setup(stage === 'conversation' ? { conversationResult: fail } : { memberResult: fail });
    const result = await fixture.action('peer');
    assert.equal(result.success, false);
    assert.match(result.reason, /Försök igen/);
    assert.equal(fixture.dispatched.length, 0);
    assert.equal(fixture.dependencies.pendingDataWrites.current.size, 0);
    assert.match(fixture.logs[0][0], /^\[chat create\]/);
  });
}

test('member creation uses INSERT without RETURNING and an independent filtered receipt read', async () => {
  const fixture = await setup({ rejectMemberReturning: true });
  const result = await fixture.action('peer');
  assert.equal(result.success, true);
  const insert = fixture.writes.find(write => write.table === 'conversation_members');
  assert.equal(insert.columns, undefined);
  assert.deepEqual(fixture.reads.find(read => read.table === 'conversation_members').filters, { conversation_id: result.data });
  assert.equal(fixture.serverMembers.length, 2);
});

for (const stage of ['conversation', 'members', 'member-read']) {
  test(`a committed ${stage} with a lost receipt retries the same UUID and creates one usable chat`, async () => {
    let attempts = 0;
    const lostReceipt = ({ defaultResult }) => {
      const result = defaultResult();
      return attempts++ === 0 ? { data: null, error: { message: 'Synthetic committed but lost receipt' } } : result;
    };
    const fixture = await setup(stage === 'conversation' ? { conversationResult: lostReceipt }
      : stage === 'members' ? { memberResult: lostReceipt } : { memberReadResult: lostReceipt });
    assert.equal((await fixture.action('peer')).success, false);
    assert.equal(fixture.dispatched.length, 0);
    const result = await fixture.action('peer');
    assert.equal(result.success, true);
    assert.equal(fixture.serverConversations.size, 1);
    assert.equal(fixture.serverMembers.length, 2);
    assert.equal(fixture.generatedIds.length, 1);
    assert.deepEqual(fixture.writes.filter(write => write.table === 'conversations').map(write => write.payload.id), [result.data, result.data]);
    assert.equal(fixture.dispatched.length, 1);
  });
}

for (const stage of ['conversation', 'members']) {
  test(`a committed ${stage} ignores cancellation and confirms after timeout without duplicating a retry`, async () => {
    let release;
    let started;
    let expire;
    let attempts = 0;
    const lateReceipt = new Promise(resolve => { release = resolve; });
    const requestStarted = new Promise(resolve => { started = resolve; });
    const held = ({ defaultResult }) => {
      const result = defaultResult();
      if (attempts++ !== 0) return result;
      started();
      return lateReceipt.then(() => result);
    };
    const fixture = await setup({ ...(stage === 'conversation' ? { conversationResult: held } : { memberResult: held }),
      timers: { setTimeout: callback => { expire = callback; return 1; }, clearTimeout() {} } });
    const first = fixture.action('peer');
    await requestStarted;
    expire();
    assert.equal((await first).success, false);
    assert.equal(fixture.dispatched.length, 0);
    const retried = await fixture.action('peer');
    assert.equal(retried.success, true);
    assert.equal(fixture.serverConversations.size, 1);
    assert.equal(fixture.serverMembers.length, 2);
    assert.equal(fixture.generatedIds.length, 1);
    release();
    await lateReceipt;
    await Promise.resolve();
    assert.equal(fixture.dispatched.length, 1);
    assert.equal(fixture.dependencies.pendingDataWrites.current.size, 0);
  });
}

test('the confirmed attempt ID stays reusable until React makes the preview visible', async () => {
  const fixture = await setup({ delayDispatch: true });
  const first = await fixture.action('peer');
  assert.equal(first.success, true);
  assert.deepEqual(await fixture.action('peer'), first);
  assert.equal(fixture.serverConversations.size, 1);
  assert.equal(fixture.serverMembers.length, 2);
  assert.equal(fixture.generatedIds.length, 1);
  fixture.dependencies.stateRef.current = fixture.reducer(fixture.dependencies.stateRef.current, fixture.dispatched[0]);
  const writes = fixture.writes.length;
  assert.deepEqual(await fixture.action('peer'), first);
  assert.equal(fixture.writes.length, writes);
  assert.equal(fixture.dependencies.privateConversationAttempts.current.size, 0);
});

test('an uncertain attempt ID is scoped to the active user and peer', async () => {
  let attempts = 0;
  const fixture = await setup({ conversationResult: ({ defaultResult }) => {
    const result = defaultResult();
    return attempts++ === 0 ? { data: null, error: { message: 'Synthetic lost receipt' } } : result;
  } });
  assert.equal((await fixture.action('peer')).success, false);
  fixture.dependencies.stateRef.current = { ...fixture.dependencies.stateRef.current, currentUserId: 'another-owner', sessionUserId: 'another-owner' };
  assert.equal((await fixture.action('peer')).success, true);
  assert.equal(fixture.generatedIds.length, 2);
  assert.notEqual(fixture.generatedIds[0], fixture.generatedIds[1]);
  assert.equal(fixture.serverConversations.size, 2);
});

for (const mismatch of ['id', 'created_by_user_id', 'is_group', 'stable_id']) {
  test(`a duplicate conversation receipt with another ${mismatch} is never accepted`, async () => {
    const fixture = await setup({ conversationResult: () => ({ data: null, error: { code: '23505' } }),
      conversationReadResult: ({ filters }) => ({ error: null, data: { ...filters, [mismatch]: mismatch === 'is_group' ? true : 'wrong' } }) });
    assert.equal((await fixture.action('peer')).success, false);
    assert.equal(fixture.dispatched.length, 0);
    assert.equal(fixture.writes.filter(write => write.table === 'conversation_members').length, 0);
    assert.deepEqual(fixture.reads[0].filters, { id: fixture.generatedIds[0], created_by_user_id: 'owner', is_group: false, stable_id: null });
    assert.equal(fixture.dependencies.pendingDataWrites.current.size, 0);
  });
}

for (const stage of ['conversation-read', 'member-read']) {
  for (const interruption of ['timeout', 'account-change']) {
    test(`${stage} respects the shared ${interruption} guard`, async () => {
      let finish;
      let started;
      let expire;
      const operation = new Promise(resolve => { finish = resolve; });
      const requestStarted = new Promise(resolve => { started = resolve; });
      const held = ({ defaultResult }) => { started(); return operation.then(defaultResult); };
      const fixture = await setup({ ...(stage === 'conversation-read' ? {
        conversationResult: ({ defaultResult }) => { defaultResult(); return { data: null, error: { code: '23505' } }; },
        conversationReadResult: held,
      } : { memberReadResult: held }),
      timers: { setTimeout: callback => { expire = callback; return 1; }, clearTimeout() {} } });
      const pending = fixture.action('peer');
      await requestStarted;
      if (interruption === 'timeout') expire();
      else {
        fixture.dependencies.stateRef.current = { ...fixture.dependencies.stateRef.current, currentUserId: 'another-owner' };
        finish();
      }
      assert.equal((await pending).success, false);
      assert.equal(fixture.dispatched.length, 0);
      assert.equal(fixture.dependencies.pendingDataWrites.current.size, 0);
      if (stage === 'conversation-read') assert.equal(fixture.writes.filter(write => write.table === 'conversation_members').length, 0);
      finish();
      await Promise.resolve();
      assert.equal(fixture.dispatched.length, 0);
    });
  }
}

for (const changed of ['currentUserId', 'sessionUserId', 'currentStableId']) {
  for (const stage of ['conversation', 'members']) {
    test(`a changed ${changed} during ${stage} cannot receive the pending chat`, async () => {
      let finish;
      let started;
      const operation = new Promise(resolve => { finish = resolve; });
      const requestStarted = new Promise(resolve => { started = resolve; });
      const held = ({ defaultResult }) => { started(); return operation.then(defaultResult); };
      const fixture = await setup(stage === 'conversation' ? { conversationResult: held } : { memberResult: held });
      const pending = fixture.action('peer');
      await requestStarted;
      fixture.dependencies.stateRef.current = { ...fixture.dependencies.stateRef.current, [changed]: 'changed' };
      finish();
      assert.equal((await pending).success, false);
      assert.equal(fixture.dispatched.length, 0);
      if (stage === 'conversation') assert.equal(fixture.writes.filter(write => write.table === 'conversation_members').length, 0);
      assert.equal(fixture.dependencies.pendingDataWrites.current.size, 0);
    });
  }
}

for (const stage of ['conversation', 'members']) {
  test(`a stalled ${stage} SDK request times out and releases the guard`, async () => {
    let finish;
    let started;
    let expire;
    const operation = new Promise(resolve => { finish = resolve; });
    const requestStarted = new Promise(resolve => { started = resolve; });
    const held = ({ defaultResult }) => { started(); return operation.then(defaultResult); };
    const fixture = await setup({ ...(stage === 'conversation' ? { conversationResult: held } : { memberResult: held }),
      timers: { setTimeout: callback => { expire = callback; return 1; }, clearTimeout() {} } });
    const pending = fixture.action('peer');
    await requestStarted;
    expire();
    const result = await pending;
    assert.equal(result.success, false);
    assert.match(result.reason, /Försök igen/);
    assert.equal(fixture.dispatched.length, 0);
    assert.equal(fixture.dependencies.pendingDataWrites.current.size, 0);
    finish();
    await Promise.resolve();
    assert.equal(fixture.dispatched.length, 0);
  });
}
