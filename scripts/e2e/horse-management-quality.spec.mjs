import { expect, test } from '@playwright/test';
import { URL } from 'node:url';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

async function useDemoRole(page, role, access) {
  // Only the qaDemo membership fixture changes; the app's permission logic runs normally.
  let seeded = false;
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return local && !/\/(rest|auth|functions|storage)\/v1\//.test(url.pathname)
      ? route.continue()
      : route.abort('blockedbyclient');
  });
  await page.route(/\.bundle\?/, async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /(email:\s*['"]qa-admin@example\.com['"],\s*membership:\s*\[\s*\{\s*stableId(?:\s*:\s*stableId)?,\s*)role:\s*['"]admin['"],\s*access:\s*['"]owner['"],\s*riderRole:\s*['"]owner['"]/,
      (_match, prefix) => {
        seeded = true;
        return `${prefix}role: '${role}', access: '${access}', riderRole: 'owner'`;
      },
    );
    await route.fulfill({ response, body });
  });
  return () => expect(seeded, 'The requested role must be present in the qaDemo fixture').toBe(true);
}

for (const width of [390, 1280]) {
  test(`staff/edit reaches horse management but not full stable settings at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const expectSeeded = await useDemoRole(page, 'staff', 'edit');
    await page.goto('/stable-horses?qaDemo=1');
    expectSeeded();
    await page.getByRole('button', { name: 'Hantera hästar', exact: true }).click();
    await expect(page).toHaveURL(/\/stables\?section=horses/);
    await expect(page.getByText('Hästar i QA Stallet', { exact: true })).toBeVisible();
    await expect(page.getByText('Admin krävs', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Snabbstart', { exact: true })).toHaveCount(0);
    await page.getByText('Saga', { exact: true }).filter({ visible: true }).click();
    await expect(page.getByPlaceholder('Namn', { exact: true })).toBeEditable();
    await expect(page.getByRole('button', { name: 'Uppdatera häst', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('staff-edit-horse-management.png') });
    await page.goto('/stables?qaDemo=1');
    await expect(page.getByText('Admin krävs', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Namn', { exact: true })).toHaveCount(0);
  });
}

for (const role of ['staff', 'guest', 'rider']) {
  test(`${role}/view cannot open horse management`, async ({ page }) => {
    const expectSeeded = await useDemoRole(page, role, 'view');
    await page.goto('/stable-horses?qaDemo=1');
    expectSeeded();
    await expect(page.getByRole('textbox', { name: 'Sök häst efter namn', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hantera hästar', exact: true })).toHaveCount(0);
    await page.goto('/stables?section=horses&qaDemo=1');
    await expect(page.getByText('Admin krävs', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Namn', { exact: true })).toHaveCount(0);
  });
}

test('admin/owner can open horse management and full stable settings', async ({ page }) => {
  const expectSeeded = await useDemoRole(page, 'admin', 'owner');
  await page.goto('/stable-horses?qaDemo=1');
  expectSeeded();
  await page.getByRole('button', { name: 'Hantera hästar', exact: true }).click();
  await expect(page.getByText('Hästar i QA Stallet', { exact: true })).toBeVisible();
  await expect(page.getByText('Admin krävs', { exact: true })).toHaveCount(0);
  await page.goto('/stables?qaDemo=1');
  await expect(page.getByText('Snabbstart', { exact: true })).toBeVisible();
  await expect(page.getByText('Admin krävs', { exact: true })).toHaveCount(0);
});
