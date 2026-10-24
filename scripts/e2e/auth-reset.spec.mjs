import { Buffer } from 'node:buffer';
import { URL, URLSearchParams } from 'node:url';
import { expect, test } from '@playwright/test';

test.use({ trace: 'off', serviceWorkers: 'block' });

const userId = '00000000-0000-4000-8000-000000000091';
const stableId = '00000000-0000-4000-8000-000000000092';
const password = 'OfflineResetPassword123!';
const updateError = 'Lösenordsändringen kunde inte bekräftas. Dina lösenord finns kvar. Försök igen.';

async function offlineRecovery(page, { incompleteOnboarding = false, membershipFailure = false, invalidLink = false } = {}) {
  const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'offline-reset@example.test',
    app_metadata: {}, user_metadata: { full_name: 'Offline Recovery' }, created_at: '2026-01-01T00:00:00.000Z' };
  const profile = { id: userId, full_name: 'Offline Recovery', onboarding_dismissed: !incompleteOnboarding };
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: userId, exp: expiresAt }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')
    + '.' + Buffer.from('offline-signature').toString('base64url');
  const tables = {
    profiles: [profile],
    stable_members: [{ stable_id: stableId, user_id: userId, role: incompleteOnboarding ? 'admin' : 'guest',
      access: incompleteOnboarding ? 'owner' : 'view', horse_ids: [] }],
    stables: [{ id: stableId, name: 'Offline Recovery Stall', created_by: userId,
      settings: { onboarding: { resourcesComplete: false } } }],
    conversations: [{ id: '00000000-0000-4000-8000-000000000093', stable_id: stableId,
      title: 'Offline Recovery Stall', is_group: true }],
  };
  const calls = { verify: 0, memberships: 0, passwordUpdates: [], blockedWrites: [], warnings: [], pageErrors: [] };
  const controls = { rejectNextUpdate: false };
  let storageKey;
  page.on('console', message => {
    if (message.type() === 'warning' && message.text().includes('[auth reset]')) calls.warnings.push(message.text());
  });
  page.on('pageerror', error => calls.pageErrors.push(error.message));
  // Exercise the installed SDK against synthetic transport responses. Install
  // every route before navigation; all other backend writes and external traffic fail closed.
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!/\/(auth|rest|functions|storage|realtime)\/v1(?:\/|$)/.test(url.pathname)) {
      return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        ? route.continue() : route.abort('blockedbyclient');
    }
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PUT,OPTIONS' };
    const respond = (json, status = 200) => route.fulfill({ json, status, headers });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname === '/auth/v1/user' && request.method() === 'GET') {
      calls.verify += 1;
      storageKey = `sb-${url.hostname.split('.')[0]}-auth-token`;
      return invalidLink ? respond({ message: 'Offline expired recovery link', code: 'bad_jwt' }, 401) : respond(user);
    }
    if (url.pathname === '/auth/v1/user' && request.method() === 'PUT') {
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      calls.passwordUpdates.push(request.postDataJSON());
      if (controls.rejectNextUpdate) {
        controls.rejectNextUpdate = false;
        return respond({ message: 'Offline password update rejection', code: 'OFFLINE_RESET' }, 503);
      }
      return respond(user);
    }
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
    if (request.method() === 'POST' && rpc === 'accept_pending_invites') return respond([]);
    if (request.method() === 'POST' && rpc === 'get_member_directory') return respond([profile]);
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
      if (table === 'stable_members') {
        calls.memberships += 1;
        if (membershipFailure) return respond({ message: 'Offline membership rejection', code: 'OFFLINE_RESET' }, 500);
      }
      const rows = tables[table] ?? [];
      return respond(request.headers().accept?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows);
    }
    if (!['GET', 'HEAD'].includes(request.method())) calls.blockedWrites.push({ path: url.pathname, method: request.method() });
    return route.abort('blockedbyclient');
  });
  await page.routeWebSocket(/.*/, socket => socket.close());
  const hash = new URLSearchParams({ access_token: token, refresh_token: 'offline-reset-refresh',
    expires_in: '3600', expires_at: String(expiresAt), token_type: 'bearer', type: 'recovery' });
  await page.goto(`/reset#${hash}`);
  return { calls, controls, token, user, storageKey: () => storageKey };
}

