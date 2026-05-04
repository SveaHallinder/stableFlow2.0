import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('Phase 5 — Care types + state wired into AppDataContext', async () => {
  const context = await readProjectFile('context/AppDataContext.tsx');

  assert.match(context, /export type ExternalContactType = 'farrier' \| 'vet' \| 'trainer' \| 'therapist' \| 'other'/);
  assert.match(context, /export type ExternalContact = \{/);
  assert.match(context, /export type CareEventType = 'farrier' \| 'vet' \| 'vaccination' \| 'dental' \| 'treatment' \| 'other'/);
  assert.match(context, /export type CareEvent = \{/);
  assert.match(context, /horseIds: string\[\];/);
  assert.match(context, /externalContacts: ExternalContact\[\];/);
  assert.match(context, /careEvents: CareEvent\[\];/);
});

test('Phase 5 — Reducer cases + cleanup on stable/horse delete', async () => {
  const context = await readProjectFile('context/AppDataContext.tsx');

  assert.match(context, /case 'EXTERNAL_CONTACT_UPSERT'/);
  assert.match(context, /case 'EXTERNAL_CONTACT_DELETE'/);
  assert.match(context, /case 'CARE_EVENT_UPSERT'/);
  assert.match(context, /case 'CARE_EVENT_DELETE'/);
  // STABLE_DELETE clears care data
  assert.match(
    context,
    /externalContacts: state\.externalContacts\.filter\(\s*\(contact\) => contact\.stableId !== action\.payload\.id/,
  );
  assert.match(
    context,
    /careEvents: state\.careEvents\.filter\(\(event\) => event\.stableId !== action\.payload\.id\)/,
  );
  // HORSE_DELETE removes horse from horseIds + drops events with empty horseIds
  assert.match(context, /horseIds: event\.horseIds\.filter\(\(horseId\) => horseId !== action\.payload\.id\)/);
  assert.match(context, /\.filter\(\(event\) => event\.horseIds\.length > 0\)/);
});

test('Phase 5 — Actions exposed on AppDataContextValue', async () => {
  const context = await readProjectFile('context/AppDataContext.tsx');

  assert.match(context, /upsertExternalContact: \(input: UpsertExternalContactInput\) => ActionResult<ExternalContact>;/);
  assert.match(context, /deleteExternalContact: \(contactId: string\) => ActionResult;/);
  assert.match(context, /createCareEvent: \(input: CreateCareEventInput\) => ActionResult<CareEvent>;/);
  assert.match(context, /updateCareEvent: \(input: UpdateCareEventInput\) => ActionResult<CareEvent>;/);
  assert.match(context, /deleteCareEvent: \(careEventId: string\) => ActionResult;/);
  assert.match(context, /completeCareEvent: \(input: CompleteCareEventInput\) => ActionResult<CareEvent>;/);
  // completeCareEvent flips status + sets completedAt
  assert.match(context, /status: 'done',\s+completedAt: new Date\(\)\.toISOString\(\),/);
});

test('Phase 5 — Supabase load and persist for contacts + care events', async () => {
  const context = await readProjectFile('context/AppDataContext.tsx');

  assert.match(context, /supabase\.from\('external_contacts'\)\.select\('\*'\)\.in\('stable_id', stableIds\)/);
  assert.match(context, /supabase\.from\('care_events'\)\.select\('\*'\)\.in\('stable_id', stableIds\)/);
  assert.match(context, /from\('external_contacts'\)\.upsert/);
  assert.match(context, /from\('care_events'\)\.upsert/);
  assert.match(context, /from\('care_events'\)\.delete\(\)\.eq\('id', eventId\)/);
});

test('Phase 5 — Migration + schema mirror care_events_contacts', async () => {
  const migrationSql = await readProjectFile('supabase/migrations/20260503_care_events_contacts.sql');
  const schemaSql = await readProjectFile('supabase/schema.sql');

  for (const fragment of [
    /create table if not exists public\.external_contacts/i,
    /create table if not exists public\.care_events/i,
    /horse_ids uuid\[\] not null default/i,
    /alter table public\.external_contacts enable row level security/i,
    /alter table public\.care_events enable row level security/i,
    /can_edit_stable\(stable_id\)/i,
    /create policy "care_events_select"/i,
  ]) {
    assert.match(migrationSql, fragment);
    assert.match(schemaSql, fragment);
  }
});

test('Phase 5 — Horse profile, contacts page and Vård filter wired', async () => {
  const horseProfile = await readProjectFile('app/horses/[id].tsx');
  const contactsPage = await readProjectFile('app/contacts/index.tsx');
  const calendar = await readProjectFile('app/(tabs)/calendar.tsx');
  const adminPage = await readProjectFile('app/admin/index.tsx');

  // Horse profile renders care editor
  assert.match(horseProfile, /function CareEventsEditor/);
  assert.match(horseProfile, /Slutför vård/);
  assert.match(horseProfile, /Lägg till vårdhändelse/);

  // Contacts page lists contacts and supports edit/delete
  assert.match(contactsPage, /actions\.upsertExternalContact/);
  assert.match(contactsPage, /actions\.deleteExternalContact/);

  // Calendar has Vård filter
  assert.match(calendar, /\['Pass', 'Riddagar', 'Ridhus', 'Tävling', 'Vård'\]/);
  assert.match(calendar, /function CareEventsSection/);
  assert.match(calendar, /activeFilter === 'Vård'/);

  // Admin links to /contacts
  assert.match(adminPage, /route: '\/contacts'/);
});
