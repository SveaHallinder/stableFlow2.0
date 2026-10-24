/* global document */
import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { URL } from 'node:url';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const attemptsByPage = new WeakMap();

test.beforeEach(async ({ context, page, baseURL }) => {
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(baseURL).hostname);
  const attempts = [];
  attemptsByPage.set(page, attempts);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || /\/(auth|rest|functions|storage|realtime)\/v1(?:\/|$)/.test(url.pathname)) {
      attempts.push({ method: route.request().method(), path: url.pathname });
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await context.routeWebSocket(/.*/, socket => socket.close());
});

test.afterEach(async ({ page }, testInfo) => {
  await writeFile(testInfo.outputPath('blocked-network.json'), JSON.stringify(attemptsByPage.get(page), null, 2));
  expect(attemptsByPage.get(page), 'UI polish QA must not attempt backend or external requests').toEqual([]);
});

for (const entry of [
  { route: '/feed', title: 'Flöde' },
  { route: '/messages', title: 'Chatt' },
  { route: '/calendar', title: 'Schema', section: 'Tävling' },
]) {
  test(`header search from ${entry.title} opens usable existing search`, async ({ page }) => {
    await page.goto(`${entry.route}?qaDemo=1`);
    await expect(page.getByText(entry.title, { exact: true }).first()).toBeVisible();
    if (entry.section) await page.getByRole('button', { name: entry.section, exact: true }).click();
    await page.getByRole('button', { name: 'Sök', exact: true }).click();
    const search = page.getByPlaceholder('Sök personer, hästar, pass, loggar...', { exact: true });
    await expect(search).toBeVisible();
    await search.fill('Saga');
    await expect(page.getByText('Saga', { exact: true }).first()).toBeVisible();
  });
}

test('the stable switcher exposes the current stable when local selection changes', async ({ page }) => {
  await page.goto('/messages?qaDemo=1');
  await expect(page.getByText('Chatt', { exact: true }).first()).toBeVisible();
  const first = page.getByRole('button', { name: 'Byt till QA Stallet', exact: true });
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => {
    const element = document.querySelector('#root');
    const key = Object.keys(element).find(key => key.startsWith('__reactContainer$'));
    let provider;
    const visited = new Set();
    const visit = fiber => {
      if (!fiber || visited.has(fiber)) return;
      visited.add(fiber);
      if ((fiber.type?.name || fiber.type?.displayName) === 'AppDataProvider') provider = fiber;
      visit(fiber.child); visit(fiber.sibling);
    };
    visit(element[key].stateNode?.current || element[key]);
    if (!provider) throw new Error('UI polish qaDemo fixture is unavailable.');
    const hook = provider.memoizedState, state = hook.memoizedState;
    if (state.currentStableId !== 'qa-stable-main') throw new Error('Only synthetic qaDemo fixtures are allowed.');
    const stable = state.stables.find(item => item.id === state.currentStableId);
    const otherId = 'qa-stable-switcher';
    hook.queue.dispatch({ type: 'STATE_HYDRATE', payload: { ...state,
      currentStableId: otherId,
      stables: [...state.stables, { ...stable, id: otherId, name: 'QA Andra stallet' }],
      horses: [...state.horses, { ...state.horses[0], id: 'qa-switcher-horse', stableId: otherId }],
      assignments: [...state.assignments, { ...state.assignments[0], id: 'qa-switcher-assignment', stableId: otherId }],
      users: { ...state.users, [state.currentUserId]: { ...state.users[state.currentUserId],
        membership: [...state.users[state.currentUserId].membership, { stableId: otherId, role: 'admin', access: 'owner' }],
      } },
    } });
  });
  const second = page.getByRole('button', { name: 'Byt till QA Andra stallet', exact: true });
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  // The existing qaDemo refresh intentionally restores its single-stable seed.
  // Render the alternate selection locally, then exercise the real return action.
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(second).toHaveCount(0);
});

test('care events expose a reachable horse profile action on narrow mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/calendar?qaDemo=1');
  await page.getByRole('button', { name: 'Vård', exact: true }).click();
  await expect(page.getByText('Årsvaccination', { exact: true })).toBeVisible();
  const profile = page.getByText('Öppna hästprofil →', { exact: true }).locator('..');
  await expect(profile).toHaveAttribute('role', 'button');
  const bounds = await profile.boundingBox();
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  await profile.click();
  await expect(page).toHaveURL(/\/horses\//);
  await expect(page.getByText('Saga', { exact: true }).filter({ visible: true }).first()).toBeVisible();
});

for (const width of [320, 390]) {
  test(`selected member weekdays remain readable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/members/00000000-0000-4000-8000-000000000001?qaDemo=1');
    const day = page.getByRole('button', { name: 'Morgon, Mån', exact: true });
    const label = day.getByText('Mån', { exact: true });
    await expect(day).toHaveAttribute('aria-pressed', 'true');
    await expect(label).toHaveCSS('color', 'rgb(255, 255, 255)');
    const other = page.getByRole('button', { name: 'Morgon, Tis', exact: true });
    await expect(other).toHaveAttribute('aria-pressed', 'false');
    await expect(other.getByText('Tis', { exact: true })).toHaveCSS('color', 'rgb(102, 102, 102)');
    await day.scrollIntoViewIfNeeded();
    const bounds = await day.boundingBox();
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath(`member-weekday-${width}.png`) });
  });
}
