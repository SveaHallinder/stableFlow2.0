/* global document */
import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';
import { URL } from 'node:url';

test.use({ trace: 'off', serviceWorkers: 'block', timezoneId: 'Europe/Stockholm' });

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!local || /\/(auth|rest|functions|storage|realtime)\/v1\//.test(url.pathname)) return route.abort('blockedbyclient');
    return route.continue();
  });
  await page.routeWebSocket(/.*/, socket => socket.close());
  await page.clock.setFixedTime(new Date('2026-10-07T12:00:00Z'));
});

// The development demo remains backend-free. These fixtures drive the actual
// provider/component hooks; the Node suite separately exercises the real SDK
// and asynchronous callback with synthetic success, denial and stale replies.
async function fixture(page, name) {
  await page.evaluate(name => {
    const element = document.querySelector('#root');
    const key = Object.keys(element).find(key => key.startsWith('__reactContainer$'));
    const root = element[key];
    const fibers = [];
    const seen = new Set();
    const visit = fiber => {
      if (!fiber || seen.has(fiber)) return;
      seen.add(fiber); fibers.push(fiber);
      visit(fiber.child); visit(fiber.sibling);
    };
    visit(root.stateNode?.current || root);
    const provider = fibers.find(fiber => (fiber.type?.name || fiber.type?.displayName) === 'AppDataProvider');
    const component = fibers.find(fiber => (fiber.type?.name || fiber.type?.displayName) === 'StableInviteList');
    if (!provider || !component) throw new Error('Backend-free invitation fixture is unavailable.');
    const hook = provider.memoizedState;
    const state = hook.memoizedState;
    if (['loading', 'empty', 'failure', 'bounded', 'private-row'].includes(name)) {
      let listHook = component.memoizedState;
      while (listHook && !(listHook.queue?.dispatch && listHook.memoizedState?.scope && listHook.memoizedState?.status)) listHook = listHook.next;
      if (!listHook) throw new Error('Invitation list hook is unavailable.');
      const row = { id: 'fixture-row', stable_id: state.currentStableId, email: 'selected-stable-only@example.test', role: 'rider', custom_role: null,
        created_at: '2026-10-06T12:00:00Z', accepted_at: null, expires_at: null };
      const result = name === 'bounded' ? { invites: Array.from({ length: 50 }, (_, index) => ({ ...row, id: `bounded-${index}`, email: `bounded-${index}@example.test` })), truncated: true }
        : { invites: name === 'private-row' ? [row] : [], truncated: false };
      listHook.queue.dispatch({ ...listHook.memoizedState, status: name === 'failure' ? 'error' : name === 'loading' ? 'loading' : 'ready', result });
      return;
    }
    const userId = state.currentUserId;
    const otherId = 'qa-second-stable';
    const current = state.users[userId];
    const role = name === 'staff-owner' ? 'staff' : 'admin';
    const access = name === 'admin-edit' ? 'edit' : 'owner';
    const membership = [...current.membership.filter(entry => entry.stableId !== otherId), { stableId: otherId, role, access }];
    const users = { ...state.users, [userId]: { ...current, membership } };
    const stables = state.stables.some(entry => entry.id === otherId) ? state.stables : [...state.stables, { ...state.stables[0], id: otherId, name: 'QA Andra stallet' }];
    const horses = state.horses.some(entry => entry.stableId === otherId) ? state.horses : [...state.horses, { ...state.horses[0], id: 'qa-second-horse', stableId: otherId }];
    const assignments = state.assignments.some(entry => entry.stableId === otherId) ? state.assignments : [...state.assignments, { ...state.assignments[0], id: 'qa-second-assignment', stableId: otherId }];
    if (!['admin-edit', 'staff-owner', 'owner-other', 'session-mismatch'].includes(name)) throw new Error(`Unknown invitation fixture: ${name}`);
    hook.queue.dispatch({ type: 'STATE_HYDRATE', payload: { ...state, users, stables, horses, assignments, currentStableId: otherId,
      sessionUserId: name === 'session-mismatch' ? 'qa-other-account' : state.sessionUserId } });
  }, name);
}

