import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, root), 'utf8');
}

async function pathExists(path) {
  try {
    await access(new URL(path, root));
    return true;
  } catch {
    return false;
  }
}

test('horse module exposes list filters and profile navigation', async () => {
  const listSql = await readProjectFile('app/(tabs)/stable-horses.tsx');

  assert.ok(listSql.includes('type HorseListFilter'));
  assert.match(listSql, /label: 'Alla'/);
  assert.match(listSql, /label: 'Mina'/);
  assert.match(listSql, /label: 'Ansvar'/);
  assert.ok(listSql.includes('router.push(`/horses/${horse.id}`)'));
});

test('horse profile route shows the required Phase 2 sections', async () => {
  assert.equal(await pathExists('app/horses/[id].tsx'), true);

  const profileRoute = await readProjectFile('app/horses/[id].tsx');

  assert.ok(profileRoute.includes('Dagens status'));
  assert.ok(profileRoute.includes('Foderplan'));
  assert.ok(profileRoute.includes('Ridning/träning'));
  assert.ok(profileRoute.includes('Vård'));
  assert.ok(profileRoute.includes('Ägare/ansvariga'));
});

test('horse access helper models owner plus responsible users without database schema', async () => {
  const accessHelper = await readProjectFile('lib/horseAccess.ts');
  const context = await readProjectFile('context/AppDataContext.tsx');

  assert.match(context, /export type HorseResponsibility/);
  assert.ok(accessHelper.includes("export type HorseListFilter = 'all' | 'mine' | 'responsible'"));
  assert.match(accessHelper, /function isHorseOwner/);
  assert.match(accessHelper, /function isHorseResponsible/);
  assert.match(accessHelper, /horseIds\?\.includes/);
});
