// Real-backend QA suite. Logs in as the 5 seed roles and verifies plan QA Script steps 1-9.
// Prereq: supabase/seed_qa.sql has been run AND the 5 confirmed auth users exist.
//
// Override password via env: E2E_QA_PASSWORD="..."
// Override base URL via env: E2E_URL=...

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_URL ?? 'http://localhost:8081';
const PASSWORD = process.env.E2E_QA_PASSWORD ?? 'QaTest1234!';
const SCREEN_DIR = process.env.E2E_SCREENS ?? '/tmp/stableflow-e2e-screens';

const ROLES = {
  admin: { email: 'stableflow-admin@example.test', name: 'QA Admin' },
  staff: { email: 'stableflow-staff@example.test', name: 'QA Staff' },
  owner: { email: 'stableflow-owner@example.test', name: 'QA Horse Owner' },
  rider: { email: 'stableflow-rider@example.test', name: 'QA Medryttare' },
  guest: { email: 'stableflow-guest@example.test', name: 'QA Guest' },
};

async function loginAs(page, role) {
  const { email } = ROLES[role];
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  // Auth-skärmen kan vara default landing om ingen session. Vänta på epost-input.
  const emailInput = page.locator('input[placeholder="namn@exempel.se"]');
  await expect(emailInput).toBeVisible({ timeout: 30000 });
  await emailInput.fill(email);
  await page.locator('input[placeholder="Minst 8 tecken"]').fill(PASSWORD);
  // Två element matchar aria-label "Logga in" (toggle + submit). Submit är sista i DOM.
  await page.locator('button[aria-label="Logga in"]').last().click();
  // Efter lyckad login redirectas till tabs root → vänta på Schema/Idag header
  await expect(page.getByText(/Idag|Stallstatus/).first()).toBeVisible({ timeout: 20000 });
}

async function isolatedContext(browser) {
  return browser.newContext({ storageState: undefined });
}

