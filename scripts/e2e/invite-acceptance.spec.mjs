import { Buffer } from 'node:buffer';
import { URL, URLSearchParams } from 'node:url';
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

// Every auth and data request is intercepted before the first navigation.
// These are client-flow checks, not proof of live email or database acceptance.
async function installRecipientBackend(page, options = {}) {
  const control = { valid: true, confirmationNeeded: true, failAcceptance: false, failJoin: false, emailInvite: true, ...options };
  const user = {
    id: '00000000-0000-4000-8000-000000000071', aud: 'authenticated', role: 'authenticated',
    email: 'recipient@example.test', app_metadata: {}, user_metadata: { full_name: 'QA Invite Recipient' },
    identities: [{ id: 'synthetic-identity' }], created_at: '2026-01-01T00:00:00.000Z',
  };
  const stable = { id: '00000000-0000-4000-8000-000000000072', name: 'QA Invited Stable',
    created_at: '2026-01-01T00:00:00.000Z', settings: {}, join_code: 'STABLE1' };
  const profile = { id: user.id, full_name: 'QA Invite Recipient', username: 'qa-invite',
    responsibilities: [], onboarding_dismissed: true };
  const assignedMember = { stable_id: stable.id, user_id: user.id, role: 'guest', access: 'view',
    custom_role: 'QA Gäståtkomst', horse_ids: [], created_at: '2026-01-01T00:00:00.000Z' };
  const session = {
    access_token: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
      'synthetic-signature'].join('.'),
    refresh_token: 'synthetic-invite-refresh', token_type: 'bearer', expires_in: 3600, user,
  };
  const calls = { signup: 0, logout: 0, accepts: 0, joins: 0, validations: [], writes: [] };
  let member;
  await page.route('**/auth/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/signup')) {
      calls.signup += 1;
      return route.fulfill({ json: control.confirmationNeeded ? user : session });
    }
    if (pathname.endsWith('/logout')) { calls.logout += 1; return route.fulfill({ status: 204 }); }
    if (pathname.endsWith('/user')) return route.fulfill({ json: user });
    if (pathname.endsWith('/token')) return route.fulfill({ json: session });
    return route.abort('blockedbyclient');
  });
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const name = url.pathname.split('/').at(-1);
    if (name === 'validate_invite') {
      calls.validations.push(request.postDataJSON());
      return route.fulfill({ json: control.valid });
    }
    if (name === 'accept_pending_invites') {
      calls.accepts += 1;
      if (control.failAcceptance) return route.fulfill({ status: 503, json: { message: 'Synthetic acceptance unavailable' } });
      const count = !member && control.emailInvite ? 1 : 0;
      if (count) member = assignedMember;
      return route.fulfill({ json: count });
    }
    if (name === 'accept_join_code') {
      calls.joins += 1;
      if (control.failJoin) return route.fulfill({ status: 503, json: { message: 'Synthetic join unavailable' } });
      if (request.postDataJSON().p_code !== 'STABLE1') return route.fulfill({ status: 400, json: { message: 'Invalid join code' } });
      if (!member) member = { ...assignedMember, role: 'rider', custom_role: 'QA Medryttare', rider_role: 'medryttare' };
      return route.fulfill({ json: stable.id });
    }
    if (name === 'get_member_directory') return route.fulfill({ json: [profile] });
    if (request.method() !== 'GET') {
      calls.writes.push({ name, method: request.method() });
      if (name === 'profiles' && request.method() === 'PATCH') return route.fulfill({ status: 204 });
      return route.abort('blockedbyclient');
    }
    const rows = {
      stable_members: member ? [member] : [], stables: [stable],
      conversations: [{ id: '00000000-0000-4000-8000-000000000073', stable_id: stable.id, is_group: true, title: stable.name }],
      profiles: [profile], stable_invites: [],
    };
    return route.fulfill({ json: name === 'profiles' && request.headers().accept?.includes('object') ? profile : rows[name] ?? [] });
  });
  return { control, calls, stable, user, session };
}

async function fillJoinSignup(page, code = '') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skapa konto', exact: true }).first().click();
  await page.getByRole('button', { name: 'Har inbjudningskod', exact: true }).click();
  await page.getByPlaceholder('För- och efternamn').fill('QA Invite Recipient');
  await page.getByPlaceholder('namn@exempel.se').fill('recipient@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill('SyntheticTest123!');
  if (code) await page.getByPlaceholder('Kod från admin').fill(code);
  await page.getByRole('button', { name: 'Skapa konto', exact: true }).last().click();
}

