/* global document */
import { expect, test } from '@playwright/test';
import { URL } from 'node:url';

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm' });

const forecast = {
  createdTime: '2026-10-12T15:15:00Z',
  referenceTime: '2026-10-12T15:00:00Z',
  timeSeries: [
    { time: '2026-10-12T16:00:00Z', data: { air_temperature: 0, wind_speed: 4.4, symbol_code: 6 } },
    { time: '2026-10-13T06:00:00Z', data: { air_temperature: -2.3, wind_speed: 3, symbol_code: 25 } },
    { time: '2026-10-13T15:00:00Z', data: { air_temperature: 7.4, wind_speed: 3, symbol_code: 3 } },
  ],
};

async function prepare(page, status = 200) {
  const weatherRequests = [];
  await page.clock.setFixedTime(new Date('2026-10-12T15:30:00Z'));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'opendata-download-metfcst.smhi.se') {
      weatherRequests.push(url.href);
      const responseStatus = typeof status === 'function' ? status() : status;
      return route.fulfill({ status: responseStatus, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(responseStatus === 200 ? forecast : {}) });
    }
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || /\/(auth|rest|functions)\/v1\//.test(url.pathname)) {
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await page.routeWebSocket(/supabase\./, socket => socket.close());
  await page.goto('/?qaDemo=1');
  await expect(page.getByRole('heading', { name: 'Dagen i stallet', exact: true })).toBeVisible();
  return weatherRequests;
}

async function setFixtureLocation(page, location, member = false) {
  return page.evaluate(({ location, member }) => {
    const element = document.querySelector('#root');
    const key = Object.keys(element).find(key => key.startsWith('__reactContainer$'));
    const root = element[key];
    let provider;
    const visited = new Set();
    const visit = fiber => {
      if (!fiber || visited.has(fiber)) return;
      visited.add(fiber);
      if ((fiber.type?.name || fiber.type?.displayName) === 'AppDataProvider') provider = fiber;
      visit(fiber.child); visit(fiber.sibling);
    };
    visit(root.stateNode?.current || root);
    if (!provider) throw new Error('QA weather fixture is unavailable.');
    const hook = provider.memoizedState;
    const state = hook.memoizedState;
    const users = member ? { ...state.users, [state.currentUserId]: { ...state.users[state.currentUserId],
      membership: state.users[state.currentUserId].membership.map(membership => ({ ...membership, role: 'member', access: 'view' })),
    } } : state.users;
    hook.queue.dispatch({ type: 'STATE_HYDRATE', payload: { ...state,
      users,
      stables: state.stables.map(stable => stable.id === state.currentStableId ? { ...stable, location } : stable),
    } });
    return state.stables.find(stable => stable.id === state.currentStableId)?.name;
  }, { location, member });
}

test('weather: Åkersberga shows confirmed temperature, condition, source and 24-hour range', async ({ page }, testInfo) => {
  const requests = await prepare(page);
  await setFixtureLocation(page, 'Åkersberga');
  await expect(page.getByText('≈0°', { exact: true })).toBeVisible();
  await expect(page.getByText('Mulet', { exact: true })).toBeVisible();
  await expect(page.getByText('24h H:7° L:-2°', { exact: true })).toBeVisible();
  await expect(page.getByText('SMHI · 17:15', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Prognos för Åkersberga/ })).toBeVisible();
  expect(requests.some(url => url.includes('/snow1g/version/1/geotype/point/lon/18.2997/lat/59.4794/'))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('weather-akersberga-390.png') });
});

test('weather: provider errors show an empty state without a made-up zero', async ({ page }, testInfo) => {
  await prepare(page, 503); await setFixtureLocation(page, 'Åkersberga');
  await expect(page.getByText('Ej tillgängligt', { exact: true })).toBeVisible();
  await expect(page.getByText('≈0°', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Prognos för/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('weather-unavailable-390.png') });
});

test('weather: an unsupported place clears the old forecast instead of guessing Stockholm', async ({ page }, testInfo) => {
  const requests = await prepare(page);
  await expect(page.getByText('≈0°', { exact: true })).toBeVisible();
  const count = requests.length;
  await setFixtureLocation(page, 'En ort som inte finns');
  await expect(page.getByText('Ort ej hittad', { exact: true })).toBeVisible();
  await expect(page.getByText('≈0°', { exact: true })).toHaveCount(0);
  expect(requests.length).toBe(count);
  await page.screenshot({ path: testInfo.outputPath('weather-unknown-location-390.png') });
});

test('weather: the owner can correct the current stable’s unknown place and return to its forecast', async ({ page }) => {
  await prepare(page);
  const stableName = await setFixtureLocation(page, 'platsen');
  await expect(page.getByText('Ort ej hittad', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ändra stallets ort', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ändra stallets ort', exact: true }).click();
  await expect(page.getByText('Stalluppgifter', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Stallnamn', { exact: true })).toHaveValue(stableName);
  await expect(page.getByPlaceholder('Plats (valfritt)', { exact: true })).toHaveValue('platsen');
  await page.getByPlaceholder('Plats (valfritt)', { exact: true }).fill('Åkersberga');
  await page.getByText('Spara & tillbaka', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dagen i stallet', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Prognos för Åkersberga/ })).toBeVisible();
});

test('weather: a member with an unknown place gets owner guidance without an edit action', async ({ page }) => {
  await prepare(page); await setFixtureLocation(page, 'platsen', true);
  await expect(page.getByText('Ort ej hittad', { exact: true })).toBeVisible();
  await expect(page.getByText('Be ägaren ändra ort', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ändra stallets ort', exact: true })).toHaveCount(0);
});

test('weather: a member can retry a temporary failure as soon as SMHI recovers', async ({ page }) => {
  let status = 503;
  const requests = await prepare(page, () => status);
  await setFixtureLocation(page, 'Åkersberga', true);
  await expect(page.getByText('Ej tillgängligt', { exact: true })).toBeVisible();
  const count = requests.length;
  status = 200;
  await expect(page.getByRole('button', { name: 'Hämta vädret igen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hämta vädret igen', exact: true }).click();
  await expect(page.getByRole('link', { name: /Prognos för Åkersberga/ })).toBeVisible();
  expect(requests.length).toBe(count + 1);
});