async function expectRecoveryForm(page) {
  await expect(page.getByText('Sätt nytt lösenord', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Uppdatera lösenord', exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/reset$/);
  expect(await page.evaluate(() => globalThis.location.hash)).toBe('');
  await expect(page.getByText('Hämtar ditt stall…', { exact: true })).toHaveCount(0);
}

async function fillPassword(page) {
  await page.getByPlaceholder('Minst 8 tecken').fill(password);
  await page.getByPlaceholder('Upprepa lösenord').fill(password);
}

async function refocusRecovery(page, fixture) {
  await page.evaluate(key => {
    globalThis.__recoveryFocusEvent = null;
    const channel = new globalThis.BroadcastChannel(key);
    globalThis.__recoveryFocusChannel = channel;
    channel.onmessage = ({ data }) => {
      if (data.event === 'SIGNED_IN') globalThis.__recoveryFocusEvent = {
        event: data.event, userId: data.session?.user?.id, accessToken: data.session?.access_token,
      };
    };
    // Trigger the installed SDK's browser visibility handler, then observe its
    // public Auth broadcast to prove the same-session SIGNED_IN event occurred.
    Object.defineProperty(globalThis.document, 'visibilityState', { configurable: true, value: 'hidden' });
    globalThis.dispatchEvent(new globalThis.Event('visibilitychange'));
    Object.defineProperty(globalThis.document, 'visibilityState', { configurable: true, value: 'visible' });
    globalThis.dispatchEvent(new globalThis.Event('visibilitychange'));
  }, fixture.storageKey());
  try {
    await expect.poll(() => page.evaluate(() => globalThis.__recoveryFocusEvent))
      .toEqual({ event: 'SIGNED_IN', userId, accessToken: fixture.token });
    await page.evaluate(() => new Promise(resolve => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve))));
  } finally {
    await page.evaluate(() => {
      globalThis.__recoveryFocusChannel.close();
      delete globalThis.document.visibilityState;
    });
  }
}

function expectCleanTraffic(fixture) {
  expect(fixture.calls.blockedWrites).toEqual([]);
  expect(fixture.calls.pageErrors).toEqual([]);
}

