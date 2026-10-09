/* global document, getComputedStyle */
import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { URL } from 'node:url';

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm', serviceWorkers: 'block' });
const backendAttempts = new WeakMap();
const visibleText = (page, value) => page.getByText(value, { exact: true })
  .filter({ visible: true }).and(page.locator(':not([aria-hidden="true"] *)'));

test.beforeEach(async ({ context, page, baseURL }) => {
  const base = new URL(baseURL);
  expect(['http:', 'https:']).toContain(base.protocol);
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(base.hostname);
  const attempts = [];
  backendAttempts.set(page, attempts);
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

test.afterEach(async ({ page }, testInfo) => {
  const attempts = backendAttempts.get(page);
  await writeFile(testInfo.outputPath('blocked-network.json'), JSON.stringify(attempts, null, 2));
  expect(attempts, 'Calendar qaDemo must not attempt backend HTTP or WebSocket requests').toEqual([]);
});

async function qaAssignments(page) {
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
    if (!provider) throw new Error('Calendar qaDemo AppDataProvider is unavailable.');
    const state = provider.memoizedState.memoizedState;
    if (state.currentStableId !== 'qa-stable-main') throw new Error('Only the synthetic qaDemo stable is allowed.');
    return state.assignments;
  });
}

async function screenshotModal(page, testInfo, anchor, filename) {
  await expect.poll(() => anchor.evaluate(element => {
    let opacity = 1;
    for (let node = element; node; node = node.parentElement) {
      opacity *= Number(getComputedStyle(node).opacity);
    }
    return opacity;
  })).toBe(1);
  await page.screenshot({ path: testInfo.outputPath(filename), fullPage: true });
}

test('mobile calendar keeps the colour explanation optional and week controls readable', async ({ page }, testInfo) => {
  await page.goto('/calendar?qaDemo=1&view=all');
  const explanation = page.getByRole('button', { name: 'Färgförklaring', exact: true });
  await expect(explanation).toHaveAttribute('aria-expanded', 'false');
  await expect(visibleText(page, 'Fodring saknas')).toHaveCount(0);
  await explanation.click();
  await expect(explanation).toHaveAttribute('aria-expanded', 'true');
  await expect(visibleText(page, 'Fodring saknas')).toBeVisible();
  await explanation.click();
  await expect(visibleText(page, 'Fodring saknas')).toHaveCount(0);
  for (const name of ['Föregående vecka', 'Nästa vecka']) {
    const control = page.getByRole('button', { name, exact: true });
    await expect(control).toBeVisible();
    const bounds = await control.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByLabel('Nytt pass', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ta Lunchfodring', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ta pass', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stallschema', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Mina', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mina', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Alla', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.screenshot({ path: testInfo.outputPath('calendar-compact-controls.png') });
});

test('Sunday afternoon opens the current week and shows today assignments', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date('2026-10-11T10:00:00Z'));
  await page.goto('/calendar?qaDemo=1&view=all');
  await expect(visibleText(page, 'Vecka 41')).toBeVisible();
  await expect(visibleText(page, 'Vecka 42')).toHaveCount(0);
  await expect(visibleText(page, 'Morgonfodring')).toBeVisible();
  expect((await qaAssignments(page)).find(assignment => assignment.id === 'qa-assignment-mine')?.date)
    .toBe('2026-10-11');
  await page.screenshot({ path: testInfo.outputPath('sunday-current-week.png'), fullPage: true });
  await visibleText(page, 'Morgonfodring').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('sunday-today-assignment.png'), fullPage: true });
});

test('narrow mobile mine view keeps the assignment name readable above both actions', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/calendar?qaDemo=1&view=mine');
  const name = visibleText(page, 'Morgonfodring');
  await expect(name).toBeVisible();
  const title = await name.boundingBox();
  expect(title.width).toBeGreaterThanOrEqual(140);
  expect(title.height).toBeLessThanOrEqual(36);
  for (const action of ['Släpp Morgonfodring', 'Markera Morgonfodring klart']) {
    const button = page.getByRole('button', { name: action, exact: true });
    await expect(button).toBeVisible();
    const bounds = await button.boundingBox();
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.y).toBeGreaterThanOrEqual(title.y + title.height);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath('calendar-mine-320.png') });
});