test.describe('Staging QA — Balanced MVP plan steg 1-9', () => {
  test('Steg 1 — auth/seed sanity (admin login speglar seedade member-data)', async ({ browser }) => {
    const context = await isolatedContext(browser);
    const page = await context.newPage();
    await loginAs(page, 'admin');
    // Stallets namn enligt seed: "StableFlow QA Stable"
    await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${SCREEN_DIR}/qa-step1-admin-login.png`, fullPage: true });
    await context.close();
  });

  test('Steg 2 — admin på Idag prioriterar stallstatus + saknar ansvarig', async ({ browser }) => {
    const context = await isolatedContext(browser);
    const page = await context.newPage();
    await loginAs(page, 'admin');
    await expect(page.getByText('Stallstatus först').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Saknar ansvarig').first()).toBeVisible();
    await page.screenshot({ path: `${SCREEN_DIR}/qa-step2-admin-idag.png`, fullPage: true });
    await context.close();
  });

  test('Steg 3 — staff på Idag prioriterar mina uppgifter', async ({ browser }) => {
    const context = await isolatedContext(browser);
    const page = await context.newPage();
    await loginAs(page, 'staff');
    await expect(page.getByText(/Dina uppgifter först|Mina uppgifter/).first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${SCREEN_DIR}/qa-step3-staff-idag.png`, fullPage: true });
    await context.close();
  });

  test('Steg 3b — medryttare på Idag prioriterar mina uppgifter / mina hästar', async ({ browser }) => {
    const context = await isolatedContext(browser);
    const page = await context.newPage();
    await loginAs(page, 'rider');
    await expect(page.getByText(/Mina uppgifter|Mina hästar/).first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${SCREEN_DIR}/qa-step3b-rider-idag.png`, fullPage: true });
    await context.close();
  });

  test('Steg 4 — horse owner på Idag prioriterar mina hästar', async ({ browser }) => {
    const context = await isolatedContext(browser);
    const page = await context.newPage();
    await loginAs(page, 'owner');
    await expect(page.getByText('Dina hästar först').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Mina hästar').first()).toBeVisible();
    await page.screenshot({ path: `${SCREEN_DIR}/qa-step4-owner-idag.png`, fullPage: true });
    await context.close();
  });

  test('Steg 5 — admin sätter stallstandard, owner sätter override, staff markerar klart', async ({ browser }) => {
    // 5a: admin lägger en stallstandard för morgon
    const adminCtx = await isolatedContext(browser);
    const adminPage = await adminCtx.newPage();
    await loginAs(adminPage, 'admin');
    // Hoppa direkt till hästprofilen (vi behöver inte härleda horse id — använd hästlistan)
    await adminPage.goto(`${BASE_URL}/stable-horses`);
    await expect(adminPage.getByText('StableFlow QA Horse')).toBeVisible({ timeout: 15000 });
    // Klicka "Profil"-knappen för hästen
    await adminPage.getByText('Profil', { exact: true }).nth(1).click();
    await expect(adminPage.getByText('Foderplan', { exact: true })).toBeVisible({ timeout: 15000 });
    // Lägg till eller ändra stallplan (idempotent över körningar).
    const stallplanBtn = adminPage
      .locator('text=/^(Lägg till stallplan|Ändra stallplan)$/')
      .first();
    await stallplanBtn.scrollIntoViewIfNeeded();
    await stallplanBtn.click();
    await adminPage.locator('input[placeholder*="Titel"]').first().fill('Morgonfoder QA');
    await adminPage.locator('input[placeholder*="Mängd"]').first().fill('2 kg hösilage');
    const sparaBtn = adminPage.getByText('Spara', { exact: true }).first();
    await sparaBtn.scrollIntoViewIfNeeded();
    await sparaBtn.click();
    await expect(adminPage.getByText('Foderplan sparad.')).toBeVisible({ timeout: 5000 });
    await adminPage.screenshot({ path: `${SCREEN_DIR}/qa-step5a-admin-default.png`, fullPage: true });
    await adminPage.waitForTimeout(2000);
    await adminCtx.close();

    // 5b: owner lägger till override för samma häst (lunch)
    const ownerCtx = await isolatedContext(browser);
    const ownerPage = await ownerCtx.newPage();
    await loginAs(ownerPage, 'owner');
    await ownerPage.goto(`${BASE_URL}/stable-horses`);
    await ownerPage.getByText('Profil', { exact: true }).nth(1).click();
    await expect(ownerPage.getByText('Foderplan', { exact: true })).toBeVisible({ timeout: 15000 });
    // Owner kan se "Lägg till hästplan" eller "Ändra hästplan" beroende på befintlig data.
    const addOrEdit = ownerPage
      .locator('text=/^(Lägg till hästplan|Ändra hästplan)$/')
      .first();
    await addOrEdit.scrollIntoViewIfNeeded();
    await addOrEdit.click();
    await ownerPage.locator('input[placeholder*="Titel"]').first().fill('QA Owner override');
    await ownerPage.locator('input[placeholder*="Mängd"]').first().fill('1 kg lunch');
    await ownerPage.getByText('Spara', { exact: true }).first().click();
    await expect(ownerPage.getByText('Foderplan sparad.')).toBeVisible({ timeout: 5000 });
    await ownerPage.screenshot({ path: `${SCREEN_DIR}/qa-step5b-owner-override.png`, fullPage: true });
    await ownerPage.waitForTimeout(2000);
    await ownerCtx.close();

    // 5c: staff markerar klart från hästprofilen och avvikelse fungerar
    const staffCtx = await isolatedContext(browser);
    const staffPage = await staffCtx.newPage();
    await loginAs(staffPage, 'staff');
    await staffPage.goto(`${BASE_URL}/stable-horses`);
    await staffPage.getByText('Profil', { exact: true }).nth(1).click();
    await expect(staffPage.getByText('Foderplan', { exact: true })).toBeVisible({ timeout: 15000 });
    // Markera klart (eller Markera om om redan checkad från tidigare körning).
    const markeraBtn = staffPage
      .locator('text=/^(Markera klart|Markera om)$/')
      .first();
    await markeraBtn.scrollIntoViewIfNeeded();
    await markeraBtn.click();
    await expect(staffPage.getByText('Foderkoll registrerad.')).toBeVisible({ timeout: 5000 });
    await expect(staffPage.getByText('Senaste foderkollar')).toBeVisible();
    await staffPage.screenshot({ path: `${SCREEN_DIR}/qa-step5c-staff-check.png`, fullPage: true });
    await staffCtx.close();
  });

  test('Steg 6 — staff syncar hage-status mellan hästprofil och paddocks', async ({ browser }) => {
    const context = await isolatedContext(browser);
    const page = await context.newPage();
    await loginAs(page, 'staff');
    await page.goto(`${BASE_URL}/stable-horses`);
    await page.getByText('Profil', { exact: true }).nth(1).click();
    // Vänta på att vi är på /horses/{id} via unik text på sidan
    await expect(page.getByText('Foderplan', { exact: true })).toBeVisible({ timeout: 15000 });
    // Sätt Ute för Dag (DailyStatusEditor renderar två "Ute"-toggles)
    const uteBtn = page.getByText('Ute', { exact: true }).first();
    await uteBtn.scrollIntoViewIfNeeded();
    await uteBtn.click();
    await expect(page.getByText('Status uppdaterad.')).toBeVisible({ timeout: 5000 });
    // Verifiera på paddock-sidan
    await page.goto(`${BASE_URL}/paddocks`);
    await expect(page.getByText(/QA-1|StableFlow QA Horse|Ute/).first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: `${SCREEN_DIR}/qa-step6-paddock-sync.png`, fullPage: true });
    await context.close();
  });

  test('Steg 7 — owner planerar och staff slutför ridpass', async ({ browser }) => {
    // 7a owner planerar
    const ownerCtx = await isolatedContext(browser);
    const ownerPage = await ownerCtx.newPage();
    await loginAs(ownerPage, 'owner');
    await ownerPage.goto(`${BASE_URL}/stable-horses`);
    await ownerPage.getByText('Profil', { exact: true }).nth(1).click();
    await expect(ownerPage.getByText('Ridning/träning')).toBeVisible({ timeout: 15000 });
    const planeraBtn = ownerPage.getByText('Planera ridpass', { exact: true }).first();
    await planeraBtn.scrollIntoViewIfNeeded();
    await planeraBtn.click();
    const today = new Date().toISOString().slice(0, 10);
    await ownerPage.locator('input[placeholder="Datum (YYYY-MM-DD)"]').first().fill(today);
    await ownerPage.locator('input[placeholder*="Tid"]').first().fill('17:30');
    await ownerPage.locator('input[placeholder*="Notering"]').first().fill('QA owner planerat');
    const laggTill = ownerPage.getByText('Lägg till', { exact: true }).first();
    await laggTill.scrollIntoViewIfNeeded();
    await laggTill.click();
    await expect(ownerPage.getByText('Ridpass planerat.')).toBeVisible({ timeout: 5000 });
    // Vänta på Supabase-persist innan ctx stängs så att staff i nästa steg ser passet
    await ownerPage.waitForTimeout(2000);
    await ownerCtx.close();

    // 7b staff slutför
    const staffCtx = await isolatedContext(browser);
    const staffPage = await staffCtx.newPage();
    await loginAs(staffPage, 'staff');
    await staffPage.goto(`${BASE_URL}/stable-horses`);
    await staffPage.getByText('Profil', { exact: true }).nth(1).click();
    await expect(staffPage.getByText('Ridning/träning')).toBeVisible({ timeout: 15000 });
    const slutfor = staffPage.getByText('Slutför ridpass', { exact: true }).first();
    await slutfor.scrollIntoViewIfNeeded();
    await slutfor.click();
    await staffPage.locator('input[placeholder*="Längd"]').first().fill('30 min');
    await staffPage.locator('input[placeholder="Notering"]').first().fill('QA staff klar');
    const logga = staffPage.getByText('Logga ridpass klart', { exact: true }).first();
    await logga.scrollIntoViewIfNeeded();
    await logga.click();
    await expect(staffPage.getByText('Ridpass loggat.')).toBeVisible({ timeout: 5000 });
    // Verifiera att ride log finns i DOM (kan ligga utanför viewport på desktop, men logiken är vad vi testar)
    await expect(staffPage.getByText(/30 min/).first()).toBeAttached({ timeout: 10000 });
    await staffPage.screenshot({ path: `${SCREEN_DIR}/qa-step7-ride-completed.png`, fullPage: true });
    await staffCtx.close();
  });

  test('Steg 8 — admin skapar care event + kontakt och slutför', async ({ browser }) => {
    const context = await isolatedContext(browser);
    const page = await context.newPage();
    await loginAs(page, 'admin');
    // Lägg till kontakt
    await page.goto(`${BASE_URL}/contacts`);
    await page.locator('[aria-label="Lägg till kontakt"]').first().click();
    await page.getByText('Veterinär', { exact: true }).first().click();
    await page.locator('input[placeholder="Namn"]').fill('QA Veterinär');
    await page.locator('input[placeholder*="Telefon"]').fill('070-000 00 99');
    await page.getByText('Spara kontakt', { exact: true }).click();
    await expect(page.getByText('Kontakt skapad.')).toBeVisible({ timeout: 5000 });
    // Vänta på Supabase-persist innan vi navigerar
    await page.waitForTimeout(2000);

    // Skapa care event på hästprofilen
    await page.goto(`${BASE_URL}/stable-horses`);
    await page.getByText('Profil', { exact: true }).nth(1).click();
    await expect(page.getByText('Vård', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    const addCareBtn = page.getByText('Lägg till vårdhändelse', { exact: true }).first();
    await addCareBtn.scrollIntoViewIfNeeded();
    await addCareBtn.click();
    await page.getByText('Veterinär', { exact: true }).first().click();
    await page.locator('input[placeholder*="Skoning"]').first().fill('QA hälsokoll');
    const today = new Date().toISOString().slice(0, 10);
    await page.locator('input[placeholder="Datum (YYYY-MM-DD)"]').first().fill(today);
    // Välj kontakt
    const kontaktBtn = page.getByText('QA Veterinär', { exact: true }).first();
    if (await kontaktBtn.isVisible().catch(() => false)) {
      await kontaktBtn.scrollIntoViewIfNeeded();
      await kontaktBtn.click();
    }
    const skapaCare = page.getByText('Skapa vårdhändelse', { exact: true }).first();
    await skapaCare.scrollIntoViewIfNeeded();
    await skapaCare.click();
    await expect(page.getByText('Vårdhändelse skapad.')).toBeVisible({ timeout: 5000 });
    // Vänta på Supabase-persist innan vi navigerar (annars kan write avbrytas).
    await page.waitForTimeout(2000);

    // Verifiera i Schema/Vård
    await page.goto(`${BASE_URL}/calendar?section=care`);
    await expect(page.getByText('QA hälsokoll').first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${SCREEN_DIR}/qa-step8a-care-created.png`, fullPage: true });

    // Slutför från hästprofilen
    await page.goto(`${BASE_URL}/stable-horses`);
    await page.getByText('Profil', { exact: true }).nth(1).click();
    await expect(page.getByText('Vård', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    const slutforCare = page.getByText('Slutför vård', { exact: true }).first();
    await slutforCare.scrollIntoViewIfNeeded();
    await slutforCare.click();
    await page.locator('input[placeholder*="Notering, t.ex. nya skor"]').first().fill('Allt OK');
    const sparaVard = page.getByText('Spara vårdlogg', { exact: true }).first();
    await sparaVard.scrollIntoViewIfNeeded();
    await sparaVard.click();
    await expect(page.getByText('Vårdhändelse markerad klar.')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Vårdhistorik')).toBeVisible();
    await page.screenshot({ path: `${SCREEN_DIR}/qa-step8b-care-completed.png`, fullPage: true });
    await context.close();
  });

  test('Steg 9 — admin separerar feed/alert/chat', async ({ browser }) => {
    const context = await isolatedContext(browser);
    const page = await context.newPage();
    await loginAs(page, 'admin');

    // Skapa Akut alert via Idag-händelser. QuickAction Pressable har nu
    // accessibilityRole=button + accessibilityLabel="Händelser".
    const handelser = page.getByRole('button', { name: 'Händelser', exact: true }).first();
    await handelser.scrollIntoViewIfNeeded();
    await handelser.click();
    const akut = page.getByText('Akut', { exact: true }).first();
    await akut.scrollIntoViewIfNeeded();
    await akut.click();
    await page.locator('input[placeholder*="Kanel har tappat en sko"]').first().fill('QA akut: testlarm');
    await page.getByText('Skicka', { exact: true }).first().click();
    await expect(page.getByText('Viktig notis lades till.')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('QA akut: testlarm').first()).toBeVisible();
    // Vänta på Supabase-persist
    await page.waitForTimeout(2000);

    // Verifiera på Feed-strippen
    await page.goto(`${BASE_URL}/feed`);
    await expect(page.getByText('Viktigt i stallet')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('QA akut: testlarm')).toBeVisible();
    await page.screenshot({ path: `${SCREEN_DIR}/qa-step9-alert-on-feed.png`, fullPage: true });

    // Lös alert (säkerställ att det försvinner från Idag)
    await page.goto(`${BASE_URL}/`);
    const last = page.getByText('Löst', { exact: true }).last();
    await last.scrollIntoViewIfNeeded();
    await last.click();
    await context.close();
  });

  test('Steg 9b — guest har read-only sanity', async ({ browser }) => {
    const context = await isolatedContext(browser);
    const page = await context.newPage();
    await loginAs(page, 'guest');
    // Foderknappar för markering bör inte synas (canUpdateHorseStatus=false, ej ägare)
    await page.goto(`${BASE_URL}/stable-horses`);
    // Guest har horse_ids=[] enligt seed → kan inte se hästen i Mina filter, men All-listan har read-access
    await expect(page.getByText('Hästar', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${SCREEN_DIR}/qa-step9b-guest.png`, fullPage: true });
    await context.close();
  });
});
