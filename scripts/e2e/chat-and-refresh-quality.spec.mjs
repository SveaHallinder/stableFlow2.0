import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', trace: 'off' });
const senderId = '00000000-0000-4000-8000-000000000091';
const peerId = '00000000-0000-4000-8000-000000000092';
const stableId = '00000000-0000-4000-8000-000000000093';
const groupId = '00000000-0000-4000-8000-000000000094';
const privateId = '00000000-0000-4000-8000-000000000095';
const visibleText = (page, text) => page.getByText(text, { exact: true }).filter({ visible: true });

async function boot(page, { existingChat = false, ownMessage = false, orphanChat = false, failMembers = false } = {}) {
  const user = { id: senderId, aud: 'authenticated', role: 'authenticated', email: 'offline-chat@example.test',
    app_metadata: {}, user_metadata: { full_name: 'Offline Sender' }, created_at: '2026-01-01T00:00:00Z' };
  const profiles = [{ id: senderId, full_name: 'Offline Sender', onboarding_dismissed: true },
    { id: peerId, full_name: 'Offline Medlem', onboarding_dismissed: true }];
  const token = [{ alg: 'HS256', typ: 'JWT' }, { sub: senderId, exp: 4102444800 }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.offline-signature';
  const privateConversation = { id: privateId, stable_id: null, is_group: false, created_by_user_id: senderId, created_at: '2026-10-07T07:00:00Z' };
  const tables = {
    profiles: [profiles[0]],
    stable_members: [{ stable_id: stableId, user_id: senderId, role: 'staff', access: 'edit', horse_ids: [] },
      { stable_id: stableId, user_id: peerId, role: 'rider', access: 'view', horse_ids: [] }],
    stables: [{ id: stableId, name: 'Offline Chattstall', settings: {} }],
    conversations: [{ id: groupId, stable_id: stableId, title: 'Offline Chattstall', is_group: true },
      ...(existingChat || orphanChat ? [privateConversation] : [])],
    conversation_members: existingChat ? [{ conversation_id: privateId, user_id: senderId },
      { conversation_id: privateId, user_id: peerId }] : [],
    messages: ownMessage ? [{ id: '00000000-0000-4000-8000-000000000096', conversation_id: privateId,
      author_id: senderId, text: 'Offline eget meddelande', created_at: '2026-10-07T07:10:00Z' }] : [],
  };
  const controls = { conversationWrites: [], createdIds: [], memberWrites: [], unexpected: [], pageErrors: [], warnings: [], failMembers };
  page.on('pageerror', error => controls.pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'warning' && /\[(chat create|stable refresh)\]/.test(message.text())) controls.warnings.push(message.text());
  });
  await page.addInitScript(() => {
    const getItem = globalThis.Storage.prototype.getItem;
    globalThis.Storage.prototype.getItem = function (key) {
      if (globalThis.__failNextSessionRead && /^sb-.*-auth-token$/.test(key)) {
        globalThis.__failNextSessionRead = false;
        throw new Error('PRIVATE storage detail offline-person@example.test Bearer offline-secret');
      }
      return getItem.call(this, key);
    };
  });
  // The installed SDK talks only to these fixtures. All unmatched external HTTP,
  // backend writes and WebSockets are blocked before the first navigation.
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS' };
    const respond = (json, status = 200) => route.fulfill({ json, status, headers });
    if (!/\/(auth|rest|functions|storage|realtime)\/v1(?:\/|$)/.test(url.pathname)) {
      if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return route.continue();
      controls.unexpected.push({ method: request.method(), path: url.pathname });
      return route.abort('blockedbyclient');
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname === '/auth/v1/token' && request.method() === 'POST') {
      return respond({ access_token: token, refresh_token: 'offline-chat-refresh', token_type: 'bearer',
        expires_in: 3600, expires_at: 4102444800, user });
    }
    if (url.pathname === '/auth/v1/user' && request.method() === 'GET') return respond(user);
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
    if (request.method() === 'POST' && rpc === 'accept_pending_invites') return respond([]);
    if (request.method() === 'POST' && rpc === 'get_member_directory') return respond(profiles);
    const table = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
    if (request.method() === 'GET' && table) {
      let rows = tables[table] ?? [];
      if (table === 'stable_members' && url.searchParams.has('user_id')) rows = rows.filter(row => row.user_id === senderId);
      if (table === 'conversations') {
        for (const [column, filter] of url.searchParams) {
          if (filter.startsWith('eq.')) rows = rows.filter(row => String(row[column]) === filter.slice(3));
          else if (filter === 'is.null') rows = rows.filter(row => row[column] == null);
        }
      }
      if (table === 'conversation_members' && url.searchParams.has('conversation_id')) {
        const filter = url.searchParams.get('conversation_id');
        const ids = filter.startsWith('in.(') ? filter.slice(4, -1).split(',') : [filter.replace(/^eq\./, '')];
        rows = rows.filter(row => ids.includes(row.conversation_id));
      }
      return respond(request.headers().accept?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows);
    }
    if (table === 'conversations' && request.method() === 'POST') {
      const payload = request.postDataJSON();
      controls.conversationWrites.push(payload);
      const id = payload.id ?? privateId;
      if (tables.conversations.some(row => row.id === id)) return respond({ code: '23505', message: 'Synthetic duplicate conversation ID' }, 409);
      const row = { ...privateConversation, ...payload, id };
      controls.createdIds.push(id);
      tables.conversations.push(row);
      return respond(row);
    }
    if (table === 'conversation_members' && request.method() === 'POST') {
      const payload = request.postDataJSON();
      controls.memberWrites.push(payload);
      if (controls.failMembers) return respond({ code: '42501', message: 'PRIVATE provider membership detail' }, 403);
      tables.conversation_members = payload;
      return route.fulfill({ status: 201, headers });
    }
    controls.unexpected.push({ method: request.method(), path: url.pathname });
    return route.abort('blockedbyclient');
  });
  await page.routeWebSocket(/.*/, socket => socket.close());
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill(user.email);
  await page.getByPlaceholder('Minst 8 tecken').fill('OfflineFixture1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect(visibleText(page, 'Offline Chattstall').first()).toBeVisible();
  return controls;
}

