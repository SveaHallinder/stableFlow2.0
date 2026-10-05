import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';

test.use({ trace: 'off' });

const stableId = '00000000-0000-4000-8000-000000000091';
const ownerId = '00000000-0000-4000-8000-000000000092';
const memberId = '00000000-0000-4000-8000-000000000093';
const memberName = 'QA andra ägaren';
const concurrencyCopy = /annan.*(telefon|samtidigt)|samtidig.*ändring|ändring.*samtidigt/i;

async function signInSynthetic(page) {
  const user = { id: ownerId, aud: 'authenticated', role: 'authenticated', email: 'pilot-ui@example.test',
    app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00.000Z' };
  const session = {
    access_token: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      Buffer.from(JSON.stringify({ sub: ownerId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
      'synthetic-signature'].join('.'),
    refresh_token: 'synthetic-pilot-refresh', token_type: 'bearer', expires_in: 3600, user,
  };
  const membership = id => ({ stable_id: stableId, user_id: id, role: 'admin', access: 'owner', horse_ids: [] });
  const members = [membership(ownerId), membership(memberId)];
  const profiles = [ownerId, memberId].map(id => ({ id, full_name: id === ownerId ? 'QA pilotägare' : memberName,
    username: id, responsibilities: [], onboarding_dismissed: true }));
  // All auth and data traffic is intercepted before login. No real account,
  // membership, booking or automatic group conversation can be changed.
  await page.route('**/auth/v1/**', route => route.fulfill({ json: route.request().url().endsWith('/user') ? user : session }));
  await page.route('**/rest/v1/**', route => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    if (table === 'get_member_directory') return route.fulfill({ json: profiles });
    if (table === 'accept_pending_invites') return route.fulfill({ json: [] });
    if (request.method() !== 'GET') return route.abort('blockedbyclient');
    const fixtures = {
      stable_members: url.searchParams.get('user_id') === `eq.${ownerId}` ? [members[0]] : members,
      stables: [{ id: stableId, name: 'QA konfliktstall', settings: { onboarding: { resourcesComplete: true, membersComplete: true } } }],
      profiles: profiles[0],
      horses: [{ id: '00000000-0000-4000-8000-000000000094', stable_id: stableId, name: 'QA pilothäst', owner_user_id: ownerId }],
      assignments: [{ id: '00000000-0000-4000-8000-000000000096', stable_id: stableId, date: '2026-01-01', label: 'QA avslutat pass', slot: 'Morning', time: '07:00', icon: 'sun', status: 'completed', assignee_id: ownerId, declined_by_user_ids: [] }],
      conversations: [{ id: '00000000-0000-4000-8000-000000000095', stable_id: stableId, is_group: true, title: 'QA konfliktstall' }],
    };
    return route.fulfill({ json: fixtures[table] ?? [] });
  });
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill(user.email);
  await page.getByPlaceholder('Minst 8 tecken').fill('SyntheticPilot123!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect(page.getByText('QA konfliktstall', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  return { members };
}

for (const width of [390, 1280]) {
  test.describe(`pilot database conflicts at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    for (const code of ['23P01', '40001', '40P01']) {
      test(`arena ${code} explains the conflict, keeps the draft and can retry`, async ({ page }) => {
        await signInSynthetic(page);
        const writes = [];
        let saved;
        await page.route('**/rest/v1/arena_bookings*', route => {
          const request = route.request();
          if (request.method() === 'GET') return route.fulfill({ json: saved ? [saved] : [] });
          if (request.method() !== 'POST') return route.abort('blockedbyclient');
          const payload = request.postDataJSON();
          writes.push(payload);
          if (writes.length === 1) return route.fulfill({ status: 409, json: { code, message: code === '23P01'
            ? '[arena overlap] Tiden är redan bokad. Välj en annan tid.' : 'Synthetic transaction conflict' } });
          saved = { ...payload, start_time: `${payload.start_time}:00`, end_time: `${payload.end_time}:00` };
          return route.fulfill({ json: saved });
        });
        await page.goto('/calendar');
        await page.getByRole('button', { name: 'Ridhus', exact: true }).click();
        await page.getByRole('button', { name: 'Ny bokning', exact: true }).first().click();
        const purpose = page.getByPlaceholder('Dressyrträning', { exact: true });
        await purpose.fill('QA pilotens ridhusutkast');
        await page.getByPlaceholder('17:00', { exact: true }).fill('17:00');
        await page.getByPlaceholder('18:00', { exact: true }).fill('18:00');
        await page.getByPlaceholder('Valfritt', { exact: true }).fill('Behåll min anteckning');
        await page.getByText('Skapa', { exact: true }).click();
        const error = page.getByRole('alert').filter({ hasText: code === '23P01' ? /tiden.*bokad.*annan tid/i : concurrencyCopy });
        await expect(error).toBeVisible();
        await expect(purpose).toHaveValue('QA pilotens ridhusutkast');
        await expect(page.getByPlaceholder('Valfritt', { exact: true })).toHaveValue('Behåll min anteckning');
        await expect(page.getByText('Ridhusbokning skapad.', { exact: true })).toHaveCount(0);
        // For an overlap the user can amend the time; concurrency can retry unchanged.
        if (code === '23P01') await page.getByPlaceholder('17:00', { exact: true }).fill('18:30');
        if (code === '23P01') await page.getByPlaceholder('18:00', { exact: true }).fill('19:30');
        await page.getByText('Skapa', { exact: true }).click();
        await expect(purpose).toHaveCount(0);
        await expect(page.getByText('QA pilotens ridhusutkast', { exact: true })).toBeVisible();
        expect(writes).toHaveLength(2);
        expect(writes[1].id).toBe(writes[0].id);
      });
    }

    for (const code of ['23514', '40001', '40P01']) {
      test(`member role ${code} explains rejection and retains the confirmed role`, async ({ page }) => {
        const { members } = await signInSynthetic(page);
        const writes = [];
        await page.route('**/rest/v1/stable_members*', route => {
          const request = route.request();
          if (request.method() === 'GET') return route.fulfill({ json: new URL(request.url()).searchParams.get('user_id') === `eq.${ownerId}` ? [members[0]] : members });
          if (request.method() !== 'PATCH') return route.abort('blockedbyclient');
          expect(new URL(request.url()).searchParams.get('user_id')).toBe(`eq.${memberId}`);
          writes.push(request.postDataJSON());
          if (writes.length === 1) return route.fulfill({ status: 409, json: { code, message: code === '23514'
            ? '[last owner] Stallet måste ha minst en ägare. Utse en ny ägare först.' : 'Synthetic transaction conflict' } });
          Object.assign(members[1], request.postDataJSON());
          return route.fulfill({ json: members[1] });
        });
        await page.goto(`/members/${memberId}?stableId=${stableId}`);
        const role = page.getByRole('button', { name: 'Byt roll', exact: true });
        await expect(page.getByText('Admin · Ägare', { exact: true })).toBeVisible();
        await role.click();
        await expect(page.getByRole('alert').filter({ hasText: code === '23514' ? /minst en ägare.*ny ägare/i : concurrencyCopy })).toBeVisible();
        await expect(page.getByText('Admin · Ägare', { exact: true })).toBeVisible();
        await expect(role).toBeEnabled();
        await role.click();
        await expect(page.getByText('Personal · Redigera', { exact: true })).toBeVisible();
        await expect(page.getByRole('alert')).toHaveCount(0);
        expect(writes).toHaveLength(2);
        expect(writes[1]).toEqual(writes[0]);
      });
    }

    test('last-owner deletion stays visible and never reports removal', async ({ page }) => {
      await signInSynthetic(page);
      let writes = 0;
      await page.route('**/rest/v1/stable_members*', async route => {
        if (route.request().method() === 'GET') return route.fallback();
        if (route.request().method() !== 'DELETE') return route.abort('blockedbyclient');
        writes += 1;
        return route.fulfill({ status: 409, json: { code: '23514', message: '[last owner] Stallet måste ha minst en ägare. Utse en ny ägare först.' } });
      });
      await page.goto(`/members/${memberId}?stableId=${stableId}`);
      await page.getByRole('button', { name: 'Ta bort från stallet', exact: true }).click();
      await expect(page.getByRole('alert').filter({ hasText: /minst en ägare.*ny ägare/i })).toBeVisible();
      await expect(page.getByText(memberName, { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Medlem borttagen.', { exact: true })).toHaveCount(0);
      expect(writes).toBe(1);
    });
  });
}
