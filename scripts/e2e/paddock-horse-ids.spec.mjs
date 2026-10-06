/* global document, MutationObserver */
import { expect, test } from '@playwright/test';
import { URL } from 'node:url';

test.use({ trace: 'off', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const twinId = '71000000-0000-4000-8000-000000000001';
const foreignId = '72000000-0000-4000-8000-000000000001';
const legacyName = 'Äldre namn som inte bekräftats';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return local && !/\/(auth|rest|functions|storage|realtime)\/v1(?:\/|$)/.test(url.pathname)
      ? route.continue() : route.abort('blockedbyclient');
  });
  await page.routeWebSocket(/.*/, socket => socket.close());
  // Fixed, local test helpers locate the existing reducer/actions. The app
  // bundle and its production callbacks are unchanged.
  await page.addInitScript(() => {
    globalThis.__paddockQa = () => {
      const element = document.querySelector('#root');
      const key = Object.keys(element).find(key => key.startsWith('__reactContainer$'));
      const root = element[key];
      const visited = new Set();
      let provider;
      let context;
      function visit(fiber) {
        if (!fiber || visited.has(fiber)) return;
        visited.add(fiber);
        if ((fiber.type?.name || fiber.type?.displayName) === 'AppDataProvider') provider = fiber;
        if (fiber.memoizedProps?.value?.actions?.upsertPaddock && fiber.memoizedProps.value.state) context = fiber.memoizedProps.value;
        visit(fiber.child);
        visit(fiber.sibling);
      }
      visit(root.stateNode?.current || root);
      if (!provider || !context) throw new Error('Local qaDemo paddock fixture is unavailable.');
      return { provider, context };
    };
  });
});

async function seed(page, mode = 'ready') {
  await page.goto('/stable-horses?qaDemo=1');
  await expect(page.getByRole('button', { name: 'Hantera hästar', exact: true })).toBeVisible();
  await page.evaluate(({ mode, twinId, foreignId, legacyName }) => {
    const { provider, context } = globalThis.__paddockQa();
    const state = context.state;
    const stableId = state.currentStableId;
    const userId = state.currentUserId;
    const otherStableId = 'qa-paddock-other-stable';
    const unready = mode === 'legacy' || mode === 'empty-legacy';
    const original = state.horses.find(horse => horse.stableId === stableId);
    const horse = { ...original, name: 'Saga', boxNumber: 'B1' };
    const users = { ...state.users, [userId]: { ...state.users[userId], horses: [horse.id], membership: [
      { stableId, role: mode === 'view' ? 'guest' : 'admin', access: mode === 'view' ? 'view' : 'owner' },
      { stableId: otherStableId, role: 'guest', access: 'view' },
    ] } };
    const row = { stableId, horseIds: [horse.id], horseNames: ['Äldre Saga snapshot'], revision: 1, linksReady: true, updatedAt: '2026-10-06T07:00:00Z', season: 'yearRound' };
    const paddocks = mode === 'empty-legacy' ? [] : mode === 'unresolved'
      ? [{ ...row, id: 'qa-paddock-unresolved', name: 'Hagen behöver kontroll', horseIds: [foreignId, '73000000-0000-4000-8000-000000000001'] }]
      : mode === 'legacy'
      ? [{ ...row, id: 'qa-paddock-legacy', name: 'Äldre hagen', horseIds: [], horseNames: [legacyName, null, '  Saga  '], revision: 0, linksReady: false }]
      : [{ ...row, id: 'qa-paddock-east', name: 'Östra hagen' }, { ...row, id: 'qa-paddock-west', name: 'Västra hagen' }];
    provider.memoizedState.queue.dispatch({ type: 'STATE_HYDRATE', payload: {
      ...state, users, paddockLinksReady: !unready,
      stables: [...state.stables, { ...state.stables[0], id: otherStableId, name: 'QA Främmande stall' }],
      horses: [horse, { ...horse, id: twinId, boxNumber: 'B2' }, { ...horse, id: foreignId, stableId: otherStableId, name: 'Enbart främmande häst', boxNumber: 'X1' }],
      paddocks: mode === 'empty-legacy' ? [] : [...paddocks, { ...row, id: 'qa-paddock-foreign', stableId: otherStableId, horseIds: [foreignId], name: 'Främmande hagen' }],
    } });
  }, { mode, twinId, foreignId, legacyName });
  await expect(page.getByText(/Box B1/)).toBeVisible();
}

async function expectSelected(locator, selected) {
  await expect(locator).toHaveAttribute('aria-pressed', String(selected));
}

