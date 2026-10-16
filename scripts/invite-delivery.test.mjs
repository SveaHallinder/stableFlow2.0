import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

const uuid = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const actorId = uuid(1);
const stableId = uuid(2);
const inviteId = uuid(3);
const savedInvite = { id: inviteId, stable_id: stableId, email: 'recipient@example.test',
  code: 'INVITE1', role: 'staff', accepted_at: null, expires_at: '2099-06-15T12:00:00Z' };

// Actual installed Supabase SDK, source-bound Edge handler, synthetic transport only.
// This fixture cannot send mail or make Supabase/Auth requests over the network.
async function loadHandler(overrides = {}) {
  const source = await readFile(new URL('../supabase/functions/send-invite/index.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('send-invite.ts', source, ts.ScriptTarget.Latest, true);
  const body = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n');
  const environment = { SUPABASE_URL: 'https://synthetic.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key',
    SUPABASE_ANON_KEY: 'synthetic-anon-key', RESEND_API_KEY: 'synthetic-provider-key',
    APP_URL: 'https://pilot.example.test', INVITE_FROM_EMAIL: 'StableFlow <sender@example.test>', ...overrides.environment };
  const calls = [], reads = [], logs = [], capture = {};
  const reply = (data, status = 200) => new globalThis.Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  const sdkFetch = async (input, init) => {
    const url = new URL(String(input));
    const authorization = new globalThis.Headers(init?.headers).get('authorization');
    reads.push({ path: url.pathname, search: url.search, authorization, body: init?.body ? JSON.parse(init.body) : undefined });
    if (url.pathname === '/auth/v1/user' && overrides.authGate) await overrides.authGate;
    if (url.pathname === '/auth/v1/user') return overrides.authError
      ? reply({ message: 'Invalid synthetic token', code: 'bad_jwt' }, 401)
      : reply({ id: actorId, aud: 'authenticated', role: 'authenticated', email: 'actor@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
    if (url.pathname === '/rest/v1/rpc/account_is_active') return reply(Object.hasOwn(overrides, 'active') ? overrides.active : true);
    if (url.pathname === '/rest/v1/rpc/is_stable_owner') return reply(Object.hasOwn(overrides, 'owner') ? overrides.owner : true);
    if (overrides.lookupError && url.pathname === `/rest/v1/${overrides.lookupError}`) return reply({ message: 'private-marker', code: '503' }, 503);
    if (url.pathname === '/rest/v1/stable_invites') return reply(overrides.invites ?? [{ ...savedInvite, ...overrides.invite }]);
    if (url.pathname === '/rest/v1/stables') return reply(overrides.stables ?? [{ id: stableId, name: 'QA Stable' }]);
    throw new Error(`Unexpected synthetic SDK path: ${url.pathname}`);
  };
  const dependencies = {
    Deno: { env: { get: name => environment[name] }, serve: handler => { capture.handler = handler; } },
    createClient: (url, key, options) => createClient(url, key, { ...options,
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { ...options?.global, fetch: sdkFetch } }),
    fetch: async (...args) => { calls.push(args); return overrides.provider ? overrides.provider(...args)
      : environment.BREVO_API_KEY ? reply({ messageId: '<synthetic-message-id@example.test>' }, 201) : reply({ id: 'synthetic-email-id' }); },
    console: { warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    ...(overrides.timeoutMs ? { setTimeout: callback => globalThis.setTimeout(callback, overrides.timeoutMs) } : {}),
  };
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => { ${body} };`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
  return { handler: capture.handler, calls, reads, logs };
}

function request(body = { invite_ids: [inviteId] }, authorization = 'Bearer synthetic-user-token') {
  return new globalThis.Request('https://synthetic.example.test/functions/v1/send-invite', {
    method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

test('an authenticated owner sends only the saved invite and receives an ID-bound acceptance', async () => {
  const fixture = await loadHandler();
  const response = await fixture.handler(request());
  assert.equal(response.status, 200);
  const ack = await response.json();
  assert.equal(ack.accepted, true);
  assert.equal(ack.actor_id, actorId);
  assert.deepEqual(ack.invite_ids, [inviteId]);
  assert.equal(JSON.parse(fixture.calls[0][1].body).to, savedInvite.email);
  assert.equal(fixture.calls[0][1].headers['Idempotency-Key'], `stable-invite/${inviteId}`);
  assert.ok(fixture.reads.some(read => read.path === '/auth/v1/user'));
  assert.ok(fixture.reads.some(read => read.path === '/rest/v1/rpc/account_is_active'));
  assert.ok(fixture.reads.some(read => read.path === '/rest/v1/rpc/is_stable_owner' && read.body.p_stable_id === stableId));
});

test('a browser preflight allows the SDK headers without sending mail', async () => {
  const fixture = await loadHandler();
  const response = await fixture.handler(new globalThis.Request('https://synthetic.example.test', { method: 'OPTIONS' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('access-control-allow-headers'), /authorization/);
  assert.match(response.headers.get('access-control-allow-methods'), /POST/);
  assert.equal(fixture.calls.length, 0);
});

test('unauthenticated and invalid JWT callers never reach the provider', async () => {
  for (const auth of ['', 'Bearer invalid-token']) {
    const fixture = await loadHandler({ authError: true });
    const response = await fixture.handler(request(undefined, auth));
    assert.equal(response.status, 401);
    assert.equal(fixture.calls.length, 0);
  }
});

test('non-owners, pending/deleted accounts and another stable invite cannot send', async () => {
  for (const overrides of [{ owner: false }, { active: false }, { active: null }, { invites: [] }]) {
    const fixture = await loadHandler(overrides);
    const response = await fixture.handler(request());
    assert.ok([403, 404].includes(response.status));
    assert.equal(fixture.calls.length, 0);
  }
});

test('client-supplied email, stable, expiry or record fields cannot steer delivery', async () => {
  for (const extra of [{ email: 'attacker@example.test' }, { stable_id: uuid(9) }, { expires_at: null }, { record: savedInvite }]) {
    const fixture = await loadHandler();
    assert.equal((await fixture.handler(request({ invite_ids: [inviteId], ...extra }))).status, 400);
    assert.equal(fixture.calls.length, 0);
  }
});

test('all supplied invite IDs must be unique valid UUIDs before delivery', async () => {
  for (const ids of [[], ['bad-id'], [inviteId, inviteId], [inviteId, null]]) {
    const fixture = await loadHandler();
    assert.equal((await fixture.handler(request({ invite_ids: ids }))).status, 400);
    assert.equal(fixture.calls.length, 0);
  }
});

test('accepted, expired and invalid-expiry saved invites cannot be mailed', async () => {
  for (const invite of [{ accepted_at: '2026-01-01T00:00:00Z' }, { expires_at: '2020-01-01T00:00:00Z' }, { expires_at: 'bad-date' }]) {
    const fixture = await loadHandler({ invite });
    const response = await fixture.handler(request());
    assert.equal(response.status, 409);
    assert.equal(fixture.calls.length, 0);
  }
});

test('a valid 14-day invite is not given an undocumented one-day sending deadline', async () => {
  const fixture = await loadHandler({ invite: { created_at: '2020-01-01T00:00:00Z' } });
  assert.equal((await fixture.handler(request())).status, 200);
  assert.equal(fixture.calls.length, 1);
});

test('missing provider/sender or invalid APP_URL gives unconfirmed mail, never an acceptance', async () => {
  for (const environment of [{ RESEND_API_KEY: undefined }, { INVITE_FROM_EMAIL: undefined }, { APP_URL: 'not-a-url' }, { APP_URL: 'http://insecure.example.test' }]) {
    const fixture = await loadHandler({ environment });
    const response = await fixture.handler(request());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).accepted, false);
    assert.equal(fixture.calls.length, 0);
  }
});

test('Brevo uses the verified sender, DB recipient and per-invite idempotency key', async () => {
  const fixture = await loadHandler({ environment: { BREVO_API_KEY: 'synthetic-brevo-key', RESEND_API_KEY: undefined } });
  const response = await fixture.handler(request());
  assert.equal((await response.json()).accepted, true);
  const [url, options] = fixture.calls[0];
  assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(options.headers['api-key'], 'synthetic-brevo-key');
  const body = JSON.parse(options.body);
  assert.deepEqual(body.sender, { name: 'StableFlow', email: 'sender@example.test' });
  assert.deepEqual(body.to, [{ email: savedInvite.email }]);
  assert.equal(body.headers.idempotencyKey, inviteId);
  assert.match(body.htmlContent, /Har inbjudan/);
});

test('email body describes the actual expiry and signup path', async () => {
  const fixture = await loadHandler();
  await fixture.handler(request());
  assert.equal(fixture.calls.length, 1);
  const body = JSON.parse(fixture.calls[0][1].body);
  assert.match(body.html, /2099/);
  assert.match(body.html, /Har inbjudan/);
  assert.doesNotMatch(body.html, /14 dagar/);
});

test('HTTP failures and malformed provider acknowledgements never claim acceptance or log private payloads', async () => {
  for (const provider of [
    async () => new globalThis.Response(JSON.stringify({ error: 'private-marker' }), { status: 429 }),
    async () => new globalThis.Response('{}', { status: 200 }),
    async () => new globalThis.Response('invalid-json', { status: 200 }),
    async () => { throw new Error('private-marker'); },
  ]) {
    const fixture = await loadHandler({ provider });
    const response = await fixture.handler(request());
    assert.equal((await response.json()).accepted, false);
    assert.match(fixture.logs.at(-1)?.[0], /^\[invite email\]/);
    assert.doesNotMatch(JSON.stringify(fixture.logs), /private-marker|recipient@example|synthetic-provider-key/);
  }
});

test('an unknown provider outcome is bounded with no automatic resend', async () => {
  const fixture = await loadHandler({ timeoutMs: 5, provider: () => new Promise(() => {}) });
  const response = await fixture.handler(request());
  assert.equal(response.status, 504);
  assert.equal(fixture.calls.length, 1);
});

test('lookup errors fail before provider dispatch', async () => {
  for (const lookupError of ['stable_invites', 'stables']) {
    const fixture = await loadHandler({ lookupError });
    assert.equal((await fixture.handler(request())).status, 500);
    assert.equal(fixture.calls.length, 0);
  }
});

test('legacy service-role requests re-read record.id instead of trusting its recipient', async () => {
  const fixture = await loadHandler();
  const response = await fixture.handler(request({ type: 'invite', record: { ...savedInvite, email: 'attacker@example.test' } }, 'Bearer synthetic-service-key'));
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(fixture.calls[0][1].body).to, savedInvite.email);
  assert.equal(fixture.reads.some(read => read.path === '/auth/v1/user'), false);
});


test('an empty APP_URL gives explicit private Expo Go instructions and the saved code, without a fake link', async () => {
  const fixture = await loadHandler({ environment: { APP_URL: undefined } });
  const response = await fixture.handler(request());
  assert.equal(response.status, 200);
  assert.equal(fixture.calls.length, 1);
  const body = JSON.parse(fixture.calls[0][1].body);
  assert.match(body.html, /Expo Go/);
  assert.match(body.html, /QR-kod/);
  assert.match(body.html, /INVITE1/);
  assert.match(body.html, /koden från nästa mejl/);
  assert.doesNotMatch(body.html, /href=|localhost|stableflow:\/\//);
  assert.equal((await response.json()).accepted, true);
});


test('Brevo accepts a bare verified sender address and does not fall back to an unconfigured domain', async () => {
  const fixture = await loadHandler({ environment: { BREVO_API_KEY: 'synthetic-brevo-key', INVITE_FROM_EMAIL: 'verified@example.test' } });
  assert.equal((await (await fixture.handler(request())).json()).accepted, true);
  assert.deepEqual(JSON.parse(fixture.calls[0][1].body).sender, { name: 'StableFlow', email: 'verified@example.test' });
});

test('Brevo errors or an empty messageId cannot be reported as provider acceptance', async () => {
  for (const provider of [
    async () => new globalThis.Response(JSON.stringify({ code: 'duplicate_parameter' }), { status: 400 }),
    async () => new globalThis.Response(JSON.stringify({ messageId: '' }), { status: 201 }),
  ]) {
    const fixture = await loadHandler({ environment: { BREVO_API_KEY: 'synthetic-brevo-key' }, provider });
    assert.equal((await (await fixture.handler(request())).json()).accepted, false);
    assert.equal(fixture.calls.length, 1, 'Never silently resend or switch providers after an unknown outcome.');
  }
});

test('repeated requests retain the same per-invite provider key and email body', async () => {
  for (const environment of [{}, { BREVO_API_KEY: 'synthetic-brevo-key' }]) {
    const fixture = await loadHandler({ environment });
    await fixture.handler(request());
    await fixture.handler(request());
    assert.equal(fixture.calls.length, 2);
    assert.deepEqual(fixture.calls[0][1].headers, fixture.calls[1][1].headers);
    assert.equal(fixture.calls[0][1].body, fixture.calls[1][1].body);
  }
});

test('a capped or mismatched saved-invite read cannot cause a partial dispatch', async () => {
  const fixture = await loadHandler();
  const response = await fixture.handler(request({ invite_ids: [inviteId, uuid(4)] }));
  assert.equal(response.status, 404);
  assert.equal(fixture.calls.length, 0);
});

test('a delayed Auth response cannot trigger mail after the request deadline', async () => {
  let release;
  const authGate = new Promise(resolve => { release = resolve; });
  const fixture = await loadHandler({ authGate, timeoutMs: 5 });
  const response = await fixture.handler(request());
  assert.equal(response.status, 504);
  assert.equal(fixture.calls.length, 0);
  release();
  await new Promise(resolve => globalThis.setImmediate(resolve));
  assert.equal(fixture.calls.length, 0);
});

test('unsupported methods return CORS-enabled errors without database or provider calls', async () => {
  const fixture = await loadHandler();
  const response = await fixture.handler(new globalThis.Request('https://synthetic.example.test', { method: 'GET' }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(fixture.reads.length, 0);
  assert.equal(fixture.calls.length, 0);
});
