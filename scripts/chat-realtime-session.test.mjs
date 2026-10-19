import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
const statement = provider.body.statements.find(node => ts.isExpressionStatement(node)
  && node.getText(ast).includes(".channel('messages-realtime')"));
const effect = statement.expression.arguments[0].getText(ast);
const reducer = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'reducer').getText(ast);

async function setup({ user = { id: 'first' }, isQaDemoMode = false } = {}) {
  let receive;
  let subscriptions = 0;
  const dispatched = [];
  const removed = [];
  const stateRef = { current: {
    sessionUserId: 'first', currentUserId: 'first',
    messages: [{ id: 'shared-chat', unreadCount: 2, description: 'Tidigare text' }],
    conversations: { 'shared-chat': [] },
  } };
  const channel = {
    on(_event, _filter, callback) { receive = callback; return this; },
    subscribe() { subscriptions += 1; return this; },
  };
  let actualReducer;
  const dependencies = {
    user, isQaDemoMode, stateRef, dataWriteVersion: { current: 0 },
    formatTimeAgo: () => 'Nyss',
    supabase: { channel: () => channel, removeChannel: value => { removed.push(value); return Promise.resolve(); } },
    dispatch: action => { dispatched.push(action); stateRef.current = actualReducer(stateRef.current, action); },
  };
  const { outputText } = ts.transpileModule(`${reducer}\nexport default ({ ${Object.keys(dependencies).join(', ')} }) => ({ effect: (${effect}), reducer });`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const loaded = (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
  actualReducer = loaded.reducer;
  const cleanup = loaded.effect();
  const emit = (overrides = {}) => receive({ new: {
    id: 'new-message', conversation_id: 'shared-chat', author_id: 'peer',
    text: 'Nytt meddelande', created_at: '2026-10-07T18:00:00.000Z', status: null, ...overrides,
  } });
  return { stateRef, dispatched, removed, channel, cleanup, emit, subscriptions };
}

test('active realtime appends a peer message and preserves the existing own-message echo guard', async () => {
  const fixture = await setup();
  fixture.emit();
  fixture.emit({ id: 'own-message', author_id: 'first' });
  assert.equal(fixture.dispatched.length, 1);
  assert.equal(fixture.stateRef.current.messages[0].unreadCount, 3);
  assert.equal(fixture.stateRef.current.conversations['shared-chat'][0].text, 'Nytt meddelande');
});

test('repeated delivery leaves one message and one unread increment through the real reducer', async () => {
  const fixture = await setup();
  fixture.emit();
  fixture.emit();
  assert.equal(fixture.stateRef.current.conversations['shared-chat'].length, 1);
  assert.equal(fixture.stateRef.current.messages[0].unreadCount, 3);
});

test('a callback from account A cannot alter a shared-chat preview after state belongs to B', async () => {
  for (const identity of [{ sessionUserId: 'second', currentUserId: 'second' }, { sessionUserId: 'first', currentUserId: 'second' }]) {
    const fixture = await setup();
    Object.assign(fixture.stateRef.current, identity);
    const before = structuredClone(fixture.stateRef.current);
    fixture.emit();
    assert.deepEqual(fixture.stateRef.current, before);
    assert.equal(fixture.dispatched.length, 0);
  }
});

test('cleanup rejects late callbacks even after A changes to B and back to A', async () => {
  const fixture = await setup();
  fixture.cleanup();
  Object.assign(fixture.stateRef.current, { sessionUserId: 'second', currentUserId: 'second' });
  Object.assign(fixture.stateRef.current, { sessionUserId: 'first', currentUserId: 'first' });
  const before = structuredClone(fixture.stateRef.current);
  fixture.emit();
  assert.deepEqual(fixture.stateRef.current, before);
  assert.deepEqual(fixture.removed, [fixture.channel]);
  assert.equal(fixture.dispatched.length, 0);
});

test('signed-out and QA demo modes create no provider subscription', async () => {
  for (const options of [{ user: null }, { isQaDemoMode: true }]) {
    const fixture = await setup(options);
    assert.equal(fixture.subscriptions, 0);
    assert.equal(fixture.cleanup, undefined);
  }
});
