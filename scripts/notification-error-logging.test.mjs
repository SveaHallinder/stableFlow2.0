import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

const compile = async source => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`);
const source = await readFile(new URL('../lib/notifications.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('notifications.ts', source, ts.ScriptTarget.Latest, true);
const functions = ['getExpoPushToken', 'registerPushToken'].map(name => {
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, name);
  return declaration.getText(ast).replace(/^export /, '');
}).join('\n');
const { CodedError } = await compile(await readFile(new URL('../node_modules/expo-modules-core/src/errors/CodedError.ts', import.meta.url), 'utf8'));
const token = 'synthetic-private-ExpoPushToken';
const userId = '00000000-0000-4000-8000-000000000001';

async function load({ tokenError, registrationError, networkError } = {}) {
  const requests = [], logs = [], tokenRequests = [];
  const supabase = createClient('https://stableflow-notification-fixture.invalid', 'synthetic-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, options) => {
      requests.push({ url: String(input), method: options?.method, body: JSON.parse(options.body) });
      if (networkError) throw networkError;
      return new globalThis.Response(registrationError ? JSON.stringify(registrationError) : null, {
        status: registrationError ? 403 : 201, headers: { 'Content-Type': 'application/json' },
      });
    } },
  });
  const dependencies = {
    Platform: { OS: 'ios' }, Device: { isDevice: true },
    Constants: { expoConfig: { extra: { eas: { projectId: 'synthetic-project' } } } },
    Notifications: { getExpoPushTokenAsync: async options => {
      tokenRequests.push(options);
      if (tokenError) throw tokenError;
      return { data: token };
    } },
    supabase, console: { warn: (...values) => logs.push(values) },
  };
  const factory = await compile(`export default ({ ${Object.keys(dependencies).join(', ')} }) => { ${functions}; return { getExpoPushToken, registerPushToken }; };`);
  return { ...factory.default(dependencies), requests, logs, tokenRequests };
}

test('Expo CodedError never logs its private message, code, info or custom name', async () => {
  const error = new CodedError('synthetic-private-provider-code', `Provider rejected ${token}`);
  error.info = { token };
  error.name = token;
  const fixture = await load({ tokenError: error });
  assert.equal(await fixture.getExpoPushToken(), null);
  assert.deepEqual(fixture.logs, [['[push notification] Kunde inte hämta push-token', 'Error']]);
  assert.deepEqual(fixture.tokenRequests, [{ projectId: 'synthetic-project' }]);
  assert.equal(fixture.requests.length, 0);
  assert.doesNotMatch(JSON.stringify(fixture.logs), /synthetic-private/);
});

test('non-Error token failure keeps registration false without persisting or logging raw details', async () => {
  const fixture = await load({ tokenError: { code: token, message: 'synthetic-private-provider-details' } });
  assert.equal(await fixture.registerPushToken(userId), false);
  assert.deepEqual(fixture.logs, [['[push notification] Kunde inte hämta push-token', 'Unknown']]);
  assert.equal(fixture.requests.length, 0);
});

test('actual Supabase SDK registration error is redacted and still returns false', async () => {
  const fixture = await load({ registrationError: {
    code: 'synthetic-private-provider-code', message: `Rejected ${token}`,
    details: 'synthetic-private-row-details', hint: 'synthetic-private-provider-hint',
  } });
  assert.equal(await fixture.registerPushToken(userId), false);
  assert.deepEqual(fixture.logs, [['[push registration] Kunde inte spara push-token', 'Unknown']]);
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.requests[0].method, 'POST');
  assert.ok(fixture.requests[0].url.includes('/rest/v1/push_tokens'));
  assert.equal(fixture.requests[0].body.token, token);
  assert.doesNotMatch(JSON.stringify(fixture.logs), /synthetic-private/);
});

test('actual SDK network failure keeps provider message and stack out of registration logs', async () => {
  const error = new Error(`synthetic-private-network-token ${token}`);
  error.name = 'synthetic-private-network-provider';
  const fixture = await load({ networkError: error });
  assert.equal(await fixture.registerPushToken(userId), false);
  assert.deepEqual(fixture.logs, [['[push registration] Kunde inte spara push-token', 'Unknown']]);
  assert.equal(fixture.requests.length, 1);
});

test('successful token lookup and registration preserve payload, conflict key and return values', async () => {
  const fixture = await load();
  assert.equal(await fixture.getExpoPushToken(), token);
  assert.equal(await fixture.registerPushToken(userId), true);
  assert.deepEqual(fixture.logs, []);
  assert.equal(fixture.requests.length, 1);
  const request = fixture.requests[0];
  assert.equal(new URL(request.url).searchParams.get('on_conflict'), 'user_id,token');
  assert.equal(request.body.user_id, userId);
  assert.equal(request.body.token, token);
  assert.equal(request.body.platform, 'ios');
  assert.ok(Number.isFinite(Date.parse(request.body.updated_at)));
});
