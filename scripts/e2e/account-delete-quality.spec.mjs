import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';

test.use({ trace: 'off', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

async function loadAccount(page, outcome) {
  const calls = [];
  const backend = /\/(auth|rest|functions|realtime|storage)\/v1(?:\/|$)/;
  const local = url => ['localhost', '127.0.0.1'].includes(url.hostname);
  const headers = { 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  // Installed before navigation: every backend request is stubbed or blocked.
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/rest/v1/rpc/own_account_deletion_status') {
      if (outcome === 'status_abort') return route.abort('failed');
      return route.fulfill({ json: deletionStatus('00000000-0000-4000-8000-000000000001'), headers });
    }
    if (url.pathname === '/functions/v1/delete-account') {
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      calls.push('delete-account');
      if (outcome === 'abort') return route.abort('failed');
      return route.fulfill({ status: outcome === 'sole_owner' ? 409 : 200, headers,
        json: outcome === 'sole_owner' ? { error: 'sole_owner' } : { skipped: 'not_configured' } });
    }
    if (backend.test(url.pathname) || !local(url)) {
      calls.push('blocked-backend');
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await page.routeWebSocket(url => backend.test(url.pathname) || !local(url), socket => socket.close());
  await page.goto('/settings/account?qaDemo=1');
  await expect(page.getByRole('button', { name: 'Radera konto', exact: true })).toBeVisible();
  return calls;
}

const ownerId = '60000000-0000-4000-8000-000000000002';
const replacementOwnerId = '60000000-0000-4000-8000-000000000004';
const stableId = '60000000-0000-4000-8000-000000000001';
const timestamp = '2026-10-07T00:00:00Z';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS' };

function deletionStatus(userId, { deleted = false, requiresOwner = false } = {}) {
  return { user_id: userId, status: deleted ? 'deleted' : 'not_started',
    auth_present: !deleted, profile_present: !deleted, requires_owner: !deleted && requiresOwner,
    affected_stable_count: !deleted && requiresOwner ? 1 : 0,
    replacement_owners: !deleted && requiresOwner ? [{ user_id: replacementOwnerId, display_name: 'Offline Ny ägare' }] : [],
    replacement_user_id: null, prepared_at: null };
}

// Exercise the installed Auth SDK and real provider against an entirely offline
// session. No backend write or external WebSocket can escape this fixture.
async function productionAccount(page, { holdDeletion = false } = {}) {
  const user = { id: ownerId, aud: 'authenticated', role: 'authenticated', email: 'offline-account@example.test',
    email_confirmed_at: timestamp, created_at: timestamp, app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: 'Offline Ägare' } };
  const profile = { id: ownerId, full_name: 'Offline Ägare', onboarding_dismissed: true };
  const replacementProfile = { id: replacementOwnerId, full_name: 'Offline Ny ägare', onboarding_dismissed: true };
  const horseId = '61000000-0000-4000-8000-000000000001';
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: ownerId, aud: 'authenticated', role: 'authenticated', exp: 4102444800 }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.offline-signature';
  const tables = {
    profiles: [profile, replacementProfile],
    stable_members: [{ stable_id: stableId, user_id: ownerId, role: 'admin', access: 'owner', rider_role: 'owner', horse_ids: [horseId] },
      { stable_id: stableId, user_id: replacementOwnerId, role: 'admin', access: 'owner', rider_role: 'owner', horse_ids: [] }],
    stables: [{ id: stableId, name: 'Offline Stallet', created_by: ownerId, settings: { onboarding: { resourcesComplete: true } } }],
    horses: [{ id: horseId, stable_id: stableId, name: 'Offline Häst', owner_user_id: ownerId, can_sleep_inside: true }],
    assignments: [{ id: '63000000-0000-4000-8000-000000000001', stable_id: stableId, date: '2026-10-07', label: 'Offline Pass', slot: 'Morning', icon: 'sun', time: '07:00', status: 'open' }],
    conversations: [{ id: '64000000-0000-4000-8000-000000000001', stable_id: stableId, title: 'Offline Stallet', is_group: true, created_at: timestamp }],
  };
  const deletes = [];
  const blockedWrites = [];
  let storageKey;
  let releaseDelete;
  let serverDeleted = false;
  await page.addInitScript(() => {
    const remove = globalThis.Storage.prototype.removeItem;
    globalThis.Storage.prototype.removeItem = function (key) {
      if (globalThis.__failAccountCleanup && /-auth-token$/.test(key)) {
        globalThis.__failAccountCleanup = false;
        throw new Error('Offline local storage failure');
      }
      return remove.call(this, key);
    };
  });
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    const backend = /\/(auth|rest|functions|storage|realtime)\/v1(?:\/|$)/.test(url.pathname);
    if (!backend) return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ? route.continue() : route.abort('blockedbyclient');
    const respond = json => route.fulfill({ json, headers: cors });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/auth/v1/token' && request.method() === 'POST') {
      storageKey = `sb-${url.hostname.split('.')[0]}-auth-token`;
      return respond({ access_token: token, refresh_token: 'offline-refresh', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user });
    }
    if (url.pathname === '/auth/v1/user' && request.method() === 'GET') return respond(user);
    if (url.pathname === '/functions/v1/delete-account' && request.method() === 'POST') {
      deletes.push(request.postDataJSON());
      const complete = () => { serverDeleted = true; return respond({ deleted: true, user_id: ownerId }); };
      if (holdDeletion) return new Promise(resolve => { releaseDelete = resolve; })
        .then(complete);
      return complete();
    }
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
    if (request.method() === 'POST' && rpc === 'accept_pending_invites') return respond([]);
    if (request.method() === 'POST' && rpc === 'get_member_directory') return respond([profile, replacementProfile]);
    if (request.method() === 'POST' && rpc === 'own_account_deletion_status') {
      expect(request.postDataJSON()).toEqual({});
      return respond(deletionStatus(ownerId, { deleted: serverDeleted, requiresOwner: true }));
    }
    if (request.method() === 'POST' && rpc === 'own_chat_read_state') {
      const body = request.postDataJSON();
      expect(body.expected_user_id).toBe(ownerId);
      expect(body.message_ids).toEqual([]);
      return respond({ user_id: ownerId, conversation_id: body.target_conversation_id, complete: true,
        requested_message_ids: [], read_message_ids: [], known_read_message_ids: [], unread_message_ids: [] });
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
  await page.getByPlaceholder('namn@exempel.se').fill(user.email);
  await page.getByPlaceholder('Minst 8 tecken').fill('OfflineFixture1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect(page.getByText('Stallstatus först', { exact: true })).toBeVisible();
  await page.goto('/settings');
  await page.getByText('Konto', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Radera konto', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Välj Offline Ny ägare som ny ägare', exact: true })).toBeVisible();
  return { deletes, blockedWrites, storageKey, releaseDeletion: () => releaseDelete?.() };
}

