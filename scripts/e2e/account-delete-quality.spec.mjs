import { expect, test } from '@playwright/test';
import { URL } from 'node:url';

test.use({ viewport: { width: 390, height: 844 } });

async function loadAccount(page, outcome) {
  const calls = [];
  const backend = /\/(auth|rest|functions|realtime|storage)\/v1(?:\/|$)/;
  const local = url => ['localhost', '127.0.0.1'].includes(url.hostname);
  const headers = { 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  // Installed before navigation: every backend request is stubbed or blocked.
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/functions/v1/delete-account') {
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      calls.push('delete-account');
      if (outcome === 'abort') return route.abort('failed');
      return route.fulfill({ status: outcome === 'sole_owner' ? 409 : 200, headers,
        json: outcome === 'sole_owner' ? { error: 'sole_owner' } : { skipped: 'not_configured' } });
    }
    if (backend.test(url.pathname) || !local(url)) {
      calls.push('blocked-backend');
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await page.routeWebSocket(url => backend.test(url.pathname) || !local(url), socket => socket.close());
  await page.goto('/settings/account?qaDemo=1');
  await expect(page.getByRole('button', { name: 'Radera konto', exact: true })).toBeVisible();
  return calls;
}

async function confirmDeletion(page) {
  await page.getByRole('button', { name: 'Radera konto', exact: true }).click();
  await page.getByRole('button', { name: 'Bekräfta radering av konto', exact: true }).click();
}

test('account deletion describes the actual scope and lets confirmation be cancelled', async ({ page }) => {
  const calls = await loadAccount(page, 'abort');
  await expect(page.getByText(/Ditt inloggningskonto och din profil raderas permanent/)).toBeVisible();
  await expect(page.getByText(/Inlägg, meddelanden och stallhistorik kan finnas kvar/)).toBeVisible();
  await expect(page.getByText(/Raderingen går inte att ångra/)).toBeVisible();
  await expect(page.getByText(/personuppgifter \(GDPR\)/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Radera konto', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bekräfta radering av konto', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Avbryt radering', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Radera konto', exact: true })).toBeEnabled();
  expect(calls).not.toContain('delete-account');
});

for (const outcome of ['abort', 'sole_owner', 'skipped']) {
  test(`account deletion recovers from ${outcome} without success or logout`, async ({ page }) => {
    const calls = await loadAccount(page, outcome);
    await confirmDeletion(page);
    await expect(page.getByText(outcome === 'sole_owner'
      ? 'Du är ensam ägare av ett stall. Utse en ny ägare först.'
      : 'Raderingen kunde inte bekräftas. Kontrollera kontot innan du försöker igen.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Radera konto', exact: true })).toBeEnabled();
    await expect(page.getByText('Ditt konto har raderats.', { exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(/\/settings\/account\?qaDemo=1$/);
    await expect(page.getByText('Logga ut', { exact: true })).toBeVisible();
    expect(calls.filter(call => call === 'delete-account')).toHaveLength(1);
  });
}
