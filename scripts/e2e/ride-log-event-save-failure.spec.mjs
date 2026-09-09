import { expect, test } from '@playwright/test';

test.use({ trace: 'off', viewport: { width: 390, height: 844 } });

for (const kind of ['event', 'ride-log']) {
  test(`${kind} keeps its text after a lost acknowledgement and recovers the same record`, async ({ page }) => {
    const table = kind === 'event' ? 'alerts' : 'ride_logs';
    let release;
    let saved;
    const writes = [];
    await page.route(`**/rest/v1/${table}*`, async route => {
      const request = route.request();
      if (request.method() === 'GET') return route.fulfill({ json: new URL(request.url()).searchParams.has('id') ? saved : [] });
      if (request.method() !== 'POST') return route.abort('blockedbyclient');
      const payload = request.postDataJSON();
      writes.push(payload);
      if (writes.length === 1) {
        saved = { ...payload, created_at: new Date().toISOString() };
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      return route.fulfill({ status: 409, json: { code: '23505', message: 'QA already stored' } });
    });
    const stablesLoaded = page.waitForResponse(response => new URL(response.url()).pathname === '/rest/v1/stables' && response.request().method() === 'GET');
    await page.goto('/');
    await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
    await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
    if (kind === 'ride-log') {
      const stables = await (await stablesLoaded).json();
      await page.route('**/rest/v1/stables*', route => route.request().method() === 'GET'
        ? route.fulfill({ json: stables.map(stable => ({ ...stable, ride_types: [{ id: 'a7e26614-ea3a-40ea-8617-4709b2a2b8c2', code: 'QA', label: 'QA ridning' }] })) })
        : route.abort('blockedbyclient'));
      await page.goto('/calendar');
      await page.getByRole('button', { name: 'Ridschema', exact: true }).click();
      await page.getByRole('button', { name: 'Registrera', exact: true }).first().click();
      await page.getByPlaceholder('45 min / 8 km').fill('45 min');
      await page.getByPlaceholder('Valfritt', { exact: true }).fill('QA behåll texten');
    } else {
      await page.getByRole('button', { name: 'Händelser', exact: true }).click();
      await page.getByPlaceholder('Ex. Kanel har tappat en sko. / Parkera inte vid containern.').fill('QA behåll texten');
    }
    const text = page.getByPlaceholder(kind === 'event' ? 'Ex. Kanel har tappat en sko. / Parkera inte vid containern.' : 'Valfritt', { exact: true });
    const submit = () => page.getByText(kind === 'event' ? 'Skicka' : 'Spara', { exact: true }).click();
    await submit();
    try {
      await expect.poll(() => Boolean(release)).toBe(true);
      await expect(text).toHaveValue('QA behåll texten');
      await expect(text).not.toBeEditable();
      await expect(page.getByText('Sparar…', { exact: true })).toBeVisible();
    } finally { release?.(); }
    await expect(page.getByRole('alert').filter({ hasText: kind === 'event' ? 'Händelsen kunde inte sparas' : 'Ridpasset kunde inte sparas' })).toBeVisible();
    await expect(text).toHaveValue('QA behåll texten');
    await submit();
    await expect(text).toHaveCount(0);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual(writes[1]);
  });
}