async function expectPersistentLogout(page, storageKey) {
  await expect(page.getByPlaceholder('namn@exempel.se')).toBeVisible();
  expect(await page.evaluate(key => [key, key + '-user', key + '-code-verifier'].map(value => globalThis.localStorage.getItem(value)), storageKey))
    .toEqual([null, null, null]);
  await page.reload();
  await expect(page.getByPlaceholder('namn@exempel.se')).toBeVisible();
  await expect(page.getByText('Stallstatus först', { exact: true })).toHaveCount(0);
}

test('verified production-flow deletion clears persistent Auth and navigates without remote logout or push cleanup', async ({ page }) => {
  const fixture = await productionAccount(page);
  await confirmDeletion(page);
  await expectPersistentLogout(page, fixture.storageKey);
  expect(fixture.deletes).toEqual([{ expected_user_id: ownerId, replacement_user_id: replacementOwnerId }]);
  expect(fixture.blockedWrites).toEqual([]);
});

test('verified deletion with local storage failure stays recoverable and retries no server deletion', async ({ page }) => {
  const fixture = await productionAccount(page);
  await page.evaluate(() => { globalThis.__failAccountCleanup = true; });
  await confirmDeletion(page);
  await expect(page.getByText(/Kontot har raderats, men den lokala sessionen kunde inte rensas/).first()).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/account$/);
  expect(await page.evaluate(key => JSON.parse(globalThis.localStorage.getItem(key)).user.id, fixture.storageKey)).toBe(ownerId);
  await expect(page.getByText('Ditt konto har raderats.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Rensa session och logga ut', exact: true }).click();
  await expectPersistentLogout(page, fixture.storageKey);
  expect(fixture.deletes).toEqual([{ expected_user_id: ownerId, replacement_user_id: replacementOwnerId }]);
  expect(fixture.blockedWrites).toEqual([]);
});

