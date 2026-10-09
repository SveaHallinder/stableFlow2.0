/* global document */
import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { URL } from 'node:url';

// These are synthetic qaDemo workflows, not database or delivery acceptance.
// Navigate through the UI after the one initial goto so demo state is not reset.
test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm', serviceWorkers: 'block' });
const backendAttempts = new WeakMap();
const memberId = '00000000-0000-4000-8000-000000000002';
const visibleText = (page, value, exact = true) => page.getByText(value, { exact })
  .filter({ visible: true }).and(page.locator(':not([aria-hidden="true"] *)'));
const button = (page, name) => page.getByRole('button', { name, exact: true });

test.beforeEach(async ({ context, page, baseURL }) => {
  const base = new URL(baseURL);
  expect(['http:', 'https:']).toContain(base.protocol);
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(base.hostname);
  const attempts = [];
  backendAttempts.set(page, attempts);
  page.setDefaultTimeout(10_000);
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || /\/(auth|rest|functions|storage|realtime)\/v1(?:\/|$)/.test(url.pathname)) {
      attempts.push({ method: request.method(), path: url.pathname });
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await context.routeWebSocket(/.*/, socket => {
    const url = new URL(socket.url());
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || /\/realtime\/v1(?:\/|$)/.test(url.pathname)) {
      attempts.push({ method: 'WS', path: url.pathname });
    }
    socket.close();
  });
  await page.clock.setFixedTime(new Date('2026-10-07T06:00:00Z'));
});

async function screenshot(page, testInfo, name) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

test.afterEach(async ({ page }, testInfo) => {
  const attempts = backendAttempts.get(page);
  await writeFile(testInfo.outputPath('blocked-network.json'), JSON.stringify(attempts, null, 2));
  if (testInfo.status !== testInfo.expectedStatus) {
    await screenshot(page, testInfo, 'failure-context').catch(() => {});
  }
  expect(attempts, 'qaDemo must not attempt backend HTTP or WebSocket requests').toEqual([]);
});

// These are client-role checks, not actual account switches or RLS acceptance.
// Use the existing development reducer only for fixtures and supplementary ID
// assertions. UI operations use real controls; reload discards every fixture.
async function qaState(page, fixture = null) {
  return page.evaluate(fixture => {
    const element = document.querySelector('#root');
    const key = Object.keys(element).find(key => key.startsWith('__reactContainer$'));
    const visited = new Set();
    let provider;
    const visit = fiber => {
      if (!fiber || visited.has(fiber)) return;
      visited.add(fiber);
      if ((fiber.type?.name || fiber.type?.displayName) === 'AppDataProvider') provider = fiber;
      visit(fiber.child);
      visit(fiber.sibling);
    };
    visit(element[key].stateNode?.current || element[key]);
    if (!provider) throw new Error('qaDemo AppDataProvider is unavailable.');
    const hook = provider.memoizedState;
    const state = hook.memoizedState;
    if (state.currentStableId !== 'qa-stable-main') throw new Error('Only the synthetic qaDemo stable is allowed.');
    if (!fixture) return state;
    let payload = { ...state };
    const stableId = state.currentStableId;
    if (fixture === 'clear-checks') {
      payload.feedChecks = [];
    } else if (fixture === 'owner') {
      const id = state.currentUserId;
      payload.users = { ...state.users, [id]: { ...state.users[id], membership: [
        { stableId, role: 'rider', access: 'view', riderRole: 'owner' },
      ] } };
    } else if (fixture === 'rider') {
      payload.currentUserId = '00000000-0000-4000-8000-000000000002';
    } else if (fixture === 'staff' || fixture === 'guest') {
      const id = `qa-core-${fixture}`;
      payload.currentUserId = id;
      payload.users = { ...state.users, [id]: {
        ...state.users[state.currentUserId], id,
        name: fixture === 'staff' ? 'QA Staff lokalt' : 'QA Gäst lokalt',
        horses: [], responsibilities: [], defaultPasses: [],
        membership: [{ stableId, role: fixture, access: fixture === 'staff' ? 'edit' : 'view', horseIds: [] }],
      } };
    } else {
      throw new Error(`Unknown qaDemo fixture: ${fixture}`);
    }
    hook.queue.dispatch({ type: 'STATE_HYDRATE', payload });
    return null;
  }, fixture);
}

