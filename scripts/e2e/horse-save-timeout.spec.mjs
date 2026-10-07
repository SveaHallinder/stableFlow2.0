import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';

test.use({ trace: 'off', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const stableId = '60000000-0000-4000-8000-000000000001';
const ownerId = '60000000-0000-4000-8000-000000000002';
const horseId = '61000000-0000-4000-8000-000000000001';
const timestamp = '2026-10-07T07:00:00Z';
const horseRow = {
  id: horseId, stable_id: stableId, name: 'Offline Häst', owner_user_id: ownerId,
  box_number: 'B1', can_sleep_inside: true, gender: 'mare', age: 8,
  note: 'Behåll uppgifterna', image_url: null,
};
const cors = {
  'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
};

// Production Auth, hydration and persistence use only synthetic responses.
// Install every external/backend route and WebSocket block before navigation.
async function offlineSession(page, { horses, save, remove }) {
  const user = {
    id: ownerId, aud: 'authenticated', role: 'authenticated', email: 'offline-owner@example.test',
    email_confirmed_at: timestamp, created_at: timestamp,
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: 'Offline Ägare' },
  };
  const profile = { id: ownerId, full_name: 'Offline Ägare', onboarding_dismissed: true };
  const token = [
    { alg: 'HS256', typ: 'JWT' },
    { sub: ownerId, aud: 'authenticated', role: 'authenticated', exp: 4102444800 },
  ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.offline-signature';
  const tables = {
    profiles: [profile],
    stable_members: [{ stable_id: stableId, user_id: ownerId, role: 'admin', access: 'owner', rider_role: 'owner', horse_ids: [horseId] }],
    stables: [{ id: stableId, name: 'Offline Stallet', created_by: ownerId, settings: { onboarding: { resourcesComplete: true } } }],
    horses, paddocks: [],
    assignments: [{ id: '63000000-0000-4000-8000-000000000001', stable_id: stableId, date: '2026-10-07', label: 'Offline Morgonfodring', slot: 'Morning', icon: 'sun', time: '07:00', status: 'open' }],
    conversations: [{ id: '64000000-0000-4000-8000-000000000001', stable_id: stableId, title: 'Offline Stallet', is_group: true, created_at: timestamp }],
  };
  const blockedWrites = [];
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const backend = /\/(auth|rest|functions|storage|realtime)\/v1(?:\/|$)/.test(url.pathname);
    if (!backend) {
      return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        ? route.continue() : route.abort('blockedbyclient');
    }
    const respond = json => route.fulfill({ json, headers: cors });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/auth/v1/token' && request.method() === 'POST') {
      return respond({ access_token: token, refresh_token: 'offline-refresh', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user });
    }
    if (url.pathname === '/auth/v1/user' && request.method() === 'GET') return respond(user);
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
    if (request.method() === 'POST' && rpc === 'accept_pending_invites') return respond([]);
    if (request.method() === 'POST' && rpc === 'get_member_directory') return respond([profile]);
    const table = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
    if (table === 'horses' && ['POST', 'PATCH'].includes(request.method()) && save) {
      return save(route, request.postDataJSON());
    }
    if (table === 'horses' && request.method() === 'DELETE' && remove) return remove(route, url);
    if (request.method() === 'GET' && table) {
      const rows = tables[table] ?? [];
      return respond(request.headers().accept?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows);
    }
    if (!['GET', 'HEAD'].includes(request.method())) blockedWrites.push({ method: request.method(), path: url.pathname });
    return route.abort('blockedbyclient');
  });
  await page.routeWebSocket(/.*/, socket => socket.close());
  await page.addInitScript(() => {
    const originalFetch = globalThis.fetch.bind(globalThis);
    // Model a transport that ignores AbortSignal. The app's independent deadline
    // must settle the operation, and the same request can genuinely answer late.
    globalThis.fetch = (input, init) => {
      const url = new globalThis.URL(typeof input === 'string' ? input : input.url);
      if (url.pathname === '/rest/v1/horses' && ['POST', 'PATCH', 'DELETE'].includes(init?.method)) {
        return originalFetch(input, { ...init, signal: undefined });
      }
      return originalFetch(input, init);
    };
  });
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill(user.email);
  await page.getByPlaceholder('Minst 8 tecken').fill('OfflineFixture1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect(page.getByText('Stallstatus först', { exact: true })).toBeVisible();
  await page.goto('/stables?section=horses');
  await expect(page.getByText(horseRow.name, { exact: true })).toBeVisible();
  await page.clock.install();
  return { blockedWrites };
}

function delayedAcknowledgement() {
  let release;
  let delivered;
  const delivery = new Promise(resolve => { delivered = resolve; });
  return {
    hold: async (route, json) => {
      await new Promise(resolve => { release = resolve; });
      try { await route.fulfill({ json, headers: cors }); }
      finally { delivered(); }
    },
    release: () => release?.(),
    delivery,
  };
}

async function deliverLate(page, late, method) {
  const received = page.waitForResponse(response => new URL(response.url()).pathname === '/rest/v1/horses'
    && response.request().method() === method);
  late.release();
  await late.delivery;
  const response = await received;
  expect(response.status()).toBe(200);
  expect(await response.finished()).toBeNull();
  await page.clock.fastForward(50);
}

