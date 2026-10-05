import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

// All environment values, database reads and provider calls are synthetic.
// Executing these tests never sends mail or connects to Supabase.
async function loadHandler(overrides = {}) {
  const source = await readFile(new URL('../supabase/functions/send-invite/index.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('send-invite.ts', source, ts.ScriptTarget.Latest, true);
  const body = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n');
  const environment = {
    SUPABASE_URL: 'https://synthetic.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key',
    RESEND_API_KEY: 'synthetic-provider-key', APP_URL: 'https://pilot.example.test',
    ...overrides.environment,
  };
  const calls = [];
  const logs = [];
  const capture = {};
  const dependencies = {
    Deno: { env: { get: name => environment[name] }, serve: handler => { capture.handler = handler; } },
    createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { name: 'QA Stable' }, error: null }) }) }) }) }),
    fetch: async (...args) => { calls.push(args); return new globalThis.Response(JSON.stringify({ id: 'synthetic-email-id' }), { status: 200 }); },
    console: { warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    ...overrides.dependencies,
  };
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => { ${body} };`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
  return { handler: capture.handler, calls, logs };
}

function request(record = {}) {
  return new globalThis.Request('https://synthetic.example.test/functions/v1/send-invite', {
    method: 'POST', headers: { Authorization: 'Bearer synthetic-service-key', 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'invite', record: {
      id: 'invite-id', stable_id: 'stable-id', email: 'recipient@example.test', code: 'INVITE1',
      role: 'staff', expires_at: '2099-06-15T12:00:00Z', ...record,
    } }),
  });
}

test('missing provider configuration reports skipped, without delivery claim', async () => {
  const { handler, calls } = await loadHandler({ environment: { RESEND_API_KEY: undefined } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { skipped: 'resend_not_configured' });
  assert.equal(calls.length, 0);
});

test('missing APP_URL cannot send an invitation linking to an assumed deployment', async () => {
  const { handler, calls } = await loadHandler({ environment: { APP_URL: undefined } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { skipped: 'app_url_not_configured' });
  assert.equal(calls.length, 0);
});

test('invalid APP_URL cannot send an unusable invitation', async () => {
  const { handler, calls } = await loadHandler({ environment: { APP_URL: 'not-a-url' } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { skipped: 'app_url_not_configured' });
  assert.equal(calls.length, 0);
});

test('expired invitations are never handed to the email provider', async () => {
  const { handler, calls } = await loadHandler();
  const response = await handler(request({ expires_at: '2020-01-01T00:00:00Z' }));
  assert.deepEqual(await response.json(), { skipped: 'invite_expired' });
  assert.equal(calls.length, 0);
});

test('email body describes the actual expiry and the available signup path', async () => {
  const { handler, calls } = await loadHandler();
  const response = await handler(request());
  assert.deepEqual(await response.json(), { sent: true });
  const body = JSON.parse(calls[0][1].body);
  assert.match(body.html, /2099/);
  assert.match(body.html, /Har inbjudan/);
  assert.doesNotMatch(body.html, /14 dagar/);
  assert.equal(body.to, 'recipient@example.test');
});

test('provider network errors return a structured failure with feature logging', async () => {
  const { handler, logs } = await loadHandler({ dependencies: { fetch: async () => { throw new Error('Synthetic network failure'); } } });
  const response = await handler(request());
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'send_failed');
  assert.match(logs.at(-1)?.[0], /^\[invite email\]/);
});

test('unauthorized callers never reach the provider', async () => {
  const { handler, calls } = await loadHandler();
  const response = await handler(new globalThis.Request('https://synthetic.example.test', { method: 'POST' }));
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});
