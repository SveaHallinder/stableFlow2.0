import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

async function loadCallback(name, dependencies, file = '../context/AppDataContext.tsx') {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const callback = ts.isCallExpression(initializer) ? initializer.arguments[0] : initializer;
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback.getText(ast)});`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

const comment = { id: 'comment', postId: 'post', authorId: 'user', authorName: 'Anna', text: 'Tack!', createdAt: '2026-09-08T15:00:00Z' };
function actionDependencies(overrides = {}) {
  const dispatched = [];
  return { dispatched, dependencies: {
    stateRef: { current: { currentUserId: 'user', currentStableId: 'stable', users: { user: { name: 'Anna' } },
      posts: [{ id: 'post', stableId: 'stable', comments: 0, commentsData: [], likes: 0, likedByUserIds: [] }] } },
    ensurePermission: () => ({ success: true }), dispatch: action => dispatched.push(action),
    generateId: () => 'generated', isQaDemoMode: false,
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 }, trackDataWrite() {},
    console: { warn() {} }, ...overrides,
  } };
}

for (const [name, helper] of [['addPostComment', 'persistPostCommentInsert'], ['togglePostLike', 'persistPostLikeToggle']]) {
  test(`${name} waits for acknowledgement and blocks duplicate interactions`, async () => {
    let finish;
    let writes = 0;
    const pending = new Promise(resolve => { finish = resolve; });
    const { dispatched, dependencies } = actionDependencies({ [helper]: () => { writes += 1; return pending; } });
    const action = await loadCallback(name, dependencies);
    const first = action('post', 'Tack!', 'comment');
    assert.equal(dispatched.length, 0);
    assert.equal((await action('post', 'Tack!', 'comment')).success, false);
    assert.equal(writes, 1);
    finish({ success: false, reason: 'QA nätfel' });
    assert.equal((await first).success, false);
    assert.equal(dispatched.length, 0);
    assert.equal(dependencies.pendingDataWrites.current.size, 0);
  });
}

test('comment action keeps request ID and canonical timestamp after acknowledgement', async () => {
  let received;
  const { dispatched, dependencies } = actionDependencies({ persistPostCommentInsert: async value => {
    received = value;
    return { success: true, data: comment };
  } });
  const action = await loadCallback('addPostComment', dependencies);
  const result = await action('post', 'Tack!', 'comment');
  assert.equal(received.id, 'comment');
  assert.equal(result.data.createdAt, comment.createdAt);
  assert.deepEqual(dispatched, [{ type: 'POST_COMMENT_UPSERT', payload: comment }]);
});

function persistenceFixture(answers) {
  const calls = [];
  const supabase = { from(table) {
    const query = {};
    for (const method of ['insert', 'update', 'delete', 'select', 'eq', 'abortSignal']) {
      query[method] = (...args) => { if (method !== 'abortSignal') calls.push({ table, method, args }); return query; };
    }
    query.single = async () => answers.shift();
    query.maybeSingle = async () => answers.shift();
    query.then = (resolve, reject) => Promise.resolve(answers.shift()).then(resolve, reject);
    return query;
  } };
  return { calls, dependencies: {
    supabase, user: { id: 'user' }, isQaDemoMode: false, console: { warn() {} },
    AbortController: globalThis.AbortController, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    reportPersistErrorRef: { current() {} },
  } };
}

for (const name of ['persistPostCommentInsert', 'persistPostLikeToggle']) {
  test(`${name} rejects empty acknowledgement`, async () => {
    const { dependencies } = persistenceFixture([{ data: null, error: null }]);
    const persist = await loadCallback(name, dependencies);
    const result = name === 'persistPostCommentInsert' ? await persist(comment) : await persist('post', 'user', true);
    assert.equal(result?.success, false);
  });
}

test('comment lost-ack retry recovers its ID and timestamp without duplicate rows', async () => {
  const row = { id: 'comment', post_id: 'post', user_id: 'user', content: 'Tack!', created_at: comment.createdAt };
  const { calls, dependencies } = persistenceFixture([{ data: null, error: { code: '23505' } }, { data: row, error: null }]);
  const result = await (await loadCallback('persistPostCommentInsert', dependencies))(comment);
  assert.equal(result?.success, true);
  assert.equal(result.data.id, 'comment');
  assert.equal(result.data.createdAt, row.created_at);
  assert.equal(calls.filter(call => call.method === 'update').length, 0);
});

test('edited comment retry updates only the original own comment', async () => {
  const row = { id: 'comment', post_id: 'post', user_id: 'user', content: 'Tidigare text', created_at: comment.createdAt };
  const { calls, dependencies } = persistenceFixture([
    { data: null, error: { code: '23505' } }, { data: row, error: null }, { data: { ...row, content: comment.text }, error: null },
  ]);
  const result = await (await loadCallback('persistPostCommentInsert', dependencies))(comment);
  assert.equal(result?.success, true);
  assert.deepEqual(calls.find(call => call.method === 'update')?.args[0], { content: 'Tack!' });
});

test('duplicate like requires a matching own-post receipt', async () => {
  const { dependencies } = persistenceFixture([{ data: null, error: { code: '23505' } }, { data: { post_id: 'post', user_id: 'user' }, error: null }]);
  assert.equal((await (await loadCallback('persistPostLikeToggle', dependencies))('post', 'user', true))?.success, true);
});

test('comment composer retains text on failed acknowledgement', async () => {
  const cleared = [];
  const errors = [];
  const handler = await loadCallback('handleSubmitComment', {
    commentText: 'Tack!', onAddComment: async () => ({ success: false, reason: 'QA nätfel' }),
    commentPendingRef: { current: false }, commentRequestIdRef: { current: 'comment' },
    canInteract: true, generateId: () => 'comment', setCommentPending() {}, setCommentError: value => errors.push(value),
    setCommentText: value => cleared.push(value), setShowComposer() {}, console: { warn() {} },
  }, '../components/Post.tsx');
  await handler();
  assert.deepEqual(cleared, []);
  assert.equal(errors.at(-1), 'QA nätfel');
});

test('unlike retry confirms absence and verifies the post remains readable', async () => {
  const { dependencies } = persistenceFixture([
    { data: [], error: null }, { data: null, error: null }, { data: { id: 'post' }, error: null },
  ]);
  assert.equal((await (await loadCallback('persistPostLikeToggle', dependencies))('post', 'user', false)).success, true);
});

test('empty unlike response fails when the like remains on the server', async () => {
  const { dependencies } = persistenceFixture([
    { data: [], error: null }, { data: { post_id: 'post', user_id: 'user' }, error: null },
  ]);
  assert.equal((await (await loadCallback('persistPostLikeToggle', dependencies))('post', 'user', false)).success, false);
});

test('comment and like acknowledgements preserve other users interactions and deduplicate retries', async () => {
  const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const reducer = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'reducer');
  const { outputText } = ts.transpileModule(`${reducer.getText(ast)}; export default reducer;`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const reduce = (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default;
  const otherComment = { ...comment, id: 'other-comment', authorId: 'other-user', text: 'Senare kommentar', createdAt: '2026-09-08T15:01:00Z' };
  let state = { posts: [{ id: 'post', content: 'Behåll inlägget', likes: 1, likedByUserIds: ['other-user'], comments: 1, commentsData: [otherComment] }] };
  for (let retry = 0; retry < 2; retry += 1) {
    state = reduce(state, { type: 'POST_COMMENT_UPSERT', payload: comment });
    state = reduce(state, { type: 'POST_LIKE_SET', payload: { postId: 'post', userId: 'user', enabled: true } });
  }
  assert.equal(state.posts[0].comments, 2);
  assert.deepEqual(state.posts[0].commentsData, [comment, otherComment]);
  assert.equal(state.posts[0].likes, 2);
  assert.deepEqual(state.posts[0].likedByUserIds, ['other-user', 'user']);
  state = reduce(state, { type: 'POST_LIKE_SET', payload: { postId: 'post', userId: 'user', enabled: false } });
  assert.equal(state.posts[0].likes, 1);
  assert.equal(state.posts[0].content, 'Behåll inlägget');
});
