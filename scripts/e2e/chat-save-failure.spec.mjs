import { expect, test } from '@playwright/test';

// All outgoing messages are intercepted. Nothing is sent to another person.
test('chat retains an unsent draft and retries with the same message ID', async ({ page }) => {
  await page.route('**/rest/v1/messages*', route => route.fulfill({ json: [] }));
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
  const loaded = page.waitForResponse(response => new URL(response.url()).pathname === '/rest/v1/conversations' && response.request().method() === 'GET');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  const conversations = await (await loaded).json();
  await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
  await page.goto(`/chat/${conversations[0].id}`);
  await expect(page.getByText('QA Admin', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('StableFlow QA Stable', { exact: true }).first()).toBeVisible();
  const draft = page.getByPlaceholder('Skriv ditt meddelande...');
  await draft.fill('QA: detta meddelande får aldrig skickas på riktigt');
  let release;
  const writes = [];
  await page.route('**/rest/v1/messages*', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    const payload = route.request().postDataJSON();
    writes.push(payload);
    if (writes.length === 1) {
      await new Promise(resolve => { release = resolve; });
      return route.abort('failed');
    }
    return route.fulfill({ json: payload });
  });
  await page.getByRole('button', { name: 'Skicka meddelande', exact: true }).click();
  try {
    await expect.poll(() => Boolean(release)).toBe(true);
    await expect(draft).toHaveValue('QA: detta meddelande får aldrig skickas på riktigt');
    await expect(page.getByText('Skickar…', { exact: true })).toBeVisible();
  } finally { release?.(); }
  await expect(page.getByText('Meddelandet kunde inte skickas. Försök igen.', { exact: true }).first()).toBeVisible();
  await draft.fill('QA: detta meddelande får aldrig skickas på riktigt ');
  await page.getByRole('button', { name: 'Skicka meddelande', exact: true }).click();
  await expect(draft).toHaveValue('');
  expect(writes).toHaveLength(2);
  expect(writes[1].id).toBe(writes[0].id);
  await expect(page.getByText(writes[0].text, { exact: true })).toHaveCount(1);
  await expect(page.getByText('Skickat', { exact: true })).toBeVisible();
});
