/* global document, localStorage, MutationObserver */
import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { URL } from 'node:url';

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm', serviceWorkers: 'block' });
const attemptsByPage = new WeakMap();
const visibleText = (page, value) => page.getByText(value, { exact: true })
  .filter({ visible: true }).and(page.locator(':not([aria-hidden="true"] *)'));

test.beforeEach(async ({ context, page, baseURL }) => {
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(baseURL).hostname);
  const attempts = [];
  attemptsByPage.set(page, attempts);
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
  await page.clock.setFixedTime(new Date('2026-10-12T06:00:00Z'));
});

test.afterEach(async ({ page }, testInfo) => {
  const attempts = attemptsByPage.get(page);
  await writeFile(testInfo.outputPath('blocked-network.json'), JSON.stringify(attempts, null, 2));
  expect(attempts, 'Seasonal qaDemo must stay local without backend HTTP or WebSockets').toEqual([]);
});

async function qaState(page) {
  return page.evaluate(() => {
    const element = document.querySelector('#root');
    const key = Object.keys(element).find(key => key.startsWith('__reactContainer$'));
    let provider;
    const visited = new Set();
    const visit = fiber => {
      if (!fiber || visited.has(fiber)) return;
      visited.add(fiber);
      if ((fiber.type?.name || fiber.type?.displayName) === 'AppDataProvider') provider = fiber;
      visit(fiber.child);
      visit(fiber.sibling);
    };
    visit(element[key].stateNode?.current || element[key]);
    if (!provider) throw new Error('Synthetic seasonal AppDataProvider unavailable.');
    const state = provider.memoizedState.memoizedState;
    if (state.currentStableId !== 'qa-stable-main') throw new Error('Only synthetic qaDemo state is allowed.');
    return { assignments: state.assignments, currentUserId: state.currentUserId };
  });
}

async function setDemoRole(page, role, access) {
  await page.evaluate(({ role, access }) => {
    const element = document.querySelector('#root');
    const key = Object.keys(element).find(key => key.startsWith('__reactContainer$'));
    let provider;
    const visited = new Set();
    const visit = fiber => {
      if (!fiber || visited.has(fiber)) return;
      visited.add(fiber);
      if ((fiber.type?.name || fiber.type?.displayName) === 'AppDataProvider') provider = fiber;
      visit(fiber.child);
      visit(fiber.sibling);
    };
    visit(element[key].stateNode?.current || element[key]);
    const hook = provider.memoizedState;
    const state = hook.memoizedState;
    if (state.currentStableId !== 'qa-stable-main') throw new Error('Only the synthetic qaDemo membership may change.');
    const user = state.users[state.currentUserId];
    const membership = user.membership.map(entry => entry.stableId === state.currentStableId
      ? { ...entry, role, access } : entry);
    hook.queue.dispatch({ type: 'STATE_HYDRATE', payload: {
      ...state, users: { ...state.users, [user.id]: { ...user, membership } },
    } });
  }, { role, access });
}

async function createPeriod(page, { name = 'QA vinter', from = '2026-11-01', to = '2026-11-14', extra = false } = {}) {
  await page.getByRole('button', { name: 'Skapa period', exact: true }).click();
  await expect(page.getByLabel('Periodens startdatum', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Periodens slutdatum', { exact: true })).toHaveValue('');
  await page.getByLabel('Periodens namn', { exact: true }).fill(name);
  await page.getByLabel('Periodens startdatum', { exact: true }).fill(from);
  await page.getByLabel('Periodens slutdatum', { exact: true }).fill(to);
  if (extra) {
    for (const [index, label, time] of [[4, 'Vattenrunda', '15:00'], [5, 'Senfodring', '21:00']]) {
      await page.getByRole('button', { name: 'Lägg till pass', exact: true }).click();
      await page.getByLabel(`Pass ${index}, namn`, { exact: true }).fill(label);
      await page.getByLabel(`Pass ${index}, starttid`, { exact: true }).fill(time);
    }
  }
  await page.getByRole('button', { name: 'Skapa passen', exact: true }).click();
  await expect(visibleText(page, 'Passen är skapade.')).toBeVisible();
}

test('Schema opens named periods and five daily passes fit on mobile with inclusive dates', async ({ page }, testInfo) => {
  await page.goto('/calendar?qaDemo=1&view=all');
  const entry = page.getByRole('button', { name: 'Fasta pass', exact: true });
  await expect(entry).toBeVisible();
  const entryBounds = await entry.boundingBox();
  expect(entryBounds.y + entryBounds.height).toBeLessThanOrEqual(500);
  await entry.click();
  await expect(visibleText(page, 'Inga fasta pass för perioden')).toBeVisible();
  await createPeriod(page, { extra: true });
  for (const name of ['Morgonfodring', 'Lunchfodring', 'Kvällsfodring', 'Vattenrunda', 'Senfodring']) {
    await expect(page.getByRole('button', { name: `Välj veckodagar för ${name}`, exact: true })).toBeVisible();
  }
  const assignments = (await qaState(page)).assignments.filter(item => item.templateId);
  expect(assignments).toHaveLength(70);
  expect(assignments.filter(item => item.date === '2026-11-01')).toHaveLength(5);
  expect(assignments.filter(item => item.date === '2026-11-14')).toHaveLength(5);
  expect(assignments.every(item => item.date >= '2026-11-01' && item.date <= '2026-11-14')).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await visibleText(page, 'Stallets fasta pass.').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('season-five-templates-mobile.png'), fullPage: true });
});

