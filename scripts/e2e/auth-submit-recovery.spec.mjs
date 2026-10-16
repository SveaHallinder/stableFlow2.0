import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { expect, test } from '@playwright/test';

test.use({ trace: 'off', serviceWorkers: 'block' });

for (const width of [390, 1280]) {
  test(`login keeps its draft and retries after an actual SDK storage rejection at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const id = '00000000-0000-4000-8000-000000000081';
    const stableId = '00000000-0000-4000-8000-000000000082';
    const email = 'offline-login@example.test';
    const password = 'OfflineFixture1234!';
    const user = { id, aud: 'authenticated', role: 'authenticated', email,
      app_metadata: {}, user_metadata: { full_name: 'Offline Login' },
      created_at: '2026-01-01T00:00:00.000Z' };
    const profile = { id, full_name: 'Offline Login', onboarding_dismissed: true };
    const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: id, exp: 4102444800 }]
      .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.offline-signature';
    const tables = {
      profiles: [profile],
      stable_members: [{ stable_id: stableId, user_id: id, role: 'guest', access: 'view', horse_ids: [] }],
      stables: [{ id: stableId, name: 'Offline Login Stall', settings: {} }],
      conversations: [{ id: '00000000-0000-4000-8000-000000000083', stable_id: stableId,
        title: 'Offline Login Stall', is_group: true }],
    };
    const blockedWrites = [];
    const warnings = [];
    const pageErrors = [];
    let logins = 0;
    let storageKey;
    page.on('console', message => {
      if (message.type() === 'warning' && message.text().includes('[auth submit]')) warnings.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => {
      const setItem = globalThis.Storage.prototype.setItem;
      globalThis.Storage.prototype.setItem = function (key, value) {
        if (globalThis.__failAuthWrite && /^sb-.*-auth-token$/.test(key)) {
          globalThis.__failAuthWrite = false;
          throw new Error('Offline session storage rejection');
        }
        return setItem.call(this, key, value);
      };
    });
    // Mock the installed Auth SDK's transport, not the screen callback. All
    // backend traffic and WebSockets are intercepted before navigation.
    await page.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!/\/(auth|rest|functions|storage|realtime)\/v1(?:\/|$)/.test(url.pathname)) {
        return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
          ? route.continue() : route.abort('blockedbyclient');
      }
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS' };
      const respond = json => route.fulfill({ json, headers });
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (url.pathname === '/auth/v1/token' && request.method() === 'POST') {
        expect(request.postDataJSON()).toEqual({ email, password, gotrue_meta_security: {} });
        logins += 1;
        storageKey = `sb-${url.hostname.split('.')[0]}-auth-token`;
        return respond({ access_token: token, refresh_token: 'offline-login-refresh',
          token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user });
      }
      if (url.pathname === '/auth/v1/user' && request.method() === 'GET') return respond(user);
      const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
      if (request.method() === 'POST' && rpc === 'accept_pending_invites') return respond([]);
      if (request.method() === 'POST' && rpc === 'get_member_directory') return respond([profile]);
      if (request.method() === 'POST' && ['own_chat_read_state', 'mark_chat_messages_read'].includes(rpc)) {
        const body = request.postDataJSON();
        expect(body.expected_user_id).toBe(id);
        expect(tables.conversations.some(row => row.id === body.target_conversation_id)).toBe(true);
        expect(body.message_ids).toEqual([]);
        const receipt = { user_id: id, conversation_id: body.target_conversation_id, complete: true,
          requested_message_ids: [], read_message_ids: [], known_read_message_ids: [], unread_message_ids: [] };
        return respond(receipt);
      }
      const table = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
      if (request.method() === 'GET' && table) {
        const rows = tables[table] ?? [];
        return respond(request.headers().accept?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows);
      }
      if (!['GET', 'HEAD'].includes(request.method())) blockedWrites.push({ path: url.pathname, method: request.method() });
      return route.abort('blockedbyclient');
    });
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/');
    await page.getByPlaceholder('namn@exempel.se').fill(email);
    await page.getByPlaceholder('Minst 8 tecken').fill(password);
    await page.evaluate(() => { globalThis.__failAuthWrite = true; });
    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    await expect(page.getByText('Kunde inte slutföra inloggning eller kontoskapande. Dina uppgifter finns kvar. Försök igen.', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('namn@exempel.se')).toHaveValue(email);
    await expect(page.getByPlaceholder('Minst 8 tecken')).toHaveValue(password);
    await expect(page.getByRole('button', { name: 'Logga in', exact: true }).last()).toBeEnabled();
    await expect(page.getByText('Jobbar...', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Välkommen!', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(key => globalThis.localStorage.getItem(key), storageKey)).toBeNull();
    expect(logins).toBe(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).not.toContain(email);
    expect(warnings[0]).not.toContain(password);
    expect(warnings[0]).not.toContain(token);

    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    await expect(page.getByText('Offline Login Stall', { exact: true }).first()).toBeVisible();
    expect(await page.evaluate(key => JSON.parse(globalThis.localStorage.getItem(key))?.user?.id, storageKey)).toBe(id);
    expect(logins).toBe(2);
    expect(blockedWrites).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
