import { expect, test } from '@playwright/test';
import { URL } from 'node:url';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const trafficByPage = new WeakMap();

function isLocalAppUrl(url) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && !/\/(auth|rest|functions|storage|realtime)\/v1(?:\/|$)/.test(url.pathname);
}

test.beforeEach(async ({ context, page }) => {
  const traffic = { unexpected: [], pageErrors: [] };
  trafficByPage.set(page, traffic);
  page.on('pageerror', error => traffic.pageErrors.push(error.message));
  // Every case uses local qaDemo state. Install both barriers before navigation.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (isLocalAppUrl(url)) return route.continue();
    traffic.unexpected.push({ method: route.request().method(), url: url.origin + url.pathname });
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket(/.*/, socket => {
    const url = new URL(socket.url());
    if (!isLocalAppUrl(url)) traffic.unexpected.push({ method: 'WS', url: url.origin + url.pathname });
    return socket.close();
  });
});

test.afterEach(async ({ page }) => {
  const traffic = trafficByPage.get(page);
  expect(traffic.unexpected, 'No external or backend request may be attempted').toEqual([]);
  expect(traffic.pageErrors, 'Navigation must not raise browser errors').toEqual([]);
});

test('URL-prefilled member search stays editable and clearable on mobile', async ({ page }, testInfo) => {
  await page.goto('/members?qaDemo=1&q=QA%20Medlem');
  const search = page.getByPlaceholder('Sök namn, roll, häst...', { exact: true });
  await expect(search).toHaveValue('QA Medlem');
  await expect(page.getByText('QA Medlem', { exact: true })).toBeVisible();
  await expect(page.getByText('QA Admin', { exact: true })).toHaveCount(0);

  await search.fill('');
  await expect(search).toHaveValue('');
  await expect(page.getByText('QA Admin', { exact: true })).toBeVisible();
  await expect(page.getByText('QA Medlem', { exact: true })).toBeVisible();

  await search.fill('Ingen sådan medlem');
  await expect(page.getByText('Inga medlemmar matchar filtret.', { exact: true })).toBeVisible();
  await expect(search).toHaveValue('Ingen sådan medlem');
  await search.fill('QA Admin');
  await expect(page.getByText('QA Admin', { exact: true })).toBeVisible();
  await expect(page.getByText('QA Medlem', { exact: true })).toHaveCount(0);
  await expect(search).toHaveValue('QA Admin');
  await page.screenshot({ path: testInfo.outputPath('member-query-edited.png') });
});

test('mounted member search follows changed and removed URL parameters', async ({ page }, testInfo) => {
  await page.goto('/members?qaDemo=1&q=QA%20Medlem');
  const search = page.getByPlaceholder('Sök namn, roll, häst...', { exact: true });
  await expect(search).toHaveValue('QA Medlem');
  await search.fill('Eget sökutkast');
  await expect(search).toHaveValue('Eget sökutkast');

  // This explicit browser-history fixture changes q without reloading the screen.
  // The production router handles popstate and updates the mounted route params.
  await page.evaluate(() => {
    globalThis.history.pushState({}, '', '/members?qaDemo=1&q=QA%20Admin');
    globalThis.dispatchEvent(new globalThis.PopStateEvent('popstate'));
  });
  await expect(search).toHaveValue('QA Admin');
  await expect(page.getByText('QA Admin', { exact: true })).toBeVisible();
  await expect(page.getByText('QA Medlem', { exact: true })).toHaveCount(0);

  await page.evaluate(() => {
    globalThis.history.pushState({}, '', '/members?qaDemo=1');
    globalThis.dispatchEvent(new globalThis.PopStateEvent('popstate'));
  });
  await expect(search).toHaveValue('');
  await expect(page.getByText('QA Admin', { exact: true })).toBeVisible();
  await expect(page.getByText('QA Medlem', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('member-query-removed.png') });
});

test('contacts opened directly return to the horse tab on mobile', async ({ page }, testInfo) => {
  await page.goto('/contacts?qaDemo=1');
  await expect(page.getByText('Kontakter', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tillbaka', exact: true }).click();
  await expect(page).toHaveURL(/\/stable-horses$/);
  await expect(page.getByRole('textbox', { name: 'Sök häst efter namn', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('contacts-fallback-horses.png') });
});

test('contacts retain the previous page after real UI navigation', async ({ page }, testInfo) => {
  await page.goto('/admin?qaDemo=1');
  await page.getByText('Öppna kontakter →', { exact: true }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await page.getByRole('button', { name: 'Tillbaka', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\?qaDemo=1$/);
  await expect(page.getByText('Öppna kontakter →', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('contacts-back-admin.png') });
});
