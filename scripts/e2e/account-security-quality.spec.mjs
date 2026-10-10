import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', trace: 'off' });
const userId = '00000000-0000-4000-8000-000000000221';
const stableId = '00000000-0000-4000-8000-000000000222';
const visibleText = (page, text) => page.getByText(text, { exact: true }).filter({ visible: true });
const fields = {
  password: { button: 'Byt lösenord', error: 'Kunde inte byta lösenord. Logga in igen och försök på nytt.',
    success: 'Lösenordet är uppdaterat.', value: 'OfflineNewPassword1234!' },
  email: { button: 'Byt e-post', error: 'Kunde inte byta e-post. Försök igen.',
    success: 'Bekräftelselänk skickad till den nya adressen.', value: 'offline-new@example.test' },
};

async function boot(page, { rejectUpdate = false } = {}) {
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'offline-security@example.test',
    app_metadata: {}, user_metadata: { full_name: 'Offline Konto' }, created_at: '2026-01-01T00:00:00Z' };
  const profile = { id: userId, full_name: 'Offline Konto', onboarding_dismissed: true };
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: userId, exp: 4102444800 }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')
    + '.' + Buffer.from('offline-signature').toString('base64url');
  const tables = {
    profiles: [profile],
    stable_members: [{ stable_id: stableId, user_id: userId, role: 'staff', access: 'edit', horse_ids: [] }],
    stables: [{ id: stableId, name: 'Offline Kontostall', created_by: userId, settings: { onboarding: { resourcesComplete: true } } }],
    conversations: [{ id: '00000000-0000-4000-8000-000000000223', stable_id: stableId, title: 'Offline Kontostall', is_group: true }],
  };
  const controls = { updates: [], unexpected: [], pageErrors: [], warnings: [], rejectUpdate };
  page.on('pageerror', error => controls.pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'warning' && /\[account (password|email)\]/.test(message.text())) controls.warnings.push(message.text());
  });
  await page.addInitScript(() => {
    const getItem = globalThis.Storage.prototype.getItem;
    globalThis.Storage.prototype.getItem = function (key) {
      if (globalThis.__failNextAccountSessionRead && /^sb-.*-auth-token$/.test(key)) {
        globalThis.__failNextAccountSessionRead = false;
        throw new Error('PRIVATE account storage detail offline-security@example.test Bearer offline-secret');
      }
      return getItem.call(this, key);
    };
  });
  // Install isolation before navigation. The real SDK uses only synthetic Auth
  // and database responses; all other backend HTTP and WebSockets are blocked.
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PUT,OPTIONS' };
    const respond = (json, status = 200) => route.fulfill({ json, status, headers });
    if (!/\/(auth|rest|functions|storage|realtime)\/v1(?:\/|$)/.test(url.pathname)) {
      if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return route.continue();
      controls.unexpected.push({ method: request.method(), path: url.pathname });
      return route.abort('blockedbyclient');
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname === '/auth/v1/token' && request.method() === 'POST') {
      return respond({ access_token: token, refresh_token: 'offline-security-refresh', token_type: 'bearer',
        expires_in: 3600, expires_at: 4102444800, user });
    }
    if (url.pathname === '/auth/v1/user' && request.method() === 'GET') return respond(user);
    if (url.pathname === '/auth/v1/user' && request.method() === 'PUT') {
      controls.updates.push(request.postDataJSON());
      if (controls.rejectUpdate) return respond({ code: 'offline_update_failed', message: 'PRIVATE provider account detail' }, 400);
      return respond(user);
    }
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
    if (request.method() === 'POST' && rpc === 'accept_pending_invites') return respond([]);
    if (request.method() === 'POST' && rpc === 'get_member_directory') return respond([profile]);
    if (request.method() === 'POST' && rpc === 'own_account_deletion_status') {
      expect(request.postDataJSON()).toEqual({});
      return respond({ user_id: userId, status: 'not_started', auth_present: true, profile_present: true,
        requires_owner: true, affected_stable_count: 1, replacement_owners: [], replacement_user_id: null, prepared_at: null });
    }
    if (request.method() === 'POST' && rpc === 'own_account_media_status') {
      expect(request.postDataJSON()).toEqual({ p_project_url: url.origin });
      // Explicit complete-empty own-file fixture, retaining this test's owner scope.
      return respond({ user_id: userId, complete: true, blocked_count: 0, requires_owner: true,
        affected_stable_count: 1, replacement_owners: [],
        own: { plan_id: null, plan_generation: null, reselect_allowed: false, reselect_blocked_reason: null,
          replacement_user_id: null, state: 'not_started', delete_count: 0, transfer_count: 0,
          copied_count: 0, removed_count: 0, next_copy_item_id: null, next_remove_item_id: null }, incoming: [] });
    }
    if (request.method() === 'POST' && ['own_chat_read_state', 'mark_chat_messages_read'].includes(rpc)) {
      const body = request.postDataJSON();
      expect(body.expected_user_id).toBe(userId);
      expect(tables.conversations.some(row => row.id === body.target_conversation_id)).toBe(true);
      expect(body.message_ids).toEqual([]);
      const receipt = { user_id: userId, conversation_id: body.target_conversation_id, complete: true,
        requested_message_ids: [], read_message_ids: [], known_read_message_ids: [], unread_message_ids: [] };
      return respond(receipt);
    }
    const table = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
    if (request.method() === 'GET' && table) {
      const rows = tables[table] ?? [];
      return respond(request.headers().accept?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows);
    }
    controls.unexpected.push({ method: request.method(), path: url.pathname });
    return route.abort('blockedbyclient');
  });
  await page.routeWebSocket(/.*/, socket => socket.close());
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill(user.email);
  await page.getByPlaceholder('Minst 8 tecken').fill('OfflineFixture1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect(visibleText(page, 'Dina uppgifter först')).toBeVisible();
  await page.goto('/settings');
  await page.getByText('Konto', { exact: true }).click();
  await expect(visibleText(page, user.email)).toBeVisible();
  return controls;
}

