import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { URL } from 'node:url';
import vm from 'node:vm';
import { createClient } from '@supabase/supabase-js';
import React from 'react';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const project = 'https://stableflow-private-images.invalid';
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const S = '00000000-0000-4000-8000-000000000003';
const F = '00000000-0000-4000-8000-000000000004';
const reference = (bucket = 'avatars', file = F) => `${project}/storage/v1/object/public/${bucket}/${S}/${file}.jpg`;
const response = (data, status = 200) => new globalThis.Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
const jwt = uid => [Buffer.from('{"alg":"HS256"}').toString('base64url'),
  Buffer.from(JSON.stringify({ sub: uid, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
  Buffer.from('synthetic-signature').toString('base64url')].join('.');

function load(path, dependencies, globals = {}) {
  const source = readFileSync(new URL(path, root), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } });
  const module = { exports: {} };
  const require = name => {
    assert.ok(Object.hasOwn(dependencies, name), 'Unexpected image dependency: ' + name);
    return dependencies[name];
  };
  vm.runInNewContext('(function(require,module,exports){' + outputText + '\n})', {
    URL, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, console, ...globals,
  }, { filename: path })(require, module, module.exports);
  return module.exports;
}

const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object'
  ? [value, ...nodes(value.props?.children)] : [];
const image = tree => nodes(tree).find(node => node.type === 'Image');
const retry = tree => nodes(tree).find(node => node.props?.accessibilityRole === 'button');

async function fixture({ source = { uri: reference() }, avatar = false } = {}) {
  const requests = [], logs = [], listeners = [];
  const client = createClient(project, 'synthetic-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, options) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/v1/user') {
        const token = new globalThis.Headers(options.headers).get('Authorization').split(' ')[1];
        const id = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
        return response({ id, aud: 'authenticated', role: 'authenticated' });
      }
      assert.ok(url.pathname.startsWith('/storage/v1/object/sign/'), 'Only synthetic signing is allowed');
      return new Promise(resolve => requests.push({ url, options, resolve, done: false }));
    } },
  });
  const session = async id => {
    const result = await client.auth.setSession({ access_token: jwt(id), refresh_token: 'synthetic-refresh' });
    assert.equal(result.error, null);
  };
  await session(A);
  const subscribe = client.auth.onAuthStateChange.bind(client.auth);
  client.auth.onAuthStateChange = callback => { listeners.push(callback); return subscribe(callback); };
  const helpers = load('lib/privateImages.ts', { '@/lib/supabase': { supabase: client, supabaseConfig: { url: project } } }, {
    console: { warn: (...args) => logs.push(args) },
  });
  const auth = { user: { id: A }, loading: false, pendingAccountDeletionId: null };
  const state = { currentStableId: S, currentUserId: A, sessionUserId: A };
  let driver;
  const hooks = { ...React, memo: fn => fn,
    useState: value => driver.state(value), useRef: value => driver.ref(value),
    useMemo: (fn, deps) => driver.memo(fn, deps),
    useLayoutEffect: (fn, deps) => driver.effect(fn, deps, true), useEffect: (fn, deps) => driver.effect(fn, deps, false),
  };
  const native = { StyleSheet: { create: value => value, absoluteFillObject: { position: 'absolute', inset: 0 } } };
  for (const name of ['Image', 'View', 'Text', 'TouchableOpacity', 'ActivityIndicator']) native[name] = name;
  const { PrivateImage } = load('components/PrivateImage.tsx', {
    react: hooks, 'react-native': native, '@expo/vector-icons': { Feather: 'Feather' },
    '@/context/AuthContext': { useAuth: () => auth }, '@/context/AppDataContext': { useAppData: () => ({ state }) },
    '@/lib/supabase': { supabase: client }, '@/lib/privateImages': helpers, '@/components/theme': { theme: { colors: {} } },
  }, { console: { warn: (...args) => logs.push(args) } });
  const { Avatar } = load('components/Avatar.tsx', {
    react: hooks, 'react-native': native, '@/components/PrivateImage': { PrivateImage },
    '@/assets/images/dummy-avatar.png': 77,
  });
  class Driver {
    constructor() { this.slots = []; this.props = { source, style: { width: 56, height: 56 } }; this.live = true; this.writesAfterUnmount = 0; }
    state(initial) {
      const slot = this.slots[this.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slot.value, next => {
        if (!this.live) this.writesAfterUnmount++;
        const value = typeof next === 'function' ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) { slot.value = value; this.dirty = true; }
      }];
    }
    ref(value) { return this.slots[this.cursor++] ??= { current: value }; }
    memo(fn, deps) {
      const i = this.cursor++;
      if (!equal(this.slots[i]?.deps, deps)) this.slots[i] = { value: fn(), deps };
      return this.slots[i].value;
    }
    effect(fn, deps, layout) {
      const i = this.cursor++, previous = this.slots[i];
      if (!equal(previous?.deps, deps)) {
        this.slots[i] = { effect: true, deps, cleanup: previous?.cleanup };
        (layout ? this.layouts : this.effects).push(() => {
          this.slots[i].cleanup?.(); this.slots[i].cleanup = fn();
        });
      }
    }
    render(patch = {}) {
      Object.assign(this.props, patch); this.cursor = 0; this.layouts = []; this.effects = []; this.dirty = false;
      const wrapper = avatar ? Avatar(this.props) : null;
      this.tree = wrapper ? wrapper.type === PrivateImage ? PrivateImage(wrapper.props) : wrapper : PrivateImage(this.props);
      return this.tree;
    }
    flush(patch = {}) {
      this.render(patch);
      for (let n = 0; n < 12; n++) {
        this.layouts.splice(0).forEach(fn => fn()); this.effects.splice(0).forEach(fn => fn());
        if (!this.dirty) return this.tree;
        this.render();
      }
      assert.fail('Image effect loop');
    }
    unmount() { this.slots.filter(slot => slot?.effect).forEach(slot => slot.cleanup?.()); this.live = false; }
    strictRemount() {
      this.slots.filter(slot => slot?.effect).forEach(slot => { slot.cleanup?.(); slot.cleanup = undefined; slot.deps = undefined; });
      this.flush();
    }
  }
  driver = new Driver(); driver.flush();
  const settle = async () => { for (let n = 0; n < 4; n++) { await setImmediate(); if (driver.live) driver.flush(); } };
  await settle();
  const answer = (index, data, status = 200) => {
    const request = requests[index]; assert.ok(request && !request.done);
    request.done = true;
    request.resolve(response(data ?? { signedURL: request.url.pathname.slice('/storage/v1'.length) + '?token=synthetic-display-token' }, status));
  };
  return { driver, helpers, client, requests, logs, listeners, auth, state, session, answer, settle,
    async cleanup() {
      driver.unmount(); requests.forEach((r, i) => { if (!r.done) answer(i, { message: 'synthetic-error' }, 403); });
      await settle(); assert.equal(driver.writesAfterUnmount, 0);
    },
  };
}

