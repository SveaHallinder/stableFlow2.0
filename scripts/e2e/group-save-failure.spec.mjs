import { expect, test } from '@playwright/test';
import { URL } from 'node:url';

test.use({ viewport: { width: 390, height: 844 } });

test('groups retain drafts and selected targets until acknowledged; delete asks and retries', async ({ page }) => {
  let saved;
  let release;
  const inserts = [];
  let deletes = 0;
  // All group writes are intercepted, including recovery PATCH after a lost response.
  await page.route('**/rest/v1/groups*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET') return route.fulfill({ json: url.searchParams.get('id')?.startsWith('eq.') ? saved : saved ? [saved] : [] });
    if (request.method() === 'POST') {
      inserts.push(request.postDataJSON());
      if (inserts.length === 1) {
        saved = request.postDataJSON();
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      return route.fulfill({ status: 409, json: { code: '23505', message: 'QA previously saved group' } });
    }
    if (request.method() === 'PATCH') {
      expect(url.searchParams.get('created_by_user_id')).toBe(`eq.${saved.created_by_user_id}`);
      saved = { ...saved, ...request.postDataJSON() };
      return route.fulfill({ json: saved });
    }
    if (request.method() === 'DELETE') {
      deletes += 1;
      if (deletes === 1) {
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      const row = saved;
      saved = undefined;
      return route.fulfill({ json: [{ id: row.id, stable_id: row.stable_id }] });
    }
    return route.abort('blockedbyclient');
  });
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
  await page.goto('/feed');
  const draft = page.getByPlaceholder('Nytt gruppnamn');
  if (!await draft.isVisible()) await page.getByRole('button', { name: 'Skriv nytt inlägg', exact: true }).click();
  await draft.fill('QA grupputkast');
  const create = page.getByRole('button', { name: 'Skapa grupp', exact: true });
  await create.click();
  try {
    await expect.poll(() => Boolean(release)).toBe(true);
    await expect(create).toBeDisabled();
    await expect(draft).toHaveValue('QA grupputkast');
    await expect(page.getByText('Gruppen är skapad.', { exact: true })).toHaveCount(0);
  } finally { release?.(); release = undefined; }
  await expect(page.getByRole('alert').filter({ hasText: 'Gruppen kunde inte sparas' })).toBeVisible();
  await draft.fill('QA grupp efter återförsök');
  await create.click();
  await expect(draft).toHaveValue('');
  expect(inserts).toHaveLength(2);
  expect(inserts[1].id).toBe(inserts[0].id);
  const remove = page.getByRole('button', { name: 'Ta bort grupp QA grupp efter återförsök', exact: true });
  await expect(remove).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await remove.click();
  expect(deletes).toBe(0);
  page.on('dialog', dialog => dialog.accept());
  await remove.click();
  try {
    await expect.poll(() => Boolean(release)).toBe(true);
    await expect(remove).toBeDisabled();
    await expect(page.getByText('Gruppen är borttagen.', { exact: true })).toHaveCount(0);
  } finally { release?.(); release = undefined; }
  await expect(page.getByRole('alert').filter({ hasText: 'Gruppen kunde inte tas bort' })).toBeVisible();
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(remove).toHaveCount(0);
  expect(deletes).toBe(2);
});
