import { expect, test } from '@playwright/test';

const qaStableId = '6eb197a3-0be8-4d8a-a3f3-fe04718c26b7';
for (const role of ['admin', 'rider']) {
  test(`${role}: defaults from another stable or a read-only session never auto-assign`, async ({ page }) => {
    const login = page.waitForResponse((response) => response.url().includes('/auth/v1/token'))
      .then((response) => response.json());
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    let writes = 0;
    await page.route('**/rest/v1/assignments*', async (route) => {
      if (route.request().method() !== 'GET') {
        writes += 1;
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      return route.fulfill({ json: [{
        id: 'ae1ee991-407d-4578-ae9b-24b7d3c3c2bb', stable_id: qaStableId,
        date, label: 'QA stallavgränsat pass', slot: 'Lunch', icon: 'clock', time: '12:00',
        status: 'open', assignee_id: null, assigned_via: null, declined_by_user_ids: [],
      }] });
    });
    await page.route('**/rest/v1/default_passes*', async (route) => {
      if (route.request().method() !== 'GET') return route.abort('blockedbyclient');
      const { user } = await login;
      return route.fulfill({ json: [{
        user_id: user.id, weekday: (today.getDay() + 6) % 7, slot: 'Lunch',
        stable_id: role === 'admin' ? '45ec0950-c79d-4e1f-9348-16898d4eb792' : qaStableId,
      }] });
    });
    await page.goto('/');
    await page.getByPlaceholder('namn@exempel.se').fill(`stableflow-${role}@example.test`);
    await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
    await page.goto('/calendar?view=open');
    await expect(page.getByRole('button', { name: 'Ta QA stallavgränsat pass', exact: true })).toBeVisible();
    expect(writes).toBe(0);
  });
}
