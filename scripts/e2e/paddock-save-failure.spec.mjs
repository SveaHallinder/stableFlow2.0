import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';

test.use({ trace: 'off', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const stableId = '60000000-0000-4000-8000-000000000001';
const ownerId = '60000000-0000-4000-8000-000000000002';
const horseId = '61000000-0000-4000-8000-000000000001';
const twinId = '62000000-0000-4000-8000-000000000002';
const timestamp = '2026-10-06T07:00:00Z';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cors = {
  'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

// Normal Auth/refresh/persistence runs against synthetic responses. All route
// handlers and WebSocket blocks are installed before any page is opened.
async function offlineSession(page, { paddocks = [], save, remove } = {}) {
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
    horses: [
      { id: horseId, stable_id: stableId, name: 'Saga', box_number: 'B1', owner_user_id: ownerId, can_sleep_inside: true },
      { id: twinId, stable_id: stableId, name: 'Saga', box_number: 'B2', owner_user_id: ownerId, can_sleep_inside: true },
    ],
    paddocks,
    assignments: [{ id: '63000000-0000-4000-8000-000000000001', stable_id: stableId, date: '2026-10-06', label: 'Offline Morgonfodring', slot: 'Morning', icon: 'sun', time: '07:00', status: 'open' }],
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
    const respond = (json, status = 200) => route.fulfill({ status, json, headers: cors });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/auth/v1/token' && request.method() === 'POST') {
      return respond({ access_token: token, refresh_token: 'offline-refresh', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user });
    }
    if (url.pathname === '/auth/v1/user' && request.method() === 'GET') return respond(user);
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
    if (request.method() === 'POST' && rpc === 'accept_pending_invites') return respond([]);
    if (request.method() === 'POST' && rpc === 'get_member_directory') return respond([profile]);
    if (request.method() === 'POST' && rpc === 'save_paddock' && save) return save(route, request.postDataJSON());
    if (request.method() === 'POST' && rpc === 'delete_paddock' && remove) return remove(route, request.postDataJSON());
    const table = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
    if (request.method() === 'GET' && table) {
      const rows = tables[table] ?? [];
      return respond(request.headers().accept?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows);
    }
    if (!['GET', 'HEAD'].includes(request.method())) blockedWrites.push({ method: request.method(), path: url.pathname });
    return route.abort('blockedbyclient');
  });
  await page.routeWebSocket(/.*/, socket => socket.close());
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill(user.email);
  await page.getByPlaceholder('Minst 8 tecken').fill('OfflineFixture1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect(page.getByText('Stallstatus först', { exact: true })).toBeVisible();
  return { blockedWrites };
}

async function expectSelected(locator, selected) {
  await expect(locator).toHaveAttribute('aria-pressed', String(selected));
}

function saveAcknowledgement(body) {
  return {
    id: body.p_paddock_id, stable_id: body.p_stable_id, name: body.p_name,
    horse_ids: body.p_horse_ids, horse_names: null, season: body.p_season,
    image_url: body.p_image_url, revision: (body.p_expected_revision ?? 0) + 1,
    request_id: body.p_request_id, last_save_request_id: body.p_request_id, updated_at: timestamp,
  };
}

for (const surface of ['paddocks', 'stables', 'admin', 'setup-paddocks']) {
  test(`${surface}: actual RPC preserves draft, IDs and request UUID across failure, missing ack and conflict`, async ({ page }) => {
    const writes = [];
    let release;
    const fixture = await offlineSession(page, {
      save: async (route, body) => {
        writes.push(body);
        if (writes.length === 1) {
          await new Promise(resolve => { release = resolve; });
          return route.abort('failed');
        }
        if (writes.length === 2) return route.fulfill({ json: null, headers: cors });
        if (writes.length === 3) return route.fulfill({ status: 409, json: { code: '40001', message: 'Offline revision conflict' }, headers: cors });
        return route.fulfill({ json: saveAcknowledgement(body), headers: cors });
      },
    });
    await page.goto(`/${surface}`);
    if (surface === 'paddocks') await page.getByText('Lägg till hage', { exact: true }).click();
    const name = page.getByPlaceholder(surface === 'paddocks' ? 'Ex. Hage 3, Gräshage, Paddock vid ridhuset' : surface === 'stables' ? 'Namn eller nummer' : 'Namn på hage');
    await name.fill('Offline Sparad hage');
    const selected = page.getByRole('button', { name: /Saga · Box B1 · Offline Ägare/ });
    const other = page.getByRole('button', { name: /Saga · Box B2 · Offline Ägare/ });
    await selected.click();
    await expectSelected(selected, true);
    await expectSelected(other, false);
    const save = page.getByText(surface === 'paddocks' ? 'Spara' : surface === 'admin' ? 'Skapa hage' : 'Spara hage', { exact: true }).last();
    await save.click();
    try {
      await expect.poll(() => writes.length).toBe(1);
      await expect(name).toHaveValue('Offline Sparad hage');
      await expect(page.getByText('Sparar hagen…', { exact: true })).toBeVisible();
    } finally { release?.(); }
    const error = page.getByRole('alert').filter({ hasText: /Hagen kunde inte sparas|Hagen har ändrats/ }).first();
    for (let attempt = 1; attempt <= 3; attempt++) {
      await expect(error).toBeVisible();
      await expect(name).toHaveValue('Offline Sparad hage');
      await expectSelected(selected, true);
      await expectSelected(other, false);
      if (attempt === 3) await expect(error).toContainText('Hagen har ändrats');
      await save.click();
      await expect.poll(() => writes.length).toBe(attempt + 1);
    }
    expect(new Set(writes.map(row => row.p_paddock_id)).size).toBe(1);
    expect(new Set(writes.map(row => row.p_request_id)).size).toBe(1);
    for (const row of writes) {
      expect(row.p_paddock_id).toMatch(uuid);
      expect(row.p_request_id).toMatch(uuid);
      expect(row.p_stable_id).toBe(stableId);
      expect(row.p_horse_ids).toEqual([horseId]);
      expect(row.p_expected_revision).toBeNull();
    }
    if (surface === 'paddocks') await expect(name).toHaveCount(0);
    else await expect(name).toHaveValue('');
    expect(fixture.blockedWrites).toEqual([]);
  });
}

test('actual delete RPC confirms intent and requires the captured revision and full ack', async ({ page }) => {
  const row = {
    id: '65000000-0000-4000-8000-000000000001', stable_id: stableId,
    name: 'Offline Hage att ta bort', horse_names: null, revision: 1,
    paddock_horses: [{ horse_id: horseId }], season: 'yearRound', updated_at: timestamp, image_url: null,
  };
  const deletes = [];
  let release;
  const fixture = await offlineSession(page, {
    paddocks: [row],
    remove: async (route, body) => {
      deletes.push(body);
      if (deletes.length === 1) {
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      if (deletes.length === 2) return route.fulfill({ json: null, headers: cors });
      if (deletes.length === 3) return route.fulfill({ status: 409, json: { code: '40001', message: 'Offline revision conflict' }, headers: cors });
      return route.fulfill({ json: { id: row.id, stable_id: stableId, deleted: true, revision: 1 }, headers: cors });
    },
  });
  await page.goto('/paddocks');
  await page.getByText(row.name, { exact: true }).last().click();
  const remove = page.getByText('Ta bort hage', { exact: true });
  await expect(remove).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await remove.click();
  expect(deletes).toHaveLength(0);
  page.once('dialog', dialog => dialog.accept());
  await remove.click();
  try {
    await expect.poll(() => deletes.length).toBe(1);
    await expect(page.getByText('Tar bort hagen…', { exact: true })).toBeVisible();
  } finally { release?.(); }
  const error = page.getByRole('alert').filter({ hasText: /Hagen kunde inte tas bort|Hagen har ändrats/ }).first();
  for (let attempt = 1; attempt <= 3; attempt++) {
    await expect(error).toBeVisible();
    await expect(remove).toBeVisible();
    if (attempt === 3) await expect(error).toContainText('Hagen har ändrats');
    page.once('dialog', dialog => dialog.accept());
    await remove.click();
    await expect.poll(() => deletes.length).toBe(attempt + 1);
  }
  expect(deletes.every(body => body.p_paddock_id === row.id && body.p_stable_id === stableId && body.p_expected_revision === 1)).toBe(true);
  await expect(remove).toHaveCount(0);
  await expect(page.getByText(row.name, { exact: true })).toHaveCount(0);
  expect(fixture.blockedWrites).toEqual([]);
});

test('missing save RPC preserves the draft and selected IDs while disabling further writes', async ({ page }) => {
  const existing = {
    id: '65000000-0000-4000-8000-000000000002', stable_id: stableId,
    name: 'Offline Befintlig hage', horse_names: null, revision: 1,
    paddock_horses: [{ horse_id: horseId }], season: 'yearRound', updated_at: timestamp, image_url: null,
  };
  const writes = [];
  const fixture = await offlineSession(page, {
    paddocks: [existing],
    save: (route, body) => {
      writes.push(body);
      return route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Offline missing save_paddock RPC' }, headers: cors });
    },
  });
  await page.goto('/paddocks');
  await page.getByText('Lägg till hage', { exact: true }).click();
  const name = page.getByPlaceholder('Ex. Hage 3, Gräshage, Paddock vid ridhuset');
  await name.fill('Offline Osparad hage');
  const selected = page.getByRole('button', { name: /^Saga · Box B2 · Offline Ägare/ });
  await selected.click();
  await page.getByText('Spara', { exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Hagkopplingen behöver uppdateras');
  await expect(name).toHaveValue('Offline Osparad hage');
  await expectSelected(selected, true);
  await expect(page.getByText('Spara', { exact: true }).locator('..')).toHaveAttribute('aria-disabled', 'true');
  expect(writes).toHaveLength(1);
  expect(writes[0].p_horse_ids).toEqual([twinId]);
  await page.getByText('Avbryt', { exact: true }).click();
  await expect(page.getByText(existing.name, { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Hästkopplingarna är inte aktiverade ännu. Hagar kan inte skapas, ändras eller tas bort.', { exact: true })).toBeVisible();
  await expect(page.getByText('Lägg till hage', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Spara', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Ta bort hage', { exact: true })).toHaveCount(0);
  expect(fixture.blockedWrites).toEqual([]);
});
