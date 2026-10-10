import { expect, test } from '@playwright/test';
import { URL } from 'node:url';

test.use({ trace: 'off', serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
  // Local qaDemo only: block every backend and external request before navigation.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return local && !/\/(auth|rest|functions|storage|realtime)\/v1(?:\/|$)/.test(url.pathname)
      ? route.continue() : route.abort('blockedbyclient');
  });
  await page.routeWebSocket(/.*/, socket => socket.close());
  // Capture the browser clipboard locally; never touch the computer's clipboard.
  await page.addInitScript(() => {
    globalThis.__inviteClipboardEnabled = true;
    globalThis.__copiedInvite = '';
    Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => {
        if (!globalThis.__inviteClipboardEnabled) throw new Error('Synthetic clipboard denial');
        globalThis.__copiedInvite = text;
      },
    } });
    const original = globalThis.document.execCommand.bind(globalThis.document);
    globalThis.document.execCommand = (...args) => {
      if (args[0] === 'copy' && !globalThis.__inviteClipboardEnabled) throw new Error('Synthetic clipboard denial');
      return original(...args);
    };
  });
});

for (const width of [390, 1280]) {
  test(`confirmed invite at ${width}px retains its recipient and copies usable instructions`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/stables?qaDemo=1');
    const form = page.getByText('Bjud in medlem', { exact: true }).locator('..');
    await expect(form.getByPlaceholder('Namn', { exact: true })).toBeVisible();
    await form.getByPlaceholder('Namn', { exact: true }).fill('Lokalt kvitto');
    const email = form.getByPlaceholder('E-post', { exact: true });
    await email.fill(' Recipient@Example.Test ');
    await form.getByText('Skapa inbjudan', { exact: true }).click();
    await expect(email).toHaveValue('');
    await expect(form.getByText('Logga in med recipient@example.test.', { exact: true })).toBeVisible();
    await expect(form.getByText('Vid nytt konto: välj Skapa konto → Har inbjudan och använd samma e-postadress.', { exact: true })).toBeVisible();
    await expect(form.getByText(/Mejlleverans är inte bekräftad/)).toBeVisible();
    const instructions = form.getByRole('button', { name: 'Kopiera inbjudan med instruktioner', exact: true });
    const codeButton = form.getByRole('button', { name: /^Kopiera inbjudningskod / }).first();
    const code = (await codeButton.getAttribute('aria-label')).replace('Kopiera inbjudningskod ', '');

    await page.evaluate(() => { globalThis.__inviteClipboardEnabled = false; });
    await instructions.click();
    await expect(page.getByText('Instruktionerna kunde inte kopieras. Markera och kopiera dem manuellt.', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => globalThis.__copiedInvite)).toBe('');
    await expect(form.getByText('Logga in med recipient@example.test.', { exact: true })).toBeVisible();

    await page.evaluate(() => { globalThis.__inviteClipboardEnabled = true; });
    await instructions.click();
    const message = await page.evaluate(() => globalThis.__copiedInvite);
    expect(message).toContain('recipient@example.test');
    expect(message).toContain('Skapa konto → Har inbjudan');
    expect(message).toContain('I Gå med använder du en stallkod.');
    expect(message).toContain(code);
    await codeButton.click();
    expect(await page.evaluate(() => globalThis.__copiedInvite)).toBe(code);
    await expect(form.getByText(code, { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`invite-receipt-${width}.png`), fullPage: true });
  });
}
