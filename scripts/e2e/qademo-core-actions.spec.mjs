import { test, expect } from '@playwright/test';

// Regression guard: in the backend-free qaDemo mode, core write actions must update
// optimistically WITHOUT surfacing the persist-error toast. Before the fix, every write
// hit Supabase with no session, failed, and fired "Kunde inte spara ändringen..." on
// every action — making the app feel completely broken to a human tester.

const BASE_URL = process.env.E2E_URL ?? 'http://localhost:8081';
const PERSIST_ERROR = 'Kunde inte spara ändringen';
const QA_MEMBER_ID = '00000000-0000-4000-8000-000000000002';

async function expectNoPersistError(page) {
  // Give any (erroneous) debounced toast a beat to appear, then assert it didn't.
  await page.waitForTimeout(400);
  await expect(page.getByText(PERSIST_ERROR)).toHaveCount(0);
}

test.describe('qaDemo — core write actions stay silent (no persist-error toast)', () => {
  test('send a chat message: appears, no error toast', async ({ page }) => {
    await page.goto(`${BASE_URL}/chat/qa-conversation-private?qaDemo=1&name=QA%20Medlem`, {
      waitUntil: 'domcontentloaded',
    });
    const input = page.getByPlaceholder('Skriv ditt meddelande...');
    await expect(input).toBeVisible({ timeout: 30000 });
    await input.fill('E2E: tar kvällspasset');
    await page.getByRole('button', { name: 'Skicka meddelande' }).click();
    await expect(page.getByText('E2E: tar kvällspasset')).toBeVisible({ timeout: 5000 });
    await expectNoPersistError(page);
  });

  test('create a feed post + like: no error toast', async ({ page }) => {
    await page.goto(`${BASE_URL}/feed?qaDemo=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.getByRole('button', { name: 'Gilla inlägg' }).first().click();
    const composer = page.getByPlaceholder('Vad behöver alla veta idag?');
    await expect(composer).toBeVisible({ timeout: 20000 });
    await composer.fill('E2E: containern är tömd');
    await page.getByRole('button', { name: 'Publicera inlägg' }).click();
    await expect(page.getByText('E2E: containern är tömd')).toBeVisible({ timeout: 5000 });
    await expectNoPersistError(page);
  });

  test('block a member: button flips to Avblockera, no error toast', async ({ page }) => {
    await page.goto(`${BASE_URL}/members/${QA_MEMBER_ID}?qaDemo=1`, {
      waitUntil: 'domcontentloaded',
    });
    const blockBtn = page.getByRole('button', { name: 'Blockera användare' });
    await expect(blockBtn).toBeVisible({ timeout: 30000 });
    await blockBtn.click();
    // Optimistic block must STICK (no rollback in qaDemo).
    await expect(page.getByRole('button', { name: 'Avblockera användare' })).toBeVisible({
      timeout: 5000,
    });
    await expectNoPersistError(page);
  });
});