test('Invalid period retains all fields and preview counts custom passes before generation', async ({ page }) => {
  await page.goto('/season-schedule?qaDemo=1');
  await page.getByRole('button', { name: 'Skapa period', exact: true }).click();
  await page.getByLabel('Periodens namn', { exact: true }).fill('QA behåll mitt utkast');
  await page.getByLabel('Periodens startdatum', { exact: true }).fill('2026-11-14');
  await page.getByLabel('Periodens slutdatum', { exact: true }).fill('2026-11-01');
  await page.getByRole('button', { name: 'Skapa passen', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /slutdatum|datumperiod/i })).toBeVisible();
  await expect(page.getByLabel('Periodens namn', { exact: true })).toHaveValue('QA behåll mitt utkast');
  await expect(page.getByLabel('Periodens startdatum', { exact: true })).toHaveValue('2026-11-14');
  expect((await qaState(page)).assignments.filter(item => item.templateId)).toHaveLength(0);
  await page.getByLabel('Periodens startdatum', { exact: true }).fill('2026-11-01');
  await page.getByLabel('Periodens slutdatum', { exact: true }).fill('2026-11-14');
  await expect(visibleText(page, '14 dagar · 42 pass')).toBeVisible();
  await page.getByRole('button', { name: 'Skapa passen', exact: true }).click();
  await expect(visibleText(page, 'Passen är skapade.')).toBeVisible();
});

test('Weekly choices apply from selected date while a one-date exception survives later weekly changes', async ({ page }, testInfo) => {
  await page.goto('/season-schedule?qaDemo=1');
  await createPeriod(page);
  await page.getByRole('button', { name: 'Välj veckodagar för Morgonfodring', exact: true }).click();
  await page.getByLabel('Veckoval från datum', { exact: true }).fill('2026-11-01');
  await page.getByRole('button', { name: 'Morgonfodring, tisdag', exact: true }).click();
  await page.getByRole('button', { name: 'Morgonfodring, torsdag', exact: true }).click();
  await page.getByRole('button', { name: 'Tilldela valda veckodagar', exact: true }).click();
  await expect(visibleText(page, 'Veckofördelningen är sparad.')).toBeVisible();
  const { assignments, currentUserId } = await qaState(page);
  const morning = assignments.filter(item => item.templateId && item.label === 'Morgonfodring');
  const mine = morning.filter(item => item.assigneeId === currentUserId);
  expect(mine.map(item => item.date)).toEqual(['2026-11-03', '2026-11-05', '2026-11-10', '2026-11-12']);
  const occurrence = mine.find(item => item.date === '2026-11-03');
  await page.goto(`/season-schedule?qaDemo=1&assignmentId=${occurrence.id}`);
  await page.getByRole('button', { name: 'Bara detta pass', exact: true }).click();
  await page.getByLabel('Passets namn', { exact: true }).fill('QA enstaka morgon');
  await page.getByRole('button', { name: 'Spara bara detta pass', exact: true }).click();
  await expect(visibleText(page, 'Passet är sparat.')).toBeVisible();
  const after = (await qaState(page)).assignments;
  expect(after.find(item => item.id === occurrence.id)).toMatchObject({ label: 'QA enstaka morgon', isScheduleOverride: true });
  expect(after.find(item => item.templateId === occurrence.templateId && item.date === '2026-11-10')?.label).toBe('Morgonfodring');
  await page.getByRole('button', { name: 'Välj veckodagar för Morgonfodring', exact: true }).click();
  await page.getByRole('button', { name: 'Morgonfodring, tisdag', exact: true }).click();
  await page.getByRole('button', { name: 'Välj ansvarig QA Medlem', exact: true }).click();
  await page.getByLabel('Veckoval från datum', { exact: true }).fill('2026-11-01');
  await page.getByRole('button', { name: 'Tilldela valda veckodagar', exact: true }).click();
  await expect(visibleText(page, 'Veckofördelningen är sparad.')).toBeVisible();
  expect((await qaState(page)).assignments.find(item => item.id === occurrence.id))
    .toMatchObject({ label: 'QA enstaka morgon', assigneeId: currentUserId, isScheduleOverride: true });
  await page.getByRole('button', { name: 'Ändra period och pass', exact: true }).click();
  await page.getByLabel('Pass 1, namn', { exact: true }).fill('QA uppdaterad standard');
  await expect(visibleText(page, '4 framtida bokade pass · 3 berörs av dina ändringar')).toBeVisible();
  await page.getByRole('button', { name: 'Spara och uppdatera passen', exact: true }).click();
  await expect(visibleText(page, 'Passen är skapade.')).toBeVisible();
  expect((await qaState(page)).assignments.find(item => item.id === occurrence.id))
    .toMatchObject({ label: 'QA enstaka morgon', assigneeId: currentUserId, isScheduleOverride: true });
  expect((await qaState(page)).assignments.find(item => item.templateId === occurrence.templateId && item.date === '2026-11-10')?.label)
    .toBe('QA uppdaterad standard');
  await page.screenshot({ path: testInfo.outputPath('season-weekly-and-exception.png'), fullPage: true });
});

