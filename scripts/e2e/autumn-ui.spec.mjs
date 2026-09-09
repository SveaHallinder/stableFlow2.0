import { test, expect } from '@playwright/test';

test('horse feed plans remain visible when the daily hay check is cleared', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/horses/qa-horse-main?qaDemo=1');
  await expect(page.getByText('Saga – kvällsfoder', { exact: true })).toBeVisible();
  const hayRow = page.getByText('Hö', { exact: true }).locator('..');
  await hayRow.getByText('Klart', { exact: true }).click();
  await expect(hayRow.getByText('Markera', { exact: true })).toBeVisible();
  await page.getByLabel('Öppna hästlistan').click();
  await expect(page.getByText('1 av 2 fodringar klara', { exact: true })).toBeVisible();
  await expect(page.getByText('Foderplan ej satt ännu', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: '/tmp/stableflow-autumn-horses-mobile.png' });
  await page.getByRole('button', { name: 'Status för Saga', exact: true }).click();
  await expect(page).toHaveURL(/\/horses\/qa-horse-main/);
  await expect(page.getByText('Dagens status', { exact: true }).last()).toBeVisible();
});

test('mobile navigation shows destination labels and a readable new assignment action', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar?qaDemo=1');
  for (const label of ['Idag', 'Hästar', 'Schema', 'Feed', 'Chat']) {
    await expect(page.getByRole('tab', { name: label, exact: true }).getByText(label, { exact: true })).toBeVisible();
  }
  const create = page.getByRole('button', { name: 'Nytt pass', exact: true }).first();
  await expect(create).toBeVisible();
  const labelFits = await create.getByText('Nytt pass', { exact: true }).evaluate(
    (element) => element.scrollWidth <= element.clientWidth,
  );
  expect(labelFits).toBe(true);
  await page.screenshot({ path: '/tmp/stableflow-autumn-calendar-mobile.png' });
  await create.click();
  await expect(page.getByText('Skapa pass', { exact: true })).toBeVisible();
});

test('desktop retains the explicit back action on the paddock screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/stable-horses?qaDemo=1');
  await page.getByLabel('Öppna hagar').click();
  await expect(page.getByRole('button', { name: 'Tillbaka', exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/stableflow-autumn-paddocks-desktop.png' });
  await page.getByRole('button', { name: 'Tillbaka', exact: true }).click();
  await expect(page).toHaveURL(/\/stable-horses/);
});

test('horse management remains reachable from a populated horse list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/stable-horses?qaDemo=1');
  await page.getByRole('button', { name: 'Hantera hästar', exact: true }).click();
  await expect(page).toHaveURL(/\/stables/);
  await expect(page.getByText('Hantera hästar', { exact: true }).last()).toBeVisible();
});