test('email-only signup, confirmation and login show the assigned stable with guest rights', async ({ page }) => {
  const { calls, stable, user } = await installRecipientBackend(page);
  await fillJoinSignup(page);
  await expect(page.getByText('Bekräfta din e-post', { exact: true })).toBeVisible();
  expect(calls.signup).toBe(1);
  expect(calls.validations).toEqual([{ p_email: user.email, p_code: null }]);
  await page.getByRole('button', { name: 'Till inloggning', exact: true }).click();
  await page.getByPlaceholder('Minst 8 tecken').fill('SyntheticTest123!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect(page.getByText(stable.name, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await page.goto('/members');
  await expect(page.getByText('QA Gäståtkomst • Läsa', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gäst', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Ta bort .* från stallet/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('QA Gäståtkomst • Läsa', { exact: true })).toBeVisible();
  expect(calls.logout).toBe(0);
  expect(calls.joins).toBe(0);
});

test('expired or used invite validation retains the signup draft and permits retry with a new invitation', async ({ page }) => {
  const { calls, control } = await installRecipientBackend(page, { valid: false });
  await fillJoinSignup(page, 'EXPIRED');
  await expect(page.getByText('Ingen giltig inbjudan hittades. Kontrollera e-post och kod, eller be om en ny inbjudan.', { exact: true })).toBeVisible();
  expect(calls.signup).toBe(0);
  await expect(page.getByPlaceholder('namn@exempel.se')).toHaveValue('recipient@example.test');
  await expect(page.getByPlaceholder('Kod från admin')).toHaveValue('EXPIRED');
  control.valid = true;
  await page.getByPlaceholder('Kod från admin').fill('NEWCODE');
  await page.getByRole('button', { name: 'Skapa konto', exact: true }).last().click();
  await expect(page.getByText('Bekräfta din e-post', { exact: true })).toBeVisible();
  expect(calls.signup).toBe(1);
});

test('an acceptance outage after immediate signup preserves the code and recovers assigned rights on retry', async ({ page }) => {
  const { calls, control, stable } = await installRecipientBackend(page, { confirmationNeeded: false, failAcceptance: true });
  await fillJoinSignup(page, 'INVITE1');
  await expect(page.getByText('Kunde inte hämta stallet', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Kunde inte kontrollera dina inbjudningar. Kontrollera anslutningen och försök igen.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('pending_join_code')))).toEqual({ code: 'INVITE1', email: 'recipient@example.test' });
  expect(calls.logout).toBe(0);
  control.failAcceptance = false;
  await page.getByRole('button', { name: 'Försök igen', exact: true }).click();
  await expect(page.getByText(stable.name, { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('pending_join_code'))).toBeNull();
  expect(calls.joins).toBe(1);
  await page.goto('/members');
  await expect(page.getByText('QA Gäståtkomst • Läsa', { exact: true })).toBeVisible();
});

test('a generic code for the emailed stable preserves the assigned guest role', async ({ page }) => {
  const { calls, stable } = await installRecipientBackend(page, { confirmationNeeded: false });
  await fillJoinSignup(page, 'STABLE1');
  await expect(page.getByText(stable.name, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  expect(calls.joins).toBe(1);
  expect(calls.logout).toBe(0);
  await page.goto('/members');
  await expect(page.getByText('QA Gäståtkomst • Läsa', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('pending_join_code'))).toBeNull();
});

test('a reusable stable code reaches its exact stable with rider rights', async ({ page }) => {
  const { calls, stable } = await installRecipientBackend(page, { confirmationNeeded: false, emailInvite: false });
  await fillJoinSignup(page, 'stable1');
  await expect(page.getByText(stable.name, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  expect(calls.joins).toBe(1);
  expect(calls.logout).toBe(0);
  await page.goto('/members');
  await expect(page.getByText('QA Medryttare • Medryttare • Läsa', { exact: true })).toBeVisible();
});

test('opening the confirm route without proof never claims that email was confirmed', async ({ page }) => {
  await installRecipientBackend(page);
  await page.goto('/confirm');
  await expect(page.getByText('Öppna bekräftelselänken i mejlet. Om du redan har bekräftat din e-post kan du logga in.', { exact: true })).toBeVisible();
  await expect(page.getByText('Din e-post är bekräftad', { exact: true })).toHaveCount(0);
});

test('a synthetic confirmation link opens the recipient session and assigned stable', async ({ page }) => {
  const { session, stable, calls } = await installRecipientBackend(page);
  const hash = new URLSearchParams({ access_token: session.access_token, refresh_token: session.refresh_token,
    expires_in: '3600', token_type: 'bearer', type: 'signup' });
  await page.goto(`/confirm#${hash}`);
  await expect(page.getByText(stable.name, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  expect(calls.logout).toBe(0);
  await page.goto('/members');
  await expect(page.getByText('QA Gäståtkomst • Läsa', { exact: true })).toBeVisible();
});

test('manual join preserves its code after a network failure and retries into the correct stable', async ({ page }) => {
  const { control, stable } = await installRecipientBackend(page, { emailInvite: false, failJoin: true });
  await page.goto('/');
  await page.getByPlaceholder('namn@exempel.se').fill('recipient@example.test');
  await page.getByPlaceholder('Minst 8 tecken').fill('SyntheticTest123!');
  await page.getByRole('button', { name: 'Logga in', exact: true }).last().click();
  await expect(page.getByPlaceholder('namn@exempel.se')).toHaveCount(0);
  await page.goto('/join');
  await page.getByPlaceholder('Ex: ABC123').fill('stable1');
  await page.getByText('Gå med', { exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Kontrollera anslutningen' })).toBeVisible();
  await expect(page.getByPlaceholder('Ex: ABC123')).toHaveValue('stable1');
  control.failJoin = false;
  await page.getByText('Gå med', { exact: true }).click();
  await expect(page.getByText(stable.name, { exact: true }).first()).toBeVisible();
});
