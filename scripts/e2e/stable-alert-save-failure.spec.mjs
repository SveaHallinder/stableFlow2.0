import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

for (const mode of ['create', 'resolve']) {
  test(`important notice ${mode} waits for acknowledgement and keeps information after failure`, async ({ page }) => {
    const fixture = {
      id: 'e7e26614-ea3a-40ea-8617-4709b2a2b8c1', stable_id: '6eb197a3-0be8-4d8a-a3f3-fe04718c26b7',
      title: 'QA vatten avstängt', body: 'Använd reservvattnet tills vidare.', severity: 'urgent',
      created_at: new Date().toISOString(), resolved_at: null,
    };
    let release;
    const writes = [];
    await page.route('**/rest/v1/stable_alerts*', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: mode === 'resolve' ? [fixture] : [] });
      if (!['POST', 'PATCH'].includes(route.request().method())) return route.abort('blockedbyclient');
      const payload = route.request().postDataJSON();
      writes.push(payload);
      if (writes.length === 1) {
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      return route.fulfill({ json: { ...fixture, ...payload } });
    });
    await page.goto('/');
    await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
    await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
    const draft = page.getByPlaceholder('Ex. Kanel har tappat en sko. / Parkera inte vid containern.');
    if (mode === 'create') {
      await page.getByRole('button', { name: 'Händelser', exact: true }).click();
      await page.getByText('Akut', { exact: true }).click();
      await draft.fill('QA vatten avstängt');
    }
    const submit = () => mode === 'create'
      ? page.getByText('Skicka', { exact: true }).click()
      : page.getByRole('button', { name: 'Markera QA vatten avstängt som löst', exact: true }).click();
    await submit();
    try {
      await expect.poll(() => Boolean(release)).toBe(true);
      if (mode === 'create') await expect(draft).toHaveValue('QA vatten avstängt');
      else await expect(page.getByText(fixture.body, { exact: true })).toBeVisible();
      await expect(page.getByText('Sparar…', { exact: true })).toBeVisible();
    } finally { release?.(); }
    await expect(page.getByRole('alert').filter({ hasText: mode === 'create' ? 'Notisen kunde inte sparas' : 'Notisen kunde inte markeras som löst' })).toBeVisible();
    await submit();
    await expect.poll(() => writes.length).toBe(2);
    if (mode === 'create') {
      expect(writes[0].id).toBe(writes[1].id);
      await expect(draft).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Markera QA vatten avstängt som löst', exact: true })).toBeVisible();
    } else {
      expect(Object.keys(writes[1])).toEqual(['resolved_at']);
      await expect(page.getByRole('button', { name: 'Markera QA vatten avstängt som löst', exact: true })).toHaveCount(0);
    }
  });
}
