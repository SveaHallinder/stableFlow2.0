import { expect, test } from '@playwright/test';

test.use({ trace: 'off', viewport: { width: 390, height: 844 } });

for (const surface of ['stables', 'onboarding']) {
  test(`${surface}: horse deletion requires confirmation and preserves the row until acknowledged`, async ({ page }) => {
    const loaded = page.waitForResponse(response => response.url().includes('/rest/v1/horses?') && response.request().method() === 'GET');
    await page.goto('/');
    await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
    await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    const horse = (await (await loaded).json()).find(row => row.name === 'StableFlow QA Horse');
    expect(Boolean(horse?.id)).toBe(true);
    let release;
    let deletes = 0;
    await page.route('**/rest/v1/horses*', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: [horse] });
      if (route.request().method() !== 'DELETE') return route.abort('blockedbyclient');
      deletes += 1;
      if (deletes === 1) {
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      return route.fulfill({ json: deletes === 2 ? [] : [{ id: horse.id }] });
    });
    await page.goto(surface === 'stables' ? '/stables?section=horses' : '/horses');
    const remove = page.getByRole('button', { name: `Ta bort ${horse.name}`, exact: true });
    await expect(remove).toBeVisible();
    page.once('dialog', async dialog => { expect(dialog.message()).toContain(horse.name); await dialog.dismiss(); });
    await remove.click();
    expect(deletes).toBe(0);
    page.once('dialog', dialog => dialog.accept());
    await remove.click();
    try {
      await expect.poll(() => deletes).toBe(1);
      await expect(page.getByText('Tar bort hästen…', { exact: true })).toBeVisible();
      await expect(page.getByText(horse.name, { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Häst borttagen.', { exact: true })).toHaveCount(0);
    } finally { release?.(); }
    const error = page.getByText('Hästen kunde inte tas bort. Försök igen.', { exact: true });
    await expect(error).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await remove.click();
    await expect.poll(() => deletes).toBe(2);
    await expect(error).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await remove.click();
    await expect.poll(() => deletes).toBe(3);
    await expect(remove).toHaveCount(0);
    await expect(page.getByText('Häst borttagen.', { exact: true }).filter({ visible: true })).toBeVisible();
  });
}
