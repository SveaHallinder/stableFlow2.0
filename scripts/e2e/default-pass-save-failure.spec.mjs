import { expect, test } from '@playwright/test';

test.use({ trace: 'off', viewport: { width: 390, height: 844 } });

for (const surface of ['profile', 'member']) {
  test(`${surface} default passes change only after acknowledgement and retry failed removal`, async ({ page }) => {
    let release;
    let saved;
    let adds = 0;
    let deletes = 0;
    await page.route('**/rest/v1/assignments*', route => route.request().method() === 'GET' ? route.continue() : route.abort('blockedbyclient'));
    await page.route('**/rest/v1/default_passes*', async route => {
      const request = route.request();
      if (request.method() === 'GET') return route.fulfill({ json: saved ? [saved] : [] });
      if (request.method() === 'POST') {
        adds++;
        if (adds === 1) {
          await new Promise(resolve => { release = resolve; });
          return route.abort('failed');
        }
        saved = request.postDataJSON();
        return route.fulfill({ json: saved });
      }
      if (request.method() === 'DELETE') {
        deletes++;
        if (deletes === 1) return route.abort('failed');
        const rows = [saved];
        saved = undefined;
        return route.fulfill({ json: rows });
      }
      return route.abort('blockedbyclient');
    });
    const login = page.waitForResponse(response => new URL(response.url()).pathname === '/auth/v1/token').then(response => response.json());
    const loaded = page.waitForResponse(response => new URL(response.url()).pathname === '/rest/v1/stables' && response.request().method() === 'GET').then(response => response.json());
    await page.goto('/');
    await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
    await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    const { user } = await login;
    const stable = (await loaded)[0];
    await expect(page.getByText(stable.name).first()).toBeVisible({ timeout: 20_000 });
    await page.goto(surface === 'profile' ? '/profile?section=defaultPasses' : `/members/${user.id}?stableId=${stable.id}`);
    const toggle = page.getByRole('button', { name: 'Lunch, Ons', exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    try {
      await expect.poll(() => Boolean(release)).toBe(true);
      await expect(toggle).toBeDisabled();
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    } finally { release?.(); }
    const error = page.getByRole('alert').filter({ hasText: 'Standardpasset kunde inte sparas' });
    await expect(error).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(adds).toBe(2);
    await toggle.click();
    await expect(error).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(deletes).toBe(2);
  });
}
