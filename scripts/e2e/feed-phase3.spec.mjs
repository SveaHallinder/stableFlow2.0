import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_URL ?? 'http://localhost:8081';
const SCREEN_DIR = process.env.E2E_SCREENS ?? '/tmp/stableflow-e2e-screens';

async function bootDemo(page) {
  await page.goto(`${BASE_URL}/?qaDemo=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  // Wait for the Idag header
  await expect(page.getByText('Stallstatus först')).toBeVisible({ timeout: 30000 });
}

test.describe('Phase 3 — Feed e2e against qaDemo state', () => {
  test('Idag deviation: avvikelse-knapp + form sparar deviation', async ({ page }) => {
    await bootDemo(page);
    await expect(page.getByText('Foder nu', { exact: true })).toBeVisible();
    // Idag-kortet ska visa Avvikelse-knapp på horse-raden
    await page.getByText('Avvikelse', { exact: true }).first().click();
    const input = page
      .locator('input[placeholder*="Skriv en kort avvikelse"]')
      .first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('E2E-Idag: trasig kran');
    // Klicka Spara avvikelse
    await page.getByText('Spara avvikelse', { exact: true }).first().click();
    await expect(page.getByText('Avvikelse registrerad.')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${SCREEN_DIR}/07-idag-deviation.png`, fullPage: true });
    // Avvikelsetexten ska nu synas i raden
    await expect(page.getByText(/Avvikelse: E2E-Idag: trasig kran/)).toBeVisible();
  });

  test('Idag deviation: Avbryt rensar formulär utan att spara', async ({ page }) => {
    await bootDemo(page);
    await page.getByText('Avvikelse', { exact: true }).first().click();
    const input = page.locator('input[placeholder*="Skriv en kort avvikelse"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('Detta ska INTE sparas');
    await page.getByText('Avbryt', { exact: true }).first().click();
    await expect(input).toBeHidden({ timeout: 5000 });
    // Texten får inte förekomma kvar
    expect(await page.getByText(/Detta ska INTE sparas/).count()).toBe(0);
  });

  test('Idag visar "Foder nu" kort med slot och horse-rows', async ({ page }) => {
    await bootDemo(page);
    await page.screenshot({ path: `${SCREEN_DIR}/01-idag.png`, fullPage: true });
    // Card eyebrow says "Foder nu"
    const feedNuEyebrow = page.getByText('Foder nu', { exact: true }).first();
    await expect(feedNuEyebrow).toBeVisible();
    // Slot label is one of morgonfoder/lunchfoder/kvällsfoder
    const expectedLabels = ['Morgonfoder', 'Lunchfoder', 'Kvällsfoder'];
    let matchedLabel = null;
    for (const label of expectedLabels) {
      if (await page.getByText(label, { exact: true }).first().isVisible().catch(() => false)) {
        matchedLabel = label;
        break;
      }
    }
    expect(matchedLabel, 'Förväntade en slot-rubrik (Morgonfoder/Lunchfoder/Kvällsfoder)').not.toBeNull();
    // QA seed har hästen "Saga"
    await expect(page.getByText(/Saga\s*·/).first()).toBeVisible();
  });

  test('Hästprofil visar foderplan, status och historik', async ({ page }) => {
    await bootDemo(page);
    await page.goto(`${BASE_URL}/horses/qa-horse-main?qaDemo=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Foderplan', { exact: true })).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${SCREEN_DIR}/03-horse-profile.png`, fullPage: true });
    // Tre slots ska finnas (slot-rubrikerna; "Morgonfoder" kan dyka upp 2x: rubrik + plan-label)
    expect(await page.getByText('Morgonfoder', { exact: true }).count()).toBeGreaterThanOrEqual(1);
    await expect(page.getByText('Lunchfoder', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Kvällsfoder', { exact: true }).first()).toBeVisible();
    // Stallstandard för morgon (seed: "Morgonfoder")
    await expect(page.getByText('Stallets standardplan').first()).toBeVisible();
    // Hästspecifik plan för kväll (seed: "Saga – kvällsfoder")
    await expect(page.getByText('Saga – kvällsfoder')).toBeVisible();
    await expect(page.getByText('Egen plan för hästen').first()).toBeVisible();
    // Historik-block (seed har en koll)
    await expect(page.getByText('Senaste foderkollar')).toBeVisible();
  });

  test('Markera klart fungerar och slot-rubriken uppdateras till "Klart idag"', async ({ page }) => {
    await bootDemo(page);
    await page.goto(`${BASE_URL}/horses/qa-horse-main?qaDemo=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Foderplan', { exact: true })).toBeVisible({ timeout: 15000 });
    // Hitta lunch-blocket: slot-rubriken har "Lunchfoder" och borde inte vara klart från seed.
    // Vi klickar första "Markera klart" (lunch eller kväll, vi tar första som inte är klar)
    const markeraKlartButtons = page.getByText('Markera klart', { exact: true });
    const count = await markeraKlartButtons.count();
    expect(count, 'Förväntade minst en "Markera klart"-knapp').toBeGreaterThan(0);
    await markeraKlartButtons.first().click();
    // Toast bör dyka upp
    await expect(page.getByText('Foderkoll registrerad.')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${SCREEN_DIR}/04-marked-done.png`, fullPage: true });
    // Efter klick ska det finnas minst två "Klart idag"-pillar (morgon från seed + nyss klickad)
    await expect(page.getByText('Klart idag').nth(1)).toBeVisible({ timeout: 5000 });
  });

  test('Avvikelse-formulär sparar deviation', async ({ page }) => {
    await bootDemo(page);
    await page.goto(`${BASE_URL}/horses/qa-horse-main?qaDemo=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Foderplan', { exact: true })).toBeVisible({ timeout: 15000 });
    // Klicka första Avvikelse-knappen
    await page.getByText('Avvikelse', { exact: true }).first().click();
    await page.locator('input[placeholder*="Hösilage tog slut"]').first().fill('E2E test: avvikelse-anteckning');
    await page.getByText('Spara avvikelse', { exact: true }).first().click();
    await expect(page.getByText('Foderkoll registrerad.')).toBeVisible({ timeout: 5000 });
    // Verifiera att texten dyker upp i historik-blocket
    await page.screenshot({ path: `${SCREEN_DIR}/05-deviation.png`, fullPage: true });
    await expect(page.getByText(/E2E test: avvikelse-anteckning/).first()).toBeVisible({ timeout: 5000 });
  });

  test('Lägg till hästplan (override) ersätter stallstandarden i UI', async ({ page }) => {
    await bootDemo(page);
    await page.goto(`${BASE_URL}/horses/qa-horse-main?qaDemo=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Foderplan', { exact: true })).toBeVisible({ timeout: 15000 });
    // Lunch har troligen ingen plan i seed → "Lägg till hästplan"
    const addBtn = page.getByText('Lägg till hästplan', { exact: true }).first();
    if (!(await addBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Ingen "Lägg till hästplan"-knapp synlig i nuvarande seed.');
    }
    await addBtn.click();
    await page.locator('input[placeholder*="Titel"]').first().fill('E2E – Saga lunch');
    await page.locator('input[placeholder*="Mängd"]').first().fill('1.5 kg hösilage');
    await page.getByText('Spara', { exact: true }).first().click();
    await expect(page.getByText('Foderplan sparad.')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${SCREEN_DIR}/06-override-saved.png`, fullPage: true });
    // Override-titeln ska synas
    await expect(page.getByText('E2E – Saga lunch')).toBeVisible();
    // Och stallpill ska bytt till "Egen plan för hästen" minst på det blocket
    // Vi kan inte enkelt bara titta på det blocket utan extra DOM-jakt — räcker att texten "E2E – Saga lunch" syns + att "Egen plan för hästen" syns minst två ggr (kvällen + nya lunchen).
    expect(await page.getByText('Egen plan för hästen').count()).toBeGreaterThanOrEqual(2);
    // Ta bort hästplan
    const deleteBtns = page.getByText('Ta bort hästplan', { exact: true });
    const before = await deleteBtns.count();
    await deleteBtns.first().click();
    await expect(page.getByText('Foderplan borttagen.')).toBeVisible({ timeout: 5000 });
    expect(await page.getByText('Ta bort hästplan', { exact: true }).count()).toBeLessThan(before);
  });
});
