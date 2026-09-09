import { expect, test } from '@playwright/test';

test.use({ trace: 'off', viewport: { width: 390, height: 844 } });

for (const action of ['create', 'update', 'delete']) {
  test(`${action}: feed plan waits for confirmation and retains its draft after failure`, async ({ page }) => {
    const horsesLoaded = page.waitForResponse((response) =>
      response.url().includes('/rest/v1/horses?') && response.request().method() === 'GET',
    );
    await page.goto('/');
    await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
    await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
    const horse = (await (await horsesLoaded).json()).find((row) => row.name === 'StableFlow QA Horse');
    expect(Boolean(horse?.id)).toBe(true);
    const fixture = {
      id: '67e26614-ea3a-40ea-8617-4709b2a2b8c0', stable_id: horse.stable_id, horse_id: horse.id,
      slot: 'morning', label: 'QA sparad hästplan', amount: '2 kg', note: 'Befintlig notering',
      is_stable_default: false, active: true,
    };
    let release;
    let writes = 0;
    const submittedIds = [];
    const savedRows = new Map();
    await page.route('**/rest/v1/feed_plans*', async (route) => {
      const request = route.request();
      if (request.method() === 'GET') return route.fulfill({ json: action === 'create' ? [] : [fixture] });
      if (request.method() !== (action === 'delete' ? 'DELETE' : 'POST')) return route.abort('blockedbyclient');
      writes += 1;
      const payload = action === 'delete' ? fixture : request.postDataJSON();
      submittedIds.push(payload.id);
      if (action !== 'delete') savedRows.set(payload.id, payload);
      if (writes === 1) {
        await new Promise((resolve) => { release = resolve; });
        return route.abort('failed');
      }
      if (writes === 2) return route.fulfill({ json: [] });
      return route.fulfill({ json: action === 'delete' ? [{ id: fixture.id }] : payload });
    });
    await page.goto(`/horses/${horse.id}`);
    await expect(page.getByText('Foderplan', { exact: true })).toBeVisible();
    const title = page.getByPlaceholder('Titel, t.ex. Morgonfoder');
    const note = page.getByPlaceholder('Notering (frivillig)');
    if (action !== 'delete') {
      await page.getByText(action === 'create' ? 'Lägg till hästplan' : 'Ändra hästplan', { exact: true }).first().click();
      await title.fill('QA nytt foderutkast');
      await page.getByPlaceholder('Mängd, t.ex. 2 kg hösilage').fill('3 kg');
      await note.fill('Behåll foderanteckningen efter nätfel');
    }
    const submit = () => page.getByText(action === 'delete' ? 'Ta bort hästplan' : 'Spara', { exact: true }).first().click();
    await submit();
    try {
      await expect.poll(() => writes).toBe(1);
      await expect(page.getByText(action === 'delete' ? 'Tar bort hästplan…' : 'Sparar foderplan…', { exact: true })).toBeVisible();
      if (action === 'delete') await expect(page.getByText(fixture.label, { exact: true })).toBeVisible();
      else await expect(note).toHaveValue('Behåll foderanteckningen efter nätfel');
      await expect(page.getByText(/^(Foderplan sparad\.|Foderplan borttagen\.)$/)).toHaveCount(0);
    } finally {
      release?.();
    }
    const error = action === 'delete' ? 'Foderplanen kunde inte tas bort. Försök igen.' : 'Foderplanen kunde inte sparas. Försök igen.';
    await expect(page.getByText(error, { exact: true })).toBeVisible();
    if (action !== 'delete') await expect(title).toHaveValue('QA nytt foderutkast');
    await submit();
    await expect.poll(() => writes).toBe(2);
    await expect(page.getByText(error, { exact: true })).toBeVisible();
    await submit();
    await expect.poll(() => writes).toBe(3);
    expect(new Set(submittedIds).size).toBe(1);
    if (action === 'delete') {
      await expect(page.getByText(fixture.label, { exact: true })).toHaveCount(0);
    } else {
      expect(savedRows.size).toBe(1);
      await expect(title).toHaveCount(0);
      await expect(page.getByText('QA nytt foderutkast', { exact: true })).toBeVisible();
    }
  });
}
