import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
const userId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000100';
const stableId = '00000000-0000-4000-8000-000000000010';
const cases = [
  ['persistPostInsert', [{ id, stableId, authorId: userId, content: 'Draft' }], 'posts'],
  ['persistPostCommentInsert', [{ id, postId: id, authorId: userId, text: 'Draft' }], 'comments'],
  ['persistPostLikeToggle', [id, userId, true], 'likes'],
  ['persistConversationMessage', [{ id, conversationId: id, authorId: userId, text: 'Draft' }], 'messages'],
  ['persistAlertInsert', [{ id, stableId, message: 'Draft', type: 'info' }], 'alerts'],
  ['persistStableAlertUpsert', [{ id, stableId, title: 'Draft', createdByUserId: userId, severity: 'info' }], 'stable_alerts'],
];

for (const [name, args, table] of cases) {
  test(`${name} keeps server details out of feature logs`, async () => {
    const requests = [];
    const logs = [];
    const supabase = createClient('https://stableflow-fixture.invalid', 'synthetic-public-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, options) => {
        requests.push({ url: String(input), method: options?.method });
        return new globalThis.Response(JSON.stringify({
          code: '42501', message: 'synthetic-private-server-message',
          details: 'synthetic-private-row-details', hint: 'synthetic-private-server-hint',
        }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      } },
    });
    const declaration = provider.body.statements.filter(ts.isVariableStatement)
      .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === name);
    assert.ok(declaration, name);
    const dependencies = {
      supabase, isQaDemoMode: false, user: { id: userId },
      AbortController: globalThis.AbortController,
      setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
      console: { warn: (...values) => logs.push(values) },
      postUploadCacheRef: { current: new Map() },
    };
    const { outputText } = ts.transpileModule(
      `export default ({ ${Object.keys(dependencies).join(', ')} }) => (${declaration.initializer.arguments[0].getText(ast)});`,
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    );
    const persist = (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
    const inputBefore = JSON.stringify(args);
    const result = await persist(...args);

    assert.equal(result.success, false);
    assert.equal(JSON.stringify(args), inputBefore);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'POST');
    assert.ok(requests[0].url.includes(`/rest/v1/${table}`));
    assert.equal(logs.length, 1);
    assert.match(logs[0][0], /^\[[a-z ]+\]/);
    assert.equal(logs[0][1], 'Unknown');
    assert.ok(!JSON.stringify({ result, logs }).includes('synthetic-private'));
  });
}