function expectIsolated(controls) {
  expect(controls.unexpected).toEqual([]);
  expect(controls.pageErrors).toEqual([]);
}

for (const ownMessage of [false, true]) {
  test(`member profile reopens the hydrated private chat with ${ownMessage ? 'only my message' : 'no messages'}`, async ({ page }, testInfo) => {
    const controls = await boot(page, { existingChat: true, ownMessage });
    // Initial direct profile entry also verifies the real hydration of member IDs.
    // Subsequent navigation uses UI back so the same app state is retained.
    await page.goto(`/members/${peerId}`);
    await visibleText(page, 'Chatta').click();
    await expect(page).toHaveURL(new RegExp(`/chat/${privateId}(?:\\?|$)`));
    if (ownMessage) await expect(visibleText(page, 'Offline eget meddelande')).toBeVisible();
    await page.getByRole('button', { name: 'Tillbaka', exact: true }).click();
    await visibleText(page, 'Chatta').click();
    await expect(page).toHaveURL(new RegExp(`/chat/${privateId}(?:\\?|$)`));
    expect(controls.conversationWrites).toEqual([]);
    expect(controls.memberWrites).toEqual([]);
    expectIsolated(controls);
    await page.screenshot({ path: testInfo.outputPath('same-private-chat.png') });
  });
}

test('member-write failure stays on the profile, then retry opens one acknowledged chat', async ({ page }, testInfo) => {
  const controls = await boot(page, { failMembers: true });
  await page.goto(`/members/${peerId}`);
  await visibleText(page, 'Chatta').click();
  await expect(visibleText(page, 'Chatten kunde inte startas. Försök igen.')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/members/${peerId}(?:\\?|$)`));
  await expect(visibleText(page, 'Chatta')).toBeVisible();
  expect(controls.warnings).toHaveLength(1);
  expect(controls.warnings[0]).not.toContain('PRIVATE provider');
  await page.screenshot({ path: testInfo.outputPath('private-chat-failure-retained.png') });

  controls.failMembers = false;
  await visibleText(page, 'Chatta').click();
  await expect(page).toHaveURL(/\/chat\/[^/?]+/);
  const chatUrl = page.url();
  const inserted = controls.conversationWrites.length;
  await page.getByRole('button', { name: 'Tillbaka', exact: true }).click();
  await visibleText(page, 'Chatta').click();
  await expect(page).toHaveURL(chatUrl);
  expect(controls.conversationWrites).toHaveLength(inserted);
  expect(controls.createdIds).toHaveLength(1);
  expect(new Set(controls.conversationWrites.map(row => row.id)).size).toBe(1);
  expect(controls.memberWrites.at(-1).map(row => row.user_id).sort()).toEqual([senderId, peerId].sort());
  expectIsolated(controls);
  await page.screenshot({ path: testInfo.outputPath('private-chat-retry-acknowledged.png') });
});

test('a readable creator shell without membership stays out of the private chat list', async ({ page }, testInfo) => {
  const controls = await boot(page, { orphanChat: true });
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Öppna konversation med Offline Chattstall', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Öppna konversation med / })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Öppna konversation med Konversation', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('mobile-chat-list-without-unacknowledged-shell.png') });

  // The private filter is part of the desktop inbox; mobile shows the complete list.
  await page.setViewportSize({ width: 1280, height: 844 });
  await visibleText(page, 'Privat').click();
  await expect(visibleText(page, 'Inga meddelanden ännu')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Öppna konversation med Konversation', exact: true })).toHaveCount(0);
  expect(controls.conversationWrites).toEqual([]);
  expect(controls.memberWrites).toEqual([]);
  expectIsolated(controls);
  await page.screenshot({ path: testInfo.outputPath('private-chat-empty-without-member-ack.png') });
});

for (const width of [390, 1280]) {
  test(`stable refresh shows useful retry copy after an SDK storage exception at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const controls = await boot(page);
    const update = page.getByRole('button', { name: 'Uppdatera stalldata', exact: true }).filter({ visible: true }).first();
    await page.evaluate(() => { globalThis.__failNextSessionRead = true; });
    await update.click();
    await expect(visibleText(page, 'Kunde inte uppdatera stalldata. Försök igen.')).toBeVisible();
    await expect(update).toBeEnabled();
    await expect(visibleText(page, 'Offline Chattstall').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('PRIVATE storage detail');
    expect(controls.warnings).toHaveLength(1);
    expect(controls.warnings[0]).not.toMatch(/PRIVATE|offline-person|offline-secret/);
    await page.screenshot({ path: testInfo.outputPath('stable-refresh-useful-error.png') });
    await update.click();
    await expect(visibleText(page, 'Kunde inte uppdatera stalldata. Försök igen.')).toHaveCount(0);
    await expect(update).toBeEnabled();
    expect(controls.conversationWrites).toEqual([]);
    expect(controls.memberWrites).toEqual([]);
    expectIsolated(controls);
  });
}