test('another active session is preserved when the first account deletion finishes', async ({ page }) => {
  const fixture = await productionAccount(page, { holdDeletion: true });
  const otherId = '60000000-0000-4000-8000-000000000003';
  await confirmDeletion(page);
  await expect.poll(() => fixture.deletes.length).toBe(1);
  await page.evaluate(({ key, otherId }) => {
    const next = JSON.parse(globalThis.localStorage.getItem(key));
    next.user = { ...next.user, id: otherId, email: 'offline-other@example.test' };
    globalThis.localStorage.setItem(key, JSON.stringify(next));
    // The public browser channel is the installed SDK's cross-tab Auth path.
    const channel = new globalThis.BroadcastChannel(key);
    channel.postMessage({ event: 'SIGNED_IN', session: next });
    channel.close();
  }, { key: fixture.storageKey, otherId });
  try {
    await expect(page.getByText('offline-other@example.test', { exact: true })).toBeVisible();
  } finally { fixture.releaseDeletion(); }
  await expect(page.getByText('offline-other@example.test', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/account$/);
  await expect(page.getByText('Ditt konto har raderats.', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(globalThis.localStorage.getItem(key)).user.id, fixture.storageKey)).toBe(otherId);
  expect(fixture.deletes).toEqual([{ expected_user_id: ownerId, replacement_user_id: replacementOwnerId }]);
  expect(fixture.blockedWrites).toEqual([]);
});

test('local session recovery survives leaving and reopening the account screen', async ({ page }) => {
  const fixture = await productionAccount(page);
  await page.evaluate(() => { globalThis.__failAccountCleanup = true; });
  await confirmDeletion(page);
  await expect(page.getByRole('button', { name: 'Rensa session och logga ut', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tillbaka', exact: true }).click();
  await expect(page.getByText('Allmänt', { exact: true })).toBeVisible();
  await page.getByText('Konto', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Radera konto', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Rensa session och logga ut', exact: true }).click();
  await expectPersistentLogout(page, fixture.storageKey);
  expect(fixture.deletes).toEqual([{ expected_user_id: ownerId, replacement_user_id: replacementOwnerId }]);
  expect(fixture.blockedWrites).toEqual([]);
});


async function confirmDeletion(page) {
  const owner = page.getByRole('radio', { name: 'Välj Offline Ny ägare som ny ägare', exact: true });
  if (await owner.count()) {
    await owner.click();
    await expect(owner).toHaveAttribute('aria-checked', 'true');
  }
  await expect(page.getByRole('button', { name: 'Radera konto', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Radera konto', exact: true }).click();
  await page.getByRole('button', { name: 'Bekräfta radering av konto', exact: true }).click();
}

test('account deletion describes the actual scope and lets confirmation be cancelled', async ({ page }) => {
  const calls = await loadAccount(page, 'abort');
  await expect(page.getByText(/Ditt inloggningskonto och din profil raderas permanent/)).toBeVisible();
  await expect(page.getByText(/Din egen text i flödesinlägg, kommentarer och chattar tas bort/)).toBeVisible();
  await expect(page.getByText(/Kontoradering med egna eller okänt tillskrivna filer är därför stoppad/)).toBeVisible();
  await expect(page.getByText(/Raderingen går inte att ångra/)).toBeVisible();
  await expect(page.getByText(/personuppgifter \(GDPR\)/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Radera konto', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bekräfta radering av konto', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Avbryt radering', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Radera konto', exact: true })).toBeEnabled();
  expect(calls).not.toContain('delete-account');
});

for (const outcome of ['abort', 'sole_owner', 'skipped']) {
  test(`account deletion recovers from ${outcome} without success or logout`, async ({ page }) => {
    const calls = await loadAccount(page, outcome);
    await confirmDeletion(page);
    await expect(page.getByText(outcome === 'sole_owner'
      ? 'Du är ensam ägare av ett stall. Utse en ny ägare först.'
      : 'Raderingen kunde inte bekräftas. Samma ägarval är låst. Kontrollera status innan du försöker igen; ett tidigare anrop kan fortfarande slutföras.', { exact: true })).toBeVisible();
    if (outcome === 'abort') {
      await expect(page.getByText(/Raderingsförsök: 1 av 3 på denna enhet/)).toBeVisible();
      await page.getByRole('button', { name: 'Kontrollera raderingsstatus', exact: true }).click();
    }
    await expect(page.getByRole('button', { name: 'Radera konto', exact: true })).toBeEnabled();
    await expect(page.getByText('Ditt konto har raderats.', { exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(/\/settings\/account\?qaDemo=1$/);
    await expect(page.getByText('Logga ut', { exact: true })).toBeVisible();
    expect(calls.filter(call => call === 'delete-account')).toHaveLength(1);
  });
}

test('unverified own deletion status blocks dispatch and keeps the current session', async ({ page }) => {
  const calls = await loadAccount(page, 'status_abort');
  await expect(page.getByText('Status är okänd. Ägarvalet är låst tills samma avslut kan verifieras. Ingen lokal session har rensats.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Radera konto', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Kontrollera raderingsstatus', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Radera konto', exact: true })).toBeDisabled();
  expect(calls).not.toContain('delete-account');
  await expect(page.getByText('Logga ut', { exact: true })).toBeVisible();
});
