import { expect, test } from '@playwright/test';

test.use({ trace: 'off', viewport: { width: 390, height: 844 } });

for (const action of ['create', 'complete', 'cancel', 'delete']) {
  test(`${action}: care event retains its state until acknowledged and supports retry`, async ({ page }) => {
    const horsesLoaded = page.waitForResponse(response => response.url().includes('/rest/v1/horses?') && response.request().method() === 'GET');
    await page.goto('/');
    await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
    await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
    const horse = (await (await horsesLoaded).json()).find(row => row.name === 'StableFlow QA Horse');
    expect(Boolean(horse?.id)).toBe(true);
    const fixture = {
      id: 'c7e26614-ea3a-40ea-8617-4709b2a2b8c1', stable_id: horse.stable_id, horse_ids: [horse.id],
      date: '2026-09-08', type: 'farrier', title: 'QA trygg vårdhändelse', time: null,
      status: 'planned', note: null, contact_id: null, responsible_user_id: null, completed_at: null,
    };
    let release;
    let writes = 0;
    const ids = [];
    await page.route('**/rest/v1/planned_rides*', route => route.request().method() === 'GET' ? route.fulfill({ json: [] }) : route.abort('blockedbyclient'));
    await page.route('**/rest/v1/care_events*', async route => {
      const request = route.request();
      if (request.method() === 'GET') return route.fulfill({ json: action === 'create' ? [] : [fixture] });
      if (request.method() !== ({ create: 'POST', complete: 'PATCH', cancel: 'PATCH', delete: 'DELETE' })[action]) return route.abort('blockedbyclient');
      writes += 1;
      const payload = action === 'delete' ? fixture : request.postDataJSON();
      ids.push(action === 'create' ? payload.id : fixture.id);
      if (writes === 1) {
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      if (writes === 2) return route.fulfill({ json: [] });
      return route.fulfill({ json: action === 'delete' ? [{ id: fixture.id }] : action === 'create' ? payload : { ...fixture, ...payload } });
    });
    await page.goto(`/horses/${horse.id}`);
    if (action === 'create') {
      await page.getByText('Lägg till vårdhändelse', { exact: true }).click();
      await page.getByPlaceholder('Titel, t.ex. Skoning').fill('QA ny vårdhändelse');
      await page.getByPlaceholder('Datum (YYYY-MM-DD)', { exact: true }).fill('2026-09-08');
      await page.getByPlaceholder('Notering (frivillig)', { exact: true }).fill('QA behåll vårdutkast');
    }
    if (action === 'complete') {
      await page.getByText('Slutför vård', { exact: true }).click();
      await page.getByPlaceholder('Notering, t.ex. nya skor, dosering, datum för uppföljning').fill('QA behåll slutkommentar');
    }
    const submit = () => page.getByText(({ create: 'Skapa vårdhändelse', complete: 'Spara vårdlogg', cancel: 'Avboka', delete: 'Ta bort' })[action], { exact: true }).first().click();
    await submit();
    try {
      await expect.poll(() => writes).toBe(1);
      await expect(page.getByText(action === 'delete' ? 'Tar bort vårdhändelse…' : 'Sparar vårdhändelse…', { exact: true })).toBeVisible();
      if (action === 'create') await expect(page.getByPlaceholder('Titel, t.ex. Skoning')).toHaveValue('QA ny vårdhändelse');
      else await expect(page.getByText('Planerat', { exact: true })).toBeVisible();
      if (action === 'complete') await expect(page.getByPlaceholder('Notering, t.ex. nya skor, dosering, datum för uppföljning')).toHaveValue('QA behåll slutkommentar');
      await expect(page.getByText(/^Vårdhändelse (skapad|markerad klar|avbokad|borttagen)\.$/)).toHaveCount(0);
    } finally { release?.(); }
    const error = action === 'delete' ? 'Vårdhändelsen kunde inte tas bort. Försök igen.' : 'Vårdhändelsen kunde inte sparas. Försök igen.';
    await expect(page.getByText(error, { exact: true })).toBeVisible();
    await submit();
    await expect.poll(() => writes).toBe(2);
    await expect(page.getByText(error, { exact: true })).toBeVisible();
    await submit();
    await expect.poll(() => writes).toBe(3);
    expect(new Set(ids).size).toBe(1);
    if (action === 'create') {
      await expect(page.getByPlaceholder('Titel, t.ex. Skoning')).toHaveCount(0);
      await expect(page.getByText(/QA ny vårdhändelse/)).toBeVisible();
    } else if (action === 'delete') {
      await expect(page.getByText('QA trygg vårdhändelse', { exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByText('Planerat', { exact: true })).toHaveCount(0);
      await expect(page.getByText(action === 'complete' ? 'Klart' : 'Avbokat', { exact: true }).first()).toBeVisible();
    }
  });
}
