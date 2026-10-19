import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const compilerOptions = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 };
const toModuleUrl = source => {
  const { outputText } = ts.transpileModule(source, { compilerOptions });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
};
const helperUrl = toModuleUrl(await readFile(new URL('lib/paddockLinks.ts', root), 'utf8'));
const helpers = await import(helperUrl);

async function loadModule(path) {
  const source = (await readFile(new URL(path, root), 'utf8'))
    .replaceAll("'@/lib/paddockLinks'", JSON.stringify(helperUrl));
  return import(toModuleUrl(source));
}

async function loadMemo(path, name, dependencies) {
  const source = await readFile(new URL(path, root), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name &&
        node.initializer && ts.isCallExpression(node.initializer)) {
      callback = node.initializer.arguments[0];
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(callback, `Actual ${name} callback exists`);
  const factory = await import(toModuleUrl(
    `export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback.getText(ast)});`,
  ));
  return factory.default(dependencies)();
}

const horse = { id: 'horse-1', stableId: 'stable', name: 'Nya Saga', ownerUserId: 'owner' };
const twin = { ...horse, id: 'horse-2' };
const foreign = { ...horse, id: 'foreign-horse', stableId: 'other', name: 'Främmande' };
const horses = [horse, twin, foreign];
const paddock = (overrides = {}) => ({
  id: 'paddock-1', stableId: 'stable', name: 'Sommarhagen', horseIds: [horse.id],
  horseNames: ['Gamla Saga'], linksReady: true, revision: 1, ...overrides,
});

test('paddock readers use current names and retain two same-name identities', () => {
  const row = paddock({ horseIds: [horse.id, twin.id, horse.id] });
  const snapshot = JSON.parse(JSON.stringify(row));
  assert.deepEqual(helpers.getPaddockHorses(row, horses).map(item => item.id), [horse.id, twin.id]);
  assert.deepEqual(helpers.getPaddockHorseNames(row, horses), ['Nya Saga', 'Nya Saga']);
  assert.equal(helpers.hasUnconfirmedPaddockLinks([row], horses), false);
  assert.deepEqual(row, snapshot);
});

test('unknown and cross-stable IDs fail closed without falling back to saved names', () => {
  const row = paddock({ horseIds: [horse.id, foreign.id, 'missing'] });
  assert.deepEqual(helpers.getPaddockHorses(row, horses), [horse]);
  assert.deepEqual(helpers.getPaddockHorseNames(row, horses), [horse.name]);
  assert.equal(helpers.hasUnconfirmedPaddockLinks([row], horses), true);
  assert.deepEqual(helpers.getHorsePaddocks(foreign, [row]), []);
});

test('a horse retains all same-stable paddocks and never inherits a same-name horse link', () => {
  const rows = [paddock(), paddock({ id: 'winter' }), paddock({ id: 'foreign', stableId: 'other' })];
  assert.deepEqual(helpers.getHorsePaddocks(horse, rows).map(item => item.id), ['paddock-1', 'winter']);
  assert.deepEqual(helpers.getHorsePaddocks(twin, rows), []);
});

test('legacy raw text remains display-only and older runtime rows stay unconfirmed', () => {
  const row = paddock({ linksReady: false, horseNames: ['  Saga  ', 'Saga', '<sparat>'] });
  assert.deepEqual(helpers.getPaddockHorseNames(row, horses), row.horseNames);
  assert.deepEqual(helpers.getPaddockHorses(row, horses), []);
  assert.deepEqual(helpers.getHorsePaddocks(horse, [row]), []);
  for (const older of [row, { stableId: 'stable', horseNames: ['Nya Saga'] }, paddock({ horseIds: undefined })]) {
    assert.deepEqual(helpers.getPaddockHorses(older, horses), []);
    assert.equal(helpers.hasUnconfirmedPaddockLinks([older], horses), true);
  }
  assert.equal(helpers.hasUnconfirmedPaddockLinks([paddock({ horseIds: [] })], horses), false);
  const emptyText = paddock({ linksReady: false, horseNames: [null, '', '  ', '  Saga  '] });
  assert.deepEqual(helpers.getPaddockHorseNames(emptyText, horses), ['Tom äldre post', 'Tom äldre post', 'Tom äldre post', '  Saga  ']);
  assert.deepEqual(emptyText.horseNames, [null, '', '  ', '  Saga  ']);
});

async function today(rows, ready = true) {
  const { deriveTodayOverview } = await loadModule('lib/today.ts');
  return deriveTodayOverview({
    state: {
      horses: [horse], paddocks: rows, paddockLinksReady: ready, assignments: [], stableAlerts: [],
      horseDayStatuses: [{ horseId: horse.id, stableId: 'stable', date: '2026-10-06', hay: true, water: true, checked: true }],
      rideLogs: [], users: { owner: { horses: [horse.id] } },
    },
    currentUserId: 'owner', currentStableId: 'stable', todayIso: '2026-10-06',
    membership: { access: 'owner' }, permissions: { canManageOnboarding: true },
  });
}

test('Today derives every ID-linked paddock after a rename', async () => {
  const overview = await today([paddock(), paddock({ id: 'winter' })]);
  const summary = overview.myHorseSummaries[0];
  assert.deepEqual(summary.paddocks.map(item => item.id), ['paddock-1', 'winter']);
  assert.deepEqual(summary.gaps, []);
});

test('Today distinguishes unconfirmed legacy/global state from a confirmed missing paddock', async () => {
  for (const [rows, ready] of [[[], false], [[paddock({ linksReady: false })], true], [[paddock({ horseIds: ['missing'] })], true]]) {
    const summary = (await today(rows, ready)).myHorseSummaries[0];
    assert.equal(summary.paddockLinksUnconfirmed, true);
    assert.deepEqual(summary.gaps, ['hagkoppling ej bekräftad']);
  }
  const summary = (await today([paddock({ horseIds: [twin.id], horseNames: [horse.name] })])).myHorseSummaries[0];
  assert.equal(summary.gaps.includes('hage'), false);
  const empty = (await today([paddock({ horseIds: [], horseNames: [horse.name] })])).myHorseSummaries[0];
  assert.deepEqual(empty.gaps, ['hage']);
});

test('printing uses live Horse names and identity counts instead of snapshots', async () => {
  const { createPaddocksPrintHtml } = await loadModule('lib/paddocksPrint.ts');
  const html = createPaddocksPrintHtml([paddock({ horseIds: [horse.id, twin.id, horse.id] })], horses);
  assert.equal((html.match(/<li>Nya Saga<\/li>/g) ?? []).length, 2);
  assert.match(html, /2 hästar/);
  assert.doesNotMatch(html, /Gamla Saga/);
});

test('printing labels raw legacy text and unresolved IDs without asserting an empty paddock', async () => {
  const { createPaddocksPrintHtml } = await loadModule('lib/paddocksPrint.ts');
  const legacy = createPaddocksPrintHtml([paddock({ linksReady: false, horseNames: ['<sparat>', '<sparat>'] })], horses);
  assert.equal((legacy.match(/<li>&lt;sparat&gt;<\/li>/g) ?? []).length, 2);
  assert.match(legacy, /Hästkopplingar ej bekräftade/);
  assert.doesNotMatch(legacy, /2 hästar/);
  const unknown = createPaddocksPrintHtml([paddock({ horseIds: [foreign.id, 'missing'] })], horses);
  assert.doesNotMatch(unknown, /Inga hästar angivna|0 hästar|Främmande|Gamla Saga/);
  assert.match(unknown, /Hästkopplingar ej bekräftade/);
});

function search(rows, query) {
  return loadMemo('app/search/index.tsx', 'paddockResults', {
    ...helpers, state: { paddocks: rows, horses, paddockLinksReady: true }, hasQuery: true,
    memberStableIds: new Set(['stable']), hasStableAccess: stableId => stableId === 'stable',
    stableNameById: { stable: 'Stallet' }, normalizedQuery: query.toLowerCase(), MAX_RESULTS: 5,
  });
}

test('actual search callback follows renames, counts distinct IDs and enforces stable scope', async () => {
  const result = await search([paddock({ horseIds: [horse.id, twin.id, horse.id] }), paddock({ id: 'foreign', stableId: 'other' })], horse.name);
  assert.equal(result.total, 1);
  assert.equal(result.items[0].horseCount, 2);
  assert.equal((await search([paddock()], 'Gamla Saga')).total, 0);
  assert.equal((await search([paddock({ horseIds: [foreign.id], horseNames: [foreign.name] })], foreign.name)).total, 0);
});

test('actual search callback labels legacy matches with an unconfirmed count', async () => {
  const result = await search([paddock({ linksReady: false })], 'Gamla Saga');
  assert.equal(result.total, 1);
  assert.equal(result.items[0].horseCount, undefined);
});

test('Today quick action counts a horse once across several paddocks', async () => {
  const summary = await loadMemo('app/(tabs)/index.tsx', 'paddockSummary', {
    ...helpers, state: { horses, paddockLinksReady: true },
    activePaddocks: [paddock({ horseIds: [horse.id, twin.id], horseNames: [horse.name, twin.name] }), paddock({ id: 'winter' })],
  });
  assert.equal(summary.horseCount, 2);
  assert.equal(summary.linksUnconfirmed, false);
  const unknown = await loadMemo('app/(tabs)/index.tsx', 'paddockSummary', {
    ...helpers, state: { horses, paddockLinksReady: false }, activePaddocks: [],
  });
  assert.equal(unknown.linksUnconfirmed, true);
});
