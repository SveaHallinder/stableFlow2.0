import { expect, test } from '@playwright/test';
import { URL } from 'node:url';

test.use({ trace: 'off', viewport: { width: 390, height: 844 } });
const postId = 'cd48b53a-43b6-4a4f-9576-72d04837f5bd';

async function mockPostsAndLogin(page) {
  let post;
  await page.route('**/rest/v1/profiles*', route => route.request().method() === 'GET'
    ? route.continue() : route.abort('blockedbyclient'));
  await page.route('**/rest/v1/posts*', route => {
    const request = route.request();
    if (request.method() !== 'GET') return route.abort('blockedbyclient');
    const url = new URL(request.url());
    const stableId = url.searchParams.get('stable_id')?.match(/[0-9a-f-]{36}/i)?.[0];
    if (stableId) post = { id: postId, stable_id: stableId, user_id: null, content: 'QA kommentar och gilla',
      group_ids: [`stable:${stableId}`], created_at: '2026-09-08T15:00:00Z', image_url: null };
    return route.fulfill({ json: url.searchParams.has('id') ? { id: postId } : [post] });
  });
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
  await page.goto('/feed');
  await expect(page.getByText('QA kommentar och gilla', { exact: true })).toBeVisible({ timeout: 20_000 });
}

test('comment keeps its draft on failure and edited retry recovers the original comment ID', async ({ page }) => {
  let release;
  let saved;
  let inserts = 0;
  const ids = [];
  const updates = [];
  await page.route('**/rest/v1/likes*', route => route.request().method() === 'GET'
    ? route.fulfill({ json: [] }) : route.abort('blockedbyclient'));
  await page.route('**/rest/v1/comments*', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: new URL(request.url()).searchParams.has('id') ? saved : [] });
    const payload = request.postDataJSON();
    if (request.method() === 'POST') {
      inserts += 1;
      ids.push(payload.id);
      if (inserts === 1) {
        saved = { ...payload, created_at: '2026-09-08T15:01:00Z' };
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      if (inserts === 2) return route.fulfill({ json: [] });
      return route.fulfill({ status: 409, json: { code: '23505', message: 'QA duplicate comment' } });
    }
    if (request.method() === 'PATCH') {
      updates.push(payload);
      saved = { ...saved, ...payload };
      return route.fulfill({ json: saved });
    }
    return route.abort('blockedbyclient');
  });
  await mockPostsAndLogin(page);
  await page.getByRole('button', { name: 'Kommentera', exact: true }).click();
  const text = page.getByPlaceholder('Skriv en kommentar...');
  await text.fill('QA behåll min kommentar');
  const submit = page.getByRole('button', { name: 'Skicka kommentar', exact: true });
  await submit.click();
  try {
    await expect.poll(() => inserts).toBe(1);
    await expect(submit).toBeDisabled();
    await expect(text).toHaveValue('QA behåll min kommentar');
    await expect(page.getByRole('button', { name: 'Kommentera', exact: true })).toBeDisabled();
  } finally { release?.(); }
  const error = page.getByRole('alert').filter({ hasText: 'Kommentaren kunde inte sparas' });
  await expect(error).toBeVisible();
  await submit.click();
  await expect.poll(() => inserts).toBe(2);
  await expect(error).toBeVisible();
  await text.fill('QA ändrad kommentar efter tappat svar');
  await submit.click();
  await expect.poll(() => updates.length).toBe(1);
  await expect(text).toHaveCount(0);
  await expect(page.getByText('QA ändrad kommentar efter tappat svar', { exact: true })).toHaveCount(1);
  expect(new Set(ids).size).toBe(1);
  expect(updates).toEqual([{ content: 'QA ändrad kommentar efter tappat svar' }]);
});

test('like and unlike stay unchanged until acknowledged and retry safely after lost responses', async ({ page }) => {
  let release;
  let stored;
  let inserts = 0;
  let deletes = 0;
  await page.route('**/rest/v1/comments*', route => route.request().method() === 'GET'
    ? route.fulfill({ json: [] }) : route.abort('blockedbyclient'));
  await page.route('**/rest/v1/likes*', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      const exact = new URL(request.url()).searchParams.get('user_id')?.startsWith('eq.');
      return route.fulfill({ json: exact ? stored ?? null : [] });
    }
    if (request.method() === 'POST') {
      inserts += 1;
      if (inserts === 1) {
        stored = request.postDataJSON();
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      return route.fulfill({ status: 409, json: { code: '23505', message: 'QA duplicate like' } });
    }
    if (request.method() === 'DELETE') {
      deletes += 1;
      stored = null;
      if (deletes === 1) {
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      return route.fulfill({ json: [] });
    }
    return route.abort('blockedbyclient');
  });
  await mockPostsAndLogin(page);
  const like = page.getByRole('button', { name: 'Gilla inlägg', exact: true });
  await like.click();
  try {
    await expect.poll(() => inserts).toBe(1);
    await expect(like).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Ta bort gilla', exact: true })).toHaveCount(0);
  } finally { release?.(); }
  const error = page.getByRole('alert').filter({ hasText: 'Gillningen kunde inte sparas' });
  await expect(error).toBeVisible();
  await like.click();
  const unlike = page.getByRole('button', { name: 'Ta bort gilla', exact: true });
  await expect(unlike).toBeVisible();
  await unlike.click();
  try {
    await expect.poll(() => deletes).toBe(1);
    await expect(unlike).toBeDisabled();
  } finally { release?.(); }
  await expect(error).toBeVisible();
  await unlike.click();
  await expect(like).toBeVisible();
  expect(deletes).toBe(2);
});