async function boot(page) {
  await page.goto('/?qaDemo=1');
  await expect(visibleText(page, 'Läget i stallet')).toBeVisible();
  await qaState(page);
  await page.evaluate(() => { globalThis.__coreDocumentMarker = 'qaDemo-core-single-document'; });
}

async function sameDocument(page) {
  await expect.poll(() => page.evaluate(() => globalThis.__coreDocumentMarker))
    .toBe('qaDemo-core-single-document');
}

async function navigateTab(page, name) {
  const tab = page.getByRole('tab', { name, exact: true });
  if (await tab.count()) await tab.click();
  else await visibleText(page, name).first().click();
}

async function openHorse(page) {
  await navigateTab(page, 'Hästar');
  await visibleText(page, 'Profil').last().click();
  await expect(visibleText(page, 'Foderplan')).toBeVisible();
}

function careRow(page, title) {
  return visibleText(page, title, false)
    .locator('xpath=ancestor::div[.//*[@role="button" and contains(.,"Slutför vård")]][1]');
}

test('Idag → claim and complete the same assignment → updated Today counts', async ({ page }, testInfo) => {
  await boot(page);
  const completedSummary = visibleText(page, 'Klara idag').locator('..');
  await expect(completedSummary.getByText('0 / 2', { exact: true })).toBeVisible();
  await button(page, 'Lediga pass').click();
  await button(page, 'Ta Lunchfodring').click();
  await visibleText(page, 'Mina').click();
  await expect(button(page, 'Markera Lunchfodring klart')).toBeVisible();
  await button(page, 'Markera Lunchfodring klart').click();
  await expect(button(page, 'Markera Lunchfodring klart')).toHaveCount(0);
  await navigateTab(page, 'Idag');
  await expect(completedSummary.getByText('1 / 2', { exact: true })).toBeVisible();
  await expect(visibleText(page, 'Saknar ansvarig').locator('..').getByText('0', { exact: true })).toBeVisible();
  await expect(button(page, 'Lediga pass')).toContainText('Alla pass är bemannade');
  await screenshot(page, testInfo, 'assignment-completed-today');
  const state = await qaState(page);
  const pass = state.assignments.find(assignment => assignment.id === 'qa-assignment-open');
  expect(pass.status).toBe('completed');
  expect(pass.assigneeId).toBe(state.currentUserId);
  await sameDocument(page);
});

