import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

async function loadModule() {
  const source = await readFile(new URL('../lib/requestTimeout.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

async function loadNativeModule() {
  const source = await readFile(new URL('../lib/requestTimeout.ts', import.meta.url), 'utf8');
  const polyfill = await readFile(new URL('../node_modules/whatwg-fetch/dist/fetch.umd.js', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  // React Native's global Response differs from Node's UTF-8-safe Response.
  const context = vm.createContext({ ArrayBuffer, Uint8Array, DataView, AbortController, URLSearchParams, setTimeout, clearTimeout, exports: {} });
  vm.runInContext(polyfill, context);
  vm.runInContext(outputText, context);
  return { ...context.exports, Headers: context.Headers };
}
const abortableFetch = (_input, init) => new Promise((_resolve, reject) => {
  if (init.signal.aborted) reject(new Error('aborted'));
  else init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
});

test('a stalled server request is aborted instead of keeping a write pending forever', async () => {
  const { createTimeoutFetch } = await loadModule();
  await assert.rejects(createTimeoutFetch(abortableFetch, 10)('https://example.test'), /aborted/);
});

test('caller cancellation is preserved, including a request already aborted', async () => {
  const { createTimeoutFetch } = await loadModule();
  const controller = new AbortController();
  const request = createTimeoutFetch(abortableFetch, 1000)('https://example.test', { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, /aborted/);
  await assert.rejects(createTimeoutFetch(abortableFetch, 1000)('https://example.test', { signal: controller.signal }), /aborted/);
});

test('successful requests preserve response and request options', async () => {
  const { createTimeoutFetch } = await loadModule();
  const response = new Response('saved');
  const fetcher = async (input, init) => {
    assert.equal(input, 'https://example.test');
    assert.equal(init.method, 'POST');
    assert.equal(init.body, 'test data');
    assert.equal(init.headers['Content-Type'], 'text/plain');
    return response;
  };
  const result = await createTimeoutFetch(fetcher, 1000)('https://example.test', { method: 'POST', body: 'test data', headers: { 'Content-Type': 'text/plain' } });
  assert.equal(await result.text(), 'saved');
  assert.equal(result.status, response.status);
  assert.equal(result.headers.get('Content-Type'), response.headers.get('Content-Type'));
});

test('response headers do not end the deadline while the response body is stalled', async () => {
  const { createTimeoutFetch } = await loadModule();
  const fetcher = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([123])); } }));
  await assert.rejects(createTimeoutFetch(fetcher, 10)('https://example.test'), /aborted/);
});

for (const contentType of ['application/json; charset=utf-8', 'application/vnd.pgrst.object+json; charset=utf-8', 'text/plain; charset=utf-8']) {
  test(`native responses preserve Swedish text and valid Unicode (${contentType})`, async () => {
    const { createTimeoutFetch, Headers } = await loadNativeModule();
    const expected = { location: 'Åkersberga', label: 'Kvällsfodring', text: 'ÅÄÖ åäö – € 🐴 日本語', unchanged: 'Ã är ett tecken', combining: 'A\u030a' };
    const text = JSON.stringify(expected);
    const response = { status: 200, statusText: 'OK', url: 'https://example.test/stables', headers: new Headers({ 'Content-Type': contentType }),
      text: async () => text, arrayBuffer: async () => new TextEncoder().encode(text).buffer };
    const result = await createTimeoutFetch(async () => response, 1000)(response.url);
    assert.equal(JSON.stringify(await result.json()), JSON.stringify(expected));
    assert.equal(result.url, response.url);
    assert.equal(result.headers.get('Content-Type'), contentType);
  });
}

test('native binary responses preserve bytes and HTTP errors', async () => {
  const { createTimeoutFetch, Headers } = await loadNativeModule();
  const bytes = new Uint8Array([0, 255, 195, 164, 128]);
  const response = { status: 403, statusText: 'Forbidden', url: 'https://example.test/image', headers: new Headers({ 'Content-Type': 'application/octet-stream' }),
    text: async () => { throw new Error('Binary bytes must not be decoded as text.'); }, arrayBuffer: async () => bytes.buffer };
  const result = await createTimeoutFetch(async () => response, 1000)(response.url);
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), bytes);
  assert.equal(result.status, 403);
  assert.equal(result.statusText, 'Forbidden');
});

test('native JSON body stalls remain bounded by the request deadline', async () => {
  const { createTimeoutFetch, Headers } = await loadNativeModule();
  const stalled = () => new Promise(() => {});
  const response = { status: 200, statusText: 'OK', url: 'https://example.test', headers: new Headers({ 'Content-Type': 'application/json' }),
    text: stalled, arrayBuffer: stalled };
  await assert.rejects(createTimeoutFetch(async () => response, 10)(response.url), /aborted/);
});
