import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

for (const mode of ['create', 'edit']) {
  test(`horse ${mode} retains draft and preserves box settings until acknowledged`, async ({ page }) => {
    const loaded = page.waitForResponse(response => new URL(response.url()).pathname === '/rest/v1/horses' && response.request().method() === 'GET');
    await page.goto('/');
    await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
    await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    const rows = await (await loaded).json();
    const horse = { ...rows.find(row => row.name === 'StableFlow QA Horse'), box_number: '7', can_sleep_inside: true };
    let release;
    const writes = [];
    await page.route('**/rest/v1/horses*', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: [horse] });
      if (!['POST', 'PATCH'].includes(route.request().method())) return route.abort('blockedbyclient');
      const payload = route.request().postDataJSON();
      writes.push(payload);
      if (writes.length === 1) {
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      return route.fulfill({ json: { ...horse, ...payload } });
    });
    await page.goto(mode === 'create' ? '/stables' : '/stables?section=horses');
    await expect(page.getByText('QA Admin', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Hästar i StableFlow QA Stable', { exact: true })).toBeVisible();
    if (mode === 'edit') await page.getByText('StableFlow QA Horse', { exact: true }).last().click();
    const form = page.getByText(mode === 'edit' ? 'Redigera häst' : 'Lägg till häst', { exact: true }).locator('..');
    const name = form.getByPlaceholder('Namn', { exact: true });
    await name.fill('QA sparutkast häst');
    const submit = () => page.getByRole('button', { name: mode === 'edit' ? 'Uppdatera häst' : 'Spara häst', exact: true }).click();
    await submit();
    try {
      await expect.poll(() => Boolean(release)).toBe(true);
      await expect(page.getByRole('button', { name: 'Sparar…', exact: true })).toBeDisabled();
      await expect(name).toHaveValue('QA sparutkast häst');
      await expect(page.getByText(/^(Häst tillagd\.|Häst uppdaterad\.)$/)).toHaveCount(0);
    } finally { release?.(); }
    await expect(page.getByText('Hästen kunde inte sparas. Dina uppgifter finns kvar. Försök igen.', { exact: true }).first()).toBeVisible();
    await expect(name).toHaveValue('QA sparutkast häst');
    await submit();
    await expect(page.getByText('Lägg till häst', { exact: true }).locator('..').getByPlaceholder('Namn', { exact: true })).toHaveValue('');
    expect(writes).toHaveLength(2);
    expect(writes[0].id).toBe(writes[1].id);
    expect(writes[1]).not.toHaveProperty('box_number');
    expect(writes[1]).not.toHaveProperty('can_sleep_inside');
    await expect(page.getByText('QA sparutkast häst', { exact: true }).first()).toBeVisible();
  });
}
