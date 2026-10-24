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
    } else if (fixture === 'unread-stable-message') {
      const preview = state.messages.find(message => message.chatKind === 'stable' && message.stableId === stableId);
      const authorId = preview?.participantIds.find(id => id !== userId);
      if (!preview || !authorId) throw new Error('qaDemo stall chat fixture is unavailable.');
      const message = { id: 'qa-mobile-unread-message', conversationId: preview.id, authorId,
        text: 'QA oläst uppdatering i stallchatten', timestamp: new Date().toISOString(), status: 'delivered' };
      payload.messages = state.messages.map(item => item.id === preview.id ? {
        ...item, description: message.text, unreadCount: 1, unreadMessageIds: [message.id],
      } : item);
      payload.conversations = { ...state.conversations,
        [preview.id]: [...(state.conversations[preview.id] ?? []), message] };
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
  await expect(page.getByRole('heading', { name: 'Dagen i stallet', exact: true })).toBeVisible();
  await loadFixture(page, 'other-stable');
  const nextPass = page.getByRole('heading', { name: 'Mitt närmaste pass', exact: true }).locator('../..');
  const next = nextPass.getByText('Lunch i valt stall', { exact: true });
  await expect(next).toBeVisible();
  await expect(nextPass.getByText('Idag · 12:00', { exact: true })).toBeVisible();
  await expect(page.getByText('Morgon i annat stall', { exact: true })).toHaveCount(0);
  await next.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('today-current-stable.png') });
  await nextPass.getByRole('button', { name: 'Mitt schema', exact: true }).click();
  await expect(page.getByText('Lunch i valt stall', { exact: true }).filter({ visible: true })
    .and(page.locator(':not([aria-hidden="true"] *)'))).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Redigera återkommande pass', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ta Lunchfodring', exact: true })).toBeVisible();
  await loadFixture(page, 'guest');
  await expect(page.getByRole('button', { name: 'Nytt pass', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Redigera återkommande pass', exact: true })).toHaveCount(0);
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

for (const width of [320, 390]) {
  test(`home opens its messages and keeps every mobile destination usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/?qaDemo=1');
    await expect(page.getByRole('heading', { name: 'Dagen i stallet', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Öppna mitt pass', exact: true })).toBeVisible();
    await loadFixture(page, 'unread-stable-message');
    for (const name of ['Idag', 'Hästar', 'Schema', 'Flöde', 'Chatt']) {
      const tab = page.getByRole('tab', { name, exact: true });
      await expect(tab).toBeVisible();
      const box = await tab.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }
    const menu = page.getByRole('button', { name: 'Öppna meny', exact: true });
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    expect(menuBox.width).toBeGreaterThanOrEqual(44);
    expect(menuBox.height).toBeGreaterThanOrEqual(44);
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`figma-home-${width}.png`) });

    const showMore = page.getByRole('button', { name: 'Visa fler nya meddelanden', exact: true });
    await showMore.scrollIntoViewIfNeeded();
    await showMore.click();
    const showLess = page.getByRole('button', { name: 'Visa färre nya meddelanden', exact: true });
    await expect(showLess).toHaveCount(2);
    await expect(showLess.first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Öppna konversation med QA Stallet', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Öppna konversation med QA Medlem', exact: true }).click();
    await expect(page).toHaveURL(/\/chat\/[^/?]+(?:\?|$)/);
    await expect(page.getByText('Kan du ta kvällspasset imorgon?', { exact: true }).filter({ visible: true })
      .and(page.locator(':not([aria-hidden="true"] *)'))).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Meddelande', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`figma-chat-${width}.png`) });

    await page.getByRole('button', { name: 'Tillbaka', exact: true }).click();
    await page.getByRole('button', { name: 'Öppna meny', exact: true }).click();
    await page.getByRole('button', { name: 'Min profil', exact: true }).click();
    await expect(page).toHaveURL(/\/profile(?:\?|$)/);
    await expect(page.getByText('QA Admin', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`figma-profile-${width}.png`) });
  });
}
