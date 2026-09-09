import { expect, test } from '@playwright/test';
import { URL } from 'node:url';

test.use({ trace: 'off', viewport: { width: 390, height: 844 } });

for (const access of ['admin', 'horse-owner']) {
  test(`${access}: deleting a stable feed default is permission-scoped and confirmed`, async ({ page }) => {
    const horsesLoaded = page.waitForResponse(response => response.url().includes('/rest/v1/horses?') && response.request().method() === 'GET');
    const membershipLoaded = page.waitForResponse(response => response.url().includes('/rest/v1/stable_members?') && new URL(response.url()).searchParams.has('user_id'));
    await page.goto('/');
    await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
    await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
    const horses = await (await horsesLoaded).json();
    const horse = horses.find(row => row.name === 'StableFlow QA Horse');
    const membership = await (await membershipLoaded).json();
    expect(Boolean(horse?.id && membership[0]?.user_id)).toBe(true);
    const fixture = {
      id: '67e26614-ea3a-40ea-8617-4709b2a2b8c1', stable_id: horse.stable_id, horse_id: null,
      slot: 'morning', label: 'QA gemensam morgonplan', amount: '2 kg', note: null,
      is_stable_default: true, active: true,
    };
    let deletes = 0;
    let release;
    await page.route('**/rest/v1/assignments*', route => route.request().method() === 'GET' ? route.continue() : route.abort('blockedbyclient'));
    await page.route('**/rest/v1/feed_plans*', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: [fixture] });
      if (route.request().method() !== 'DELETE') return route.abort('blockedbyclient');
      expect(new URL(route.request().url()).searchParams.get('id')).toBe(`eq.${fixture.id}`);
      deletes += 1;
      await new Promise(resolve => { release = resolve; });
      return route.fulfill({ json: [{ id: fixture.id }] });
    });
    if (access === 'horse-owner') {
      await page.route('**/rest/v1/stable_members*', route => route.fulfill({ json: membership.map(row => ({ ...row, role: 'rider', access: 'view', rider_role: 'owner' })) }));
      await page.route('**/rest/v1/horses*', route => route.fulfill({ json: horses.map(row => row.id === horse.id ? { ...row, owner_user_id: membership[0].user_id } : row) }));
    }
    await page.goto(`/horses/${horse.id}`);
    await expect(page.getByText(fixture.label, { exact: true })).toBeVisible();
    const remove = page.getByRole('button', { name: 'Ta bort stallplan', exact: true });
    if (access === 'horse-owner') {
      await expect(page.getByRole('button', { name: /Lägg till hästplan$/ }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Ändra stallplan$/ })).toHaveCount(0);
      await expect(remove).toHaveCount(0);
      expect(deletes).toBe(0);
      return;
    }
    await expect(remove).toBeVisible();
    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('alla hästar utan egen plan');
      await dialog.dismiss();
    });
    await remove.click();
    expect(deletes).toBe(0);
    await expect(page.getByText(fixture.label, { exact: true })).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await remove.click();
    try {
      await expect.poll(() => deletes).toBe(1);
      await expect(page.getByRole('button', { name: 'Tar bort stallplan…', exact: true })).toBeDisabled();
      await expect(page.getByText(fixture.label, { exact: true })).toBeVisible();
    } finally {
      release?.();
    }
    await expect(page.getByText(fixture.label, { exact: true })).toHaveCount(0);
    await expect(page.getByText('Ingen foderplan satt för morgonfoder.', { exact: true })).toBeVisible();
  });
}
