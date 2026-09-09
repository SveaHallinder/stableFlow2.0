import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';

// Synthetic login and intercepted backend traffic keep this regression offline
// and never change a real account or stable.
test('a stalled session refresh offers retry and preserves the saved session', async ({ page }) => {
  const user = {
    id: '00000000-0000-4000-8000-000000000099',
    aud: 'authenticated', role: 'authenticated', email: 'auth-recovery@example.test',
    app_metadata: {}, user_metadata: {}, identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
  };
  const session = {
    access_token: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
      'synthetic-signature'].join('.'),
    refresh_token: 'synthetic-refresh-token', token_type: 'bearer',
    expires_in: 3600, user,
  };
  let releaseRefresh;
  let refreshStarted = false;
  await page.route('**/auth/v1/**', async (route) => {
    if (route.request().url().includes('grant_type=refresh_token')) {
      refreshStarted = true;
      await new Promise((resolve) => { releaseRefresh = resolve; });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) });
  });
  await page.route('**/rest/v1/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }));
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill(user.email);
  await page.getByPlaceholder('Minst 8 tecken').fill('SyntheticTest123!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect.poll(() => page.evaluate(() => Object.keys(window.localStorage).some((key) =>
    /^sb-.*-auth-token$/.test(key),
  ))).toBe(true);
  await page.evaluate(() => {
    const key = Object.keys(window.localStorage).find((name) => /^sb-.*-auth-token$/.test(name));
    const saved = JSON.parse(window.localStorage.getItem(key));
    saved.expires_at = 1;
    window.localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  try {
    await expect.poll(() => refreshStarted).toBe(true);
    await expect(page.getByText('Kunde inte ansluta', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder('namn@exempel.se')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => {
      const key = Object.keys(window.localStorage).find((name) => /^sb-.*-auth-token$/.test(name));
      return JSON.parse(window.localStorage.getItem(key))?.refresh_token === 'synthetic-refresh-token';
    })).toBe(true);
    await page.getByRole('button', { name: 'Försök igen', exact: true }).click();
    await expect(page.getByText('Laddar...', { exact: true })).toBeVisible();
    // A second unavailable attempt must also time out instead of reopening an
    // infinite spinner while the SDK is still waiting on the original request.
    await expect(page.getByText('Kunde inte ansluta', { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Försök igen', exact: true }).click();
    await expect(page.getByText('Laddar...', { exact: true })).toBeVisible();
  } finally {
    releaseRefresh?.();
  }
  await expect(page.getByText('Laddar...', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Kunde inte ansluta', { exact: true })).toHaveCount(0);
  await expect(page.getByPlaceholder('namn@exempel.se')).toHaveCount(0);
  await expect(page.getByText('Något gick fel', { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(window.localStorage).find((name) => /^sb-.*-auth-token$/.test(name));
    return JSON.parse(window.localStorage.getItem(key))?.expires_at > Date.now() / 1000;
  })).toBe(true);
});

test('a rejected session read can retry and reach login without a saved session', async ({ page }) => {
  await page.addInitScript(() => {
    const getItem = window.Storage.prototype.getItem;
    window.failSessionRead = true;
    window.Storage.prototype.getItem = function (key) {
      if (window.failSessionRead && /^sb-.*-auth-token$/.test(key)) {
        throw new Error('Synthetic session storage read failure');
      }
      return getItem.call(this, key);
    };
  });
  await page.goto('/');
  await expect(page.getByText('Kunde inte ansluta', { exact: true })).toBeVisible({ timeout: 5_000 });
  await page.evaluate(() => { window.failSessionRead = false; });
  // The SDK also reports this deliberate storage error to Expo's dev overlay.
  // Minimize that diagnostic through its UI before testing the app's retry.
  const minimize = page.getByText('Minimize', { exact: true });
  if (await minimize.isVisible()) {
    await expect(page.locator('#error-overlay')).toContainText('Synthetic session storage read failure');
    await minimize.click();
  }
  await page.getByRole('button', { name: 'Försök igen', exact: true }).click();
  await expect(page.getByPlaceholder('namn@exempel.se')).toBeVisible();
  await expect(page.getByText('Kunde inte ansluta', { exact: true })).toHaveCount(0);
});