test('An owner can leave a weekly cell empty and explicitly unlock it for members', async ({ page }, testInfo) => {
  await page.goto('/season-schedule?qaDemo=1');
  await createPeriod(page);
  await page.getByRole('button', { name: 'Välj veckodagar för Lunchfodring', exact: true }).click();
  await page.getByRole('button', { name: 'Lunchfodring, onsdag', exact: true }).click();
  await page.getByRole('button', { name: 'Lämna ledigt', exact: true }).click();
  await page.getByRole('button', { name: 'Tilldela valda veckodagar', exact: true }).click();
  await expect(visibleText(page, 'Veckofördelningen är sparad.')).toBeVisible();
  await setDemoRole(page, 'rider', 'view');
  const day = page.getByRole('button', { name: 'Lunchfodring, onsdag', exact: true });
  await expect(day).toBeDisabled();
  await expect(visibleText(page, 'Tilldelat av stallägaren')).toBeVisible();
  await expect(visibleText(page, 'Ledigt · ägarens beslut')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('season-empty-owner-cell.png'), fullPage: true });
  await setDemoRole(page, 'admin', 'owner');
  await day.click();
  await page.getByRole('button', { name: 'Öppna valda veckodagar för egna val', exact: true }).click();
  await expect(visibleText(page, 'Veckofördelningen är sparad.')).toBeVisible();
  await setDemoRole(page, 'rider', 'view');
  await expect(day).toBeEnabled();
  await day.click();
  await page.getByRole('button', { name: 'Ta valda veckodagar', exact: true }).click();
  await expect(visibleText(page, 'Veckofördelningen är sparad.')).toBeVisible();
  const { assignments, currentUserId } = await qaState(page);
  expect(assignments.filter(item => item.templateId && item.label === 'Lunchfodring' && item.assigneeId === currentUserId)
    .map(item => item.date)).toEqual(['2026-11-04', '2026-11-11']);
  await page.goto('/calendar?qaDemo=1&date=2026-11-04&view=all');
  await expect(page.getByRole('button', { name: 'Öppna Lunchfodring 2026-11-04', exact: true })).toBeVisible();
  await setDemoRole(page, 'rider', 'view');
  await page.getByRole('button', { name: 'Öppna Lunchfodring 2026-11-04', exact: true }).click();
  await page.getByRole('button', { name: 'Öppna fast pass och veckoval', exact: true }).click();
  await page.getByRole('button', { name: 'Bara detta pass', exact: true }).click();
  await expect(page.getByLabel('Passets namn', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Släpp bara detta pass', exact: true }).click();
  await expect(visibleText(page, 'Passet är sparat.')).toBeVisible();
  const released = (await qaState(page)).assignments.filter(item => item.templateId && item.label === 'Lunchfodring');
  expect(released.find(item => item.date === '2026-11-04')).toMatchObject({ status: 'open', isScheduleOverride: true });
  expect(released.find(item => item.date === '2026-11-11')?.assigneeId).toBe(currentUserId);
  await page.getByRole('button', { name: 'Tillbaka till schema', exact: true }).click();
  await page.getByRole('button', { name: 'Öppna Lunchfodring 2026-11-04', exact: true }).click();
  await page.getByRole('button', { name: 'Öppna fast pass och veckoval', exact: true }).click();
  await page.getByRole('button', { name: 'Bara detta pass', exact: true }).click();
  await page.getByRole('button', { name: 'Ta bara detta pass', exact: true }).click();
  await expect(visibleText(page, 'Passet är sparat.')).toBeVisible();
  expect((await qaState(page)).assignments.find(item => item.templateId && item.label === 'Lunchfodring' && item.date === '2026-11-04'))
    .toMatchObject({ assigneeId: currentUserId, isScheduleOverride: true });
});

test('Five daily passes for a year are created in one action and an interrupted period resumes without duplicates', async ({ page }, testInfo) => {
  await page.goto('/season-schedule?qaDemo=1');
  await createPeriod(page, { name: 'QA årsperiod', from: '2026-11-01', to: '2027-10-31', extra: true });
  const created = (await qaState(page)).assignments.filter(item => item.templateId);
  expect(created).toHaveLength(1825);
  expect(new Set(created.map(item => `${item.templateId}:${item.originalDate}`)).size).toBe(1825);
  await page.evaluate(() => {
    const key = 'stableflow-qa-season-v1:qa-stable-main';
    const fixture = JSON.parse(localStorage.getItem(key));
    // Seed a genuine interrupted synthetic period; all production UI/hook code runs normally.
    fixture.periods[0].status = 'generating';
    fixture.assignments = fixture.assignments.slice(0, 365);
    localStorage.setItem(key, JSON.stringify(fixture));
  });
  await page.reload();
  await expect(visibleText(page, 'Perioden är inte färdig')).toBeVisible();
  expect((await qaState(page)).assignments.filter(item => item.templateId)).toHaveLength(0);
  await page.getByRole('button', { name: 'Återuppta skapandet', exact: true }).click();
  await expect(visibleText(page, 'Passen är skapade.')).toBeVisible();
  const resumed = (await qaState(page)).assignments.filter(item => item.templateId);
  expect(resumed).toHaveLength(1825);
  expect(new Set(resumed.map(item => `${item.templateId}:${item.originalDate}`)).size).toBe(1825);
  await visibleText(page, 'Stallets fasta pass.').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('season-year-resumed.png'), fullPage: true });
});

