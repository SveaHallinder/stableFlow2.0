import { expect, test } from '@playwright/test';

test.use({ trace: 'off', viewport: { width: 390, height: 844 } });

async function login(page) {
  const loaded = page.waitForResponse(response => response.url().includes('/rest/v1/stables?') && response.request().method() === 'GET');
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await loaded;
  await expect(page.getByText('StableFlow QA Stable', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Hämtar ditt stall…', { exact: true })).toHaveCount(0);
}

for (const surface of ['stables', 'admin', 'create-stable', 'farm']) {
  test(`${surface}: creation recovers the same stable after lost acknowledgement and incomplete owner membership`, async ({ page }) => {
    await login(page);
    let release;
    let stableRow;
    let farmRow;
    const stableWrites = [];
    const farmWrites = [];
    let memberships = 0;
    let chats = 0;
    await page.route('**/rest/v1/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const table = url.pathname.split('/').pop();
      if (url.pathname.endsWith('/rpc/get_member_directory')) return route.continue();
      if (request.method() === 'GET') {
        if (table === 'stables' && stableRow && url.searchParams.get('id') === `eq.${stableRow.id}`) return route.fulfill({ json: stableRow });
        if (table === 'farms' && farmRow && url.searchParams.get('id') === `eq.${farmRow.id}`) return route.fulfill({ json: farmRow });
        return route.continue();
      }
      if (request.method() !== 'POST') return route.abort('blockedbyclient');
      const body = request.postDataJSON();
      if (table === 'farms') {
        farmWrites.push(body);
        if (farmRow) return route.fulfill({ status: 409, json: { code: '23505' } });
        farmRow = body;
        return route.fulfill({ json: body });
      }
      if (table === 'stables') {
        stableWrites.push(body);
        if (stableRow) return route.fulfill({ status: 409, json: { code: '23505' } });
        stableRow = body;
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      if (table === 'stable_members' && body.stable_id === stableRow?.id) {
        memberships++;
        return route.fulfill({ json: memberships === 1 ? null : body });
      }
      if (table === 'conversations' && body.stable_id === stableRow?.id) {
        chats++;
        return route.fulfill({ json: body });
      }
      return route.abort('blockedbyclient');
    });
    await page.goto(`/${surface}`);
    const name = surface === 'stables'
      ? page.getByText('Nytt stall', { exact: true }).locator('..').getByPlaceholder('Namn', { exact: true })
      : page.getByPlaceholder('Stallnamn', { exact: true }).first();
    await name.fill('QA Nytt stall');
    if (surface === 'farm') await page.getByPlaceholder('Namn på gården').fill('QA Ny gård');
    const save = page.getByText(surface === 'farm' ? 'Spara och fortsätt' : surface === 'stables' ? 'Spara stall' : 'Skapa stall', { exact: true }).last();
    await save.click();
    try {
      await expect.poll(() => stableWrites.length).toBe(1);
      await expect(name).toHaveValue('QA Nytt stall');
      await expect(name).not.toBeEditable();
      expect(memberships).toBe(0);
      expect(chats).toBe(0);
    } finally { release?.(); }
    const error = page.getByText('Stallet kunde inte sparas. Dina uppgifter finns kvar. Försök igen.', { exact: true });
    await expect(error).toBeVisible();
    await expect(name).toHaveValue('QA Nytt stall');
    await save.click();
    await expect.poll(() => memberships).toBe(1);
    await expect(error).toBeVisible();
    expect(chats).toBe(0);
    await save.click();
    await expect.poll(() => chats).toBe(1);
    expect(stableWrites.length).toBe(3);
    expect(new Set(stableWrites.map(row => row.id)).size).toBe(1);
    if (surface === 'farm') expect(new Set(farmWrites.map(row => row.id)).size).toBe(1);
    if (surface === 'stables') {
      await expect(page.getByText('Kom igång', { exact: true })).toBeVisible();
      await expect(page.getByText('QA Nytt stall', { exact: true })).toBeVisible();
      await expect(name).toHaveCount(0);
    } else if (surface === 'admin') await expect(name).toHaveValue('');
    else await expect(page).not.toHaveURL(new RegExp(`/${surface}(?:\\?|$)`));
  });
}
