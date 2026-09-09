import { expect, test } from '@playwright/test';

test.use({ trace: 'off' });

const password = process.env.E2E_QA_PASSWORD ?? 'QaTest1234!';

async function login(browser, role) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill(`stableflow-${role}@example.test`);
  await page.getByPlaceholder('Minst 8 tecken').fill(password);
  const authenticated = page.waitForResponse((response) => response.url().includes('/auth/v1/token'));
  const horsesLoaded = page.waitForResponse((response) =>
    response.url().includes('/rest/v1/horses?') && response.request().method() === 'GET',
  );
  const checksLoaded = page.waitForResponse((response) =>
    response.url().includes('/rest/v1/feed_checks?') && response.request().method() === 'GET',
  );
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  const auth = await authenticated;
  expect(auth.ok()).toBe(true);
  const userId = (await auth.json()).user.id;
  const horses = await horsesLoaded;
  const checks = await checksLoaded;
  expect(horses.ok()).toBe(true);
  expect(checks.ok()).toBe(true);
  const rawHeaders = await checks.request().allHeaders();
  await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
  return {
    context, page, userId,
    horses: await horses.json(), checks: await checks.json(),
    headers: { apikey: rawHeaders.apikey, authorization: rawHeaders.authorization },
    endpoint: `${new URL(checks.url()).origin}/rest/v1/feed_checks`,
  };
}

test('horse owner saves own feed check through the UI and sees it after reload', async ({ browser }) => {
  test.setTimeout(90_000);
  let admin;
  let owner;
  let attempted;
  const note = `QA owner feed ${Date.now()}`;
  try {
    admin = await login(browser, 'admin');
    owner = await login(browser, 'owner');
    const horse = owner.horses.find((row) => row.owner_user_id === owner.userId);
    expect(horse, 'The QA owner must have an owned horse').toBeTruthy();
    await owner.page.goto(`/horses/${horse.id}`);
    await expect(owner.page.getByText('Foderplan', { exact: true })).toBeVisible();
    await owner.page.getByText('Avvikelse', { exact: true }).first().click();
    await owner.page.getByPlaceholder(/Hösilage tog slut/).fill(note);
    owner.page.on('request', (request) => {
      if (request.url().includes('/rest/v1/feed_checks') && request.method() === 'POST') {
        attempted = request.postDataJSON();
      }
    });
    const saved = owner.page.waitForResponse((response) =>
      response.url().includes('/rest/v1/feed_checks') && response.request().method() === 'POST',
    );
    await owner.page.getByText('Spara avvikelse', { exact: true }).click();
    const response = await saved;
    attempted = response.request().postDataJSON();
    expect(response.ok(), 'Owner feed write must pass deployed RLS').toBe(true);
    expect(await response.json()).toMatchObject({ horse_id: horse.id, deviation_note: note });
    await expect(owner.page.getByText('Foderkoll registrerad.', { exact: true })).toBeVisible();
    await owner.page.reload();
    await expect(owner.page.getByText(note, { exact: false }).first()).toBeVisible();
  } finally {
    try {
      if (attempted && admin) {
        const original = admin.checks.find((row) => row.horse_id === attempted.horse_id
          && row.date === attempted.date && row.slot === attempted.slot);
        const filter = `horse_id=eq.${attempted.horse_id}&date=eq.${attempted.date}&slot=eq.${attempted.slot}`;
        const current = await admin.page.request.get(`${admin.endpoint}?${filter}`, { headers: admin.headers });
        expect(current.ok()).toBe(true);
        const rows = await current.json();
        // A failed write needs no restoration. A conditional write protects newer notes.
        if (JSON.stringify(rows) !== JSON.stringify(original ? [original] : [])) {
          expect(rows[0]?.deviation_note, 'Only restore this test’s own note').toBe(note);
          const check = rows[0];
          const hasConcurrentCheck = Date.parse(check.checked_at ?? '') !== Date.parse(attempted.checked_at ?? '')
            || check.checked_by_user_id !== attempted.checked_by_user_id;
          const checkedAtFilter = check.checked_at ? `eq.${encodeURIComponent(check.checked_at)}` : 'is.null';
          const checkedByFilter = check.checked_by_user_id ? `eq.${check.checked_by_user_id}` : 'is.null';
          const conditional = `${filter}&deviation_note=eq.${encodeURIComponent(note)}`
            + `&checked_at=${checkedAtFilter}&checked_by_user_id=${checkedByFilter}`;
          const restored = original || hasConcurrentCheck
            ? await admin.page.request.patch(`${admin.endpoint}?${conditional}`, {
              headers: { ...admin.headers, Prefer: 'return=representation' },
              data: {
                deviation_note: original?.deviation_note ?? null,
                ...(!hasConcurrentCheck ? {
                  checked_at: original?.checked_at ?? null,
                  checked_by_user_id: original?.checked_by_user_id ?? null,
                } : {}),
              },
            })
            : await admin.page.request.delete(`${admin.endpoint}?${conditional}`, {
              headers: { ...admin.headers, Prefer: 'return=representation' },
            });
          expect(restored.ok(), 'Restore QA feed data through admin rights').toBe(true);
          expect(await restored.json(), 'The conditional cleanup must affect one row').toHaveLength(1);
          const result = await admin.page.request.get(`${admin.endpoint}?${filter}`, { headers: admin.headers });
          expect(result.ok()).toBe(true);
          expect(await result.json(), 'A concurrent check is preserved, but requires QA review').toEqual(original ? [original] : []);
        }
      }
    } finally {
      await owner?.context.close();
      await admin?.context.close();
    }
  }
});

test('guest cannot see feed write actions on another members horse', async ({ browser }) => {
  let guest;
  try {
    guest = await login(browser, 'guest');
    const horse = guest.horses.find((row) => row.owner_user_id !== guest.userId);
    expect(horse).toBeTruthy();
    await guest.page.goto(`/horses/${horse.id}`);
    await expect(guest.page.getByText('Foderplan', { exact: true })).toBeVisible();
    await expect(guest.page.getByText('Avvikelse', { exact: true })).toHaveCount(0);
    await expect(guest.page.getByText('Markera klart', { exact: true })).toHaveCount(0);
  } finally {
    await guest?.context.close();
  }
});