test('A rejected overlapping period retains the complete draft and a corrected retry succeeds', async ({ page }) => {
  await page.goto('/season-schedule?qaDemo=1');
  await createPeriod(page);
  await page.getByRole('button', { name: 'Skapa period', exact: true }).click();
  await page.getByLabel('Periodens namn', { exact: true }).fill('QA ny period efter fel');
  await page.getByLabel('Periodens startdatum', { exact: true }).fill('2026-11-10');
  await page.getByLabel('Periodens slutdatum', { exact: true }).fill('2026-11-21');
  await page.getByLabel('Pass 1, instruktioner', { exact: true }).fill('Behåll denna instruktion vid fel');
  await page.getByRole('button', { name: 'Skapa passen', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /överlappar/i })).toBeVisible();
  await expect(page.getByLabel('Periodens namn', { exact: true })).toHaveValue('QA ny period efter fel');
  await expect(page.getByLabel('Pass 1, instruktioner', { exact: true })).toHaveValue('Behåll denna instruktion vid fel');
  await page.getByLabel('Periodens startdatum', { exact: true }).fill('2026-11-15');
  await page.getByRole('button', { name: 'Skapa passen', exact: true }).click();
  await expect(visibleText(page, 'Passen är skapade.')).toBeVisible();
  expect((await qaState(page)).assignments.filter(item => item.templateId && item.date >= '2026-11-15')).toHaveLength(21);
});

