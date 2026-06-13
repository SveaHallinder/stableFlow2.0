import { test, expect } from '@playwright/test';

// Backend-free render smoke for the self-serve signup UI (pre-auth, no mutations).
// Verifies the auth screen boots and the create/join intent toggle + fields render
// and are interactive. Run against a locally-served web build:
//   E2E_URL=http://localhost:8091 npx playwright test scripts/e2e/smoke-signup.spec.mjs

test('auth screen renders self-serve signup intent toggle + fields', async ({ page }) => {
  await page.goto('/');

  // Switch to signup mode (mode chip; submit button shares the label, take the first).
  const signupChip = page.getByRole('button', { name: 'Skapa konto' }).first();
  await expect(signupChip).toBeVisible({ timeout: 20_000 });
  await signupChip.click();

  // Default intent is 'create' → stable-name field is shown.
  await expect(page.getByPlaceholder('T.ex. Soltorps Ridklubb')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skapa eget stall' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Har inbjudningskod' })).toBeVisible();

  // Switch to join intent → invite-code field replaces stable-name field.
  await page.getByRole('button', { name: 'Har inbjudningskod' }).click();
  await expect(page.getByPlaceholder('Kod från admin')).toBeVisible();
  await expect(page.getByPlaceholder('T.ex. Soltorps Ridklubb')).toHaveCount(0);

  // Back to create intent.
  await page.getByRole('button', { name: 'Skapa eget stall' }).click();
  await expect(page.getByPlaceholder('T.ex. Soltorps Ridklubb')).toBeVisible();

  await page.screenshot({ path: '/tmp/smoke-signup.png', fullPage: true });
});
