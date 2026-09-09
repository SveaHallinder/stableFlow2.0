import { expect, test } from '@playwright/test';
import { URL } from 'node:url';

test.use({ viewport: { width: 390, height: 844 } });

for (const screen of ['members', 'detail', 'stables']) {
  test(`member ${screen} waits for confirmation, retains failed edits and retries safely`, async ({ page }) => {
    const memberId = 'baead091-3b1d-488e-bc8a-89b9f274cf22';
    const memberName = 'QA medlemsutkast';
    let serverRows;
    let release;
    let failNext = true;
    const writes = [];
    // Installed before login: no membership mutation can reach the backend.
    await page.route('**/rest/v1/stable_members*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'GET') {
        if (!serverRows) return route.continue();
        const userFilter = url.searchParams.get('user_id');
        return route.fulfill({ json: userFilter?.startsWith('eq.')
          ? serverRows.filter(row => row.user_id === userFilter.slice(3)) : serverRows });
      }
      if (!['PATCH', 'DELETE'].includes(request.method())) return route.abort('blockedbyclient');
      expect(url.searchParams.get('user_id')).toBe(`eq.${memberId}`);
      writes.push({ method: request.method(), payload: request.method() === 'PATCH' ? request.postDataJSON() : null });
      if (failNext) {
        failNext = false;
        await new Promise(resolve => { release = resolve; });
        return route.abort('failed');
      }
      const member = serverRows.find(row => row.user_id === memberId);
      if (request.method() === 'DELETE') {
        serverRows = serverRows.filter(row => row.user_id !== memberId);
        return route.fulfill({ json: [{ stable_id: member.stable_id, user_id: memberId }] });
      }
      Object.assign(member, request.postDataJSON());
      return route.fulfill({ json: member });
    });
    const login = page.waitForResponse(response => new URL(response.url()).pathname === '/auth/v1/token').then(response => response.json());
    const memberships = page.waitForResponse(response => new URL(response.url()).pathname === '/rest/v1/stable_members' && response.request().method() === 'GET').then(response => response.json());
    const directory = page.waitForResponse(response => new URL(response.url()).pathname === '/rest/v1/rpc/get_member_directory').then(response => response.json());
    await page.goto('/');
    await page.getByPlaceholder('namn@exempel.se').fill('stableflow-admin@example.test');
    await page.getByPlaceholder('Minst 8 tecken').fill(process.env.E2E_QA_PASSWORD ?? 'QaTest1234!');
    await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
    const { user } = await login;
    const owner = (await memberships).find(row => row.user_id === user.id);
    const profiles = await directory;
    serverRows = [owner, { ...owner, user_id: memberId, role: 'staff', access: 'edit', custom_role: null, horse_ids: [], rider_role: null }];
    await page.route('**/rest/v1/rpc/get_member_directory', route => route.fulfill({ json: [
      profiles.find(profile => profile.id === user.id),
      { id: memberId, full_name: memberName, username: 'qa-member', responsibilities: [], onboarding_dismissed: true },
    ] }));
    await page.goto(screen === 'detail' ? `/members/${memberId}?stableId=${owner.stable_id}` : `/${screen}`);
    await expect(page.getByText(memberName, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    const roleButton = () => page.getByRole('button', { name: screen === 'detail' ? 'Byt roll' : 'Personal', exact: true });
    await roleButton().click();
    try {
      await expect.poll(() => Boolean(release)).toBe(true);
      await expect(roleButton()).toBeDisabled();
      await expect(page.getByText('Sparar medlemsändring…', { exact: true })).toBeVisible();
      expect(writes).toHaveLength(1);
    } finally { release?.(); release = undefined; }
    await expect(page.getByRole('alert').filter({ hasText: 'Medlemsändringen kunde inte sparas' })).toBeVisible();
    await expect(roleButton()).toBeEnabled();
    await roleButton().click();
    await expect(page.getByRole('alert').filter({ hasText: 'Medlemsändringen kunde inte sparas' })).toHaveCount(0);
    await expect.poll(() => serverRows.find(row => row.user_id === memberId)?.role).toBe('rider');
    await expect(page.getByText('Sparar medlemsändring…', { exact: true })).toHaveCount(0);
    expect(writes).toHaveLength(2);
    expect(writes[1].payload).not.toHaveProperty('horse_ids');

    if (screen === 'detail') {
      const horse = page.getByRole('button', { name: 'StableFlow QA Horse', exact: true });
      failNext = true;
      await horse.click();
      try {
        await expect.poll(() => Boolean(release)).toBe(true);
        await expect(horse).toBeDisabled();
        await expect(horse).toHaveAttribute('aria-pressed', 'false');
      } finally { release?.(); release = undefined; }
      await expect(page.getByRole('alert').filter({ hasText: 'Medlemsändringen kunde inte sparas' })).toBeVisible();
      await expect(horse).toHaveAttribute('aria-pressed', 'false');
      await horse.click();
      await expect(horse).toHaveAttribute('aria-pressed', 'true');
    }

    failNext = true;
    page.on('dialog', dialog => dialog.accept());
    const remove = page.getByRole('button', { name: screen === 'detail' ? 'Ta bort från stallet' : `Ta bort ${memberName} från stallet`, exact: true });
    await remove.click();
    try {
      await expect.poll(() => Boolean(release)).toBe(true);
      await expect(remove).toBeDisabled();
      await expect(page.getByText(memberName, { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Medlem borttagen.', { exact: true })).toHaveCount(0);
    } finally { release?.(); release = undefined; }
    await expect(page.getByRole('alert').filter({ hasText: 'Medlemmen kunde inte tas bort' })).toBeVisible();
    await expect(page.getByText(memberName, { exact: true }).first()).toBeVisible();
    await remove.click();
    await expect.poll(() => serverRows.some(row => row.user_id === memberId)).toBe(false);
    if (screen === 'detail') await expect(page).not.toHaveURL(new RegExp(`/members/${memberId}`));
    else await expect(page.getByText(memberName, { exact: true })).toHaveCount(0);
    expect(writes.filter(write => write.method === 'DELETE')).toHaveLength(2);
  });
}
