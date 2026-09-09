import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_URL ?? 'http://localhost:8081';
const SCREEN_DIR = process.env.E2E_SCREENS ?? '/tmp/stableflow-e2e-screens';

async function bootDemo(page) {
  await page.goto(`${BASE_URL}/?qaDemo=1`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Stallstatus först')).toBeVisible({ timeout: 30000 });
}

test.describe('Phase 6 — Stable alerts separated from feed/chat', () => {
  test('Idag visar Viktigt-kort med seedat alert', async ({ page }) => {
    await bootDemo(page);
    // Viktigt-kortets rubrik
    await expect(page.getByText('Viktigt', { exact: true }).first()).toBeVisible();
    // Seedade titel + body
    await expect(page.getByText('Grinden till Vinterhagen är trög')).toBeVisible();
    await expect(page.getByText('Stäng med kedjan tills den är justerad.')).toBeVisible();
    // "1 aktiva" eller "1 aktiv"
    await expect(page.getByText(/\d+ aktiva/).first()).toBeVisible();
    await page.screenshot({ path: `${SCREEN_DIR}/p6-01-idag-alert.png`, fullPage: true });
  });

  test('Löst-knapp tar bort alertet från aktiv-listan', async ({ page }) => {
    await bootDemo(page);
    // Klicka första Löst-knappen
    const losBtn = page.getByText('Löst', { exact: true }).first();
    await losBtn.scrollIntoViewIfNeeded();
    await losBtn.click();
    // Alertet försvinner från aktiva
    await expect(page.getByText('Grinden till Vinterhagen är trög')).toHaveCount(0, { timeout: 5000 });
  });

  test('Skapa nytt Akut-alert via Händelser-modalen', async ({ page }) => {
    await bootDemo(page);
    // QuickAction Händelser har accessibilityLabel "Händelser" — klicka via text fallback
    const eventsTrigger = page.getByText('Händelser', { exact: true }).first();
    await eventsTrigger.scrollIntoViewIfNeeded();
    await eventsTrigger.click();
    // Välj Akut chip
    const akutChip = page.getByText('Akut', { exact: true }).first();
    await akutChip.scrollIntoViewIfNeeded();
    await akutChip.click();
    // Skriv text
    const input = page.locator('input[placeholder*="Kanel har tappat en sko"]').first();
    await input.scrollIntoViewIfNeeded();
    await input.fill('E2E akut: vattenkranen läcker');
    // Skicka via primärknapp i QuickActionSheet — texten är "Skicka"
    const send = page.getByText('Skicka', { exact: true }).first();
    await send.scrollIntoViewIfNeeded();
    await send.click();
    await expect(page.getByText('Viktig notis lades till.')).toBeVisible({ timeout: 5000 });
    // Det nya alertet syns i Viktigt-listan
    await expect(page.getByText('E2E akut: vattenkranen läcker')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${SCREEN_DIR}/p6-02-urgent-created.png`, fullPage: true });
  });

  test('Feed visar Viktigt-strip med aktiva alerts', async ({ page }) => {
    await bootDemo(page);
    await page.goto(`${BASE_URL}/feed?qaDemo=1`, { waitUntil: 'domcontentloaded' });
    // Strip-rubrik
    await expect(page.getByText('Viktigt i stallet', { exact: true })).toBeVisible({ timeout: 10000 });
    // Seedat alert syns där
    await expect(page.getByText('Grinden till Vinterhagen är trög')).toBeVisible();
    await page.screenshot({ path: `${SCREEN_DIR}/p6-03-feed-strip.png`, fullPage: true });
  });

  test('Skapa info-händelse hamnar INTE i Viktigt-listan', async ({ page }) => {
    await bootDemo(page);
    const eventsTrigger = page.getByText('Händelser', { exact: true }).first();
    await eventsTrigger.scrollIntoViewIfNeeded();
    await eventsTrigger.click();
    // Default chip är "Händelse" (info)
    const input = page.locator('input[placeholder*="Kanel har tappat en sko"]').first();
    await input.scrollIntoViewIfNeeded();
    await input.fill('E2E info: hosta i hage 3');
    const send = page.getByText('Skicka', { exact: true }).first();
    await send.scrollIntoViewIfNeeded();
    await send.click();
    await expect(page.getByText('Händelsen lades till.')).toBeVisible({ timeout: 5000 });
    // Det info-meddelandet ska INTE synas i Viktigt-strippen på feed
    await page.goto(`${BASE_URL}/feed?qaDemo=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Viktigt i stallet')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('E2E info: hosta i hage 3')).toHaveCount(0);
  });
});
