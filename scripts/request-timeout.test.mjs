import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadModule() {
  const source = await readFile(new URL('../lib/requestTimeout.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
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
