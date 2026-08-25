import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE_URL = process.env.E2E_URL ?? 'http://localhost:8081';
const PASSWORD = process.env.E2E_QA_PASSWORD ?? 'QaTest1234!';
const SCREEN_DIR = process.env.E2E_SCREENS ?? '/tmp/stableflow-e2e-screens';
const ROLE_EMAILS = {
  admin: 'stableflow-admin@example.test',
  staff: 'stableflow-staff@example.test',
  rider: 'stableflow-rider@example.test',
};

function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isAssignmentResponse(response, method, assignmentId) {
  const url = new URL(response.url());
  if (!url.pathname.endsWith('/rest/v1/assignments') || response.request().method() !== method) {
    return false;
  }
  return !assignmentId || url.searchParams.get('id') === `eq.${assignmentId}`;
}

async function login(browser, role) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('input[placeholder="namn@exempel.se"]').fill(ROLE_EMAILS[role]);
  await page.locator('input[placeholder="Minst 8 tecken"]').fill(PASSWORD);
  await page.locator('button[aria-label="Logga in"]').last().click();
  await expect(page.getByText('StableFlow QA Stable').first()).toBeVisible({ timeout: 20_000 });
  return { context, page };
}

async function openAssignment(page, title, view = 'open') {
  await page.goto(`${BASE_URL}/calendar?view=${view}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(view === 'mine' ? 'Mina' : 'Lediga', { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  if (view === 'open') {
    await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 20_000 });
  }
}

function claimButton(page, title) {
  const titleNode = page.getByText(title, { exact: true });
  return page
    .locator('div')
    .filter({ has: titleNode })
    .filter({ has: page.getByText('Ta pass', { exact: true }) })
    .last()
    .getByText('Ta pass', { exact: true })
    .first();
}

function waitForClaimOutcome(page) {
  return Promise.race([
    page.getByText(/är nu ditt\./).first().waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'success'),
    page
      .getByText(/Någon annan hann ta passet\./)
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => 'conflict'),
    page
      .getByText(/Det gick inte att ta passet just nu\./)
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => 'error'),
  ]);
}

function responseContainsId(body, assignmentId) {
  if (Array.isArray(body)) {
    return body.some((row) => row?.id === assignmentId);
  }
  return body?.id === assignmentId;
}

test('today is the default and concurrent claims have exactly one winner', async ({ browser }) => {
  test.setTimeout(120_000);

  const title = `QA atomic claim ${Date.now()}`;
  const today = localIsoDate();
  await mkdir(SCREEN_DIR, { recursive: true });
  let admin;
  let staff;
  let rider;
  let assignmentId;
  let assignmentsEndpoint;
  let cleanupHeaders;

  try {
    admin = await login(browser, 'admin');
    await admin.page.goto(`${BASE_URL}/calendar`, { waitUntil: 'domcontentloaded' });
    await expect(admin.page.getByText('Vecka', { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    await admin.page.screenshot({ path: `${SCREEN_DIR}/qa-current-week-mobile.png`, fullPage: true });
    await admin.page.getByText('Nytt pass', { exact: true }).first().click();
    const assignmentTitleInput = admin.page.getByPlaceholder('Ex. Mockning, Harva ridhus');
    await assignmentTitleInput.fill(title);
    await expect
      .poll(async () => (await assignmentTitleInput.boundingBox())?.y ?? Number.POSITIVE_INFINITY)
      .toBeLessThan(844);
    await admin.page.screenshot({ path: `${SCREEN_DIR}/qa-today-default-mobile.png` });

    const createdResponsePromise = admin.page.waitForResponse(
      (response) => isAssignmentResponse(response, 'POST'),
      { timeout: 20_000 },
    );
    await admin.page.getByText('Skapa pass', { exact: true }).last().click();
    const createdResponse = await createdResponsePromise;
    expect(createdResponse.ok()).toBe(true);

    const createPayload = createdResponse.request().postDataJSON();
    const createdRow = Array.isArray(createPayload) ? createPayload[0] : createPayload;
    expect(createdRow).toMatchObject({ date: today, label: title, status: 'open' });
    expect(createdRow.id).toEqual(expect.any(String));
    assignmentId = createdRow.id;

    const createdUrl = new URL(createdResponse.url());
    assignmentsEndpoint = `${createdUrl.origin}${createdUrl.pathname}`;
    const requestHeaders = await createdResponse.request().allHeaders();
    cleanupHeaders = {
      apikey: requestHeaders.apikey,
      authorization: requestHeaders.authorization,
    };

    await expect(admin.page.getByText(/finns nu som ledigt pass/)).toBeVisible({ timeout: 10_000 });
    await admin.page.reload({ waitUntil: 'domcontentloaded' });
    await openAssignment(admin.page, title);

    [staff, rider] = await Promise.all([login(browser, 'staff'), login(browser, 'rider')]);
    await Promise.all([
      openAssignment(staff.page, title),
      openAssignment(rider.page, title),
    ]);

    const staffPatchPromise = staff.page.waitForResponse(
      (response) => isAssignmentResponse(response, 'PATCH', assignmentId),
      { timeout: 20_000 },
    );
    const riderPatchPromise = rider.page.waitForResponse(
      (response) => isAssignmentResponse(response, 'PATCH', assignmentId),
      { timeout: 20_000 },
    );
    const staffOutcomePromise = waitForClaimOutcome(staff.page);
    const riderOutcomePromise = waitForClaimOutcome(rider.page);

    await Promise.all([
      claimButton(staff.page, title).click(),
      claimButton(rider.page, title).click(),
    ]);

    const [staffPatch, riderPatch, staffOutcome, riderOutcome] = await Promise.all([
      staffPatchPromise,
      riderPatchPromise,
      staffOutcomePromise,
      riderOutcomePromise,
    ]);
    const patchResponses = [staffPatch, riderPatch];
    patchResponses.forEach((response) => {
      const url = new URL(response.url());
      expect(url.searchParams.get('status')).toBe('eq.open');
      expect(url.searchParams.get('assignee_id')).toBe('is.null');
      expect(response.ok()).toBe(true);
    });

    const patchBodies = await Promise.all(
      patchResponses.map((response) => response.json().catch(() => null)),
    );
    expect(patchBodies.filter((body) => responseContainsId(body, assignmentId))).toHaveLength(1);
    expect([staffOutcome, riderOutcome].sort()).toEqual(['conflict', 'success']);
    await Promise.all([
      staff.page.screenshot({ path: `${SCREEN_DIR}/qa-atomic-claim-staff.png`, fullPage: true }),
      rider.page.screenshot({ path: `${SCREEN_DIR}/qa-atomic-claim-rider.png`, fullPage: true }),
    ]);

    await Promise.all([
      openAssignment(staff.page, title, 'mine'),
      openAssignment(rider.page, title, 'mine'),
    ]);
    await expect
      .poll(
        async () => {
          const [staffOwns, riderOwns] = await Promise.all([
            staff.page.getByText(title, { exact: true }).isVisible().catch(() => false),
            rider.page.getByText(title, { exact: true }).isVisible().catch(() => false),
          ]);
          return Number(staffOwns) + Number(riderOwns);
        },
        { timeout: 20_000 },
      )
      .toBe(1);
  } finally {
    let cleanupError;
    if (assignmentId && assignmentsEndpoint && cleanupHeaders?.apikey && cleanupHeaders?.authorization && admin) {
      const deleteResponse = await admin.context.request.delete(
        `${assignmentsEndpoint}?id=eq.${encodeURIComponent(assignmentId)}`,
        { headers: { ...cleanupHeaders, Prefer: 'return=minimal' } },
      );
      if (!deleteResponse.ok()) {
        cleanupError = new Error(`Assignment cleanup failed with HTTP ${deleteResponse.status()}.`);
      } else {
        const verifyResponse = await admin.context.request.get(
          `${assignmentsEndpoint}?select=id&id=eq.${encodeURIComponent(assignmentId)}`,
          { headers: cleanupHeaders },
        );
        const remaining = verifyResponse.ok() ? await verifyResponse.json() : null;
        if (!verifyResponse.ok() || !Array.isArray(remaining) || remaining.length !== 0) {
          cleanupError = new Error('Assignment cleanup could not be verified.');
        }
      }
    }

    await Promise.all(
      [admin, staff, rider].filter(Boolean).map(({ context }) => context.close()),
    );
    if (cleanupError) {
      throw cleanupError;
    }
  }
});
