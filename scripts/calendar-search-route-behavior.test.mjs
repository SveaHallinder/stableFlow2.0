import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

async function screenSource(path, name) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return { ast, screen: ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name) };
}
async function load(code) {
  const { outputText } = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
async function effects(path, name, include, keys) {
  const { ast, screen } = await screenSource(path, name);
  const hooks = screen.body.statements.filter(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
    && node.expression.expression.getText(ast) === 'React.useEffect' && include(node.expression.arguments[0].getText(ast)));
  return (await load(`export default ({ ${keys.join(',')} }) => [${hooks.map(node => `{ run: ${node.expression.arguments[0].getText(ast)}, deps: ${node.expression.arguments[1].getText(ast)} }`).join(',')}];`)).default;
}
function effectRunner(factory) {
  const previous = [];
  return context => {
    for (const [index, effect] of factory(context).entries()) {
      if (!previous[index] || effect.deps.some((value, key) => !Object.is(value, previous[index][key]))) {
        previous[index] = effect.deps;
        effect.run();
      }
    }
  };
}
async function calendar() {
  const factory = await effects('../app/(tabs)/calendar.tsx', 'CalendarScreen',
    body => !body.includes('assignmentParam') && (body.includes('setActiveFilter') || body.includes('setPassView')),
    ['resolvedFilter', 'activeFilter', 'focusDate', 'view', 'viewParam', 'setActiveFilter', 'setPassView', 'resolvePassView']);
  const state = { activeFilter: 'Pass', passView: 'all' };
  const run = effectRunner(factory);
  const flush = params => {
    for (let index = 0; index < 5; index++) {
      const before = JSON.stringify(state);
      run({ ...params, ...state,
        setActiveFilter: value => { state.activeFilter = value; }, setPassView: value => { state.passView = value; },
        resolvePassView: value => ['mine', 'open'].includes(value) ? value : 'all',
      });
      if (JSON.stringify(state) === before) return;
    }
    assert.fail('Route effects did not settle');
  };
  return { state, flush };
}

test('calendar deep-link seeds its category once and permits later category selection', async () => {
  const { state, flush } = await calendar();
  const params = { resolvedFilter: 'Pass', view: 'all', viewParam: 'all' };
  flush(params);
  state.activeFilter = 'Riddagar';
  flush(params);
  assert.equal(state.activeFilter, 'Riddagar');
  flush({ ...params, resolvedFilter: 'Ridhus' });
  assert.equal(state.activeFilter, 'Ridhus');
});

test('calendar accepts section, date and explicit view together without forcing stalls/all', async () => {
  const { state, flush } = await calendar();
  flush({ resolvedFilter: 'Ridhus', focusDate: '2026-11-03', view: 'mine', viewParam: 'mine' });
  assert.deepEqual(state, { activeFilter: 'Ridhus', passView: 'mine' });
  flush({ resolvedFilter: undefined, focusDate: undefined, view: 'open', viewParam: 'open' });
  assert.deepEqual(state, { activeFilter: 'Pass', passView: 'open' });
});

test('a prefilled global search remains editable and can be cleared', async () => {
  const factory = await effects('../app/search/index.tsx', 'SearchScreen', body => body.includes('setQuery'), ['initialQuery', 'query', 'setQuery']);
  const run = effectRunner(factory);
  let query = 'Cinder';
  const flush = initialQuery => {
    for (let index = 0; index < 3; index++) run({ initialQuery, query, setQuery: value => { query = value; } });
  };
  flush('Cinder');
  query = 'ZZ'; flush('Cinder'); assert.equal(query, 'ZZ');
  query = ''; flush('Cinder'); assert.equal(query, '');
  flush('Ny häst'); assert.equal(query, 'Ny häst');
});

async function searchCallback(name, dependencies) {
  const { ast, screen } = await screenSource('../app/search/index.tsx', 'SearchScreen');
  const declaration = screen.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(ast) === name);
  return (await load(`export default ({ ${Object.keys(dependencies).join(',')} }) => (${declaration.initializer.arguments[0].getText(ast)});`)).default(dependencies);
}

test('horse search opens the readable horse profile and horse list instead of owner administration', async () => {
  const routes = [];
  const deps = { openStableRoute: (...args) => routes.push(args), openRouteWithFallback: (...args) => routes.push(args), hasQuery: true, query: 'Cinder' };
  (await searchCallback('handleOpenHorse', deps))({ id: 'horse-id', stableId: 'stable-id', name: 'Cinder' });
  (await searchCallback('handleOpenHorses', deps))();
  assert.deepEqual(routes, [['stable-id', '/horses/[id]', { id: 'horse-id' }], ['/stable-horses']]);
});

test('pass search opens its actual assignment detail rather than only the calendar date', async () => {
  const routes = [];
  (await searchCallback('handleOpenAssignment', { openStableRoute: (...args) => routes.push(args) }))({ id: 'pass-id', stableId: 'stable-id', date: '2026-11-03' });
  assert.deepEqual(routes, [['stable-id', '/calendar', { assignmentId: 'pass-id', date: '2026-11-03', section: 'pass' }]]);
});

test('stable and farm search open a member-readable menu in the matching stable', async () => {
  const routes = [];
  const deps = {
    openStableRoute: (...args) => routes.push(args), openRouteWithFallback: (...args) => routes.push(args),
    fallbackStableId: 'stable-b',
    stablesInScope: [{ id: 'unrelated', farmId: 'other-farm' }, { id: 'stable-a', farmId: 'farm' }, { id: 'stable-b', farmId: 'farm' }],
  };
  (await searchCallback('handleOpenStable', deps))({ id: 'stable-a' });
  (await searchCallback('handleOpenFarm', deps))({ id: 'farm' });
  (await searchCallback('handleOpenStables', deps))();
  (await searchCallback('handleOpenFarms', deps))();
  assert.deepEqual(routes, [['stable-a', '/menu'], ['stable-b', '/menu'], ['/menu'], ['/menu']]);
});

test('ride type search opens the readable riding calendar with stable scope', async () => {
  const routes = [];
  const deps = { openStableRoute: (...args) => routes.push(args), openRouteWithFallback: (...args) => routes.push(args) };
  (await searchCallback('handleOpenRideType', deps))({ stableId: 'stable-id', id: 'dressage' });
  (await searchCallback('handleOpenRideTypes', deps))();
  assert.deepEqual(routes, [['stable-id', '/calendar', { section: 'riding' }], ['/calendar', { section: 'riding' }]]);
});
