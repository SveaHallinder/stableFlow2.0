import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('horse status remains unmarked when saving fails', async ({ page }) => {
  let release;
  await page.route('**/rest/v1/horse_day_statuses*', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    await new Promise((resolve) => { release = resolve; });
    return route.abort('failed');
  });
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
  await page.goto('/stable-horses');
  await page.getByRole('button', { name: 'Status för StableFlow QA Horse', exact: true }).click();
  const hayRow = page.getByText('Hö', { exact: true }).locator('..');
  await hayRow.getByText('Markera', { exact: true }).click();
  try {
    await expect(page.getByText('Sparar status…', { exact: true })).toBeVisible();
    await expect(hayRow.getByText('Klart', { exact: true })).toHaveCount(0);
  } finally {
    release?.();
  }
  await expect(page.getByText('Häststatus kunde inte sparas. Försök igen.', { exact: true }).first()).toBeVisible();
  await expect(hayRow.getByText('Markera', { exact: true })).toBeVisible();
  await expect(page.getByText('Status uppdaterad.', { exact: true })).toHaveCount(0);
});

test('marking hay preserves water changed by another phone', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
  const loaded = page.waitForResponse((response) =>
    response.url().includes('/rest/v1/horse_day_statuses') && response.request().method() === 'GET',
  );
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  const initial = await loaded;
  const initialRows = await initial.json();
  const rawHeaders = await initial.request().allHeaders();
  const headers = { apikey: rawHeaders.apikey, authorization: rawHeaders.authorization };
  const endpoint = `${new URL(initial.url()).origin}/rest/v1/horse_day_statuses`;
  await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible();
  await page.goto('/stable-horses');
  await page.getByRole('button', { name: 'Status för StableFlow QA Horse', exact: true }).click();
  const horseId = new URL(page.url()).pathname.split('/').pop();
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const stableId = '6eb197a3-0be8-4d8a-a3f3-fe04718c26b7';
  const original = initialRows.find((row) => row.horse_id === horseId && row.date === date);
  const water = !original?.water;
  try {
    const external = await page.request.post(`${endpoint}?on_conflict=stable_id,horse_id,date`, {
      headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
      data: { ...(original ?? { id: randomUUID(), stable_id: stableId, horse_id: horseId, date }), water },
    });
    expect(external.ok()).toBe(true);
    const write = page.waitForResponse((response) =>
      response.url().includes('/rest/v1/horse_day_statuses') && response.request().method() === 'POST',
    );
    await page.getByRole('checkbox', { name: 'Hö', exact: true }).click();
    const response = await write;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()).not.toHaveProperty('water');
    expect(await response.json()).toMatchObject({ water, hay: !original?.hay });
    await expect(page.getByRole('checkbox', { name: 'Vatten', exact: true })).toHaveAttribute('aria-checked', String(water));
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Vatten', exact: true })).toHaveAttribute('aria-checked', String(water));
  } finally {
    const response = original
      ? await page.request.post(`${endpoint}?on_conflict=stable_id,horse_id,date`, {
        headers: { ...headers, Prefer: 'resolution=merge-duplicates' }, data: original,
      })
      : await page.request.delete(`${endpoint}?stable_id=eq.${stableId}&horse_id=eq.${horseId}&date=eq.${date}`, { headers });
    expect(response.ok(), 'Restore the QA horse status').toBe(true);
    const restored = await page.request.get(`${endpoint}?horse_id=eq.${horseId}&date=eq.${date}`, { headers });
    expect(await restored.json()).toEqual(original ? [original] : []);
  }
});