test('Admin feed plan → owner override → staff feed check → profile and paddock status', async ({ page }, testInfo) => {
  await boot(page);
  await qaState(page, 'clear-checks');
  await button(page, 'Profil').click();
  await visibleText(page, 'Ändra stallplan').first().click();
  await page.getByPlaceholder('Titel, t.ex. Morgonfoder').fill('Offline stallplan');
  await page.getByPlaceholder('Mängd, t.ex. 2 kg hösilage').fill('Lokalt QA-prov');
  await visibleText(page, 'Spara').click();
  await expect(visibleText(page, 'Offline stallplan')).toBeVisible();
  await qaState(page, 'owner');
  await visibleText(page, 'Lägg till hästplan').first().click();
  await page.getByPlaceholder('Titel, t.ex. Morgonfoder').fill('Offline hästplan');
  await page.getByPlaceholder('Mängd, t.ex. 2 kg hösilage').fill('Lokalt QA-prov');
  await visibleText(page, 'Spara').click();
  await expect(visibleText(page, 'Offline hästplan')).toBeVisible();
  await qaState(page, 'staff');
  await button(page, 'Tillbaka').click();
  await expect(visibleText(page, 'Saga · Offline hästplan')).toBeVisible();
  await button(page, 'Markera klart').first().click();
  await expect(button(page, 'Klart')).toBeVisible();
  await button(page, 'Avvikelse').click();
  await page.getByPlaceholder(/Skriv en kort avvikelse/).fill('Offline foderanteckning');
  await visibleText(page, 'Spara avvikelse').click();
  await button(page, 'Profil').click();
  await expect(visibleText(page, /Offline foderanteckning/, false).first()).toBeVisible();
  await button(page, 'Dag: Inne').click();
  await expect(button(page, 'Dag: Inne')).toHaveAttribute('aria-pressed', 'true');
  await screenshot(page, testInfo, 'staff-profile-feed-and-status');
  await button(page, 'Öppna hästlistan').click();
  await button(page, 'Öppna hagar').click();
  await expect(button(page, 'Saga, dag: Inne')).toHaveAttribute('aria-pressed', 'true');
  await button(page, 'Saga, dag: Ute').click();
  await expect(button(page, 'Saga, dag: Ute')).toHaveAttribute('aria-pressed', 'true');
  await screenshot(page, testInfo, 'paddock-status-updated');
  await button(page, 'Tillbaka').click();
  await visibleText(page, 'Profil').last().click();
  await expect(button(page, 'Dag: Ute')).toHaveAttribute('aria-pressed', 'true');
  await screenshot(page, testInfo, 'profile-reflects-paddock-status');
  const state = await qaState(page);
  expect(state.feedChecks.find(check => check.deviationNote === 'Offline foderanteckning').checkedByUserId)
    .toBe('qa-core-staff');
  await sameDocument(page);
});

test('Owner plans a ride → linked rider completes it → visible linked horse history', async ({ page }, testInfo) => {
  await boot(page);
  await qaState(page, 'owner');
  await openHorse(page);
  await visibleText(page, 'Planera ridpass').click();
  await page.getByPlaceholder('Datum (YYYY-MM-DD)').fill('2026-10-07');
  await page.getByPlaceholder('Tid (HH:MM, frivillig)').fill('09:30');
  await page.getByPlaceholder('Notering (frivillig)').fill('Offline planerat ridprov');
  await visibleText(page, 'Lägg till').click();
  await expect(visibleText(page, /Offline planerat ridprov/, false)).toBeVisible();
  await screenshot(page, testInfo, 'owner-new-planned-ride');
  await qaState(page, 'rider');
  await visibleText(page, 'Slutför ridpass').first().click();
  await page.getByPlaceholder('Längd, t.ex. 45 min').fill('27 min');
  await page.getByPlaceholder('Notering', { exact: true }).fill('Offline slutfört ridprov');
  await button(page, 'Logga ridpass klart').click();
  await expect(visibleText(page, /27 min.*Offline slutfört ridprov/, false)).toBeVisible();
  await screenshot(page, testInfo, 'rider-completed-ride-history');
  const state = await qaState(page);
  const logs = state.rideLogs.filter(log => log.note === 'Offline slutfört ridprov');
  expect(logs).toHaveLength(1);
  expect(logs[0].createdByUserId).toBe(memberId);
  const plan = state.plannedRides.find(ride => ride.note === 'Offline planerat ridprov');
  expect(plan.status).toBe('done');
  expect(plan.completedRideLogId).toBe(logs[0].id);
  await sameDocument(page);
});

