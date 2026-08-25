import { test, expect } from '@playwright/test';

// Regression guard for the Expo Router group-collision blocker: the onboarding step
// files (stables/members/paddocks) used to share their URL with the top-level
// management screens (the "(onboarding)" group is stripped from the path), so the
// wizard's create-stable step was shadowed by app/stables/index.tsx and unreachable —
// a new user could not create their stable. The step screens were renamed to unique
// paths (create-stable / invite-members / setup-paddocks).

const BASE_URL = process.env.E2E_URL ?? 'http://localhost:8081';

test.describe('onboarding routing — no collision with management screens', () => {
  test('/create-stable renders the onboarding wizard step, not the management screen', async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/create-stable?qaDemo=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    // Onboarding step chrome, NOT the standalone "Stall och hästar / Snabbstart" manager.
    await expect(page.getByText('Onboarding').first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Skapa stall').first()).toBeVisible();
    await expect(page.getByText('Snabbstart')).toHaveCount(0);
  });

  test('/stables still resolves to the management screen', async ({ page }) => {
    await page.goto(`${BASE_URL}/stables?qaDemo=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await expect(page.getByText('Stall och hästar').first()).toBeVisible({ timeout: 30000 });
  });
});
