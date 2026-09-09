#!/usr/bin/env node
// Skapa de 5 QA-användarna (matchande supabase/seed_qa.sql) via Admin API.
// Kräver SUPABASE_SERVICE_ROLE_KEY (NOT anon key) i miljön.
//
// Användning:
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/setup-qa-users.mjs
//
// Lösenord overrideas med E2E_QA_PASSWORD env var (default: QaTest1234!).

import { readFile } from 'node:fs/promises';

async function loadEnv() {
  try {
    const raw = await readFile(new URL('../.env', import.meta.url), 'utf8');
    const map = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
      if (m) map[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    return map;
  } catch {
    return {};
  }
}

const env = { ...(await loadEnv()), ...process.env };
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = env.E2E_QA_PASSWORD ?? 'QaTest1234!';

if (!SUPABASE_URL) {
  console.error('Saknar EXPO_PUBLIC_SUPABASE_URL i .env');
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error('Sätt SUPABASE_SERVICE_ROLE_KEY i shell-miljön (Settings → API → service_role secret).');
  process.exit(1);
}

const QA_USERS = [
  { email: 'stableflow-admin@example.test', full_name: 'QA Admin', username: 'qa-admin' },
  { email: 'stableflow-staff@example.test', full_name: 'QA Staff', username: 'qa-staff' },
  { email: 'stableflow-owner@example.test', full_name: 'QA Horse Owner', username: 'qa-owner' },
  { email: 'stableflow-rider@example.test', full_name: 'QA Medryttare', username: 'qa-rider' },
  { email: 'stableflow-guest@example.test', full_name: 'QA Guest', username: 'qa-guest' },
];

async function getExisting(email) {
  const url = new URL(`${SUPABASE_URL}/auth/v1/admin/users`);
  url.searchParams.set('per_page', '200');
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`List users failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const users = data.users ?? data;
  return users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
}

async function createUser(user) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: user.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: user.full_name, username: user.username },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create ${user.email} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function updatePassword(id) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
  });
  if (!res.ok) {
    throw new Error(`Update password failed: ${res.status} ${await res.text()}`);
  }
}

let created = 0;
let updated = 0;
for (const user of QA_USERS) {
  const existing = await getExisting(user.email);
  if (existing) {
    await updatePassword(existing.id);
    updated += 1;
    console.log(`UPDATED ${user.email}`);
  } else {
    await createUser(user);
    created += 1;
    console.log(`CREATED ${user.email}`);
  }
}

console.log(`\n${created} skapade, ${updated} uppdaterade. Lösenord: ${PASSWORD}`);
console.log('Kör nu supabase/seed_qa.sql i SQL editor.');