test('private images: actual SDK signs only the stored canonical reference and preserves it', async () => {
  const f = await fixture();
  try {
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(f.requests[0].options.body), { expiresIn: f.helpers.PRIVATE_IMAGE_TTL_SECONDS });
    assert.equal(f.requests[0].url.pathname, `/storage/v1/object/sign/avatars/${S}/${F}.jpg`);
    f.answer(0); await f.settle();
    assert.match(image(f.driver.tree).props.source.uri, /\/object\/sign\/avatars\/.*token=synthetic-display-token$/);
    assert.equal(f.driver.props.source.uri, reference()); assert.deepEqual(f.logs, []);
  } finally { await f.cleanup(); }
});

test('private images: local previews, bundled assets and other origins stay direct; malformed private refs fail closed', async () => {
  for (const source of [9, { uri: 'file:///synthetic-preview.jpg' }, { uri: 'https://images.example.test/avatar.jpg' }]) {
    const f = await fixture({ source });
    try { assert.equal(f.requests.length, 0); assert.deepEqual(JSON.parse(JSON.stringify(image(f.driver.tree).props.source)), source); }
    finally { await f.cleanup(); }
  }
  for (const uri of [reference() + '?secret=synthetic', reference().replace(F, '..'), reference().replace('/avatars/', '/avatars/../paddocks/'),
    reference().replace('/' + F, '/%2F' + F)]) {
    const f = await fixture({ source: { uri } });
    try { assert.equal(f.requests.length, 0); assert.ok(retry(f.driver.tree)); }
    finally { await f.cleanup(); }
  }
});

test('private images: ordinary parent rerender keeps the in-flight signing request', async () => {
  const f = await fixture();
  try {
    f.driver.flush({ source: { uri: reference() }, style: { width: 42, height: 42 } }); await f.settle();
    assert.equal(f.requests.length, 1); f.answer(0); await f.settle();
    assert.deepEqual(image(f.driver.tree).props.style, { width: 42, height: 42 });
  } finally { await f.cleanup(); }
});

