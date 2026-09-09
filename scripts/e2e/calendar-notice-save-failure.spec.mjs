import { expect, test } from '@playwright/test';

test.use({ trace: 'off', viewport: { width: 390, height: 667 } });

for (const kind of ['day', 'status']) {
  test(`calendar ${kind} notice keeps a reachable draft and retries a lost acknowledgement`, async ({ page }) => {
    const table = kind === 'day' ? 'day_events' : 'arena_statuses';
    let release;
    let saved;
    const writes = [];
    await page.route(`**/rest/v1/${table}*`, async route => {
      const request = route.request();
      if (request.method() === 'GET') return route.fulfill({ json: new URL(request.url()).searchParams.has('id') ? saved : [] });
      if (request.method() !== 'POST') return route.abort('blockedbyclient');
      const payload = request.postDataJSON();
      writes.push(payload);
      if (writes.length === 1) {
        saved = { ...payload, created_at: new Date().toISOString() };
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
    await page.getByText(kind === 'day' ? 'Lägg till' : 'Markera', { exact: true }).first().click();
    const modal = page.getByText(kind === 'day' ? 'Ny dagshändelse' : 'Ridhusstatus', { exact: true }).last().locator('..');
    const draft = kind === 'day' ? modal.getByRole('textbox').nth(1) : page.getByPlaceholder('Harvat', { exact: true });
    await draft.fill('QA bevara min text');
    const submit = () => modal.getByText(kind === 'day' ? 'Lägg till' : 'Spara', { exact: true }).click();
    await submit();
    try {
      await expect.poll(() => Boolean(release)).toBe(true);
      await expect(draft).toHaveValue('QA bevara min text');
      await expect(draft).not.toBeEditable();
      await expect(modal.getByText('Sparar…', { exact: true })).toBeVisible();
    } finally { release?.(); }
    await expect(modal.getByRole('alert')).toContainText('Uppgifterna kunde inte sparas');
    await submit();
    await expect(draft).toHaveCount(0);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
  });
}