async function fillSecurity(page, kind) {
  if (kind === 'password') {
    const password = page.getByPlaceholder('Minst 8 tecken', { exact: true }).filter({ visible: true });
    const confirmation = page.getByPlaceholder('Upprepa lösenord', { exact: true });
    await password.fill(fields.password.value);
    await confirmation.fill(fields.password.value);
    return [password, confirmation];
  }
  const email = page.getByPlaceholder('ny@exempel.se', { exact: true });
  await email.fill(fields.email.value);
  return [email];
}

function expectIsolated(controls) {
  expect(controls.unexpected).toEqual([]);
  expect(controls.pageErrors).toEqual([]);
  for (const warning of controls.warnings) expect(warning).not.toMatch(/PRIVATE|offline-secret|offline-security@/);
}

for (const width of [390, 1280]) {
  for (const kind of ['password', 'email']) {
    test(`${kind} change recovers after the actual SDK session-storage exception at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      const controls = await boot(page);
      const inputs = await fillSecurity(page, kind);
      const action = page.getByRole('button', { name: fields[kind].button, exact: true });
      await page.evaluate(() => { globalThis.__failNextAccountSessionRead = true; });
      await action.click();
      await expect(visibleText(page, fields[kind].error)).toBeVisible();
      await expect(visibleText(page, fields[kind].error)).toBeInViewport({ ratio: 1 });
      await expect(action).toBeEnabled();
      for (const input of inputs) await expect(input).toHaveValue(fields[kind].value);
      expect(controls.updates).toEqual([]);
      await expect(page.locator('body')).not.toContainText('PRIVATE account storage detail');
      await expect(visibleText(page, fields[kind].success)).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath('account-storage-failure-retained.png') });

      await action.click();
      await expect(visibleText(page, fields[kind].success)).toBeVisible();
      for (const input of inputs) await expect(input).toHaveValue('');
      expect(controls.updates).toHaveLength(1);
      expect(controls.updates[0][kind]).toBe(fields[kind].value);
      expectIsolated(controls);
    });
  }
}

for (const kind of ['password', 'email']) {
  test(`${kind} change preserves its draft after provider rejection and allows retry`, async ({ page }) => {
    const controls = await boot(page, { rejectUpdate: true });
    const inputs = await fillSecurity(page, kind);
    const action = page.getByRole('button', { name: fields[kind].button, exact: true });
    await action.click();
    await expect(visibleText(page, fields[kind].error)).toBeVisible();
    await expect(visibleText(page, fields[kind].error)).toBeInViewport({ ratio: 1 });
    await expect(action).toBeEnabled();
    for (const input of inputs) await expect(input).toHaveValue(fields[kind].value);
    await expect(visibleText(page, fields[kind].success)).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('PRIVATE provider account detail');
    controls.rejectUpdate = false;
    await action.click();
    await expect(visibleText(page, fields[kind].success)).toBeVisible();
    for (const input of inputs) await expect(input).toHaveValue('');
    expect(controls.updates).toHaveLength(2);
    expectIsolated(controls);
  });
}
