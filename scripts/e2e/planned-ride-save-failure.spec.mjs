import { expect, test } from '@playwright/test';

test.use({ trace: 'off', viewport: { width: 390, height: 844 } });

for (const action of ['create', 'update', 'delete']) {
  test(`${action}: planned ride waits for acknowledgement and can retry after failure`, async ({ page }) => {
    const horsesLoaded = page.waitForResponse(response => response.url().includes('/rest/v1/horses?') && response.request().method() === 'GET');
    await page.goto('/');
    await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
    await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
    const horse = (await (await horsesLoaded).json()).find(row => row.name === 'StableFlow QA Horse');
    expect(Boolean(horse?.id)).toBe(true);
    const fixture = {
      id: 'b7e26614-ea3a-40ea-8617-4709b2a2b8c1', stable_id: horse.stable_id, horse_id: horse.id,
      date: '2026-09-08', ride_type_id: null, time: null, rider_user_id: null,
      status: 'planned', note: 'QA ridpass sparas säkert', completed_ride_log_id: null,
    };
    let release;
    let writes = 0;
    const submittedIds = [];
    await page.route('**/rest/v1/planned_rides*', async route => {
      const request = route.request();
      if (request.method() === 'GET') return route.fulfill({ json: action === 'create' ? [] : [fixture] });
      if (request.method() !== ({ create: 'POST', update: 'PATCH', delete: 'DELETE' })[action]) return route.abort('blockedbyclient');
      writes += 1;
      const payload = action === 'delete' ? fixture : request.postDataJSON();
      submittedIds.push(action === 'create' ? payload.id : fixture.id);
      if (writes === 1) {
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      if (writes === 2) return route.fulfill({ json: [] });
      return route.fulfill({ json: action === 'delete' ? [{ id: fixture.id }] : action === 'create' ? payload : { ...fixture, ...payload } });
    });
    await page.goto(`/horses/${horse.id}`);
    if (action === 'create') {
      await page.getByText('Planera ridpass', { exact: true }).click();
      await page.getByPlaceholder('Datum (YYYY-MM-DD)', { exact: true }).fill('2026-09-08');
      await page.getByPlaceholder('Tid (HH:MM, frivillig)').fill('17:30');
      await page.getByPlaceholder('Notering (frivillig)', { exact: true }).fill('QA behåll ridutkast');
    }
    const submit = () => page.getByText(({ create: 'Lägg till', update: 'Avboka', delete: 'Ta bort' })[action], { exact: true }).first().click();
    await submit();
    try {
      await expect.poll(() => writes).toBe(1);
      await expect(page.getByText(action === 'delete' ? 'Tar bort ridpass…' : 'Sparar ridpass…', { exact: true })).toBeVisible();
      if (action === 'create') await expect(page.getByPlaceholder('Notering (frivillig)', { exact: true })).toHaveValue('QA behåll ridutkast');
      else await expect(page.getByText(/QA ridpass sparas säkert/)).toBeVisible();
      await expect(page.getByText(/^(Ridpass planerat\.|Ridpass uppdaterat\.|Ridpass borttaget\.)$/)).toHaveCount(0);
    } finally { release?.(); }
    const error = action === 'delete' ? 'Ridpasset kunde inte tas bort. Försök igen.' : 'Ridpasset kunde inte sparas. Försök igen.';
    await expect(page.getByText(error, { exact: true })).toBeVisible();
    await submit();
    await expect.poll(() => writes).toBe(2);
    await expect(page.getByText(error, { exact: true })).toBeVisible();
    await submit();
    await expect.poll(() => writes).toBe(3);
    expect(new Set(submittedIds).size).toBe(1);
    if (action === 'create') {
      await expect(page.getByPlaceholder('Notering (frivillig)', { exact: true })).toHaveCount(0);
      await expect(page.getByText(/QA behåll ridutkast/)).toBeVisible();
    } else {
      await expect(page.getByText(/QA ridpass sparas säkert/)).toHaveCount(0);
    }
  });
}
