import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const require = createRequire(`${root}/package.json`);
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');
const source = await readFile(`${root}/context/AppDataContext.tsx`, 'utf8');
const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
const caller = '00000000-0000-4000-8000-000000000001';
const recordId = '00000000-0000-4000-8000-000000000100';
const stable = '00000000-0000-4000-8000-000000000010';
const cases = [
  ['persistPostInsert', [{ id: recordId, stableId: stable, authorId: caller, content: 'Draft' }], 'posts'],
  ['persistPostCommentInsert', [{ id: recordId, postId: recordId, authorId: caller, text: 'Draft' }], 'comments'],
  ['persistPostLikeToggle', [recordId, caller, true], 'likes'],
  ['persistConversationMessage', [{ id: recordId, conversationId: recordId, authorId: caller, text: 'Draft' }], 'messages'],
  ['persistAlertInsert', [{ id: recordId, stableId: stable, message: 'Draft', type: 'info' }], 'alerts'],
  ['persistStableAlertUpsert', [{ id: recordId, stableId: stable, title: 'Draft', createdByUserId: caller, severity: 'info' }], 'stable_alerts'],
];

async function load(name, suppliedError) {
  const requests = [], logs = [];
  const supabase = createClient('https://synthetic-stableflow.invalid', 'synthetic-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, options) => {
      requests.push({ url: String(input), method: options?.method });
      return new globalThis.Response(JSON.stringify(suppliedError), { status: 429, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const declaration = provider.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === name);
  assert.ok(declaration, name);
  const dependencies = {
    supabase, isQaDemoMode: false, user: { id: caller },
    AbortController: globalThis.AbortController, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    console: { warn: (...args) => logs.push(args) },
    postUploadCacheRef: { current: new Map() },
  };
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${declaration.initializer.arguments[0].getText(ast)});`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const operation = (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
  return { operation, requests, logs };
}

for (const [name, args, table] of cases) {
  test(`${name}: actual SDK PT429 has explicit wait copy and redacted feature log`, async () => {
    const fixture = await load(name, { code: 'PT429', message: 'social_rate_limited', details: 'synthetic-secret-must-not-be-logged' });
    const inputBefore = JSON.stringify(args);
    const result = await fixture.operation(...args);
    assert.equal(result.success, false);
    assert.match(result.reason, /Vänta en stund/);
    assert.equal(JSON.stringify(args), inputBefore);
    assert.equal(fixture.requests.length, 1);
    assert.ok(fixture.requests[0].url.includes(`/rest/v1/${table}`));
    assert.equal(fixture.requests[0].method, 'POST');
    assert.equal(fixture.logs.length, 1);
    assert.match(fixture.logs[0][0], /^\[[a-z ]+\]/);
    assert.equal(fixture.logs[0][1], 'Unknown');
    assert.ok(!JSON.stringify({ result, logs: fixture.logs }).includes('synthetic-secret'));
  });
  test(`${name}: an unrelated PT429 preserves the existing failure`, async () => {
    const fixture = await load(name, { code: 'PT429', message: 'different-marker', details: 'synthetic-secret-must-not-be-logged' });
    const result = await fixture.operation(...args);
    assert.equal(result.success, false);
    assert.doesNotMatch(result.reason, /Vänta en stund/);
    assert.ok(!JSON.stringify({ result, logs: fixture.logs }).includes('synthetic-secret'));
  });
}
