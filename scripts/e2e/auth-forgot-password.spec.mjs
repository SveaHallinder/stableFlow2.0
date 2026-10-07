import { URL } from 'node:url';
import { expect, test } from '@playwright/test';

test.use({ trace: 'off', serviceWorkers: 'block' });

for (const width of [390, 1280]) {
  test(`recovery email survives SDK cleanup failure and rate limiting before retry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const email = 'offline-forgot@example.test';
    const errorMessage = 'Kunde inte skicka återställningslänken. Din e-post finns kvar. Försök igen.';
    const limitedMessage = 'För många försök. Vänta en stund innan du skickar en ny återställningslänk.';
    const confirmation = 'Om adressen har ett konto får du en återställningslänk. Kontrollera även skräpposten.';
    const warnings = [], pageErrors = [], blockedWrites = [];
    let attempts = 0;
    page.on('console', message => {
      if (message.type() === 'warning' && message.text().includes('[auth forgot-password]')) warnings.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => {
      const removeItem = globalThis.Storage.prototype.removeItem;
      globalThis.Storage.prototype.removeItem = function (key) {
        if (globalThis.__failRecoveryCleanup && key.endsWith('-code-verifier')) {
          globalThis.__failRecoveryCleanup = false;
          throw new Error('Offline private storage cleanup error');
        }
        return removeItem.call(this, key);
      };
    });
    // Every backend request is a local fixture, including the installed SDK's
    // recovery transport. Never send a real reset email from this test.
    await page.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!/\/(auth|rest|functions|storage|realtime)\/v1(?:\/|$)/.test(url.pathname)) {
        return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
          ? route.continue() : route.abort('blockedbyclient');
      }
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (url.pathname === '/auth/v1/recover' && request.method() === 'POST') {
        expect(request.postDataJSON().email).toBe(email);
        expect(url.searchParams.get('redirect_to')).toBe(`${new URL(page.url()).origin}/reset`);
        attempts += 1;
        const status = attempts === 1 ? 503 : attempts === 2 ? 429 : 200;
        return route.fulfill({ status, headers, json: status === 200 ? {} : {
          message: 'Offline private provider detail', code: status === 429 ? 'over_email_send_rate_limit' : 'offline_failure',
        } });
      }
      if (!['GET', 'HEAD'].includes(request.method())) blockedWrites.push({ path: url.pathname, method: request.method() });
      return route.abort('blockedbyclient');
    });
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/forgot-password');
    await page.getByPlaceholder('namn@exempel.se').fill(`  ${email}  `);
    await page.evaluate(() => { globalThis.__failRecoveryCleanup = true; });
    const button = page.getByRole('button', { name: 'Skicka återställningslänk', exact: true });
    await button.click();
    await expect(page.getByRole('alert')).toHaveText(errorMessage);
    await expect(button).toBeEnabled();
    await expect(page.getByText('Skickar...', { exact: true })).toHaveCount(0);
    await expect(page.getByPlaceholder('namn@exempel.se')).toHaveValue(email);
    await expect(page.getByText(confirmation, { exact: true })).toHaveCount(0);
    expect(attempts).toBe(1);
    await button.click();
    await expect(page.getByRole('alert')).toHaveText(limitedMessage);
    await expect(button).toBeEnabled();
    expect(attempts).toBe(2);
    await button.click();
    await expect(page.getByText(confirmation, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(button).toBeEnabled();
    await expect(page).toHaveURL(/\/forgot-password$/);
    expect(attempts).toBe(3);
    expect(warnings).toHaveLength(2);
    expect(warnings.join(' ')).not.toContain(email);
    expect(warnings.join(' ')).not.toContain('private');
    expect(pageErrors).toEqual([]);
    expect(blockedWrites).toEqual([]);
  });
}