test('private images: Avatar recovers on A→B and ignores the old A image error', async () => {
  const f = await fixture({ source: { uri: 'file:///A.jpg' }, avatar: true });
  try {
    const oldError = image(f.driver.tree).props.onError; oldError(); f.driver.flush();
    assert.ok(retry(f.driver.tree));
    f.driver.flush({ source: { uri: 'file:///B.jpg' } });
    assert.equal(image(f.driver.tree).props.source.uri, 'file:///B.jpg');
    oldError(); f.driver.flush();
    assert.equal(image(f.driver.tree).props.source.uri, 'file:///B.jpg');
    assert.equal(image(f.driver.tree).props.accessibilityLabel, 'Profilbild');
  } finally { await f.cleanup(); }
});

test('private images: local A→B→A and mount changes retire the RNW Image instance; ordinary rerenders keep it', async () => {
  const f = await fixture({ source: { uri: 'file:///A.jpg' }, avatar: true });
  try {
    const first = image(f.driver.tree), oldError = first.props.onError;
    f.driver.flush({ source: { uri: 'file:///A.jpg' }, style: { width: 42, height: 42 } });
    assert.equal(image(f.driver.tree).key, first.key);
    f.driver.flush({ source: { uri: 'file:///B.jpg' } });
    const second = image(f.driver.tree);
    assert.notEqual(second.key, first.key);
    f.driver.flush({ source: { uri: 'file:///A.jpg' } });
    const current = image(f.driver.tree);
    assert.notEqual(current.key, first.key); assert.notEqual(current.key, second.key);
    oldError(); f.driver.flush();
    assert.equal(image(f.driver.tree).key, current.key); assert.equal(image(f.driver.tree).props.source.uri, 'file:///A.jpg');
    f.driver.strictRemount(); await f.settle();
    assert.notEqual(image(f.driver.tree).key, current.key);
    assert.equal(f.requests.length, 0); assert.deepEqual(f.logs, []);
  } finally { await f.cleanup(); }
});

test('private images: pending source A→B→A results and stale errors cannot replace the new image', async () => {
  const f = await fixture();
  try {
    f.driver.flush({ source: { uri: reference('paddocks') } }); await f.settle();
    f.driver.flush({ source: { uri: reference() } }); await f.settle();
    assert.equal(f.requests.length, 3); f.answer(0); f.answer(1, { message: 'synthetic-private-provider-detail' }, 403); await f.settle();
    assert.equal(image(f.driver.tree), undefined); assert.deepEqual(f.logs, []);
    f.answer(2); await f.settle(); assert.equal(image(f.driver.tree).props.source.uri.includes('/avatars/'), true);
  } finally { await f.cleanup(); }
});

test('private images: SDK A→B→A before React catches up invalidates the earlier signing completion', async () => {
  const f = await fixture();
  try {
    await f.session(B); await f.session(A); f.answer(0); await f.settle();
    assert.equal(image(f.driver.tree), undefined); assert.equal(f.requests.length, 2);
    f.answer(1); await f.settle(); assert.ok(image(f.driver.tree)); assert.deepEqual(f.logs, []);
  } finally { await f.cleanup(); }
});

test('private images: stall switch and unmount discard late display results', async () => {
  const f = await fixture();
  try {
    f.state.currentStableId = B; f.driver.flush(); f.answer(0); await f.settle();
    assert.equal(image(f.driver.tree), undefined); assert.equal(f.requests.length, 2);
    f.driver.unmount(); f.answer(1); await f.settle(); assert.deepEqual(f.logs, []);
  } finally { await f.cleanup(); }
});

test('private images: wrong caller, missing Auth and pending deletion prevent signing', async () => {
  for (const change of [f => { f.auth.user = null; }, f => { f.state.currentUserId = B; },
    f => { f.state.sessionUserId = B; }, f => { f.auth.pendingAccountDeletionId = A; }]) {
    const f = await fixture({ source: { uri: 'file:///preview.jpg' } });
    try { change(f); f.driver.flush({ source: { uri: reference() } }); await f.settle(); assert.equal(f.requests.length, 0); assert.ok(retry(f.driver.tree)); }
    finally { await f.cleanup(); }
  }
});

test('private images: redacted provider failure offers display-only retry with the original reference', async () => {
  const f = await fixture();
  try {
    f.answer(0, { message: 'PRIVATE-PROVIDER-TOKEN', error: 'PRIVATE-ERROR-NAME', statusCode: '403' }, 403); await f.settle();
    assert.ok(retry(f.driver.tree)); assert.deepEqual(f.logs, [['[private image] signing failed']]);
    let stopped = 0;
    retry(f.driver.tree).props.onPress({ stopPropagation() { stopped++; } }); f.driver.flush(); await f.settle();
    assert.equal(stopped, 1, 'Retry must not open the parent horse/paddock card');
    assert.equal(f.requests.length, 2); assert.equal(f.driver.props.source.uri, reference());
    assert.equal(f.requests[0].url.pathname, f.requests[1].url.pathname); f.answer(1); await f.settle(); assert.ok(image(f.driver.tree));
    assert.doesNotMatch(JSON.stringify(f.logs), /PRIVATE-|synthetic-display-token/);
  } finally { await f.cleanup(); }
});

