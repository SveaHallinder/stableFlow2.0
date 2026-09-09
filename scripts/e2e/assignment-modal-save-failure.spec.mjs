import { expect, test } from '@playwright/test';
import { URL } from 'node:url';

test.use({ trace: 'off', viewport: { width: 390, height: 1600 } });

for (const action of ['create', 'update', 'delete']) {
  test(`${action}: assignment modal retains the draft until the server confirms the write`, async ({ page }) => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const fixture = {
      id: '32142aa8-7a6e-4696-9677-bd36d0e11901',
      stable_id: '6eb197a3-0be8-4d8a-a3f3-fe04718c26b7',
      date, label: 'QA modal befintligt pass', slot: 'Lunch', icon: 'clock', time: '12:00',
      status: 'completed', assignee_id: null, assigned_via: null, declined_by_user_ids: [],
    };
    const method = { create: 'POST', update: 'PATCH', delete: 'DELETE' }[action];
    const saveLabel = { create: 'Skapa pass', update: 'Spara ändringar', delete: 'Ta bort pass' }[action];
    const errorMessage = {
      create: 'Passet kunde inte skapas. Försök igen.',
      update: 'Passet kunde inte uppdateras. Försök igen.',
      delete: 'Passet kunde inte tas bort. Försök igen.',
    }[action];
    let release;
    let writes = 0;
    await page.route('**/rest/v1/assignments*', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: [fixture] });
      if (route.request().method() !== method) return route.abort('blockedbyclient');
      writes += 1;
      if (writes === 1) {
        await new Promise((resolve) => { release = resolve; });
        return route.abort('failed');
      }
      if (writes === 2) return route.fulfill({ json: [] });
      const id = action === 'create' ? route.request().postDataJSON().id : fixture.id;
      return route.fulfill({ json: [{ id }] });
    });
    await page.route('**/rest/v1/assignment_history*', (route) => route.fulfill({ json: [] }));
    await page.goto('/');
    await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
    await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
    await page.goto('/calendar?view=all');
    await expect(page.getByText(fixture.label, { exact: true })).toBeVisible();
    if (action === 'create') {
      await page.getByRole('button', { name: 'Nytt pass', exact: true }).first().click();
    } else {
      await page.getByText('Hantera', { exact: true }).first().click();
    }
    const label = page.getByPlaceholder('Ex. Mockning, Harva ridhus');
    const note = page.getByPlaceholder('Beskrivning (valfritt)');
    await label.fill('QA modal utkast');
    await note.fill('Behåll anteckningen efter nätfel');
    if (action === 'create') await page.getByText('Låt passet vara öppet', { exact: true }).click();
    const submit = () => page.getByText(saveLabel, { exact: true }).last().click();
    if (action !== 'delete') {
      await page.getByPlaceholder('07:00').fill('25:61');
      await submit();
      await expect(page.getByText('Ange en giltig tid i formatet HH:MM (00:00–23:59).', { exact: true })).toBeVisible();
      expect(writes).toBe(0);
      await page.getByPlaceholder('07:00').fill('07:30');
    }
    await submit();
    try {
      await expect.poll(() => writes).toBe(1);
      await expect(page.getByText(action === 'delete' ? 'Tar bort pass…' : 'Sparar pass…', { exact: true })).toBeVisible();
      await expect(label).toHaveValue('QA modal utkast');
      await expect(note).toHaveValue('Behåll anteckningen efter nätfel');
    } finally {
      release?.();
    }
    await expect(page.getByText(errorMessage, { exact: true })).toBeVisible();
    await expect(note).toHaveValue('Behåll anteckningen efter nätfel');
    await submit();
    await expect.poll(() => writes).toBe(2);
    await expect(page.getByText(errorMessage, { exact: true })).toBeVisible();
    await expect(label).toHaveValue('QA modal utkast');
    await submit();
    await expect.poll(() => writes).toBe(3);
    await expect(label).toHaveCount(0);
    if (action === 'delete') {
      await expect(page.getByText(fixture.label, { exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByText('QA modal utkast', { exact: true })).toBeVisible();
    }
  });
}

for (const changedOnServer of [false, true]) {
  test(`create retry reuses its ID after lost acknowledgement (changed on server: ${changedOnServer})`, async ({ page }) => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const baseline = {
      id: '32142aa8-7a6e-4696-9677-bd36d0e11901', stable_id: '6eb197a3-0be8-4d8a-a3f3-fe04718c26b7',
      date, label: 'QA befintligt pass', slot: 'Lunch', icon: 'clock', time: '12:00',
      status: 'completed', assignee_id: null, declined_by_user_ids: [],
    };
    const attempts = [];
    const savedRows = new Map();
    let conflictReads = 0;
    let overwrites = 0;
    let upserts = 0;
    await page.route('**/rest/v1/assignments*', async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        const idFilter = new URL(request.url()).searchParams.get('id');
        if (idFilter) {
          conflictReads += 1;
          return route.fulfill({ json: savedRows.get(idFilter.replace(/^eq\./, '')) ?? null });
        }
        return route.fulfill({ json: [baseline] });
      }
      if (request.method() !== 'POST') {
        overwrites += 1;
        return route.abort('blockedbyclient');
      }
      const payload = request.postDataJSON();
      if (request.headers().prefer?.includes('resolution=merge-duplicates')) upserts += 1;
      attempts.push(payload);
      if (savedRows.has(payload.id)) {
        return route.fulfill({ status: 409, json: { code: '23505', message: 'QA duplicate request ID' } });
      }
      savedRows.set(payload.id, changedOnServer ? { ...payload, note: 'Ändrat av annan användare' } : payload);
      if (attempts.length === 1) return route.abort('failed');
      return route.fulfill({ json: [{ id: payload.id }] });
    });
    await page.route('**/rest/v1/assignment_history*', (route) => route.fulfill({ json: [] }));
    await page.goto('/');
    await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
    await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
    await page.goto('/calendar?view=all');
    await page.getByRole('button', { name: 'Nytt pass', exact: true }).first().click();
    const label = page.getByPlaceholder('Ex. Mockning, Harva ridhus');
    await label.fill('QA förlorad kvittens');
    await page.getByPlaceholder('Beskrivning (valfritt)').fill('Ursprungligt utkast');
    await page.getByText('Låt passet vara öppet', { exact: true }).click();
    await page.getByText('Skapa pass', { exact: true }).last().click();
    await expect(page.getByText('Passet kunde inte skapas. Försök igen.', { exact: true })).toBeVisible();
    await page.getByText('Skapa pass', { exact: true }).last().click();
    await expect.poll(() => attempts.length).toBe(2);
    expect(attempts[1].id).toBe(attempts[0].id);
    if (changedOnServer) {
      await expect(page.getByText('Passet har redan sparats med andra uppgifter. Uppdatera schemat och öppna passet för att redigera.', { exact: true })).toBeVisible();
      await expect(label).toHaveValue('QA förlorad kvittens');
      expect(savedRows.get(attempts[0].id).note).toBe('Ändrat av annan användare');
    } else {
      await expect(label).toHaveCount(0);
      await expect(page.getByText('QA förlorad kvittens', { exact: true })).toHaveCount(1);
    }
    expect(conflictReads).toBe(1);
    expect(savedRows.size).toBe(1);
    expect(overwrites).toBe(0);
    expect(upserts).toBe(0);
  });
}