test('Invalid recurring end retains the draft and correction saves the entered duration', async ({ page }, testInfo) => {
  await page.goto('/calendar?qaDemo=1&view=all');
  await page.getByRole('button', { name: 'Skapa återkommande pass', exact: true }).click();
  const dates = page.getByPlaceholder('ÅÅÅÅ-MM-DD', { exact: true });
  await dates.nth(0).fill('2026-10-07');
  await dates.nth(1).fill('2026-10-07');
  const start = page.getByPlaceholder('07:00', { exact: true });
  const end = page.getByPlaceholder('08:00', { exact: true });
  const title = page.getByPlaceholder('Mockning', { exact: true });
  await start.fill('07:00');
  await end.fill('25:61');
  await title.fill('QA återkommande med sluttid');
  await visibleText(page, 'Skapa').click();
  const error = visibleText(page, 'Ange en giltig sluttid i formatet HH:MM (00:00–23:59).');
  await expect(error).toBeVisible();
  await expect(title).toHaveValue('QA återkommande med sluttid');
  await expect(start).toHaveValue('07:00');
  await expect(end).toHaveValue('25:61');
  await expect(dates.nth(0)).toHaveValue('2026-10-07');
  await expect(dates.nth(1)).toHaveValue('2026-10-07');
  expect((await qaAssignments(page)).filter(assignment => assignment.label === 'QA återkommande med sluttid')).toEqual([]);
  await screenshotModal(page, testInfo, error, 'recurring-invalid-end-retained.png');

  await end.fill('08:30');
  await visibleText(page, 'Skapa').click();
  await expect(title).toHaveCount(0);
  await expect(visibleText(page, 'QA återkommande med sluttid')).toBeVisible();
  const assignments = (await qaAssignments(page)).filter(assignment => assignment.label === 'QA återkommande med sluttid');
  expect(assignments).toHaveLength(1);
  expect(assignments[0]).toMatchObject({ date: '2026-10-07', time: '07:00', note: 'Slut: 08:30' });
  await visibleText(page, 'QA återkommande med sluttid').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('recurring-valid-duration.png'), fullPage: true });
});

test('Invalid recurring count retains the draft and correction creates the intended pass', async ({ page }, testInfo) => {
  await page.goto('/calendar?qaDemo=1&view=all');
  await page.getByRole('button', { name: 'Skapa återkommande pass', exact: true }).click();
  const dates = page.getByPlaceholder('ÅÅÅÅ-MM-DD', { exact: true });
  await dates.nth(0).fill('2026-10-07');
  await dates.nth(1).fill('2026-10-07');
  const title = page.getByPlaceholder('Mockning', { exact: true });
  const count = page.getByPlaceholder('1', { exact: true });
  await title.fill('QA antal utan trunkering');
  await page.getByPlaceholder('07:00', { exact: true }).fill('07:00');
  await page.getByPlaceholder('08:00', { exact: true }).fill('08:30');
  await expect(visibleText(page, 'Högst 365 nya pass per omgång. Befintliga pass hoppas över.')).toBeVisible();
  for (const value of ['1.5', '20abc', '0', '-2', '366']) {
    await count.fill(value);
    await visibleText(page, 'Skapa').click();
    await expect(visibleText(page, 'Ange ett helt antal pass mellan 1 och 365.')).toBeVisible();
    await expect(count).toHaveValue(value);
    await expect(title).toHaveValue('QA antal utan trunkering');
    expect((await qaAssignments(page)).filter(assignment => assignment.label === 'QA antal utan trunkering')).toEqual([]);
  }
  await screenshotModal(page, testInfo, count, 'recurring-invalid-count-retained.png');
  await count.fill('');
  await visibleText(page, 'Skapa').click();
  await expect(title).toHaveCount(0);
  const assignments = (await qaAssignments(page)).filter(assignment => assignment.label === 'QA antal utan trunkering');
  expect(assignments).toHaveLength(1);
  expect(assignments[0]).toMatchObject({ date: '2026-10-07', note: 'Slut: 08:30' });
});

test('Recurring total cap retains the date range and a shorter retry succeeds', async ({ page }, testInfo) => {
  await page.goto('/calendar?qaDemo=1&view=all');
  await page.getByRole('button', { name: 'Skapa återkommande pass', exact: true }).click();
  const dates = page.getByPlaceholder('ÅÅÅÅ-MM-DD', { exact: true });
  await dates.nth(0).fill('2026-10-07');
  await dates.nth(1).fill('2034-01-01');
  const title = page.getByPlaceholder('Mockning', { exact: true });
  const count = page.getByPlaceholder('1', { exact: true });
  await title.fill('QA begränsad omgång');
  await count.fill('1');
  await page.getByPlaceholder('07:00', { exact: true }).fill('07:00');
  await page.getByPlaceholder('08:00', { exact: true }).fill('08:30');
  await visibleText(page, 'Skapa').click();
  const error = page.getByRole('alert').filter({ hasText: 'Högst 365 nya pass per omgång. Minska antal pass eller välj kortare datumintervall.' });
  await expect(error).toBeVisible();
  await expect(dates.nth(1)).toHaveValue('2034-01-01');
  await expect(title).toHaveValue('QA begränsad omgång');
  await expect(count).toHaveValue('1');
  expect((await qaAssignments(page)).filter(assignment => assignment.label === 'QA begränsad omgång')).toEqual([]);
  await screenshotModal(page, testInfo, error, 'recurring-total-cap-retained.png');
  await dates.nth(1).fill('2026-10-07');
  await visibleText(page, 'Skapa').click();
  await expect(title).toHaveCount(0);
  expect((await qaAssignments(page)).filter(assignment => assignment.label === 'QA begränsad omgång')).toHaveLength(1);
});
