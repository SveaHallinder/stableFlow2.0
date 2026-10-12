import { expect, test } from '@playwright/test';

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
      return route.fulfill({ status, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(status === 200 ? forecast : {}) });
    }
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || /\/(auth|rest|functions)\/v1\//.test(url.pathname)) {
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await page.routeWebSocket(/supabase\./, socket => socket.close());
  await page.goto('/?qaDemo=1');
  await expect(page.getByText('Dagens översikt', { exact: true })).toBeVisible();
  return weatherRequests;
}

async function setFixtureLocation(page, location) {
  await page.evaluate(location => {
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
    hook.queue.dispatch({ type: 'STATE_HYDRATE', payload: { ...state,
      stables: state.stables.map(stable => stable.id === state.currentStableId ? { ...stable, location } : stable),
    } });
  }, location);
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
