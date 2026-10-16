/* global document, innerHeight, getComputedStyle */
import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { URL } from 'node:url';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  timezoneId: 'Europe/Stockholm',
  serviceWorkers: 'block',
});

const networkReceipts = new WeakMap();

test.beforeEach(async ({ context, page, baseURL }) => {
  expect(['localhost', '127.0.0.1', '[::1]']).toContain(new URL(baseURL).hostname);
  const requests = [];
  networkReceipts.set(page, requests);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'opendata-download-metfcst.smhi.se') {
      requests.push({ action: 'local-smhi-503', url: url.href });
      return route.fulfill({ status: 503, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' }, body: '{}' });
    }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || /\/(auth|rest|functions|storage|realtime)\/v1(?:\/|$)/.test(url.pathname)) {
      requests.push({ action: 'blocked', method: route.request().method(), url: url.href });
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await context.routeWebSocket(/.*/, socket => {
    requests.push({ action: 'closed-websocket' });
    socket.close();
  });
  await page.clock.setFixedTime(new Date('2026-10-13T07:30:00Z'));
  await page.goto('/?qaDemo=1');
  await expect(page.getByText('Dagens översikt', { exact: true })).toBeVisible();
  await expect(page.getByText('Ej tillgängligt', { exact: true })).toBeVisible();
});

test.afterEach(async ({ page }, testInfo) => {
  await writeFile(testInfo.outputPath('offline-network.json'), JSON.stringify({
    synthetic: true,
    backendTrafficAllowed: false,
    serviceWorkersBlocked: true,
    allWebSocketsClosed: true,
    requests: networkReceipts.get(page),
  }, null, 2));
  expect(networkReceipts.get(page).filter(request => request.action === 'blocked'),
    'Today polish QA must not attempt backend or unexpected external requests').toEqual([]);
});

// Add only one local QA post to exercise the real expand/collapse controls.
// Reload discards the fixture; no authenticated data or backend is used.
async function addQaPost(page) {
  await page.evaluate(() => {
    const element = document.querySelector('#root');
    const root = element[Object.keys(element).find(key => key.startsWith('__reactContainer$'))];
    let provider;
    const visited = new Set();
    const visit = fiber => {
      if (!fiber || visited.has(fiber)) return;
      visited.add(fiber);
      if ((fiber.type?.name || fiber.type?.displayName) === 'AppDataProvider') provider = fiber;
      visit(fiber.child); visit(fiber.sibling);
    };
    visit(root.stateNode?.current || root);
    if (!provider) throw new Error('[today polish QA] Local demo provider is unavailable.');
    const hook = provider.memoizedState;
    const state = hook.memoizedState;
    if (state.currentStableId !== 'qa-stable-main') throw new Error('[today polish QA] Only synthetic qaDemo fixtures are allowed.');
    const original = state.posts.find(post => post.stableId === state.currentStableId);
    if (!original) throw new Error('[today polish QA] Local demo post is unavailable.');
    hook.queue.dispatch({ type: 'STATE_HYDRATE', payload: { ...state, posts: [...state.posts, {
      ...original,
      id: 'qa-today-polish-post',
      content: 'QA extra inlägg för listkontroll',
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      likes: 0,
      comments: 0,
      likedByUserIds: [],
      commentsData: [],
    }] } });
  });
}

async function saveUiReceipt(page, testInfo, name, controls) {
  const values = await Promise.all(controls.map(async control => ({
    text: await control.textContent(),
    role: await control.getAttribute('role'),
    label: await control.getAttribute('aria-label'),
    pressed: await control.getAttribute('aria-pressed'),
    bounds: await control.boundingBox(),
    colors: await control.evaluate(element => ({
      background: getComputedStyle(element).backgroundColor,
      border: getComputedStyle(element).borderColor,
    })),
  })));
  await writeFile(testInfo.outputPath(`${name}.json`), JSON.stringify(values, null, 2));
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
}

for (const width of [320, 390]) {
  test(`Idag: lower collapse controls are accessible touch targets at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await addQaPost(page);
    for (const section of [
      { title: 'nya meddelanden', extra: 'Välkommen till QA-stallet.' },
      { title: 'senaste inlägg', extra: 'QA extra inlägg för listkontroll' },
    ]) {
      await page.getByRole('button', { name: `Visa fler ${section.title}`, exact: true }).click();
      await expect(page.getByText(section.extra, { exact: true })).toBeVisible();
      const lowerControl = page.getByText('Visa mindre ↑', { exact: true }).last().locator('..');
      await lowerControl.scrollIntoViewIfNeeded();
      await saveUiReceipt(page, testInfo, section.title.replaceAll(' ', '-'), [lowerControl]);
      expect.soft((await lowerControl.boundingBox()).height).toBeGreaterThanOrEqual(44);
      expect.soft(await lowerControl.getAttribute('role')).toBe('button');
      expect.soft(await lowerControl.getAttribute('aria-label')).toBe(`Visa färre ${section.title}`);
      await lowerControl.click();
      await expect(page.getByText(section.extra, { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: `Visa fler ${section.title}`, exact: true })).toBeVisible();
    }
  });

  test(`Idag: event types keep accessible selection and submit/close behavior at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: 'Händelse', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await page.waitForFunction(() => {
      const input = document.querySelector('textarea');
      if (!input) return false;
      const bounds = input.getBoundingClientRect();
      return bounds.y > 0 && bounds.bottom < innerHeight && document.getAnimations().every(animation => animation.playState !== 'running');
    });
    const choices = ['Händelse', 'Viktigt', 'Akut'];
    const controls = choices.map(label => dialog.getByText(label, { exact: true }).locator('..'));
    for (let index = 0; index < choices.length; index++) {
      await controls[index].click();
      await expect(dialog.getByText(choices[index], { exact: true })).toHaveCSS('color', 'rgb(0, 153, 255)');
      for (let option = 0; option < choices.length; option++) {
        expect.soft(await controls[option].getAttribute('role')).toBe('button');
        expect.soft(await controls[option].getAttribute('aria-pressed')).toBe(String(option === index));
        expect.soft((await controls[option].boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
      const selectedColors = await controls[index].evaluate(element => ({
        background: getComputedStyle(element).backgroundColor,
        border: getComputedStyle(element).borderColor,
      }));
      expect.soft(selectedColors).toEqual({ background: 'rgb(229, 245, 255)', border: 'rgb(0, 153, 255)' });
      await saveUiReceipt(page, testInfo, `event-${choices[index].toLowerCase()}`, controls);
    }
    const submit = dialog.getByText('Skicka', { exact: true }).locator('..');
    expect.soft(await submit.getAttribute('role')).toBe('button');
    await expect(submit).toBeDisabled();
    const note = `QA akut UI-notis ${width}`;
    await dialog.getByRole('textbox').fill(note);
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(note, { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Händelse', exact: true }).click();
    await expect(dialog.getByRole('textbox')).toHaveValue('');
    const close = dialog.getByRole('button', { name: 'Stäng händelser', exact: true });
    expect.soft(await close.count()).toBe(1);
    if (await close.count()) await close.click();
    else await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
}
