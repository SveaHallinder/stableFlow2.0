import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

async function loadCallback(name, dependencies, file = '../context/AppDataContext.tsx', owner = 'AppDataProvider') {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === owner);
  const declaration = component.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(ast) === name);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${declaration.initializer.arguments[0].getText(ast)});`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

const profile = { id: 'user', name: 'Anna', phone: '070', location: 'Stallet', avatar: 'avatar' };
const post = { id: 'post', stableId: 'stable', authorId: 'user', content: 'Hästarna är inne', groupIds: ['stable:stable'] };
function actionDependencies(overrides = {}) {
  const dispatched = [];
  return { dispatched, dependencies: {
    stateRef: { current: { currentUserId: 'user', currentStableId: 'stable', users: { user: profile }, posts: [] } },
    ensurePermission: () => ({ success: true }), dispatch: action => dispatched.push(action),
    generateId: () => 'generated', hasUriScheme: value => value.includes(':'), normalizePostImagePath: value => value,
    hasOwnProperty: (value, key) => Object.prototype.hasOwnProperty.call(value, key), isQaDemoMode: false,
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 }, trackDataWrite: () => {},
    console: { warn() {} }, ...overrides,
  } };
}

for (const [name, helper, input] of [
  ['addPost', 'persistPostInsert', { content: post.content, requestId: post.id }],
  ['updateProfile', 'persistProfileUpdate', { name: 'Anna II' }],
]) {
  test(`${name} waits for server acknowledgement, blocks duplicates and preserves local state on failure`, async () => {
    let finish;
    let writes = 0;
    const pending = new Promise(resolve => { finish = resolve; });
    const { dispatched, dependencies } = actionDependencies({ [helper]: () => { writes += 1; return pending; } });
    const action = await loadCallback(name, dependencies);
    const result = action(input);
    assert.equal(dispatched.length, 0);
    assert.equal((await action(input)).success, false);
    assert.equal(writes, 1);
    finish({ success: false, reason: 'QA saknad kvittens' });
    assert.equal((await result).success, false);
    assert.equal(dispatched.length, 0);
    assert.equal(dependencies.pendingDataWrites.current.size, 0);
  });
}

test('post publishing reuses the caller request ID and canonical server timestamp', async () => {
  const saved = { ...post, createdAt: '2026-09-08T12:00:00Z' };
  let requestedId;
  const { dispatched, dependencies } = actionDependencies({ persistPostInsert: async next => {
    requestedId = next.id;
    return { success: true, data: saved };
  } });
  const action = await loadCallback('addPost', dependencies);
  assert.equal((await action({ content: post.content, requestId: post.id })).success, true);
  assert.equal(requestedId, post.id);
  assert.deepEqual(dispatched, [{ type: 'POST_ADD', payload: saved }]);
});

function persistenceFixture(answers, overrides = {}) {
  const calls = [];
  const supabase = { from(table) {
    const query = {};
    for (const method of ['insert', 'update', 'select', 'eq', 'abortSignal']) {
      query[method] = (...args) => { if (method !== 'abortSignal') calls.push({ table, method, args }); return query; };
    }
    query.single = async () => answers.shift();
    query.then = (resolve, reject) => Promise.resolve(answers.shift()).then(resolve, reject);
    return query;
  } };
  return { calls, dependencies: {
    supabase, user: { id: 'user' }, isQaDemoMode: false, console: { warn() {} },
    AbortController: globalThis.AbortController, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    reportPersistErrorRef: { current() {} }, getUploadableImage: value => ({ uri: value }),
    postUploadCacheRef: { current: new Map() },
    hasUriScheme: value => value.includes(':'), normalizePostImagePath: value => value,
    invalidateSignedUrl() {}, getSignedPostImageUrl: async () => 'signed-url',
    uploadPostImage: async () => 'stable/user/post.jpg', dispatch() {}, ...overrides,
  } };
}

for (const name of ['persistPostInsert', 'persistProfileUpdate']) {
  test(`${name} rejects empty acknowledgement`, async () => {
    const { dependencies } = persistenceFixture([{ data: null, error: null }]);
    const persist = await loadCallback(name, dependencies);
    const result = name === 'persistPostInsert' ? await persist(post) : await persist('user', { full_name: 'Anna II' });
    assert.equal(result?.success, false);
  });
}

test('post upload failure prevents a text-only post from being inserted', async () => {
  const { calls, dependencies } = persistenceFixture([{ data: { id: post.id }, error: null }], {
    uploadPostImage: async () => { throw new Error('QA upload failed'); },
  });
  const result = await (await loadCallback('persistPostInsert', dependencies))(post, 'file:///photo.jpg');
  assert.equal(calls.filter(call => call.method === 'insert').length, 0);
  assert.equal(result?.success, false);
});

test('post retry recovers an identical persisted row without overwrite', async () => {
  const row = { id: post.id, stable_id: post.stableId, user_id: post.authorId, content: post.content,
    group_ids: post.groupIds, image_url: null, media_type: 'text', created_at: '2026-09-08T12:00:00Z' };
  const { calls, dependencies } = persistenceFixture([{ data: null, error: { code: '23505' } }, { data: row, error: null }]);
  const result = await (await loadCallback('persistPostInsert', dependencies))(post);
  assert.equal(result?.success, true);
  assert.equal(result.data.createdAt, row.created_at);
  assert.equal(calls.filter(call => call.method === 'update').length, 0);
});

test('image publication retry reuses its uploaded image after the post acknowledgement is lost', async () => {
  let uploads = 0;
  const row = { id: post.id, stable_id: post.stableId, user_id: post.authorId, content: post.content,
    group_ids: post.groupIds, image_url: 'stable/user/post.jpg', media_type: 'image', created_at: '2026-09-08T12:00:00Z' };
  const { calls, dependencies } = persistenceFixture([
    { data: null, error: { message: 'Lost acknowledgement' } },
    { data: null, error: { code: '23505' } }, { data: row, error: null },
  ], { uploadPostImage: async () => { uploads += 1; return row.image_url; } });
  const persist = await loadCallback('persistPostInsert', dependencies);
  assert.equal((await persist(post, 'file:///photo.jpg')).success, false);
  const recovered = await persist(post, 'file:///photo.jpg');
  assert.equal(recovered.success, true);
  assert.equal(recovered.data.imagePath, row.image_url);
  assert.equal(uploads, 1);
  assert.equal(calls.filter(call => call.method === 'update').length, 0);
});

test('post image timeout releases the form and cannot insert a late text or image post', async () => {
  let finishUpload;
  const upload = new Promise(resolve => { finishUpload = resolve; });
  const { calls, dependencies } = persistenceFixture([], {
    uploadPostImage: () => upload,
    setTimeout: callback => { globalThis.queueMicrotask(callback); return 1; }, clearTimeout() {},
  });
  const persist = await loadCallback('persistPostInsert', dependencies);
  assert.equal((await persist(post, 'file:///photo.jpg')).success, false);
  finishUpload('stable/user/post.jpg');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.filter(call => call.method === 'insert').length, 0);
});

test('profile canonical acknowledgement changes only requested fields', async () => {
  const { dispatched, dependencies } = actionDependencies({
    persistProfileUpdate: async (_, payload) => {
      assert.deepEqual(payload, { phone: null });
      return { success: true, data: { id: 'user', full_name: 'Other newer name', phone: null } };
    },
  });
  const action = await loadCallback('updateProfile', dependencies);
  assert.equal((await action({ phone: '' })).success, true);
  assert.deepEqual(dispatched, [{ type: 'USER_UPDATE', payload: { id: 'user', updates: { phone: '' } } }]);
});

test('edited post retry updates only publication fields after verifying the existing owner and stable', async () => {
  const original = { id: post.id, stable_id: post.stableId, user_id: post.authorId, content: post.content,
    group_ids: post.groupIds, image_url: null, media_type: 'text', created_at: '2026-09-08T12:00:00Z' };
  const edited = { ...post, content: 'Uppdaterad text efter tappad kvittens' };
  const { calls, dependencies } = persistenceFixture([
    { data: null, error: { code: '23505' } }, { data: original, error: null },
    { data: { ...original, content: edited.content }, error: null },
  ]);
  const result = await (await loadCallback('persistPostInsert', dependencies))(edited);
  assert.equal(result.success, true);
  assert.equal(result.data.content, edited.content);
  const writeIndex = calls.findIndex(call => call.method === 'update');
  assert.ok(writeIndex >= 0);
  assert.deepEqual(Object.keys(calls[writeIndex].args[0]).sort(), ['content', 'group_ids', 'image_url', 'media_type']);
  const filters = calls.slice(writeIndex).filter(call => call.method === 'eq').map(call => call.args);
  assert.deepEqual(filters, [['id', post.id], ['stable_id', post.stableId], ['user_id', post.authorId]]);
});

test('duplicate post receipt for another author or stable never authorizes an update', async () => {
  for (const changed of [{ user_id: 'other-user' }, { stable_id: 'other-stable' }]) {
    const { calls, dependencies } = persistenceFixture([
      { data: null, error: { code: '23505' } },
      { data: { id: post.id, stable_id: post.stableId, user_id: post.authorId, ...changed }, error: null },
    ]);
    assert.equal((await (await loadCallback('persistPostInsert', dependencies))(post)).success, false);
    assert.equal(calls.filter(call => call.method === 'update').length, 0);
  }
});

test('late publish acknowledgement cannot clear another stable composer or restore old groups', async () => {
  let finish;
  const answer = new Promise(resolve => { finish = resolve; });
  const changed = [];
  const currentStableIdRef = { current: 'stable-a' };
  const handler = await loadCallback('handlePublish', {
    canPublishPost: true, postContent: post.content, postImage: null, currentStableId: 'stable-a',
    selectedGroups: ['stable:stable-a'], stableGroupIdValue: 'stable:stable-a', currentStableIdRef,
    actions: { addPost: () => answer }, publishingRef: { current: false }, groupSavingRef: { current: false }, postRequestIdRef: { current: post.id },
    setPublishing() {}, setPublishError() {}, generateId: () => post.id,
    setPostContent: value => changed.push(value), setSelectedGroups: value => changed.push(value),
    setPostImage() {}, setIsComposerOpen() {}, toast: { showToast() {} }, console: { warn() {} },
  }, '../app/(tabs)/feed.tsx', 'FeedScreen');
  const pending = handler();
  currentStableIdRef.current = 'stable-b';
  finish({ success: true, data: post });
  await pending;
  assert.deepEqual(changed, []);
});

test('updated duplicate post acknowledgement preserves reactions and comments in the reducer', async () => {
  const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const reducer = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'reducer');
  assert.ok(reducer, 'reducer is available');
  const { outputText } = ts.transpileModule(`${reducer.getText(ast)}; export default reducer;`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const reduce = (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default;
  const previous = { ...post, content: 'Original', likes: 2, likedByUserIds: ['u1', 'u2'], comments: 1, commentsData: [{ id: 'comment' }] };
  const next = reduce({ posts: [previous] }, { type: 'POST_ADD', payload: { ...post, content: 'Ändrat', likes: 0, comments: 0, commentsData: [] } });
  assert.equal(next.posts[0].content, 'Ändrat');
  assert.equal(next.posts[0].likes, 2);
  assert.deepEqual(next.posts[0].commentsData, previous.commentsData);
});

test('feed submit retains the composer draft on rejected publication', async () => {
  const cleared = [];
  const errors = [];
  const handler = await loadCallback('handlePublish', {
    canPublishPost: true, postContent: post.content, postImage: null, currentStableId: 'stable',
    selectedGroups: post.groupIds, stableGroupIdValue: 'stable:stable', currentStableIdRef: { current: 'stable' },
    actions: { addPost: async () => ({ success: false, reason: 'QA saknad kvittens' }) },
    publishingRef: { current: false }, groupSavingRef: { current: false }, postRequestIdRef: { current: post.id },
    setPublishing() {}, setPublishError: value => errors.push(value), generateId: () => post.id,
    setPostContent: value => cleared.push(value), setSelectedGroups() {}, setPostImage() {}, setIsComposerOpen() {},
    toast: { showToast() {} }, console: { warn() {} },
  }, '../app/(tabs)/feed.tsx', 'FeedScreen');
  await handler();
  assert.equal(cleared.length, 0);
  assert.equal(errors.at(-1), 'QA saknad kvittens');
});

test('profile submit does not show success before the server responds', async () => {
  let finish;
  const answer = new Promise(resolve => { finish = resolve; });
  const toasts = [];
  const handler = await loadCallback('handleSave', {
    currentUser: profile, draft: { name: 'Anna II', phone: '070', location: 'Stallet' },
    actions: { updateProfile: () => answer }, toast: { showToast: (...args) => toasts.push(args) },
    savingProfileRef: { current: false }, dirtyProfileRef: { current: new Set(['name']) },
    setSavingProfile() {}, setProfileError() {}, setDraft() {}, console: { warn() {} },
  }, '../app/settings/account.tsx', 'AccountSettingsScreen');
  const pending = handler();
  assert.equal(toasts.length, 0);
  finish({ success: false, reason: 'QA saknad kvittens' });
  await pending;
  assert.equal(toasts.some(([, tone]) => tone === 'success'), false);
});