test('mobile recovery survives consumed SDK hash, browser refocus and incomplete onboarding, then resumes normal routing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await offlineRecovery(page, { incompleteOnboarding: true });
  await expectRecoveryForm(page);
  await expect.poll(() => fixture.calls.memberships).toBeGreaterThan(0);
  await expect(page.getByText('Välkommen till ditt stall', { exact: true })).toHaveCount(0);
  await fillPassword(page);
  await refocusRecovery(page, fixture);
  await expectRecoveryForm(page);
  await expect(page.getByPlaceholder('Minst 8 tecken')).toHaveValue(password);
  await expect(page.getByPlaceholder('Upprepa lösenord')).toHaveValue(password);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Uppdatera lösenord', exact: true }).click();
  await expect(page.getByText('Välkommen till ditt stall', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/setup$/);
  expect(fixture.calls.passwordUpdates).toEqual([expect.objectContaining({ password })]);
  expect(await page.evaluate(key => JSON.parse(globalThis.localStorage.getItem(key))?.user?.id, fixture.storageKey())).toBe(userId);

  // The reset exemption must not keep an ordinary auth route open for an
  // already signed-in account after recovery has finished.
  await page.goto('/(auth)');
  await expect(page.getByText('Välkommen till ditt stall', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByPlaceholder('namn@exempel.se')).toHaveCount(0);
  expectCleanTraffic(fixture);
});

test('desktop recovery remains usable when stable loading fails, then restores the ordinary error gate', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const fixture = await offlineRecovery(page, { membershipFailure: true });
  await expectRecoveryForm(page);
  await expect.poll(() => fixture.calls.memberships).toBeGreaterThan(0);
  await expect(page.getByText('Kunde inte hämta stallet', { exact: true })).toHaveCount(0);
  await fillPassword(page);
  await page.getByRole('button', { name: 'Uppdatera lösenord', exact: true }).click();
  await expect(page.getByText('Kunde inte hämta stallet', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Försök igen', exact: true })).toBeEnabled();
  await expect(page.getByText('Sätt nytt lösenord', { exact: true })).toHaveCount(0);
  expect(fixture.calls.passwordUpdates).toEqual([expect.objectContaining({ password })]);
  expectCleanTraffic(fixture);
});

test('password rejection preserves the mobile draft and releases the button for a confirmed SDK retry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await offlineRecovery(page);
  await expectRecoveryForm(page);
  await fillPassword(page);
  fixture.controls.rejectNextUpdate = true;
  await page.getByRole('button', { name: 'Uppdatera lösenord', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: updateError })).toBeVisible();
  await expect(page.getByPlaceholder('Minst 8 tecken')).toHaveValue(password);
  await expect(page.getByPlaceholder('Upprepa lösenord')).toHaveValue(password);
  await expect(page.getByRole('button', { name: 'Uppdatera lösenord', exact: true })).toBeEnabled();
  await expect(page.getByText('Lösenordet är uppdaterat.', { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/reset$/);
  expect(fixture.calls.passwordUpdates).toEqual([expect.objectContaining({ password })]);
  expect(fixture.calls.warnings).toHaveLength(1);
  expect(fixture.calls.warnings[0]).not.toContain(password);
  expect(fixture.calls.warnings[0]).not.toContain(fixture.user.email);
  expect(fixture.calls.warnings[0]).not.toContain(fixture.token);

  await page.getByRole('button', { name: 'Uppdatera lösenord', exact: true }).click();
  await expect(page.getByText('Offline Recovery Stall', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Sätt nytt lösenord', { exact: true })).toHaveCount(0);
  expect(fixture.calls.passwordUpdates).toEqual([
    expect.objectContaining({ password }), expect.objectContaining({ password }),
  ]);
  expectCleanTraffic(fixture);
});

test('an invalid recovery link shows an error and stops automatic SDK verification retries', async ({ page }) => {
  const fixture = await offlineRecovery(page, { invalidLink: true });
  await expect(page.getByRole('alert').filter({ hasText: 'Kunde inte verifiera länken. Öppna återställningslänken igen eller välj Skicka ny kod.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Uppdatera lösenord', exact: true })).toBeDisabled();
  await expect(page.getByText('Verifierar länken...', { exact: true })).toHaveCount(0);
  expect(fixture.calls.verify).toBeGreaterThan(0);
  expect(fixture.calls.verify).toBeLessThanOrEqual(2);
  const verificationAttempts = fixture.calls.verify;
  await page.getByPlaceholder('Minst 8 tecken').fill(password);
  await page.getByPlaceholder('Upprepa lösenord').fill(password);
  await page.waitForTimeout(750); // Observe the former effect loop after its busy state has settled.
  expect(fixture.calls.verify).toBe(verificationAttempts);
  expect(fixture.calls.passwordUpdates).toEqual([]);
  expect(fixture.calls.memberships).toBe(0);
  expectCleanTraffic(fixture);
});


for (const width of [390, 1280]) {
  test(`six-digit recovery stays private, retries failures and consumes proof at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const email = 'offline-code@example.test';
    const user = { id: userId, aud: 'authenticated', role: 'authenticated', email,
      app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: userId, exp: expiresAt }]
      .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.offline-code-signature';
    const calls = { request: 0, verify: 0, put: 0, unexpected: [], errors: [] };
    const controls = { invalid: true, rejectUpdate: true };
    page.on('pageerror', error => calls.errors.push(error.message));
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (!/\/(auth|rest|functions|storage|realtime)\/v1(?:\/|$)/.test(url.pathname)) {
        return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? route.continue() : route.abort('blockedbyclient');
      }
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,PUT,OPTIONS' };
      const respond = (json, status = 200) => route.fulfill({ json, status, headers });
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (url.pathname === '/auth/v1/recover' && request.method() === 'POST') {
        expect(request.postDataJSON().email).toBe(email); calls.request += 1; return respond({});
      }
      if (url.pathname === '/auth/v1/verify' && request.method() === 'POST') {
        expect(request.postDataJSON()).toEqual({ email, token: '123456', type: 'recovery', gotrue_meta_security: {} });
        expect(url.search).toBe(''); calls.verify += 1;
        return controls.invalid ? respond({ code: 'otp_expired', message: 'Offline invalid code' }, 403)
          : respond({ access_token: token, refresh_token: 'offline-code-refresh', token_type: 'bearer',
            expires_in: 3600, expires_at: expiresAt, user });
      }
      if (url.pathname === '/auth/v1/user') {
        expect(request.headers().authorization).toBe(`Bearer ${token}`);
        if (request.method() === 'GET') return respond(user);
        if (request.method() === 'PUT') {
          expect(request.postDataJSON()).toEqual({ password, code_challenge: null, code_challenge_method: null }); calls.put += 1;
          return controls.rejectUpdate ? respond({ code: 'offline_rejected', message: 'Offline rejected password' }, 503) : respond(user);
        }
      }
      calls.unexpected.push({ path: url.pathname, method: request.method() });
      return route.abort('blockedbyclient');
    });
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/reset');
    await expect(page.getByPlaceholder('Minst 8 tecken')).toHaveCount(0);
    await page.getByRole('textbox', { name: 'E-post för återställning', exact: true }).fill(email);
    await page.getByRole('button', { name: 'Skicka återställningskod', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Sexsiffrig återställningskod', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Sexsiffrig återställningskod', exact: true }).fill('12345');
    await page.getByRole('button', { name: 'Verifiera återställningskod', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('sexsiffriga');
    expect(calls.verify).toBe(0);
    await page.getByRole('textbox', { name: 'Sexsiffrig återställningskod', exact: true }).fill('123456');
    await page.getByRole('button', { name: 'Verifiera återställningskod', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Koden kunde inte verifieras');
    await expect(page.getByRole('textbox', { name: 'Sexsiffrig återställningskod', exact: true })).toHaveValue('123456');
    await page.getByRole('button', { name: 'Skicka ny kod', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Sexsiffrig återställningskod', exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Ändra e-post', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'E-post för återställning', exact: true })).toBeEditable();
    await expect(page.getByRole('textbox', { name: 'Sexsiffrig återställningskod', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Skicka återställningskod', exact: true }).click();
    controls.invalid = false;
    await page.getByRole('textbox', { name: 'Sexsiffrig återställningskod', exact: true }).fill('123456');
    await page.getByRole('button', { name: 'Verifiera återställningskod', exact: true }).click();
    await expect(page.getByText(`Återställer ${email}`, { exact: true })).toBeVisible();
    await fillPassword(page);
    await page.getByRole('button', { name: 'Uppdatera lösenord', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(updateError);
    await expect(page.getByPlaceholder('Minst 8 tecken')).toHaveValue(password);
    await expect(page.getByRole('button', { name: 'Uppdatera lösenord', exact: true })).toBeEnabled();
    const stored = await page.evaluate(() => Object.values(globalThis.localStorage));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(JSON.stringify(stored)).not.toContain('offline-code-refresh');
    expect(new URL(page.url()).search).toBe(''); expect(new URL(page.url()).hash).toBe('');
    controls.rejectUpdate = false;
    await page.getByRole('button', { name: 'Uppdatera lösenord', exact: true }).click();
    await expect(page).not.toHaveURL(/\/reset$/);
    expect(calls.request).toBe(3); expect(calls.verify).toBe(2); expect(calls.put).toBe(2);
    await page.goto('/reset');
    await expect(page.getByPlaceholder('Minst 8 tecken')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Skicka återställningskod', exact: true })).toBeEnabled();
    expect(calls.unexpected).toEqual([]); expect(calls.errors).toEqual([]);
  });
}
