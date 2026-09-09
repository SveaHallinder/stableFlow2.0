import { expect, test } from '@playwright/test';

// Uses the seeded QA account. Every write is intercepted; no stall data changes.
for (const screen of ['horse', 'today']) {
  test(`${screen}: failed feed saves retain the note and allow retry`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
    await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
    if (screen === 'horse') {
      await page.goto('/stable-horses');
      await page.getByRole('button', { name: 'Status för StableFlow QA Horse', exact: true }).click();
      await expect(page.getByText('Foderplan', { exact: true })).toBeVisible();
    }

    let release;
    let writes = 0;
    await page.route('**/rest/v1/feed_checks*', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      writes += 1;
      if (writes === 1) {
        await new Promise((resolve) => { release = resolve; });
        return route.abort('failed');
      }
      // A successful HTTP status without a saved row must also be rejected.
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.getByText('Avvikelse', { exact: true }).first().click();
    const note = page.getByPlaceholder(/Hösilage tog slut/).first();
    await note.fill('QA: behåll anteckningen vid nätfel');
    await page.getByText('Spara avvikelse', { exact: true }).first().click();
    try {
      await expect.poll(() => Boolean(release)).toBe(true);
      await expect(page.getByText('Sparar…', { exact: true }).first()).toBeVisible();
      await expect(note).toHaveValue('QA: behåll anteckningen vid nätfel');
      await expect(page.getByText(/^(Foderkoll|Avvikelse) registrerad\.$/)).toHaveCount(0);
    } finally {
      release?.();
    }
    const error = page.getByText('Foderkollen kunde inte sparas. Försök igen.', { exact: true }).first();
    await expect(error).toBeVisible();
    await expect(note).toHaveValue('QA: behåll anteckningen vid nätfel');
    await page.getByText('Spara avvikelse', { exact: true }).first().click();
    await expect.poll(() => writes).toBe(2);
    await expect(error).toBeVisible();
    await expect(note).toHaveValue('QA: behåll anteckningen vid nätfel');
    await expect(page.getByText(/^(Foderkoll|Avvikelse) registrerad\.$/)).toHaveCount(0);
  });
}

test('a confirmed feed save survives reload in the QA stable', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
  const loaded = page.waitForResponse((response) =>
    response.url().includes('/rest/v1/feed_checks') && response.request().method() === 'GET',
  );
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  const loadResponse = await loaded;
  expect(loadResponse.ok()).toBe(true);
  const originalChecks = await loadResponse.json();
  const loadHeaders = await loadResponse.request().allHeaders();
  const headers = { apikey: loadHeaders.apikey, authorization: loadHeaders.authorization };
  const endpoint = `${new URL(loadResponse.url()).origin}/rest/v1/feed_checks`;
  await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible();
  await page.goto('/stable-horses');
  await page.getByRole('button', { name: 'Status för StableFlow QA Horse', exact: true }).click();
  await expect(page.getByText('Foderplan', { exact: true })).toBeVisible();
  const note = `QA confirmed feed ${Date.now()}`;
  let saved;
  try {
    await page.getByText('Avvikelse', { exact: true }).nth(1).click();
    await page.getByPlaceholder(/Hösilage tog slut/).fill(note);
    const write = page.waitForResponse((response) =>
      response.url().includes('/rest/v1/feed_checks') && response.request().method() === 'POST',
    );
    await page.getByText('Spara avvikelse', { exact: true }).click();
    const response = await write;
    // Capture the attempted row before assertions so cleanup also covers a lost acknowledgement.
    saved = response.request().postDataJSON();
    expect(response.ok()).toBe(true);
    const confirmed = await response.json();
    expect(confirmed).toMatchObject({ horse_id: saved.horse_id, slot: 'lunch', deviation_note: note });
    saved = confirmed;
    await expect(page.getByText('Foderkoll registrerad.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(note, { exact: false }).first()).toBeVisible();
  } finally {
    if (saved) {
      const original = originalChecks.find((row) =>
        row.horse_id === saved.horse_id && row.date === saved.date && row.slot === saved.slot,
      );
      const response = original
        ? await page.request.post(`${endpoint}?on_conflict=horse_id,date,slot`, {
          headers: { ...headers, Prefer: 'resolution=merge-duplicates' }, data: original,
        })
        : await page.request.delete(`${endpoint}?id=eq.${encodeURIComponent(saved.id)}`, { headers });
      expect(response.ok(), 'Restore the QA feed check').toBe(true);
      const restored = await page.request.get(
        `${endpoint}?horse_id=eq.${saved.horse_id}&date=eq.${saved.date}&slot=eq.${saved.slot}`,
        { headers },
      );
      expect(restored.ok()).toBe(true);
      const rows = await restored.json();
      expect(rows).toEqual(original ? [original] : []);
    }
  }
});

test('marking feeding preserves a deviation entered from another phone', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
  const loaded = page.waitForResponse((response) =>
    response.url().includes('/rest/v1/feed_checks') && response.request().method() === 'GET',
  );
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  const initial = await loaded;
  const initialRows = await initial.json();
  const rawHeaders = await initial.request().allHeaders();
  const headers = { apikey: rawHeaders.apikey, authorization: rawHeaders.authorization };
  const endpoint = `${new URL(initial.url()).origin}/rest/v1/feed_checks`;
  await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible();
  await page.goto('/stable-horses');
  await page.getByRole('button', { name: 'Status för StableFlow QA Horse', exact: true }).click();
  await expect(page.getByText('Foderplan', { exact: true })).toBeVisible();
  const horseId = new URL(page.url()).pathname.split('/').pop();
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const original = initialRows.find((row) => row.horse_id === horseId && row.date === date && row.slot === 'lunch');
  const note = `QA other phone ${Date.now()}`;
  try {
    const external = await page.request.post(`${endpoint}?on_conflict=horse_id,date,slot`, {
      headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
      data: { ...(original ?? { stable_id: '6eb197a3-0be8-4d8a-a3f3-fe04718c26b7', horse_id: horseId, date, slot: 'lunch' }), deviation_note: note },
    });
    expect(external.ok()).toBe(true);
    const write = page.waitForResponse((response) =>
      response.url().includes('/rest/v1/feed_checks') && response.request().method() === 'POST',
      { timeout: 15_000 },
    );
    void write.catch(() => {});
    await page.getByText('Lunchfoder', { exact: true }).locator('../..').getByText(/^(Markera klart|Markera om)$/).click({ timeout: 10_000 });
    const response = await write;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()).not.toHaveProperty('deviation_note');
    expect(await response.json()).toMatchObject({ deviation_note: note });
    await expect(page.getByText(note, { exact: false }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(note, { exact: false }).first()).toBeVisible();
  } finally {
    test.setTimeout(90_000);
    const response = original
      ? await page.request.post(`${endpoint}?on_conflict=horse_id,date,slot`, {
        headers: { ...headers, Prefer: 'resolution=merge-duplicates' }, data: original,
      })
      : await page.request.delete(`${endpoint}?horse_id=eq.${horseId}&date=eq.${date}&slot=eq.lunch`, { headers });
    expect(response.ok(), 'Restore the QA feed check').toBe(true);
    const restored = await page.request.get(`${endpoint}?horse_id=eq.${horseId}&date=eq.${date}&slot=eq.lunch`, { headers });
    expect(await restored.json()).toEqual(original ? [original] : []);
  }
});
