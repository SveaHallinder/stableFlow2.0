import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadModule() {
  const source = await readFile(new URL('../lib/writeTracker.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

test('overlapping legacy writes remain pending until both settle', async () => {
  const { trackPendingWrite } = await loadModule();
  const pending = new Set();
  let version = 0;
  let finishA, finishB;
  const a = new Promise(resolve => { finishA = resolve; });
  const b = new Promise(resolve => { finishB = resolve; });
  const trackedA = trackPendingWrite(a, pending, () => { version += 1; }, assert.fail);
  const trackedB = trackPendingWrite(b, pending, () => { version += 1; }, assert.fail);
  assert.equal(pending.size, 2);
  assert.equal(version, 2);
  finishA();
  await trackedA;
  assert.equal(pending.size, 1);
  finishB();
  await trackedB;
  assert.equal(pending.size, 0);
});

test('rejected writes release their token and report the error', async () => {
  const { trackPendingWrite } = await loadModule();
  const pending = new Set();
  const error = new Error('network unavailable');
  const failures = [];
  await trackPendingWrite(Promise.reject(error), pending, () => {}, cause => failures.push(cause));
  assert.equal(pending.size, 0);
  assert.deepEqual(failures, [error]);
});
