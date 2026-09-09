import { expect, test } from '@playwright/test';
import { URL } from 'node:url';

test.use({ trace: 'off', viewport: { width: 390, height: 844 } });

for (const lostAck of ['log', 'plan', 'plan-reload']) {
  test(`planned ride keeps its draft after lost ${lostAck} acknowledgement and retries without duplicate logs`, async ({ page }) => {
    const horsesLoaded = page.waitForResponse(response => response.url().includes('/rest/v1/horses?') && response.request().method() === 'GET');
    await page.goto('/');
    await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
    await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
    const horse = (await (await horsesLoaded).json()).find(row => row.name === 'StableFlow QA Horse');
    expect(Boolean(horse?.id)).toBe(true);
    const fixture = {
      id: 'a7e26614-ea3a-40ea-8617-4709b2a2b8c1', stable_id: horse.stable_id, horse_id: horse.id,
      date: '2026-09-08', ride_type_id: 'a7e26614-ea3a-40ea-8617-4709b2a2b8c2',
      status: 'planned', note: 'QA planerat ridpass', created_at: '2026-09-08T06:00:00Z', completed_ride_log_id: null,
    };
    const logs = new Map();
    let storedPlan = fixture;
    let logWrites = 0;
    let planWrites = 0;
    let release;
    let reloaded = false;
    await page.route('**/rest/v1/ride_logs*', async route => {
      const request = route.request();
      if (request.method() === 'GET') {
        return route.fulfill({ json: new URL(request.url()).searchParams.has('id') ? logs.get(fixture.id) : reloaded ? [...logs.values()] : [] });
      }
      if (request.method() !== 'POST') return route.abort('blockedbyclient');
      logWrites += 1;
      const payload = request.postDataJSON();
      expect(payload.id).toBe(fixture.id);
      if (logs.has(payload.id)) return route.fulfill({ status: 409, json: { code: '23505', message: 'QA duplicate log' } });
      logs.set(payload.id, payload);
      if (lostAck === 'log') {
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      return route.fulfill({ json: payload });
    });
    await page.route('**/rest/v1/planned_rides*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'GET') return route.fulfill({ json: url.searchParams.has('id') ? storedPlan : [fixture] });
      if (request.method() !== 'PATCH') return route.abort('blockedbyclient');
      planWrites += 1;
      expect(url.searchParams.get('status')).toBe('eq.planned');
      if (storedPlan.status === 'done') return route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'QA no matching planned row' } });
      if (lostAck !== 'plan-reload' || planWrites > 1) storedPlan = { ...fixture, ...request.postDataJSON() };
      if (lostAck !== 'log' && planWrites === 1) {
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      return route.fulfill({ json: storedPlan });
    });
    await page.goto(`/horses/${horse.id}`);
    await page.getByText('Slutför ridpass', { exact: true }).click();
    const length = page.getByPlaceholder('Längd, t.ex. 45 min');
    await length.fill('45 min');
    await page.getByPlaceholder('Notering', { exact: true }).fill('QA behåll denna anteckning');
    await page.getByRole('button', { name: 'Logga ridpass klart', exact: true }).click();
    try {
      await expect.poll(() => Boolean(release)).toBe(true);
      await expect(page.getByRole('button', { name: 'Loggar ridpass…', exact: true })).toBeDisabled();
      await expect(length).toHaveValue('45 min');
      await expect(page.getByText('Ridpass loggat.', { exact: true })).toHaveCount(0);
      expect(planWrites).toBe(lostAck === 'log' ? 0 : 1);
    } finally { release?.(); }
    await expect(page.getByRole('alert').filter({ hasText: lostAck === 'log' ? 'Ridpasset kunde inte loggas' : 'Ridloggen har sparats' })).toBeVisible();
    await expect(length).toHaveValue('45 min');
    if (lostAck === 'plan-reload') {
      reloaded = true;
      await page.reload();
      await page.getByText('Slutför ridpass', { exact: true }).click();
      await expect(length).toHaveValue('45 min');
      await expect(length).not.toBeEditable();
      await expect(page.getByPlaceholder('Notering', { exact: true })).toHaveValue('QA behåll denna anteckning');
      await page.getByRole('button', { name: 'Markera passet klart', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Logga ridpass klart', exact: true }).click();
    }
    await expect(page.getByText('Ridpass loggat.', { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(length).toHaveCount(0);
    expect(logs.size).toBe(1);
    expect(logWrites).toBe(2);
    expect(planWrites).toBe(lostAck === 'log' ? 1 : 2);
    expect(storedPlan.completed_ride_log_id).toBe(fixture.id);
  });
}
