import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('settings retain intent after failure and preserve another phone’s changes after refresh', async ({ page }) => {
  const loaded = page.waitForResponse(response => new URL(response.url()).pathname === '/rest/v1/stables' && response.request().method() === 'GET');
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  let server = (await (await loaded).json())[0];
  await expect(page.getByText(server.name).first()).toBeVisible({ timeout: 20_000 });
  const target = server.settings?.dayLogic === 'loose' ? 'box' : 'loose';
  let release;
  const writes = [];
  const filters = [];
  await page.route('**/rest/v1/stables*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET') return route.fulfill({ json: url.searchParams.get('id')?.startsWith('eq.') ? server : [server] });
    if (request.method() !== 'PATCH') return route.abort('blockedbyclient');
    const payload = request.postDataJSON();
    writes.push(payload);
    filters.push(url.searchParams.get('settings'));
    if (writes.length === 1) {
      await new Promise(resolve => { release = resolve; });
      return route.abort('failed');
    }
    server = { ...server, ...payload };
    return route.fulfill({ json: server });
  });
  await page.goto('/stables');
  await page.getByText(target === 'loose' ? 'Lösdrift' : 'Boxhästar', { exact: true }).click();
  await page.getByText('Spara inställningar', { exact: true }).click();
  try {
    await expect.poll(() => Boolean(release)).toBe(true);
    await expect(page.getByText('Sparar…', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Stallinställningar sparade.', { exact: true })).toHaveCount(0);
  } finally { release?.(); }
  await expect(page.getByRole('alert').filter({ hasText: 'Stalluppgifterna kunde inte sparas' })).toBeVisible();
  const feeding = !(server.settings?.eventVisibility?.feeding ?? true);
  server = { ...server, settings: { ...server.settings, eventVisibility: { ...server.settings?.eventVisibility, feeding } } };
  await page.getByText('Spara inställningar', { exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Stallet har ändrats på en annan telefon' })).toBeVisible();
  expect(writes).toHaveLength(1);
  const read = page.waitForResponse(response => new URL(response.url()).pathname === '/rest/v1/stables' && response.request().method() === 'GET');
  await page.getByRole('button', { name: 'Uppdatera stalldata', exact: true }).click();
  await read;
  await expect(page.getByText('Hämtar senaste…', { exact: true })).toHaveCount(0);
  await page.getByText('Spara inställningar', { exact: true }).click();
  await expect(page.getByText('Stallinställningar sparade.', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[1].settings.dayLogic).toBe(target);
  expect(writes[1].settings.eventVisibility.feeding).toBe(feeding);
  expect(filters[1]).toBeTruthy();
});
