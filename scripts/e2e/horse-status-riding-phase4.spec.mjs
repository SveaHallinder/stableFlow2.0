import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_URL ?? 'http://localhost:8081';
const SCREEN_DIR = process.env.E2E_SCREENS ?? '/tmp/stableflow-e2e-screens';

async function bootDemo(page) {
  await page.goto(`${BASE_URL}/?qaDemo=1`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Stallstatus först')).toBeVisible({ timeout: 30000 });
}

async function openHorseProfile(page) {
  await page.goto(`${BASE_URL}/horses/qa-horse-main?qaDemo=1`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Foderplan', { exact: true })).toBeVisible({ timeout: 15000 });
}

test.describe('Phase 4 — Horse status + planned rides', () => {
  test('Hästprofil visar Dagens status med editor-toggles', async ({ page }) => {
    await bootDemo(page);
    await openHorseProfile(page);
    // Status-editor använder labels Dag/Natt/Hö/Vatten/Kollad
    await expect(page.getByText('Dag', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Natt', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Hö', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Vatten', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Kollad', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: `${SCREEN_DIR}/p4-01-status-editor.png`, fullPage: true });
  });

  test('Status-editor: Inne/Ute toggles uppdaterar via updateHorseDayStatus', async ({ page }) => {
    await bootDemo(page);
    await openHorseProfile(page);
    // Klicka "Inne" för Dag — det är textens "Inne" inom dag-raden
    const inneButtons = page.getByText('Inne', { exact: true });
    expect(await inneButtons.count()).toBeGreaterThanOrEqual(2);
    // Toggla första (Dag) — qaDemo seedar dayStatus='out', natstatus='in'
    await inneButtons.first().click();
    await expect(page.getByText('Status uppdaterad.')).toBeVisible({ timeout: 5000 });
  });

  test('Planera ridpass via hästprofilen', async ({ page }) => {
    await bootDemo(page);
    await openHorseProfile(page);
    await page.getByText('Planera ridpass', { exact: true }).click();
    const dateInput = page.locator('input[placeholder="Datum (YYYY-MM-DD)"]');
    await dateInput.scrollIntoViewIfNeeded();
    await dateInput.fill('2026-05-04');
    await page.locator('input[placeholder*="Tid"]').first().fill('09:00');
    const noteringInput = page.locator('input[placeholder*="Notering"]').first();
    await noteringInput.scrollIntoViewIfNeeded();
    await noteringInput.fill('E2E – Phase 4 ride');
    const addBtn = page.getByText('Lägg till', { exact: true }).first();
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click();
    await expect(page.getByText('Ridpass planerat.')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('2026-05-04 · 09:00')).toBeVisible();
    await page.screenshot({ path: `${SCREEN_DIR}/p4-02-ride-planned.png`, fullPage: true });
  });

  test('Slutför planerat ridpass skapar ride log', async ({ page }) => {
    await bootDemo(page);
    await openHorseProfile(page);
    const slutforBtn = page.getByText('Slutför ridpass', { exact: true }).first();
    await slutforBtn.scrollIntoViewIfNeeded();
    await slutforBtn.click();
    const lengthInput = page.locator('input[placeholder*="Längd"]').first();
    await lengthInput.scrollIntoViewIfNeeded();
    await lengthInput.fill('45 min');
    const noteringInput = page.locator('input[placeholder="Notering"]').first();
    await noteringInput.scrollIntoViewIfNeeded();
    await noteringInput.fill('E2E klar');
    const loggaBtn = page.getByText('Logga ridpass klart', { exact: true }).first();
    await loggaBtn.scrollIntoViewIfNeeded();
    await loggaBtn.click();
    await expect(page.getByText('Ridpass loggat.')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/45 min/).first()).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${SCREEN_DIR}/p4-03-ride-completed.png`, fullPage: true });
  });

  test('Avboka planerat ridpass', async ({ page }) => {
    await bootDemo(page);
    await openHorseProfile(page);
    const avbokaBtn = page.getByText('Avboka', { exact: true }).first();
    if (!(await avbokaBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Inga planerade pass att avboka i seed.');
    }
    await avbokaBtn.click();
    await expect(page.getByText('Ridpass uppdaterat.')).toBeVisible({ timeout: 5000 });
  });

  test('Ta bort planerat ridpass', async ({ page }) => {
    await bootDemo(page);
    await openHorseProfile(page);
    const tabortBtn = page.getByText('Ta bort', { exact: true }).first();
    if (!(await tabortBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Inga planerade pass att ta bort i seed.');
    }
    await tabortBtn.click();
    await expect(page.getByText('Ridpass borttaget.')).toBeVisible({ timeout: 5000 });
  });
});