for (const width of [390, 1280]) {
  test(`owner invitation statuses and recipients fit ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin?qaDemo=1');
    const list = page.getByTestId('stable-invite-list');
    await expect(list.getByText('vantande@example.test', { exact: true })).toBeVisible();
    await expect(list.getByText('Ryttare · Väntande', { exact: true })).toBeVisible();
    await expect(list.getByText('Personal · Accepterad', { exact: true })).toBeVisible();
    await expect(list.getByText('Tränare · Utgången', { exact: true })).toBeVisible();
    await expect(list.getByText(/Mejlleverans är inte bekräftad/)).toBeVisible();
    await expect(list.getByTestId('stable-invite-row')).toHaveCount(3);
    await list.scrollIntoViewIfNeeded();
    expect(await list.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`invites-${width}.png`) });
  });
}

test('loading, empty and safe failure states recover through visible retry/update buttons', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/admin?qaDemo=1');
  const list = page.getByTestId('stable-invite-list');
  await expect(list.getByTestId('stable-invite-row')).toHaveCount(3);
  await fixture(page, 'loading');
  await expect(list.getByText('Läser inbjudningar…', { exact: true })).toBeVisible();
  await expect(list.getByTestId('stable-invite-row')).toHaveCount(0);
  await fixture(page, 'empty');
  await expect(list.getByText('Inga inbjudningar i det här stallet ännu.', { exact: true })).toBeVisible();
  await list.getByRole('button', { name: 'Uppdatera inbjudningar', exact: true }).click();
  await expect(list.getByTestId('stable-invite-row')).toHaveCount(3);
  await fixture(page, 'failure');
  await expect(list.getByRole('alert')).toHaveText('Inbjudningarna kunde inte läsas. Kontrollera anslutningen och försök igen.');
  await expect(list.getByTestId('stable-invite-row')).toHaveCount(0);
  await list.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('invites-retry-mobile.png') });
  await list.getByRole('button', { name: 'Försök igen', exact: true }).click();
  await expect(list.getByTestId('stable-invite-row')).toHaveCount(3);
  await expect(list.getByRole('alert')).toHaveCount(0);
  await fixture(page, 'bounded');
  await expect(list.getByTestId('stable-invite-row')).toHaveCount(50);
  await expect(list.getByText('Visar de 50 senaste inbjudningarna. Äldre inbjudningar visas inte här.', { exact: true })).toBeVisible();
});

test('selected stable requires admin plus owner; session mismatch removes every recipient', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/admin?qaDemo=1');
  const list = page.getByTestId('stable-invite-list');
  await expect(list.getByTestId('stable-invite-row')).toHaveCount(3);
  await fixture(page, 'private-row');
  await expect(list.getByText('selected-stable-only@example.test', { exact: true })).toBeVisible();
  for (const role of ['admin-edit', 'staff-owner']) {
    await fixture(page, role);
    await expect(list.getByText('Endast ägare i det valda stallet kan se inbjudningslistan.', { exact: true })).toBeVisible();
    await expect(list.getByTestId('stable-invite-row')).toHaveCount(0);
    await expect(page.getByText('selected-stable-only@example.test', { exact: true })).toHaveCount(0);
  }
  await fixture(page, 'owner-other');
  await expect(list.getByText(/QA Andra stallet · Senaste inbjudningarna/)).toBeVisible();
  await expect(list.getByTestId('stable-invite-row')).toHaveCount(3);
  await fixture(page, 'session-mismatch');
  await expect(list.getByText('Endast ägare i det valda stallet kan se inbjudningslistan.', { exact: true })).toBeVisible();
  await expect(list.getByTestId('stable-invite-row')).toHaveCount(0);
  await list.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('invites-owner-scope-mobile.png') });
});

const ownerId = '00000000-0000-4000-8000-000000000331';
const ownerStableId = '00000000-0000-4000-8000-000000000332';

async function bootOrdinaryOwner(page) {
  const user = { id: ownerId, aud: 'authenticated', role: 'authenticated', email: 'offline-owner@example.test',
    app_metadata: {}, user_metadata: { full_name: 'Offline Ägare' }, created_at: '2026-01-01T00:00:00Z' };
  const profile = { id: ownerId, full_name: 'Offline Ägare', onboarding_dismissed: true };
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: ownerId, exp: 4102444800 }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')
    + '.' + Buffer.from('offline-signature').toString('base64url');
  const tables = {
    profiles: [profile],
    stable_members: [{ stable_id: ownerStableId, user_id: ownerId, role: 'admin', access: 'owner', horse_ids: [] }],
    stables: [{ id: ownerStableId, name: 'Offline Ägarstall', created_by: ownerId, settings: { onboarding: { resourcesComplete: true } } }],
    horses: [{ id: '00000000-0000-4000-8000-000000000333', stable_id: ownerStableId, name: 'Offline Häst' }],
    assignments: [{ id: '00000000-0000-4000-8000-000000000334', stable_id: ownerStableId, date: '2026-10-07', slot: 'Morning', label: 'Offline fodring', time: '07:00', icon: 'sun', status: 'open' }],
    conversations: [{ id: '00000000-0000-4000-8000-000000000335', stable_id: ownerStableId, title: 'Offline Ägarstall', is_group: true }],
    stable_invites: [{ id: '00000000-0000-4000-8000-000000000336', stable_id: ownerStableId, email: 'persisted-invite@example.test', role: 'rider', custom_role: null,
      created_at: '2026-10-06T12:00:00Z', accepted_at: null, expires_at: null }],
  };
  const controls = { rejectRead: true, inviteReads: [], unexpected: [], pageErrors: [], warnings: [] };
  page.on('pageerror', error => controls.pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'warning' && message.text().includes('[stable invites]')) controls.warnings.push(message.text());
  });
  // Installed after the generic block, before navigation: every Auth/DB reply
  // is synthetic, and there is no backend pass-through even on localhost.
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
    const respond = (json, status = 200) => route.fulfill({ json, status, headers });
    if (!/\/(auth|rest|functions|storage|realtime)\/v1(?:\/|$)/.test(url.pathname)) {
      if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return route.continue();
      controls.unexpected.push({ method: request.method(), path: url.pathname });
      return route.abort('blockedbyclient');
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname === '/auth/v1/token' && request.method() === 'POST') return respond({ access_token: token, refresh_token: 'offline-owner-refresh', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user });
    if (url.pathname === '/auth/v1/user' && request.method() === 'GET') return respond(user);
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
    if (request.method() === 'POST' && rpc === 'accept_pending_invites') return respond([]);
    if (request.method() === 'POST' && rpc === 'get_member_directory') return respond([profile]);
    if (request.method() === 'POST' && ['own_chat_read_state', 'mark_chat_messages_read'].includes(rpc)) {
      const body = request.postDataJSON();
      expect(body.expected_user_id).toBe(ownerId);
      expect(tables.conversations.some(row => row.id === body.target_conversation_id)).toBe(true);
      expect(body.message_ids).toEqual([]);
      const receipt = { user_id: ownerId, conversation_id: body.target_conversation_id, complete: true,
        requested_message_ids: [], read_message_ids: [], known_read_message_ids: [], unread_message_ids: [] };
      return respond(receipt);
    }
    const table = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
    if (request.method() === 'GET' && table) {
      if (table === 'stable_invites') {
        controls.inviteReads.push(Object.fromEntries(url.searchParams));
        if (controls.rejectRead) return respond({ code: 'offline_invite_denied', message: 'PRIVATE provider detail recipient@example.test' }, 403);
      }
      const rows = tables[table] ?? [];
      return respond(request.headers().accept?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows);
    }
    controls.unexpected.push({ method: request.method(), path: url.pathname });
    return route.abort('blockedbyclient');
  });
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill(user.email);
  await page.getByPlaceholder('Minst 8 tecken').fill('OfflineFixture1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect(page.getByText('Offline Ägarstall', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await page.goto('/admin');
  return controls;
}

test('ordinary owner recovers from the actual SDK invite query failure and reload reads persistent rows', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const controls = await bootOrdinaryOwner(page);
  const list = page.getByTestId('stable-invite-list');
  await expect(list.getByRole('alert')).toHaveText('Inbjudningarna kunde inte läsas. Kontrollera anslutningen och försök igen.');
  await expect(list.getByTestId('stable-invite-row')).toHaveCount(0);
  await expect(list).not.toContainText('PRIVATE provider');
  expect(controls.inviteReads).toHaveLength(1);
  expect(controls.inviteReads[0].stable_id).toBe(`eq.${ownerStableId}`);
  expect(controls.inviteReads[0].select).not.toMatch(/\bcode\b/);
  await list.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('ordinary-owner-sdk-failure.png') });
  controls.rejectRead = false;
  await list.getByRole('button', { name: 'Försök igen', exact: true }).click();
  await expect(list.getByText('persisted-invite@example.test', { exact: true })).toBeVisible();
  await expect(list.getByText('Ryttare · Väntande', { exact: true })).toBeVisible();
  expect(controls.inviteReads).toHaveLength(2);
  await page.reload();
  await expect(list.getByText('persisted-invite@example.test', { exact: true })).toBeVisible();
  expect(controls.inviteReads).toHaveLength(3);
  expect(controls.unexpected).toEqual([]);
  expect(controls.pageErrors).toEqual([]);
  expect(controls.warnings).toEqual(['[stable invites] Kunde inte läsa inbjudningslistan.']);
  await list.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('ordinary-owner-sdk-reloaded.png') });
});