async function capturePrint(page) {
  await page.evaluate(() => {
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeName !== 'IFRAME') continue;
        node.contentWindow.print = () => {};
        globalThis.__paddockPrintHtml = node.contentDocument.documentElement.outerHTML;
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true });
  });
  await page.getByLabel('Skriv ut haglista').click();
  await expect.poll(() => page.evaluate(() => globalThis.__paddockPrintHtml ?? '')).toContain('<html');
  return page.evaluate(() => globalThis.__paddockPrintHtml);
}

test('same-name horses are independently selected by ID within the selected stable', async ({ page }, testInfo) => {
  await seed(page);
  await page.getByLabel('Öppna hagar').click();
  await page.getByText('Lägg till hage', { exact: true }).click();
  const first = page.getByRole('button', { name: /^Saga · Box B1 ·/ });
  const second = page.getByRole('button', { name: /^Saga · Box B2 ·/ });
  await expect(page.getByRole('button', { name: /Enbart främmande häst/ })).toHaveCount(0);
  await first.click();
  await expectSelected(first, true);
  await expectSelected(second, false);
  await second.click();
  await expectSelected(second, true);
  await first.click();
  await expectSelected(first, false);
  await expectSelected(second, true);
  await first.click();
  await page.getByPlaceholder('Ex. Hage 3, Gräshage, Paddock vid ridhuset').fill('Två Saga');
  await page.getByText('Spara', { exact: true }).click();
  await expect(page.getByText('Två Saga', { exact: true }).last()).toBeVisible();
  const saved = await page.evaluate(() => {
    const { state } = globalThis.__paddockQa().context;
    const paddock = state.paddocks.find(row => row.name === 'Två Saga');
    return { ...paddock, originalId: state.horses.find(horse => horse.boxNumber === 'B1').id };
  });
  expect([...saved.horseIds].sort()).toEqual([saved.originalId, twinId].sort());
  expect(saved.horseIds).not.toContain(foreignId);
  await expect(page.getByText(/^Saga · Box B1(?: · .+)?$/).last()).toBeVisible();
  await expect(page.getByText(/^Saga · Box B2(?: · .+)?$/).last()).toBeVisible();
  const firstStatus = page.getByRole('button', { name: /^Saga · Box B1(?: · .+)?, dag: Inne$/ }).last();
  const secondStatus = page.getByRole('button', { name: /^Saga · Box B2(?: · .+)?, dag: Inne$/ }).last();
  await expect(firstStatus).toBeVisible();
  await expect(secondStatus).toBeVisible();
  expect(await firstStatus.getAttribute('aria-label')).not.toBe(await secondStatus.getAttribute('aria-label'));
  await expect(page.getByRole('button', { name: 'Saga, dag: Inne', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('duplicate-name-id-selection.png') });
});

test('renaming a Horse retains every paddock link in list, profile, Today, search and actual print', async ({ page }, testInfo) => {
  await seed(page);
  const renamed = await page.evaluate(async () => {
    const { context } = globalThis.__paddockQa();
    const horse = context.state.horses.find(horse => horse.boxNumber === 'B1');
    const result = await context.actions.upsertHorse({ ...horse, name: 'Nova' });
    if (!result.success) throw new Error(result.reason);
    return horse.id;
  });
  await expect(page.getByText('Nova', { exact: true })).toBeVisible();
  await expect(page.getByText('Box B1 · Östra hagen, Västra hagen', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Status för Nova', exact: true }).click();
  await expect(page).toHaveURL(/\/horses\/qa-horse-main(?:\?|$)/);
  await expect(page.getByText('Box B1 · Östra hagen, Västra hagen', { exact: true }).last()).toBeVisible();
  await page.getByLabel('Öppna hästlistan').click();
  await page.getByRole('tab', { name: 'Idag', exact: true }).click();
  const todayLink = page.getByText('Öppna Nova · Östra hagen, Västra hagen', { exact: true });
  await expect(todayLink).toBeVisible();
  expect(await todayLink.evaluate(element => element.getBoundingClientRect().right <= globalThis.innerWidth)).toBe(true);
  await page.getByLabel('Sök', { exact: true }).click();
  await page.getByPlaceholder('Sök personer, hästar, pass, loggar...').fill('Nova');
  await expect(page.getByText('Östra hagen', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Västra hagen', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Främmande hagen', { exact: true })).toHaveCount(0);
  // Search-result navigation deliberately refreshes qaDemo and discards local
  // fixtures; return through the tabs to print the same confirmed rename.
  await page.getByLabel('Tillbaka', { exact: true }).last().click();
  await page.getByRole('tab', { name: 'Hästar', exact: true }).click();
  await page.getByLabel('Öppna hagar', { exact: true }).last().click();
  const printed = await capturePrint(page);
  expect((printed.match(/<li>Nova<\/li>/g) ?? []).length).toBe(2);
  expect(printed).not.toContain('Äldre Saga snapshot');
  const links = await page.evaluate(() => globalThis.__paddockQa().context.state.paddocks
    .filter(row => ['qa-paddock-east', 'qa-paddock-west'].includes(row.id)).map(row => row.horseIds));
  expect(links).toEqual([[renamed], [renamed]]);
  await page.screenshot({ path: testInfo.outputPath('renamed-horse-paddocks.png') });
});

test('view role reads only selected-stable paddocks and cannot open write controls', async ({ page }, testInfo) => {
  await seed(page, 'view');
  await expect(page.getByRole('button', { name: 'Hantera hästar', exact: true })).toHaveCount(0);
  await page.getByLabel('Öppna hagar').click();
  await expect(page.getByText('Östra hagen', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Västra hagen', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Främmande hagen', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Lägg till hage', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Spara', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Ta bort hage', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('view-role-current-stable.png') });
});

test('legacy not-ready text is readable and unconfirmed without declaring a horse unplaced', async ({ page }, testInfo) => {
  await seed(page, 'legacy');
  await expect(page.getByText('Ingen hage satt', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Box B1 · Hage ej bekräftad', { exact: true })).toBeVisible();
  await page.getByLabel('Öppna hagar').click();
  await expect(page.getByText('Hästkopplingarna är inte aktiverade ännu. Hagar kan inte skapas, ändras eller tas bort.', { exact: true })).toBeVisible();
  await expect(page.getByText(new RegExp(`Tidigare uppgifter \\(ej bekräftade\\): ${legacyName}, Tom äldre post`))).toBeVisible();
  await expect(page.getByText('Lägg till hage', { exact: true })).toHaveCount(0);
  await page.getByText('Äldre hagen', { exact: true }).click();
  const name = page.getByPlaceholder('Ex. Hage 3, Gräshage, Paddock vid ridhuset');
  await expect(name).toHaveValue('Äldre hagen');
  await expect(name).not.toBeEditable();
  await expect(page.getByText('Hästkopplingarna väntar på godkänd konvertering. Tidigare uppgifter är inte bekräftade.', { exact: true })).toBeVisible();
  await expect(page.getByText('Spara', { exact: true }).locator('..')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText('Ta bort hage', { exact: true }).locator('..')).toHaveAttribute('aria-disabled', 'true');
  const raw = await page.evaluate(() => globalThis.__paddockQa().context.state.paddocks.find(row => row.id === 'qa-paddock-legacy').horseNames);
  expect(raw).toEqual([legacyName, null, '  Saga  ']);
  await page.screenshot({ path: testInfo.outputPath('legacy-read-only-unconfirmed.png') });
});

test('global unready state with zero paddocks shows a transition instead of an empty/create claim', async ({ page }) => {
  await seed(page, 'empty-legacy');
  await expect(page.getByText('Ingen hage satt', { exact: true })).toHaveCount(0);
  await page.getByLabel('Öppna hagar').click();
  await expect(page.getByText('Hästkopplingarna är inte aktiverade ännu. Hagar kan inte skapas, ändras eller tas bort.', { exact: true })).toBeVisible();
  await expect(page.getByText('Lägg till hage', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Inga hagar/)).toHaveCount(0);
});

test('ready unknown/cross-stable IDs stay unconfirmed in cards and actual print', async ({ page }) => {
  await seed(page, 'unresolved');
  await expect(page.getByText('Box B1 · Hage ej bekräftad', { exact: true })).toBeVisible();
  await page.getByLabel('Öppna hagar').click();
  await expect(page.getByText('Hagen behöver kontroll', { exact: true })).toBeVisible();
  await expect(page.getByText('Hästkopplingar ej bekräftade', { exact: true })).toBeVisible();
  await expect(page.getByText('Inga hästar angivna', { exact: true })).toHaveCount(0);
  const printed = await capturePrint(page);
  expect(printed).toContain('Hästkopplingar ej bekräftade');
  expect(printed).not.toMatch(/Inga hästar angivna|0 hästar|Äldre Saga snapshot|Enbart främmande häst/);
});
