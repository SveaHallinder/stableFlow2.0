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
const functions = ast.statements.filter(node => !ts.isImportDeclaration(node))
  .map(node => node.getText(ast)).join('\n').replace(/\bexport /g, '');
const { CodedError } = await compile(await readFile(new URL('../node_modules/expo-modules-core/src/errors/CodedError.ts', import.meta.url), 'utf8'));
const token = 'synthetic-private-ExpoPushToken';
const userId = '00000000-0000-4000-8000-000000000001';

async function load({ tokenError, registrationError, networkError,
  projectId = 'synthetic-project', fallbackProjectId } = {}) {
  const requests = [], logs = [], tokenRequests = [];
  const supabase = createClient('https://stableflow-notification-fixture.invalid', 'synthetic-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, options) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/v1/user') {
        return new globalThis.Response(JSON.stringify({ id: userId, aud: 'authenticated', role: 'authenticated' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      requests.push({ url: String(input), method: options?.method, body: JSON.parse(options.body) });
      if (networkError) throw networkError;
      const acknowledgement = url.pathname.endsWith('/push_device_state')
        ? { binding_generation: '00000000-0000-4000-8000-000000000002' }
        : { user_id: userId, token_id: '00000000-0000-4000-8000-000000000003',
          registration_generation: '00000000-0000-4000-8000-000000000004',
          binding_generation: '00000000-0000-4000-8000-000000000005' };
      return new globalThis.Response(JSON.stringify(registrationError ?? acknowledgement), {
        status: registrationError ? 403 : 200, headers: { 'Content-Type': 'application/json' },
      });
    } },
  });
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = [encode({ alg: 'HS256', typ: 'JWT' }),
    encode({ sub: userId, aud: 'authenticated', role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600 }), Buffer.from('synthetic-signature').toString('base64url')].join('.');
  const session = await supabase.auth.setSession({ access_token: accessToken, refresh_token: 'synthetic-refresh' });
  assert.equal(session.error, null);
  const dependencies = {
    Platform: { OS: 'ios' }, Device: { isDevice: true },
    Constants: { expoConfig: { extra: { eas: { projectId } } },
      easConfig: { projectId: fallbackProjectId } },
    Notifications: { setNotificationHandler() {}, getExpoPushTokenAsync: async options => {
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
  assert.deepEqual(fixture.logs, [['[push registration] Kunde inte registrera enheten', 'registration_failed']]);
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.requests[0].method, 'POST');
  assert.ok(fixture.requests[0].url.includes('/rest/v1/rpc/push_device_state'));
  assert.equal(fixture.requests[0].body.p_token, token);
  assert.doesNotMatch(JSON.stringify(fixture.logs), /synthetic-private/);
});

test('actual SDK network failure keeps provider message and stack out of registration logs', async () => {
  const error = new Error(`synthetic-private-network-token ${token}`);
  error.name = 'synthetic-private-network-provider';
  const fixture = await load({ networkError: error });
  assert.equal(await fixture.registerPushToken(userId), false);
  assert.deepEqual(fixture.logs, [['[push registration] Kunde inte registrera enheten', 'registration_failed']]);
  assert.equal(fixture.requests.length, 1);
});

test('successful token lookup and ownership claim preserve token, current UID and return values', async () => {
  const fixture = await load();
  assert.equal(await fixture.getExpoPushToken(), token);
  assert.equal(await fixture.registerPushToken(userId), true);
  assert.deepEqual(fixture.logs, []);
  assert.equal(fixture.requests.length, 2);
  const [state, claim] = fixture.requests;
  assert.equal(state.body.p_token, token);
  assert.equal(state.body.p_expected_user_id, userId);
  assert.equal(claim.body.p_token, token);
  assert.equal(claim.body.p_expected_user_id, userId);
  assert.equal(claim.body.p_platform, 'ios');
  assert.equal(claim.body.p_expected_binding_generation, '00000000-0000-4000-8000-000000000002');
});

test('push project config: placeholder uses the runtime fallback before the ownership claim', async () => {
  const fixture = await load({ projectId: 'YOUR_EAS_PROJECT_ID', fallbackProjectId: 'synthetic-fallback-project' });
  assert.equal(await fixture.registerPushToken(userId), true);
  assert.deepEqual(fixture.tokenRequests, [{ projectId: 'synthetic-fallback-project' }]);
  assert.deepEqual(fixture.logs, []);
  assert.equal(fixture.requests.length, 2);
  assert.equal(fixture.requests[0].body.p_expected_user_id, userId);
  assert.equal(fixture.requests[1].body.p_expected_user_id, userId);
});

test('push project config: placeholder without a usable fallback fails before Expo or ownership RPCs', async () => {
  const fixture = await load({ projectId: 'YOUR_EAS_PROJECT_ID' });
  assert.equal(await fixture.registerPushToken(userId), false);
  assert.deepEqual(fixture.tokenRequests, []);
  assert.deepEqual(fixture.requests, []);
  assert.deepEqual(fixture.logs, [['[push notification] Kunde inte hämta push-token', 'Error']]);
  assert.doesNotMatch(JSON.stringify(fixture.logs), /YOUR_EAS_PROJECT_ID|synthetic-private/);
});

test('push project config: a configured value still takes precedence over the runtime fallback', async () => {
  const fixture = await load({ fallbackProjectId: 'synthetic-fallback-project' });
  assert.equal(await fixture.getExpoPushToken(), token);
  assert.deepEqual(fixture.tokenRequests, [{ projectId: 'synthetic-project' }]);
  assert.deepEqual(fixture.requests, []);
  assert.deepEqual(fixture.logs, []);
});