test('private images: malformed signing response is never used as an Image URI', async () => {
  for (const signedURL of ['https://unrelated.example.test/object?token=synthetic', '/object/sign/paddocks/foreign.jpg?token=synthetic', '/object/sign/avatars/' + S + '/' + F + '.jpg',
    '/object/sign/avatars/' + S + '/' + F + '.jpg?token=synthetic&download=1', '/object/sign/avatars/' + S + '/' + F + '.jpg?token=one&token=two',
    '/object/sign/avatars/' + S + '/../' + S + '/' + F + '.jpg?token=synthetic']) {
    const f = await fixture();
    try { f.answer(0, { signedURL }); await f.settle(); assert.equal(image(f.driver.tree), undefined); assert.ok(retry(f.driver.tree)); assert.equal(f.logs.length, 1); }
    finally { await f.cleanup(); }
  }
});

test('private images: an old image event cannot write after a StrictMode effect remount', async () => {
  const f = await fixture({ source: { uri: 'file:///preview.jpg' } });
  try {
    const oldError = image(f.driver.tree).props.onError;
    f.driver.strictRemount(); await f.settle(); oldError(); f.driver.flush();
    assert.equal(image(f.driver.tree).props.source.uri, 'file:///preview.jpg');
    assert.deepEqual(f.logs, []);
  } finally { await f.cleanup(); }
});

test('private images: a late unsubscribed Auth listener cannot change the new B subscription', async () => {
  const f = await fixture();
  try {
    const oldListener = f.listeners[0]; f.driver.strictRemount(); await f.settle();
    await f.session(B); f.auth.user = { id: B }; f.state.currentUserId = B; f.state.sessionUserId = B; f.driver.flush(); await f.settle();
    const last = f.requests.length - 1; f.answer(last); await f.settle();
    const currentUri = image(f.driver.tree).props.source.uri, count = f.requests.length;
    oldListener('SIGNED_IN', { user: { id: A } }); await f.settle();
    assert.equal(image(f.driver.tree).props.source.uri, currentUri); assert.equal(f.requests.length, count);
    assert.deepEqual(f.logs, []);
    f.driver.unmount(); oldListener('SIGNED_IN', { user: { id: A } });
    assert.equal(f.driver.writesAfterUnmount, 0);
  } finally { await f.cleanup(); }
});

test('private images: deadline ends a stalled actual SDK session read and blocks later signing', async () => {
  let release; const stored = new Promise(resolve => { release = resolve; }); const timers = [], requests = [], logs = [];
  const client = createClient(project, 'synthetic-anon-key', {
    auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storage: {
      getItem: () => stored, setItem: async () => {}, removeItem: async () => {},
    } }, global: { fetch: async () => { requests.push(true); return response({}); } },
  });
  const helpers = load('lib/privateImages.ts', { '@/lib/supabase': { supabase: client, supabaseConfig: { url: project } } }, {
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: () => {}, console: { warn: (...args) => logs.push(args) },
  });
  const result = helpers.getPrivateImageUrl({ bucket: 'avatars', path: `${S}/${F}.jpg` }, A, () => true);
  timers[0](); assert.equal(await result, null); release(null); await setImmediate(); await setImmediate();
  assert.equal(requests.length, 0); assert.deepEqual(logs, [['[private image] signing timed out']]);
});