test('A concurrent owner edit retains the draft and requires an explicit version choice before retry', async ({ page, context }, testInfo) => {
  await page.goto('/season-schedule?qaDemo=1');
  await createPeriod(page);
  await page.getByRole('button', { name: 'Ändra period och pass', exact: true }).click();
  await page.getByLabel('Periodens namn', { exact: true }).fill('QA mitt bevarade utkast');
  await page.getByLabel('Pass 1, instruktioner', { exact: true }).fill('Min instruktion finns kvar');
  const otherOwner = await context.newPage();
  await otherOwner.clock.setFixedTime(new Date('2026-10-12T06:00:00Z'));
  await otherOwner.goto('/season-schedule?qaDemo=1');
  await otherOwner.getByRole('button', { name: 'Ändra period och pass', exact: true }).click();
  await otherOwner.getByLabel('Periodens namn', { exact: true }).fill('QA annan ägare');
  await otherOwner.getByRole('button', { name: 'Lägg till pass', exact: true }).click();
  await otherOwner.getByLabel('Pass 4, namn', { exact: true }).fill('QA nytillagt av annan');
  await otherOwner.getByLabel('Pass 4, starttid', { exact: true }).fill('21:30');
  await otherOwner.getByRole('button', { name: 'Spara och uppdatera passen', exact: true }).click();
  await expect(visibleText(otherOwner, 'Passen är skapade.')).toBeVisible();
  await page.getByRole('button', { name: 'Spara och uppdatera passen', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /ändrades/i })).toBeVisible();
  await expect(page.getByLabel('Periodens namn', { exact: true })).toHaveValue('QA mitt bevarade utkast');
  await expect(page.getByLabel('Pass 1, instruktioner', { exact: true })).toHaveValue('Min instruktion finns kvar');
  await page.getByRole('button', { name: 'Uppdatera schema', exact: true }).click();
  await expect(visibleText(page, 'Senaste period: QA annan ägare')).toBeVisible();
  await expect(page.getByLabel('Periodens namn', { exact: true })).toHaveValue('QA mitt bevarade utkast');
  await page.getByRole('button', { name: 'Använd senaste versionen och behåll mitt utkast', exact: true }).click();
  await expect(page.getByLabel('Pass 4, namn', { exact: true })).toHaveValue('QA nytillagt av annan');
  await page.getByRole('button', { name: 'Spara och uppdatera passen', exact: true }).click();
  await expect(visibleText(page, 'Passen är skapade.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Välj period QA mitt bevarade utkast', exact: true })).toBeVisible();
  await visibleText(page, 'Stallets fasta pass.').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('season-owner-conflict-retry.png'), fullPage: true });
  await otherOwner.close();
});

