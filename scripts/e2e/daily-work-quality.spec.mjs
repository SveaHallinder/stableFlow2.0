/* global document */
import { expect, test } from '@playwright/test';
import { URL } from 'node:url';

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm' });

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (/\/(auth|rest|functions)\/v1\//.test(url.pathname) || !['localhost', '127.0.0.1'].includes(url.hostname)) {
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await page.routeWebSocket(/supabase\./, (socket) => socket.close());
  await page.clock.setFixedTime(new Date('2026-10-06T07:00:00Z'));
});

// Use the development qaDemo reducer for local fixtures. No authenticated
// session or backend requests are needed, and reload discards every fixture.
async function loadFixture(page, fixture) {
  await page.evaluate((fixture) => {
    const element = document.querySelector('#root');
    const key = Object.keys(element).find((key) => key.startsWith('__reactContainer$'));
    const root = element[key];
    let provider;
    const visited = new Set();
    const visit = (fiber) => {
      if (!fiber || visited.has(fiber)) return;
      visited.add(fiber);
      if ((fiber.type?.name || fiber.type?.displayName) === 'AppDataProvider') provider = fiber;
      visit(fiber.child);
      visit(fiber.sibling);
    };
    visit(root.stateNode?.current || root);
    if (!provider) throw new Error('qaDemo AppDataProvider fixture is unavailable.');
    const hook = provider.memoizedState;
    const state = hook.memoizedState;
    const userId = state.currentUserId;
    const stableId = state.currentStableId;
    const users = { ...state.users, [userId]: { ...state.users[userId], defaultPasses: [] } };
    let payload = { ...state, users };
    if (fixture === 'other-stable') {
      const foreignId = 'qa-stable-other';
      users[userId].membership = [...users[userId].membership, { stableId: foreignId, role: 'admin', access: 'owner' }];
      payload = {
        ...payload,
        stables: [...state.stables, { ...state.stables[0], id: foreignId, name: 'QA Andra stallet' }],
        assignments: [
          { id: 'local', stableId, assigneeId: userId, status: 'assigned', date: '2026-10-06', time: '12:00', slot: 'Lunch', icon: 'clock', label: 'Lunch i valt stall' },
          { id: 'foreign', stableId: foreignId, assigneeId: userId, status: 'assigned', date: '2026-10-06', time: '07:00', slot: 'Morning', icon: 'sun', label: 'Morgon i annat stall' },
        ],
      };
    } else if (fixture === 'mine' || fixture === 'open') {
      const otherId = Object.keys(users).find((id) => id !== userId);
      payload.assignments = Array.from({ length: 16 }, (_, index) => ({
        id: `horizon-${index}`, stableId, date: `2026-10-${String(index + 6).padStart(2, '0')}`,
        label: index >= 7 ? `QA matchande pass dag ${index + 1}` : `QA annat pass dag ${index + 1}`,
        slot: 'Lunch', icon: 'clock', time: '12:00',
        status: fixture === 'open' && index >= 7 ? 'open' : 'assigned',
        assigneeId: fixture === 'open' && index >= 7 ? undefined : fixture === 'mine' && index >= 7 ? userId : otherId,
      }));
    } else if (fixture === 'guest') {
      users[userId].membership = users[userId].membership.map((membership) => ({
        ...membership, role: 'guest', access: 'view', riderRole: undefined, horseIds: [],
      }));
    } else throw new Error(`Unknown qaDemo fixture: ${fixture}`);
    hook.queue.dispatch({ type: 'STATE_HYDRATE', payload });
  }, fixture);
}

test('Idag and Mina pass agree on the current stable', async ({ page }, testInfo) => {
  await page.goto('/?qaDemo=1');
  await expect(page.getByText('Läget i stallet', { exact: true })).toBeVisible();
  await loadFixture(page, 'other-stable');
  const next = page.getByText('Nästa: Lunch i valt stall · 12:00', { exact: true });
  await expect(next).toBeVisible();
  await expect(page.getByText(/Nästa: Morgon i annat stall/)).toHaveCount(0);
  await next.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('today-current-stable.png') });
  await page.getByText('Mina pass', { exact: true }).click();
  await expect(page.getByText('Lunch i valt stall', { exact: true })).toBeVisible();
  await expect(page.getByText('Morgon i annat stall', { exact: true })).toHaveCount(0);
});

for (const view of ['mine', 'open']) {
  test(`${view} finds day eight while showing seven matching days`, async ({ page }, testInfo) => {
    await page.goto(`/calendar?qaDemo=1&view=${view}`);
    await expect(page.getByText('Kommande dagar', { exact: true })).toBeVisible();
    await expect(page.getByText(view === 'mine' ? 'Morgonfodring' : 'Lunchfodring', { exact: true })).toBeVisible();
    await loadFixture(page, view);
    const dayEight = page.getByText('QA matchande pass dag 8', { exact: true });
    await expect(dayEight).toBeVisible();
    await expect(page.getByText('QA matchande pass dag 14', { exact: true })).toBeVisible();
    await expect(page.getByText('QA matchande pass dag 15', { exact: true })).toHaveCount(0);
    await expect(page.getByText(view === 'mine' ? 'Inga pass på dig ännu' : 'Inga lediga pass', { exact: true })).toHaveCount(0);
    await dayEight.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`${view}-day-eight.png`) });
  });
}

test('guest has no claim, complete, release or manage buttons', async ({ page }, testInfo) => {
  await page.goto('/calendar?qaDemo=1');
  await expect(page.getByRole('button', { name: 'Ta Lunchfodring', exact: true })).toBeVisible();
  await loadFixture(page, 'guest');
  await expect(page.getByRole('button', { name: 'Nytt pass', exact: true })).toHaveCount(0);
  await expect(page.getByText('Lunchfodring', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ta Lunchfodring', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Markera Morgonfodring klart', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Släpp Morgonfodring', exact: true })).toHaveCount(0);
  await expect(page.getByText('Hantera', { exact: true })).toHaveCount(0);
  await page.getByText('Lunchfodring', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('guest-read-only.png') });
});

test('authorized assignment buttons still claim, complete, release and open the editor', async ({ page }) => {
  await page.goto('/calendar?qaDemo=1');
  await page.getByRole('button', { name: 'Ta Lunchfodring', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Markera Lunchfodring klart', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Markera Lunchfodring klart', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Markera Lunchfodring klart', exact: true })).toHaveCount(0);
  await expect(page.getByText('Klart', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Släpp Morgonfodring', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ta Morgonfodring', exact: true })).toBeVisible();
  await page.getByText('Hantera', { exact: true }).first().click();
  await expect(page.getByText('Redigera pass', { exact: true })).toBeVisible();
});