test('production horse save deadline preserves the draft, ignores a late ack and permits a confirmed retry', async ({ page }) => {
  const writes = [];
  const horses = [{ ...horseRow }];
  const late = delayedAcknowledgement();
  const fixture = await offlineSession(page, {
    horses,
    save: (route, body) => {
      writes.push(body);
      const acknowledgement = { ...horseRow, ...body };
      if (writes.length === 1) return late.hold(route, acknowledgement);
      horses[0] = acknowledgement;
      return route.fulfill({ json: acknowledgement, headers: cors });
    },
  });
  await page.getByText(horseRow.name, { exact: true }).click();
  const name = page.getByPlaceholder('Namn', { exact: true });
  const note = page.getByPlaceholder('Anteckning (t.ex. temperament, viktiga behov)', { exact: true });
  await name.fill('Offline Häst ändrad');
  await note.fill('Utkastet ska finnas kvar');
  await page.getByRole('button', { name: 'Uppdatera häst', exact: true }).click();
  try {
    await expect.poll(() => writes.length).toBe(1);
    await expect(page.getByRole('button', { name: 'Sparar…', exact: true })).toBeDisabled();
    await expect(name).not.toBeEditable();
    await page.clock.fastForward(15_010);
    const error = page.getByRole('alert').filter({ hasText: 'Sparningen kunde inte bekräftas.' });
    await expect(error).toContainText('Dina uppgifter finns kvar. Uppdatera hästlistan innan du försöker igen.');
    await expect(name).toHaveValue('Offline Häst ändrad');
    await expect(note).toHaveValue('Utkastet ska finnas kvar');
    await expect(name).toBeEditable();
    await expect(page.getByRole('button', { name: 'Uppdatera häst', exact: true })).toBeEnabled();
    await deliverLate(page, late, 'PATCH');
    await expect(error).toBeVisible();
    await expect(page.getByText(horseRow.name, { exact: true })).toBeVisible();
    await expect(page.getByText('Offline Häst ändrad', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Häst uppdaterad.', { exact: true })).toHaveCount(0);
    await expect(name).toHaveValue('Offline Häst ändrad');
    await page.getByRole('button', { name: 'Uppdatera häst', exact: true }).click();
    await expect.poll(() => writes.length).toBe(2);
    await expect(page.getByText('Offline Häst ändrad', { exact: true })).toBeVisible();
    await expect(name).toHaveValue('');
    await expect(note).toHaveValue('');
    expect(writes.every(row => row.id === horseId && row.stable_id === stableId)).toBe(true);
    expect(writes[1]).toEqual(writes[0]);
    expect(fixture.blockedWrites).toEqual([]);
  } finally { late.release(); }
});

test('production horse delete deadline keeps the horse, ignores a late ack and permits a confirmed retry', async ({ page }) => {
  const deletes = [];
  // Keep another horse so a successful delete does not restart onboarding.
  const remainingHorse = { ...horseRow, id: '61000000-0000-4000-8000-000000000002', name: 'Offline Häst kvar' };
  const horses = [{ ...horseRow }, remainingHorse];
  const late = delayedAcknowledgement();
  const fixture = await offlineSession(page, {
    horses,
    remove: (route, url) => {
      deletes.push({ id: url.searchParams.get('id'), stableId: url.searchParams.get('stable_id') });
      if (deletes.length === 1) return late.hold(route, [{ id: horseId }]);
      horses.splice(0, 1);
      return route.fulfill({ json: [{ id: horseId }], headers: cors });
    },
  });
  const remove = page.getByRole('button', { name: `Ta bort ${horseRow.name}`, exact: true });
  page.once('dialog', dialog => dialog.accept());
  await remove.click();
  try {
    await expect.poll(() => deletes.length).toBe(1);
    await expect(page.getByText('Tar bort hästen…', { exact: true })).toBeVisible();
    await expect(remove).toBeDisabled();
    await page.clock.fastForward(15_010);
    const error = page.getByRole('alert').filter({ hasText: 'Borttagningen kunde inte bekräftas.' });
    await expect(error).toContainText('Uppdatera hästlistan innan du försöker igen.');
    await expect(page.getByText(horseRow.name, { exact: true })).toBeVisible();
    await expect(remove).toBeEnabled();
    await deliverLate(page, late, 'DELETE');
    await expect(error).toBeVisible();
    await expect(page.getByText(horseRow.name, { exact: true })).toBeVisible();
    await expect(remove).toBeEnabled();
    await expect(page.getByText('Häst borttagen.', { exact: true })).toHaveCount(0);
    page.once('dialog', dialog => dialog.accept());
    await remove.click();
    await expect.poll(() => deletes.length).toBe(2);
    await expect(page.getByText(horseRow.name, { exact: true })).toHaveCount(0);
    await expect(remove).toHaveCount(0);
    await expect(page.getByText(remainingHorse.name, { exact: true })).toBeVisible();
    expect(deletes).toEqual(Array(2).fill({ id: `eq.${horseId}`, stableId: `eq.${stableId}` }));
    expect(fixture.blockedWrites).toEqual([]);
  } finally { late.release(); }
});
