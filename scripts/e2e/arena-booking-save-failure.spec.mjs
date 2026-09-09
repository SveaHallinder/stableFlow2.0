import { expect, test } from '@playwright/test';

test.use({ trace: 'off', viewport: { width: 390, height: 844 } });

test('arena booking keeps its draft after lost acknowledgement and retains failed cancellation', async ({ page }) => {
  let release;
  let saved;
  const writes = [];
  let deletes = 0;
  await page.route('**/rest/v1/arena_bookings*', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: new URL(request.url()).searchParams.has('id') ? saved : saved ? [saved] : [] });
    if (request.method() === 'DELETE') {
      deletes++;
      if (deletes === 1) return route.abort('failed');
      return route.fulfill({ json: [{ id: saved.id }] });
    }
    if (request.method() !== 'POST') return route.abort('blockedbyclient');
    const payload = request.postDataJSON();
    writes.push(payload);
    if (writes.length === 1) {
      saved = { ...payload, start_time: `${payload.start_time}:00`, end_time: `${payload.end_time}:00` };
      await new Promise(resolve => { release = resolve; });
      return route.abort('failed');
    }
    return route.fulfill({ status: 409, json: { code: '23505', message: 'QA already stored' } });
  });
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
  await page.goto('/calendar');
  await page.getByRole('button', { name: 'Ridhus', exact: true }).click();
  await page.getByRole('button', { name: 'Ny bokning', exact: true }).first().click();
  const purpose = page.getByPlaceholder('Dressyrträning', { exact: true });
  await purpose.fill('QA bokning med nätfel');
  await page.getByPlaceholder('17:00', { exact: true }).fill('17:00');
  await page.getByPlaceholder('18:00', { exact: true }).fill('18:00');
  await page.getByText('Skapa', { exact: true }).click();
  try {
    await expect.poll(() => Boolean(release)).toBe(true);
    await expect(purpose).toHaveValue('QA bokning med nätfel');
    await expect(purpose).not.toBeEditable();
    await expect(page.getByText('Sparar…', { exact: true })).toBeVisible();
  } finally { release?.(); }
  await expect(page.getByRole('alert').filter({ hasText: 'Bokningen kunde inte sparas' })).toBeVisible();
  await page.getByText('Skapa', { exact: true }).click();
  await expect(purpose).toHaveCount(0);
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  const cancel = page.getByRole('button', { name: 'Avboka QA bokning med nätfel', exact: true });
  page.once('dialog', dialog => dialog.dismiss());
  await cancel.click();
  expect(deletes).toBe(0);
  page.once('dialog', dialog => dialog.accept());
  await cancel.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Bokningen kunde inte tas bort' })).toBeVisible();
  await expect(cancel).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await cancel.click();
  await expect(cancel).toHaveCount(0);
  expect(deletes).toBe(2);
});
