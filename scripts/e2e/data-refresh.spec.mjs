import { expect, test } from '@playwright/test';

test('refresh shows another phone’s feed check and preserves it when the next read fails', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
  await page.goto('/stable-horses');
  await page.getByRole('button', { name: 'Status för StableFlow QA Horse', exact: true }).click();
  await expect(page.getByText('Foderplan', { exact: true })).toBeVisible();
  const horseId = new URL(page.url()).pathname.split('/').pop();
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  let fail = false;
  await page.route('**/rest/v1/feed_checks*', (route) => {
    if (fail) return route.fulfill({ status: 503, json: { message: 'QA unavailable' } });
    return route.fulfill({ json: [{
      id: '00e9a4e4-d2b9-4b16-a434-2721c74a44da',
      stable_id: '6eb197a3-0be8-4d8a-a3f3-fe04718c26b7', horse_id: horseId,
      date, slot: 'lunch', checked_at: today.toISOString(), deviation_note: 'QA från annan telefon',
    }] });
  });
  await page.getByRole('button', { name: 'Uppdatera stalldata', exact: true }).click();
  await expect(page.getByText(/QA från annan telefon/).first()).toBeVisible();
  fail = true;
  await page.getByRole('button', { name: 'Uppdatera stalldata', exact: true }).click();
  await expect(page.getByText('Kunde inte uppdatera stalldata. Försök igen.', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/QA från annan telefon/).first()).toBeVisible();
});

test('a failed member read preserves the directory and never reopens default passes', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
  let writes = 0;
  await page.route('**/rest/v1/assignments*', route => {
    if (route.request().method() === 'GET') return route.continue();
    writes += 1;
    return route.abort('blockedbyclient');
  });
  await page.route('**/rest/v1/stable_members*', route => {
    if (new URL(route.request().url()).searchParams.has('stable_id')) {
      return route.fulfill({ status: 503, json: { message: 'QA member read failure' } });
    }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Uppdatera stalldata', exact: true }).click();
  await expect(page.getByText('Kunde inte uppdatera stalldata. Försök igen.', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible();
  expect(writes).toBe(0);
});

test('refresh waits for a pending contact save and recovers when it settles', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
  await page.goto('/contacts');
  let release;
  let reads = 0;
  await page.route('**/rest/v1/external_contacts*', async route => {
    if (route.request().method() === 'GET') { reads += 1; return route.continue(); }
    await new Promise(resolve => { release = resolve; });
    return route.fulfill({ status: 200, json: [] });
  });
  await page.getByRole('button', { name: 'Lägg till kontakt', exact: true }).click();
  await page.getByRole('textbox', { name: 'Namn', exact: true }).fill('QA pending contact');
  await page.getByText('Spara kontakt', { exact: true }).click();
  try {
    await expect.poll(() => Boolean(release)).toBe(true);
    const baselineReads = reads;
    await page.getByRole('button', { name: 'Uppdatera stalldata', exact: true }).click();
    await expect(page.getByText('En ändring sparas. Vänta ett ögonblick och uppdatera igen.', { exact: true })).toBeVisible();
    expect(reads).toBe(baselineReads);
  } finally {
    release?.();
  }
  await page.getByRole('button', { name: 'Uppdatera stalldata', exact: true }).click();
  await expect.poll(() => reads).toBeGreaterThan(0);
  await expect(page.getByText('En ändring sparas. Vänta ett ögonblick och uppdatera igen.', { exact: true })).toHaveCount(0);
});