test('Removing an unsaved empty pass does not block creation of the remaining daily passes', async ({ page }) => {
  await page.goto('/season-schedule?qaDemo=1');
  await page.getByRole('button', { name: 'Skapa period', exact: true }).click();
  await page.getByLabel('Periodens namn', { exact: true }).fill('QA borttagen tom rad');
  await page.getByLabel('Periodens startdatum', { exact: true }).fill('2026-11-01');
  await page.getByLabel('Periodens slutdatum', { exact: true }).fill('2026-11-14');
  await page.getByRole('button', { name: 'Lägg till pass', exact: true }).click();
  await page.getByRole('button', { name: 'Arkivera pass 4', exact: true }).click();
  await expect(page.getByLabel('Pass 4, namn', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Skapa passen', exact: true }).click();
  await expect(visibleText(page, 'Passen är skapade.')).toBeVisible();
  expect((await qaState(page)).assignments.filter(item => item.templateId)).toHaveLength(42);
});

test('An open and then own seasonal calendar pass opens both one-date and weekday choices', async ({ page }, testInfo) => {
  await page.goto('/season-schedule?qaDemo=1');
  await createPeriod(page);
  const morning = (await qaState(page)).assignments.find(item => item.templateId && item.label === 'Morgonfodring' && item.date === '2026-11-01');
  await page.goto('/calendar?qaDemo=1&date=2026-11-01&view=all');
  await expect(page.getByRole('button', { name: 'Öppna Morgonfodring 2026-11-01', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Öppna Morgonfodring 2026-11-01', exact: true }).click();
  await page.getByRole('button', { name: 'Öppna fast pass och veckoval', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/season-schedule\\?assignmentId=${morning.id}`));
  await page.getByRole('button', { name: 'Kommande pass denna veckodag', exact: true }).click();
  await expect(page.getByLabel('Veckoval från datum', { exact: true })).toHaveValue('2026-11-01');
  await expect(page.getByRole('button', { name: 'Morgonfodring, söndag', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Välj ansvarig QA Admin', exact: true }).click();
  await page.getByRole('button', { name: 'Tilldela valda veckodagar', exact: true }).click();
  await expect(visibleText(page, 'Veckofördelningen är sparad.')).toBeVisible();
  await page.goto('/calendar?qaDemo=1&date=2026-11-01&view=all');
  await page.getByRole('button', { name: 'Öppna Morgonfodring 2026-11-01', exact: true }).click();
  await page.getByRole('button', { name: 'Öppna fast pass och veckoval', exact: true }).click();
  await page.getByRole('button', { name: 'Bara detta pass', exact: true }).click();
  const longName = 'QA morgonfodring och utsläpp för alla hästar i norra hagen';
  await page.getByLabel('Passets namn', { exact: true }).fill(longName);
  await page.getByRole('button', { name: 'Spara bara detta pass', exact: true }).click();
  await expect(visibleText(page, 'Passet är sparat.')).toBeVisible();
  const after = (await qaState(page)).assignments;
  expect(after.find(item => item.id === morning.id)).toMatchObject({ label: longName, isScheduleOverride: true });
  expect(after.find(item => item.templateId === morning.templateId && item.date === '2026-11-08')?.label).toBe('Morgonfodring');
  await page.goto('/calendar?qaDemo=1&date=2026-11-01&view=all');
  await expect(page.getByRole('button', { name: `Öppna ${longName} 2026-11-01`, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: `Öppna ${longName} 2026-11-01`, exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('season-calendar-long-name.png'), fullPage: true });
});

test('Editing only the occurrence name preserves multiline instructions and the optional end time', async ({ page }) => {
  await page.goto('/season-schedule?qaDemo=1');
  await page.getByRole('button', { name: 'Skapa period', exact: true }).click();
  await page.getByLabel('Periodens namn', { exact: true }).fill('QA instruktioner');
  await page.getByLabel('Periodens startdatum', { exact: true }).fill('2026-11-01');
  await page.getByLabel('Periodens slutdatum', { exact: true }).fill('2026-11-02');
  const instructions = 'Fodra först.\n\nSläpp ut i norra hagen.';
  await page.getByLabel('Pass 1, instruktioner', { exact: true }).fill(instructions);
  await page.getByLabel('Pass 1, sluttid', { exact: true }).fill('08:15');
  await page.getByRole('button', { name: 'Skapa passen', exact: true }).click();
  await expect(visibleText(page, 'Passen är skapade.')).toBeVisible();
  await page.getByRole('button', { name: 'Ändra Morgonfodring 2026-11-01', exact: true }).click();
  await page.getByRole('button', { name: 'Bara detta pass', exact: true }).click();
  await expect(page.getByLabel('Passets instruktioner', { exact: true })).toHaveValue(instructions);
  await expect(page.getByLabel('Passets sluttid', { exact: true })).toHaveValue('08:15');
  await page.getByLabel('Passets namn', { exact: true }).fill('QA nytt namn, samma instruktion');
  await page.getByRole('button', { name: 'Spara bara detta pass', exact: true }).click();
  await expect(visibleText(page, 'Passet är sparat.')).toBeVisible();
  expect((await qaState(page)).assignments.find(item => item.templateId && item.label === 'QA nytt namn, samma instruktion')?.note)
    .toBe(`${instructions}\nSlut: 08:15`);
});

test('Profile and member detail open the actual seasonal weekly choices with the intended member selected', async ({ page }) => {
  await page.goto('/season-schedule?qaDemo=1');
  await createPeriod(page);
  await page.goto('/profile?qaDemo=1');
  await page.getByRole('button', { name: 'Mina fasta veckopass', exact: true }).click();
  await expect(page).toHaveURL(/\/season-schedule$/);
  await page.goto('/members/00000000-0000-4000-8000-000000000002?qaDemo=1&stableId=qa-stable-main');
  await page.getByRole('button', { name: 'Fasta veckopass för QA Medlem', exact: true }).click();
  await expect(page).toHaveURL(/\/season-schedule\?memberId=00000000-0000-4000-8000-000000000002/);
  await page.getByRole('button', { name: 'Välj veckodagar för Morgonfodring', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Välj ansvarig QA Medlem', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Morgonfodring, tisdag', exact: true }).click();
  await page.getByRole('button', { name: 'Tilldela valda veckodagar', exact: true }).click();
  await expect(visibleText(page, 'Veckofördelningen är sparad.')).toBeVisible();
  expect((await qaState(page)).assignments.filter(item => item.templateId && item.label === 'Morgonfodring' && item.assigneeId === '00000000-0000-4000-8000-000000000002')
    .map(item => item.date)).toEqual(['2026-11-03', '2026-11-10']);
});

test('Ordinary calendar take, release and complete actions on seasonal passes persist after reload', async ({ page }) => {
  await page.goto('/season-schedule?qaDemo=1');
  await createPeriod(page, { to: '2026-11-02' });
  const { assignments, currentUserId } = await qaState(page);
  const morning = assignments.find(item => item.templateId && item.label === 'Morgonfodring' && item.date === '2026-11-01');
  await page.goto('/calendar?qaDemo=1&date=2026-11-01&view=all');
  await page.getByRole('button', { name: 'Ta Morgonfodring', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Släpp Morgonfodring', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Släpp Morgonfodring', exact: true })).toBeVisible();
  expect((await qaState(page)).assignments.find(item => item.id === morning.id))
    .toMatchObject({ status: 'assigned', assigneeId: currentUserId, isScheduleOverride: true });
  await page.getByRole('button', { name: 'Släpp Morgonfodring', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ta Morgonfodring', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Ta Morgonfodring', exact: true })).toBeVisible();
  const released = (await qaState(page)).assignments.find(item => item.id === morning.id);
  expect(released).toMatchObject({ status: 'open', isScheduleOverride: true });
  expect(released.assigneeId).toBeUndefined();
  await page.getByRole('button', { name: 'Ta Morgonfodring', exact: true }).click();
  await page.getByRole('button', { name: 'Markera Morgonfodring klart', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Markera Morgonfodring klart', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(visibleText(page, 'Klart')).toBeVisible();
  const completed = (await qaState(page)).assignments.find(item => item.id === morning.id);
  expect(completed).toMatchObject({ status: 'completed', assigneeId: currentUserId, isScheduleOverride: true });
  expect(completed.completedAt).toBeTruthy();
});

test('Changing stable during a real save clears the old draft and busy state', async ({ page }) => {
  await page.goto('/season-schedule?qaDemo=1');
  await page.getByRole('button', { name: 'Skapa period', exact: true }).click();
  await page.getByLabel('Periodens namn', { exact: true }).fill('QA äldre stall');
  await page.getByLabel('Periodens startdatum', { exact: true }).fill('2026-11-01');
  await page.getByLabel('Periodens slutdatum', { exact: true }).fill('2027-10-31');
  await page.getByRole('button', { name: 'Skapa passen', exact: true }).evaluate(button => {
    button.addEventListener('click', () => {
      const observer = new MutationObserver(() => {
        if (!document.body.textContent.includes('Skapar pass ·')) return;
        observer.disconnect();
        const root = document.querySelector('#root');
        const key = Object.keys(root).find(key => key.startsWith('__reactContainer$'));
        let provider;
        const seen = new Set();
        const visit = fiber => {
          if (!fiber || seen.has(fiber)) return;
          seen.add(fiber);
          if ((fiber.type?.name || fiber.type?.displayName) === 'AppDataProvider') provider = fiber;
          visit(fiber.child); visit(fiber.sibling);
        };
        visit(root[key].stateNode?.current || root[key]);
        const hook = provider.memoizedState;
        const state = hook.memoizedState;
        if (state.currentStableId !== 'qa-stable-main') throw new Error('Only synthetic seasonal state may change.');
        const otherId = 'qa-season-other';
        const user = state.users[state.currentUserId];
        const stable = state.stables.find(row => row.id === state.currentStableId);
        hook.queue.dispatch({ type: 'STATE_HYDRATE', payload: {
          ...state, currentStableId: otherId,
          stables: [...state.stables, { ...stable, id: otherId, name: 'QA andra stallet' }],
          horses: [...state.horses, { ...state.horses[0], id: 'qa-season-other-horse', stableId: otherId }],
          assignments: [...state.assignments, { ...state.assignments.find(row => !row.templateId), id: 'qa-season-other-manual', stableId: otherId }],
          users: { ...state.users, [user.id]: { ...user, membership: [...user.membership,
            { stableId: otherId, role: 'admin', access: 'owner' }] } },
        } });
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }, { once: true });
  });
  await page.getByRole('button', { name: 'Skapa passen', exact: true }).click();
  await expect(visibleText(page, 'QA andra stallet')).toBeVisible();
  await expect(visibleText(page, 'Sparar schemat…')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Skapa period', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Skapa period', exact: true }).click();
  await expect(page.getByLabel('Periodens namn', { exact: true })).toHaveValue('');
});

test('An open one-date draft detects a fresh assignment token without overwriting the other owner', async ({ page }, testInfo) => {
  await page.goto('/season-schedule?qaDemo=1');
  await createPeriod(page);
  await page.getByRole('button', { name: 'Ändra Morgonfodring 2026-11-01', exact: true }).click();
  await page.getByRole('button', { name: 'Bara detta pass', exact: true }).click();
  await page.getByLabel('Passets namn', { exact: true }).fill('QA behåll min namnändring');
  await page.evaluate(() => {
    const key = 'stableflow-qa-season-v1:qa-stable-main';
    const store = JSON.parse(localStorage.getItem(key));
    const old = store.assignments.find(row => row.date === '2026-11-01' && row.label === 'Morgonfodring');
    const latest = { ...old, time: '09:00', label: 'QA annan ägares morgon', status: 'assigned',
      assigneeId: '00000000-0000-4000-8000-000000000002', assignedVia: 'manual',
      isScheduleOverride: true, updatedAt: '2026-10-12T09:00:00.000Z' };
    store.assignments = store.assignments.map(row => row.id === old.id ? latest : row);
    localStorage.setItem(key, JSON.stringify(store));
    const root = document.querySelector('#root');
    const fiberKey = Object.keys(root).find(key => key.startsWith('__reactContainer$'));
    let provider;
    const seen = new Set();
    const visit = fiber => {
      if (!fiber || seen.has(fiber)) return;
      seen.add(fiber);
      if ((fiber.type?.name || fiber.type?.displayName) === 'AppDataProvider') provider = fiber;
      visit(fiber.child); visit(fiber.sibling);
    };
    visit(root[fiberKey].stateNode?.current || root[fiberKey]);
    const hook = provider.memoizedState;
    const state = hook.memoizedState;
    if (state.currentStableId !== 'qa-stable-main') throw new Error('Only synthetic seasonal state may change.');
    hook.queue.dispatch({ type: 'STATE_HYDRATE', payload: {
      ...state, assignments: state.assignments.map(row => row.id === old.id ? latest : row),
    } });
  });
  await expect(page.getByRole('alert').filter({ hasText: 'Passet har ändrats sedan du öppnade det' })).toBeVisible();
  await expect(page.getByLabel('Passets namn', { exact: true })).toHaveValue('QA behåll min namnändring');
  await expect(page.getByLabel('Passets starttid', { exact: true })).toHaveValue('07:00');
  await expect(page.getByRole('button', { name: 'Spara bara detta pass', exact: true })).toBeDisabled();
  await page.getByRole('alert').filter({ hasText: 'Passet har ändrats sedan du öppnade det' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('season-occurrence-conflict.png'), fullPage: true });
  await page.getByRole('button', { name: 'Stäng och granska senaste passet', exact: true }).click();
  await page.getByRole('button', { name: 'Ändra QA annan ägares morgon 2026-11-01', exact: true }).click();
  await page.getByRole('button', { name: 'Bara detta pass', exact: true }).click();
  await expect(page.getByLabel('Passets starttid', { exact: true })).toHaveValue('09:00');
  await page.getByLabel('Passets namn', { exact: true }).fill('QA granskad namnändring');
  await page.getByRole('button', { name: 'Spara bara detta pass', exact: true }).click();
  await expect(visibleText(page, 'Passet är sparat.')).toBeVisible();
  const saved = (await qaState(page)).assignments.find(row => row.date === '2026-11-01' && row.label === 'QA granskad namnändring');
  expect(saved.time).toBe('09:00');
  expect(saved.assigneeId).toBe('00000000-0000-4000-8000-000000000002');
});

test.describe('A phone outside Sweden', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('Upcoming passes, one-date edits and weekday choices use Swedish stable time', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-12T18:30:00Z'));
    await page.goto('/season-schedule?qaDemo=1');
    await page.getByRole('button', { name: 'Skapa period', exact: true }).click();
    await page.getByLabel('Periodens namn', { exact: true }).fill('QA svensk stalltid');
    await page.getByLabel('Periodens startdatum', { exact: true }).fill('2026-10-12');
    await page.getByLabel('Periodens slutdatum', { exact: true }).fill('2026-10-13');
    await page.getByLabel('Pass 1, starttid', { exact: true }).fill('21:00');
    await page.getByRole('button', { name: 'Skapa passen', exact: true }).click();
    await expect(visibleText(page, 'Passen är skapade.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ändra Morgonfodring 2026-10-12', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ändra Morgonfodring 2026-10-12', exact: true }).click();
    await page.getByRole('button', { name: 'Bara detta pass', exact: true }).click();
    await page.getByLabel('Passets namn', { exact: true }).fill('QA svensk kväll idag');
    await page.getByLabel('Passets starttid', { exact: true }).fill('21:30');
    await page.getByRole('button', { name: 'Spara bara detta pass', exact: true }).click();
    await expect(visibleText(page, 'Passet är sparat.')).toBeVisible();
    await page.getByRole('button', { name: 'Välj veckodagar för Morgonfodring', exact: true }).click();
    await expect(page.getByLabel('Veckoval från datum', { exact: true })).toHaveValue('2026-10-12');
    await page.getByRole('button', { name: 'Morgonfodring, måndag', exact: true }).click();
    await page.getByRole('button', { name: 'Tilldela valda veckodagar', exact: true }).click();
    await expect(visibleText(page, 'Veckofördelningen är sparad.')).toBeVisible();
    expect((await qaState(page)).assignments.find(row => row.label === 'QA svensk kväll idag').time).toBe('21:30');
  });
});