test('Desktop contact → horse care → calendar → completed profile and calendar history', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await boot(page);
  await visibleText(page, 'Admin').first().click();
  await visibleText(page, 'Öppna kontakter →').click();
  await button(page, 'Lägg till kontakt').click();
  await visibleText(page, 'Veterinär').first().click();
  await page.getByRole('textbox', { name: 'Namn', exact: true }).fill('QA Kontakt lokalt');
  await visibleText(page, 'Spara kontakt').click();
  await expect(visibleText(page, 'QA Kontakt lokalt')).toBeVisible();
  await button(page, 'Tillbaka').click();
  await button(page, 'Till överblick').click();
  await openHorse(page);
  await visibleText(page, 'Lägg till vårdhändelse').click();
  await page.getByPlaceholder('Titel, t.ex. Skoning').fill('Offline vårdprov');
  await page.getByPlaceholder('Datum (YYYY-MM-DD)').fill('2026-10-07');
  await page.getByPlaceholder('Tid (HH:MM, frivillig)').fill('15:00');
  await button(page, 'QA Kontakt lokalt').click();
  await visibleText(page, 'Skapa vårdhändelse').click();
  await expect(visibleText(page, /Offline vårdprov/, false)).toBeVisible();
  await button(page, 'Tillbaka').click();
  await navigateTab(page, 'Schema');
  await visibleText(page, 'Vård').click();
  await expect(visibleText(page, 'Offline vårdprov')).toBeVisible();
  await expect(visibleText(page, /Saga · QA Kontakt lokalt/, false)).toBeVisible();
  await screenshot(page, testInfo, 'care-event-calendar-planned');
  const card = visibleText(page, 'Offline vårdprov').locator('xpath=..');
  await card.getByText('Öppna hästprofil →', { exact: true }).click();
  await careRow(page, 'Offline vårdprov').getByRole('button', { name: /Slutför vård/ }).click();
  await page.getByPlaceholder(/Notering, t.ex. nya skor/).fill('Offline vårdlogg klar');
  await button(page, 'Spara vårdlogg').click();
  await expect(visibleText(page, /Offline vårdlogg klar/, false)).toBeVisible();
  await screenshot(page, testInfo, 'horse-care-history');
  await button(page, 'Tillbaka').click();
  const history = visibleText(page, 'Vårdhistorik').locator('xpath=..');
  await expect(history.getByText('Offline vårdprov', { exact: true })).toBeVisible();
  const upcoming = visibleText(page, 'Kommande vård').locator('xpath=..');
  await expect(upcoming.getByText('Offline vårdprov', { exact: true })).toHaveCount(0);
  await screenshot(page, testInfo, 'care-event-calendar-history');
  await sameDocument(page);
});

test('Unlinked guest reads Today, schedule, horse, paddock and Feed with writes gated', async ({ page }, testInfo) => {
  await boot(page);
  await qaState(page, 'guest');
  await expect(visibleText(page, 'Läsbar stallstatus')).toBeVisible();
  await expect(button(page, 'Markera klart')).toHaveCount(0);
  await expect(button(page, 'Avvikelse')).toHaveCount(0);
  await expect(button(page, 'Markera Grinden till Vinterhagen är trög som löst')).toHaveCount(0);
  await screenshot(page, testInfo, 'guest-today');
  await navigateTab(page, 'Schema');
  await expect(button(page, 'Ta Lunchfodring')).toHaveCount(0);
  await expect(button(page, 'Nytt pass')).toHaveCount(0);
  await expect(button(page, 'Markera Morgonfodring klart')).toHaveCount(0);
  await openHorse(page);
  await expect(button(page, 'Dag: Inne')).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Hö', exact: true })).toBeDisabled();
  await expect(visibleText(page, 'Avvikelse')).toHaveCount(0);
  await expect(visibleText(page, 'Lägg till vårdhändelse')).toHaveCount(0);
  await expect(visibleText(page, 'Planera ridpass')).toHaveCount(0);
  await expect(visibleText(page, 'Slutför ridpass')).toHaveCount(0);
  await screenshot(page, testInfo, 'guest-horse-read-only');
  await button(page, 'Öppna hästlistan').click();
  await button(page, 'Öppna hagar').click();
  await expect(button(page, 'Saga, dag: Inne')).toBeDisabled();
  await expect(visibleText(page, 'Lägg till hage')).toHaveCount(0);
  await screenshot(page, testInfo, 'guest-paddock-read-only');
  await button(page, 'Tillbaka').click();
  await navigateTab(page, 'Feed');
  await expect(page.getByPlaceholder('Vad behöver alla veta idag?')).toHaveCount(0);
  await expect(button(page, 'Publicera inlägg')).toHaveCount(0);
  await expect(button(page, 'Gilla inlägg')).toBeDisabled();
  await screenshot(page, testInfo, 'guest-feed-read-only');
  await sameDocument(page);
});
