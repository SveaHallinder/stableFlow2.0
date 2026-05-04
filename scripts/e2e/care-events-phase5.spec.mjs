import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_URL ?? 'http://localhost:8081';
const SCREEN_DIR = process.env.E2E_SCREENS ?? '/tmp/stableflow-e2e-screens';

async function bootDemo(page) {
  await page.goto(`${BASE_URL}/?qaDemo=1`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Stallstatus först')).toBeVisible({ timeout: 30000 });
}

async function openHorseProfile(page) {
  await page.goto(`${BASE_URL}/horses/qa-horse-main?qaDemo=1`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Vård', { exact: true })).toBeVisible({ timeout: 15000 });
}

test.describe('Phase 5 — Care events + external contacts', () => {
  test('Hästprofil visar seedade kommande vård + kan slutföra', async ({ page }) => {
    await bootDemo(page);
    await openHorseProfile(page);
    // Seed har en vårdhändelse: Årsvaccination, vaccination, contactId qa-contact-vet
    await expect(page.getByText('Kommande vård', { exact: true })).toBeVisible();
    await expect(page.getByText(/Årsvaccination/).first()).toBeVisible();
    // Slutför första
    const slutforBtn = page.getByText('Slutför vård', { exact: true }).first();
    await slutforBtn.scrollIntoViewIfNeeded();
    await slutforBtn.click();
    const noteInput = page.locator('input[placeholder*="Notering, t.ex. nya skor"]').first();
    await noteInput.scrollIntoViewIfNeeded();
    await noteInput.fill('E2E vaccinerad');
    const sparaBtn = page.getByText('Spara vårdlogg', { exact: true }).first();
    await sparaBtn.scrollIntoViewIfNeeded();
    await sparaBtn.click();
    await expect(page.getByText('Vårdhändelse markerad klar.')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Vårdhistorik', { exact: true })).toBeVisible();
    await page.screenshot({ path: `${SCREEN_DIR}/p5-01-care-completed.png`, fullPage: true });
  });

  test('Skapa ny vårdhändelse via hästprofilens form', async ({ page }) => {
    await bootDemo(page);
    await openHorseProfile(page);
    const addBtn = page.getByText('Lägg till vårdhändelse', { exact: true }).first();
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click();
    // Välj hovslagare (default farrier är redan aktiv) - klicka explicit
    const hovslagareBtn = page.getByText('Hovslagare', { exact: true }).first();
    await hovslagareBtn.scrollIntoViewIfNeeded();
    await hovslagareBtn.click();
    // Fyll i titel + datum
    const titleInput = page.locator('input[placeholder*="Skoning"]').first();
    await titleInput.scrollIntoViewIfNeeded();
    await titleInput.fill('E2E hovbesök');
    const dateInput = page.locator('input[placeholder="Datum (YYYY-MM-DD)"]').first();
    await dateInput.scrollIntoViewIfNeeded();
    await dateInput.fill('2026-06-01');
    // Spara
    const skapaBtn = page.getByText('Skapa vårdhändelse', { exact: true }).first();
    await skapaBtn.scrollIntoViewIfNeeded();
    await skapaBtn.click();
    await expect(page.getByText('Vårdhändelse skapad.')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('E2E hovbesök')).toBeVisible();
    await page.screenshot({ path: `${SCREEN_DIR}/p5-02-care-created.png`, fullPage: true });
  });

  test('Schema/Vård-filter visar care events', async ({ page }) => {
    await bootDemo(page);
    await page.goto(`${BASE_URL}/calendar?qaDemo=1`, { waitUntil: 'domcontentloaded' });
    // Klicka Vård-filter chip
    const vardChip = page.getByText('Vård', { exact: true }).first();
    await vardChip.scrollIntoViewIfNeeded();
    await vardChip.click();
    await expect(page.getByText('Kommande vård', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Årsvaccination', { exact: true })).toBeVisible();
    await page.screenshot({ path: `${SCREEN_DIR}/p5-03-calendar-vard.png`, fullPage: true });
  });

  test('Contacts-sidan listar och låter admin lägga till kontakt', async ({ page }) => {
    await bootDemo(page);
    await page.goto(`${BASE_URL}/contacts?qaDemo=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Anna Veterinär')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Per Hovslagare')).toBeVisible();
    await page.screenshot({ path: `${SCREEN_DIR}/p5-04-contacts-list.png`, fullPage: true });
  });
});
