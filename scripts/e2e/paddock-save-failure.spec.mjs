import { expect, test } from '@playwright/test';

test.use({ trace: 'off', viewport: { width: 390, height: 844 } });
const stableId = '6eb197a3-0be8-4d8a-a3f3-fe04718c26b7';

async function login(page) {
  const loaded = page.waitForResponse(response => response.url().includes('/rest/v1/paddocks?') && response.request().method() === 'GET');
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await loaded;
}

for (const surface of ['paddocks', 'stables', 'admin', 'setup-paddocks']) {
  test(`${surface}: paddock save keeps the draft across network failure and missing acknowledgement`, async ({ page }) => {
    await login(page);
    let release;
    const writes = [];
    await page.route('**/rest/v1/paddocks*', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: [] });
      if (!['POST', 'PATCH'].includes(route.request().method())) return route.abort('blockedbyclient');
      const body = route.request().postDataJSON();
      writes.push(body);
      if (writes.length === 1) {
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      return route.fulfill({ json: writes.length === 2 ? null : { ...body, image_url: null } });
    });
    await page.goto(`/${surface}`);
    if (surface === 'paddocks') await page.getByText('Lägg till hage', { exact: true }).click();
    const name = page.getByPlaceholder(surface === 'paddocks' ? 'Ex. Hage 3, Gräshage, Paddock vid ridhuset' : surface === 'stables' ? 'Namn eller nummer' : 'Namn på hage');
    await name.fill('QA Sparad hage');
    const save = page.getByText(surface === 'paddocks' ? 'Spara' : surface === 'admin' ? 'Skapa hage' : 'Spara hage', { exact: true }).last();
    await save.click();
    try {
      await expect.poll(() => writes.length).toBe(1);
      await expect(name).toHaveValue('QA Sparad hage');
      await expect(page.getByText('Sparar hagen…', { exact: true })).toBeVisible();
    } finally { release?.(); }
    const error = page.getByText('Hagen kunde inte sparas. Försök igen.', { exact: true });
    await expect(error).toBeVisible();
    await expect(name).toHaveValue('QA Sparad hage');
    await save.click();
    await expect.poll(() => writes.length).toBe(2);
    await expect(error).toBeVisible();
    await save.click();
    await expect.poll(() => writes.length).toBe(3);
    expect(new Set(writes.map(row => row.id)).size).toBe(1);
    expect(writes.every(row => row.stable_id === stableId)).toBe(true);
    if (surface === 'paddocks') await expect(name).toHaveCount(0);
    else await expect(name).toHaveValue('');
  });
}

test('paddock deletion confirms intent and keeps the editor open until acknowledged', async ({ page }) => {
  await login(page);
  const row = { id: '8e398b8c-0cbd-4f85-bace-0abcb718d852', stable_id: stableId, name: 'QA Hage att ta bort', horse_names: [], season: 'yearRound', updated_at: '2026-09-08T12:00:00Z', image_url: null };
  let release;
  let deletes = 0;
  await page.route('**/rest/v1/paddocks*', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [row] });
    if (route.request().method() !== 'DELETE') return route.abort('blockedbyclient');
    deletes++;
    if (deletes === 1) {
      await new Promise(resolve => { release = resolve; });
      return route.abort('failed');
    }
    return route.fulfill({ json: deletes === 2 ? [] : [{ id: row.id }] });
  });
  await page.goto('/paddocks');
  await page.getByText(row.name, { exact: true }).click();
  const remove = page.getByText('Ta bort hage', { exact: true });
  await expect(remove).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await remove.click();
  expect(deletes).toBe(0);
  page.once('dialog', dialog => dialog.accept());
  await remove.click();
  try {
    await expect.poll(() => deletes).toBe(1);
    await expect(page.getByText('Tar bort hagen…', { exact: true })).toBeVisible();
  } finally { release?.(); }
  const error = page.getByText('Hagen kunde inte tas bort. Försök igen.', { exact: true });
  await expect(error).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await remove.click();
  await expect.poll(() => deletes).toBe(2);
  await expect(error).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await remove.click();
  await expect.poll(() => deletes).toBe(3);
  await expect(remove).toHaveCount(0);
  await expect(page.getByText(row.name, { exact: true })).toHaveCount(0);
});
