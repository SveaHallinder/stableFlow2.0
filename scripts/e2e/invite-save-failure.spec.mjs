import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('invite keeps its draft, targets only selected stables and recovers the confirmed code', async ({ page }) => {
  // This table triggers email delivery: every request is intercepted before login.
  let release;
  const writes = [];
  let saved = [];
  await page.route('**/rest/v1/stable_invites*', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: saved });
    if (route.request().method() !== 'POST') return route.abort('blockedbyclient');
    const payload = route.request().postDataJSON();
    writes.push(payload);
    if (writes.length === 1) {
      saved = payload;
      await new Promise(resolve => { release = resolve; });
      return route.abort('failed');
    }
    return route.fulfill({ status: 409, json: { code: '23505', message: 'QA previously saved invitation' } });
  });
  const login = page.waitForResponse(response => new URL(response.url()).pathname === '/auth/v1/token').then(response => response.json());
  const stablesLoaded = page.waitForResponse(response => new URL(response.url()).pathname === '/rest/v1/stables' && response.request().method() === 'GET');
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  const { user } = await login;
  const stableA = (await (await stablesLoaded).json())[0];
  const stableB = { ...stableA, id: 'fe1ee991-407d-4578-ae9b-24b7d3c3c2ba', name: 'QA endast detta stall' };
  await expect(page.getByText(stableA.name).first()).toBeVisible({ timeout: 20_000 });
  await page.route('**/rest/v1/stables*', route => route.request().method() === 'GET'
    ? route.fulfill({ json: [stableA, stableB] }) : route.abort('blockedbyclient'));
  await page.route('**/rest/v1/stable_members*', route => route.request().method() === 'GET'
    ? route.fulfill({ json: [stableA, stableB].map(stable => ({ stable_id: stable.id, user_id: user.id, role: 'admin', access: 'owner', horse_ids: [] })) })
    : route.abort('blockedbyclient'));
  await page.route('**/rest/v1/assignments*', route => route.request().method() === 'GET' ? route.fulfill({ json: [{ id: 'fe1ee991-407d-4578-ae9b-24b7d3c3c2bc', stable_id: stableA.id, date: '2026-09-08', label: 'QA startpass', slot: 'Morgon', time: '07:00', status: 'done', assignee_id: user.id }] }) : route.abort('blockedbyclient'));
  await page.goto('/stables');
  const form = page.getByText('Bjud in medlem', { exact: true }).locator('..');
  await expect(form.getByText(stableB.name, { exact: true })).toBeVisible({ timeout: 20_000 });
  await form.getByText(stableB.name, { exact: true }).click();
  await form.getByText(stableA.name, { exact: true }).click();
  await form.getByPlaceholder('Namn', { exact: true }).fill('QA inbjudan');
  const email = form.getByPlaceholder('E-post', { exact: true });
  await email.fill('never-send-this@example.test');
  await form.getByText('Skapa inbjudan', { exact: true }).click();
  try {
    await expect.poll(() => Boolean(release)).toBe(true);
    expect(writes[0].map(row => row.stable_id)).toEqual([stableB.id]);
    await expect(email).toHaveValue('never-send-this@example.test');
    await expect(form.getByText('Skapar inbjudan…', { exact: true })).toBeVisible();
    await expect(form.getByText('Inbjudan skapad', { exact: true })).toHaveCount(0);
  } finally { release?.(); }
  await expect(form.getByRole('alert')).toContainText('Inbjudan kunde inte skapas');
  await form.getByText('Skapa inbjudan', { exact: true }).click();
  await expect(email).toHaveValue('');
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  await expect(form.getByText(saved[0].code, { exact: true })).toBeVisible();
  await expect(form.getByRole('button', { name: `Kopiera inbjudningskod ${saved[0].code}`, exact: true })).toBeVisible();
});
