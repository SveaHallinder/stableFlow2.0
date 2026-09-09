import { expect, test } from '@playwright/test';

const fixtureId = 'b752bfe6-cc98-42b9-a52b-2be43e99cde6';
const title = 'QA bekräftad passändring';

for (const action of ['Klart', 'Kan inte']) {
  test(`${action} waits for the server and retains the assignment after failure`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let release;
    let writes = 0;
    let fixture;
    const login = page.waitForResponse((response) => response.url().includes('/auth/v1/token'))
      .then((response) => response.json());
    await page.route('**/rest/v1/assignments*', async (route) => {
      if (route.request().method() === 'GET') {
        const response = await route.fetch();
        const rows = await response.json();
        const { user } = await login;
        const now = new Date();
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        fixture = {
          id: fixtureId, stable_id: rows[0].stable_id, date, label: title, slot: 'Lunch',
          icon: 'clock', time: '12:00', status: 'assigned', assignee_id: user.id,
          assigned_via: 'manual', declined_by_user_ids: [], completed_at: null,
        };
        return route.fulfill({ response, json: [fixture] });
      }
      if (route.request().method() === 'PATCH') {
        writes += 1;
        const url = new URL(route.request().url());
        // An outdated screen cannot finish/release a pass that someone else now owns.
        if (writes > 1) {
          expect(url.searchParams.get('assignee_id')).toBe(`eq.${fixture.assignee_id}`);
          expect(url.searchParams.get('status')).toBe('eq.assigned');
          return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        }
        await new Promise((resolve) => { release = resolve; });
        return route.abort('failed');
      }
      return route.abort('blockedbyclient');
    });
    await page.route('**/rest/v1/assignment_history*', (route) =>
      route.request().method() === 'GET' ? route.continue() : route.abort('blockedbyclient'),
    );
    await page.goto('/');
    await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
    await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
    await page.goto('/calendar?view=mine');
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.getByText(action, { exact: true }).last().click();
    try {
      await expect(page.getByText('Sparar…', { exact: true })).toBeVisible();
      await expect(page.getByText(/^(Markerat som klart\.|Passet släpptes och blev ledigt\.)$/)).toHaveCount(0);
    } finally {
      release?.();
    }
    await expect(page.getByText('Passet kunde inte uppdateras. Försök igen.', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.getByText(action, { exact: true }).last().click();
    await expect(page.getByText('Passet har ändrats av någon annan. Uppdatera schemat och försök igen.', { exact: true }).first()).toBeVisible();
    expect(writes).toBe(2);
  });
}
