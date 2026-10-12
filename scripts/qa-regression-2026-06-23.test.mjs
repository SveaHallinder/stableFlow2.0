// Regression: ISSUE-001 + ISSUE-002 — weather panel hung on web; admin
// moderation screen lost its desktop sidebar nav.
// Found by /qa on 2026-06-23 (branch balanced-mvp-1.1.0)
// Report: .gstack/qa-reports/qa-report-localhost-2026-06-23.md
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root = new URL('../', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, root), 'utf8');
}

// ISSUE-001 — On web the SMHI open-data API is always CORS-blocked, so the
// fetch can never succeed. The hook must skip it on web and expose an error
// status so the panel leaves its loading state instead of hanging forever.
test('ISSUE-001: useWeather skips the doomed fetch on web and exposes a status', async () => {
  const hook = await readProjectFile('hooks/useWeather.ts');

  // Returns a { data, status } shape, not a bare WeatherData | null.
  assert.match(hook, /return \{ data, status \};/);
  assert.match(hook, /useState<WeatherStatus>\('loading'\)/);

  // Web short-circuits to 'error' without firing the CORS-doomed request.
  assert.match(hook, /if \(Platform\.OS === 'web'\)/);
  assert.match(hook, /setStatus\('error'\)/);

  // Fetch failures (incl. native network errors) surface 'error', and a
  // successful parse marks 'ready'.
  assert.match(hook, /setStatus\('ready'\)/);
  assert.match(hook, /\.catch\(\(\) => \{[\s\S]*?if \(!cancelled\) setStatus\('error'\)/);
});

test('ISSUE-001: WeatherPanel ends loading on error and shows only confirmed weather', async () => {
  const screen = await readProjectFile('app/(tabs)/index.tsx');
  const parsed = ts.createSourceFile('index.tsx', screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const panel = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'WeatherPanel');
  assert.ok(panel, 'The actual WeatherPanel component must exist');
  const { outputText } = ts.transpileModule(`export default ${panel.getText(parsed)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  });
  for (const { status, data, caption, temperature } of [
    { status: 'error', data: null, caption: 'Ej tillgängligt', temperature: '—' },
    { status: 'loading', data: null, caption: 'Hämtar väder', temperature: '—' },
    { status: 'ready', data: { location: 'Stallet', temperature: 10, summary: 'Molnigt', high: 12, low: 6 }, caption: 'Molnigt', temperature: '10°' },
  ]) {
    const exports = {};
    const scope = {
      React: { createElement: (type, props, ...children) => ({ type, props, children }) },
      useWeather: (location) => { assert.equal(location, 'Stallet'); return { data, status }; },
      theme: { gradients: { weather: [] } }, styles: {},
      LinearGradient: 'LinearGradient', View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator', CloudSun: 'CloudSun',
    };
    new Function('exports', ...Object.keys(scope), outputText)(exports, ...Object.values(scope));
    const tree = exports.default({ stableLocation: 'Stallet' });
    const types = [];
    const text = [];
    const visit = (node) => {
      if (typeof node === 'string') text.push(node);
      else if (node && typeof node === 'object') {
        types.push(node.type);
        (node.children ?? []).flat().forEach(visit);
      }
    };
    visit(tree);
    assert.equal(types.includes('ActivityIndicator'), status === 'loading');
    assert.ok(text.includes(caption), `Missing useful ${status} caption`);
    assert.ok(text.includes(temperature), `Incorrect ${status} temperature`);
    if (!data) assert.ok(!text.some((value) => /\d+°/.test(value)), 'No fabricated weather reading');
  }
});

// ISSUE-002 — Every desktop screen renders the left navigation rail via
// <DesktopNav variant="sidebar" />. The Fas 3 moderation queue omitted it,
// stranding the user with no way to navigate away.
test('ISSUE-002: admin moderation screen renders the desktop sidebar nav', async () => {
  const reports = await readProjectFile('app/admin/reports.tsx');

  assert.match(reports, /import \{ DesktopNav \} from '@\/components\/DesktopNav';/);
  assert.match(reports, /<DesktopNav variant="sidebar" \/>/);
  // Wrapped behind the same isDesktopWeb guard used elsewhere.
  assert.match(reports, /if \(!isDesktopWeb\) \{\s*return content;/);
});
