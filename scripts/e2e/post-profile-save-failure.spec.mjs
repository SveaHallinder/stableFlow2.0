import { expect, test } from '@playwright/test';
import { URL } from 'node:url';

test.use({ trace: 'off', viewport: { width: 1280, height: 900 } });

async function login(page) {
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
}

test('post publishing retains draft through failed and empty acknowledgements with one request ID', async ({ page }) => {
  let release;
  let writes = 0;
  const ids = [];
  await page.route('**/rest/v1/profiles*', route => route.request().method() === 'GET'
    ? route.continue() : route.abort('blockedbyclient'));
  await page.route('**/rest/v1/posts*', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: [] });
    if (request.method() !== 'POST') return route.abort('blockedbyclient');
    writes += 1;
    const payload = request.postDataJSON();
    ids.push(payload.id);
    if (writes === 1) {
      await new Promise(resolve => { release = resolve; });
      return route.abort('failed');
    }
    if (writes === 2) return route.fulfill({ json: [] });
    return route.fulfill({ json: { ...payload, created_at: '2026-09-08T13:00:00Z' } });
  });
  await login(page);
  await page.goto('/feed');
  const content = page.getByPlaceholder('Vad behöver alla veta idag?');
  await content.fill('QA behåll stalluppdateringen');
  const publish = page.getByRole('button', { name: 'Publicera inlägg', exact: true });
  await publish.click();
  try {
    await expect.poll(() => writes).toBe(1);
    await expect(publish).toBeDisabled();
    await expect(content).toHaveValue('QA behåll stalluppdateringen');
    await expect(page.getByText('Inlägget är publicerat.', { exact: true })).toHaveCount(0);
  } finally { release?.(); }
  const error = page.getByRole('alert').filter({ hasText: 'Inlägget kunde inte publiceras' });
  await expect(error).toBeVisible();
  await publish.click();
  await expect.poll(() => writes).toBe(2);
  await expect(error).toBeVisible();
  await expect(content).toHaveValue('QA behåll stalluppdateringen');
  await publish.click();
  await expect.poll(() => writes).toBe(3);
  await expect(content).toHaveValue('');
  expect(new Set(ids).size).toBe(1);
  await expect(page.getByText('QA behåll stalluppdateringen', { exact: true })).toHaveCount(1);
});

test('own profile retains changes on failure and waits for the confirmed row', async ({ page }) => {
  let release;
  let writes = 0;
  await page.route('**/rest/v1/posts*', route => route.request().method() === 'GET'
    ? route.fulfill({ json: [] }) : route.abort('blockedbyclient'));
  await page.route('**/rest/v1/profiles*', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.continue();
    if (request.method() !== 'PATCH') return route.abort('blockedbyclient');
    const payload = request.postDataJSON();
    const id = new URL(request.url()).searchParams.get('id')?.replace(/^eq\./, '');
    if (!('full_name' in payload)) return route.fulfill({ json: { id, ...payload } });
    writes += 1;
    if (writes === 1) {
      await new Promise(resolve => { release = resolve; });
      return route.abort('failed');
    }
    if (writes === 2) return route.fulfill({ json: [] });
    return route.fulfill({ json: { id, ...payload } });
  });
  await login(page);
  await page.goto('/settings/account');
  const name = page.getByPlaceholder('Ditt namn', { exact: true });
  await expect(name).not.toHaveValue('');
  await name.fill('QA bevarad profil');
  const save = page.getByText('Spara ändringar', { exact: true });
  await save.click();
  try {
    await expect.poll(() => writes).toBe(1);
    await expect(page.getByText('Sparar profil…', { exact: true })).toBeVisible();
    await expect(name).toHaveValue('QA bevarad profil');
    await expect(page.getByText('Uppgifter sparade.', { exact: true })).toHaveCount(0);
  } finally { release?.(); }
  const error = page.getByRole('alert').filter({ hasText: 'Profilen kunde inte sparas' });
  await expect(error).toBeVisible();
  await save.click();
  await expect.poll(() => writes).toBe(2);
  await expect(error).toBeVisible();
  await expect(name).toHaveValue('QA bevarad profil');
  await save.click();
  await expect.poll(() => writes).toBe(3);
  await expect(page.getByText('Uppgifter sparade.', { exact: true })).toBeVisible();
  await expect(name).toHaveValue('QA bevarad profil');
});

test('mobile post retry permits an edited draft after lost acknowledgement and locks stable switching', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release;
  let persisted;
  let inserts = 0;
  const updates = [];
  const ids = [];
  await page.route('**/rest/v1/profiles*', route => route.request().method() === 'GET'
    ? route.continue() : route.abort('blockedbyclient'));
  await page.route('**/rest/v1/posts*', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({ json: new URL(request.url()).searchParams.has('id') ? persisted : [] });
    }
    if (request.method() === 'POST') {
      const payload = request.postDataJSON();
      ids.push(payload.id);
      inserts += 1;
      if (inserts === 1) {
        persisted = { ...payload, created_at: '2026-09-08T13:00:00Z' };
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      return route.fulfill({ status: 409, json: { code: '23505', message: 'QA duplicate receipt' } });
    }
    if (request.method() === 'PATCH') {
      const payload = request.postDataJSON();
      updates.push(payload);
      persisted = { ...persisted, ...payload };
      return route.fulfill({ json: persisted });
    }
    return route.abort('blockedbyclient');
  });
  await login(page);
  await page.goto('/feed');
  await page.getByRole('button', { name: 'Skriv nytt inlägg', exact: true }).click();
  const content = page.getByPlaceholder('Vad behöver alla veta idag?');
  await content.fill('QA original före tappad kvittens');
  await page.getByRole('button', { name: 'Publicera inlägg', exact: true }).click();
  try {
    await expect.poll(() => inserts).toBe(1);
    const stableButtons = page.getByRole('button', { name: /^Byt till / });
    await expect(stableButtons.first()).toBeVisible();
    for (const button of await stableButtons.all()) await expect(button).toBeDisabled();
  } finally { release?.(); }
  await expect(page.getByRole('alert').filter({ hasText: 'Inlägget kunde inte publiceras' })).toBeVisible();
  await content.fill('QA redigerat efter tappad kvittens');
  await page.getByRole('button', { name: 'Publicera inlägg', exact: true }).click();
  await expect.poll(() => updates.length).toBe(1);
  await expect(page.getByText('QA redigerat efter tappad kvittens', { exact: true })).toHaveCount(1);
  expect(new Set(ids).size).toBe(1);
  expect(Object.keys(updates[0]).sort()).toEqual(['content', 'group_ids', 'image_url', 'media_type']);
});