function nativeUploader(uriBytes) {
  const source = readFileSync(new URL('context/AppDataContext.tsx', root), 'utf8');
  const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const selected = ast.statements.filter(node => ts.isFunctionDeclaration(node)
    && ['getExtensionFromUri', 'resolveContentType', 'resolveImageBytes', 'uploadPostImage', 'uploadImageToStorage'].includes(node.name?.text));
  assert.equal(selected.length, 5);
  const requests = [], imageRequests = [], invalidations = [];
  const client = createClient(project, 'synthetic-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, options) => { requests.push({ url: new URL(String(input)), options }); return response({ Key: 'synthetic-object' }); } },
  });
  // Use React Native's actual Response polyfill with its native Blob limitation.
  class NativeBlob {
    constructor(parts = []) {
      if (parts.some(part => part instanceof ArrayBuffer || ArrayBuffer.isView(part))) {
        throw new Error("Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported");
      }
    }
  }
  const nativeGlobals = { Blob: NativeBlob, FileReader: function () {}, ArrayBuffer, Uint8Array, DataView,
    URLSearchParams: globalThis.URLSearchParams, FormData: globalThis.FormData };
  const polyfill = {};
  const nativeRequire = createRequire(createRequire(import.meta.url).resolve('react-native/package.json'));
  vm.runInNewContext(readFileSync(nativeRequire.resolve('whatwg-fetch/dist/fetch.umd.js'), 'utf8'), {
    exports: polyfill, module: { exports: polyfill }, self: nativeGlobals, ...nativeGlobals,
  });
  const { createTimeoutFetch } = load('lib/requestTimeout.ts', {}, {
    ...nativeGlobals, Response: polyfill.Response, Request: polyfill.Request, AbortController: globalThis.AbortController,
  });
  const { outputText } = ts.transpileModule(selected.map(n => n.getText(ast)).join('\n')
    + '\nthis.upload=uploadImageToStorage;this.uploadPost=uploadPostImage;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  const runtime = { ...nativeGlobals, supabase: client, generateId: () => F, imageContentTypes: { jpg: 'image/jpeg' },
    POSTS_BUCKET: 'posts', invalidateSignedUrl: path => invalidations.push(path), createTimeoutFetch,
    fetch: async input => {
      imageRequests.push(String(input));
      assert.ok(String(input).startsWith('file://'), 'Native image loading cannot use data: URLs');
      return new globalThis.Response(new Uint8Array(uriBytes), { headers: { 'Content-Type': 'image/jpeg' } });
    } };
  vm.runInNewContext(outputText, runtime, { filename: 'actual-private-uploader' });
  return { ...runtime, requests, imageRequests, invalidations };
}

test('private images: native uploaders preserve unique INSERT references and correct binary image bytes', async () => {
  const cases = [
    { bytes: [0, 1, 2, 127, 128, 254, 255] },
    { bytes: [255, 0, 1, 2, 3], base64: '/wABAgM=' },
    { bytes: [0, 1, 2, 127, 128, 254, 255], base64: ' AAECf4D+/w==\n' },
    { bytes: [0, 1, 254, 255], base64: 'data:image/jpeg;base64,AAH+/w==' },
    { bytes: [0, 1, 2], base64: 'AAEC' },
  ];
  for (const { bytes, base64 } of cases) {
    for (const bucket of ['avatars', 'posts']) {
      const f = nativeUploader(bytes);
      const image = { uri: 'file:///preview.jpg', base64, mimeType: 'image/jpeg' };
      const path = bucket === 'posts' ? `${S}/${A}/${B}/${F}.jpg` : `${S}/${F}.jpg`;
      if (bucket === 'posts') {
        assert.equal(await f.uploadPost({ stableId: S, userId: A, postId: B, image }), path);
        assert.deepEqual(f.invalidations, [path]);
      } else {
        const saved = await f.upload(bucket, S, image);
        assert.equal(saved.publicUrl, reference()); assert.equal(saved.path, path);
      }
      assert.equal(f.requests.length, 1); assert.equal(f.requests[0].options.method, 'POST');
      assert.equal(f.requests[0].url.pathname, `/storage/v1/object/${bucket}/${path}`);
      const headers = new globalThis.Headers(f.requests[0].options.headers);
      assert.equal(headers.get('x-upsert'), 'false'); assert.equal(headers.get('content-type'), 'image/jpeg');
      assert.ok(f.requests[0].options.body instanceof ArrayBuffer, 'Native storage upload must send raw bytes');
      assert.deepEqual([...new Uint8Array(f.requests[0].options.body)], bytes);
      assert.deepEqual(f.imageRequests, base64 ? [] : [image.uri]);
    }
  }
});

test('private images: malformed native image data cannot write storage or invalidate signed URLs', async () => {
  const f = nativeUploader([]);
  for (const base64 of ['A===', '!foo', 'AQI=extra', 'data:image/jpeg;base64,']) {
    const image = { uri: 'file:///preview.jpg', base64, mimeType: 'image/jpeg' };
    await assert.rejects(f.upload('avatars', S, image), /Kunde inte läsa bilddata/);
    await assert.rejects(f.uploadPost({ stableId: S, userId: A, postId: B, image }), /Kunde inte läsa bilddata/);
  }
  assert.equal(f.requests.length, 0); assert.equal(f.imageRequests.length, 0);
  assert.equal(f.invalidations.length, 0);
});
