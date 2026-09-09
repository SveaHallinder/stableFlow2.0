import { expect, test } from '@playwright/test';

test.use({ trace: 'off', viewport: { width: 390, height: 844 } });
async function login(page) {
  const stables = page.waitForResponse(response => new URL(response.url()).pathname === '/rest/v1/stables' && response.request().method() === 'GET');
  const members = page.waitForResponse(response => new URL(response.url()).pathname === '/rest/v1/stable_members' && response.request().method() === 'GET');
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  const rows = await (await stables).json();
  const memberships = await (await members).json();
  await expect(page.getByText('StableFlow QA Stable', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Hämtar ditt stall…', { exact: true })).toHaveCount(0);
  return { stable: rows.find(row => row.name === 'StableFlow QA Stable'), memberships };
}

test('farm creation retains its draft and reuses the confirmed farm after a lost acknowledgement', async ({ page }) => {
  const { stable, memberships } = await login(page);
  const secondId = 'b24c299a-3d19-4d8f-b3c4-f2ad7c4f1f17';
  const writes = [];
  let farm;
  let release;
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').pop();
    if (url.pathname.endsWith('/rpc/get_member_directory')) return route.continue();
    if (request.method() === 'GET') {
      if (table === 'stables') return route.fulfill({ json: [stable, { ...stable, id: secondId, name: 'QA Extra stall' }] });
      if (table === 'stable_members') return route.fulfill({ json: [...memberships, { ...memberships[0], stable_id: secondId }] });
      if (table === 'farms') return route.fulfill({ json: url.searchParams.get('id')?.startsWith('eq.') ? writes.length === 2 ? null : farm : [] });
      return route.continue();
    }
    if (table !== 'farms' || request.method() !== 'POST') return route.abort('blockedbyclient');
    writes.push(request.postDataJSON());
    if (farm) return route.fulfill({ status: 409, json: { code: '23505' } });
    farm = writes[0];
    await new Promise(resolve => { release = resolve; });
    return route.abort('failed');
  });
  await page.goto('/stables');
  const form = page.getByText('Lägg till gård', { exact: true }).locator('..');
  const name = form.getByPlaceholder('Namn', { exact: true });
  await name.fill('QA Ny gård');
  await form.getByPlaceholder('Plats (valfritt)').fill('Skåne');
  const save = page.getByText('Spara gård', { exact: true });
  await save.click();
  try {
    await expect.poll(() => writes.length).toBe(1);
    await expect(page.getByText('Sparar gården…', { exact: true })).toBeVisible();
    await expect(name).toHaveValue('QA Ny gård');
    await expect(name).not.toBeEditable();
  } finally { release?.(); }
  const error = page.getByText('Gården kunde inte sparas. Dina uppgifter finns kvar. Försök igen.', { exact: true });
  await expect(error).toBeVisible();
  await save.click();
  await expect.poll(() => writes.length).toBe(2);
  await expect(error).toBeVisible();
  await save.click();
  await expect.poll(() => writes.length).toBe(3);
  await expect(name).toHaveValue('');
  expect(new Set(writes.map(row => row.id)).size).toBe(1);
  await expect(page.getByText('Gård skapad.', { exact: true }).filter({ visible: true })).toBeVisible();
});

test('farm resource onboarding keeps its choices until farm and stable settings are acknowledged', async ({ page }) => {
  const { stable: original, memberships } = await login(page);
  const farm = { id: 'bafe39c0-3430-4939-82ed-49e12ca7a0da', name: 'QA Resursgård', location: 'Behåll plats', has_indoor_arena: false, arena_note: 'Behåll info', created_by: memberships[0].user_id };
  let stable = { ...original, farm_id: farm.id, settings: { ...original.settings, arena: { ...original.settings?.arena, hasArena: false, hasRoundPen: true } } };
  const farmWrites = [];
  let stableWrites = 0;
  let release;
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').pop();
    if (url.pathname.endsWith('/rpc/get_member_directory')) return route.continue();
    if (request.method() === 'GET') {
      if (table === 'stables') return route.fulfill({ json: url.searchParams.get('id')?.startsWith('eq.') ? stable : [stable] });
      if (table === 'farms') return route.fulfill({ json: [farm] });
      return route.continue();
    }
    if (request.method() === 'PATCH' && table === 'farms') {
      const payload = request.postDataJSON();
      farmWrites.push(payload);
      expect(url.searchParams.get('created_by')).toBe(`eq.${farm.created_by}`);
      if (farmWrites.length === 1) { await new Promise(resolve => { release = resolve; }); return route.abort('failed'); }
      Object.assign(farm, payload);
      return route.fulfill({ json: farm });
    }
    if (request.method() === 'PATCH' && table === 'stables') {
      stableWrites++;
      if (stableWrites === 1) return route.fulfill({ json: null });
      stable = { ...stable, ...request.postDataJSON() };
      return route.fulfill({ json: stable });
    }
    return route.abort('blockedbyclient');
  });
  await page.goto('/arena?returnTo=/stables');
  await page.getByText('Har gården ridhus', { exact: true }).locator('..').getByText('Ja', { exact: true }).click();
  const save = page.getByText('Spara och fortsätt', { exact: true });
  await save.click();
  try {
    await expect.poll(() => farmWrites.length).toBe(1);
    await expect(page.getByText('Sparar...', { exact: true })).toBeVisible();
  } finally { release?.(); }
  await expect(page.getByRole('alert')).toContainText('Gården kunde inte sparas');
  await save.click();
  await expect.poll(() => stableWrites).toBe(1);
  await expect(page.getByRole('alert')).toContainText('Stalluppgifterna kunde inte sparas');
  await save.click();
  await expect.poll(() => stableWrites).toBe(2);
  await expect(page).toHaveURL(/\/stables$/);
  expect(farmWrites.every(payload => JSON.stringify(payload) === JSON.stringify({ has_indoor_arena: true }))).toBe(true);
  expect(stable.settings.arena.hasArena).toBe(true);
  expect(stable.settings.arena.hasRoundPen).toBe(true);
  expect(farm.arena_note).toBe('Behåll info');
});
