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

// The current SNOW API supports CORS. scripts/weather.test.mjs tests the real
// hook on web/iOS, including timeouts, invalid data and stale requests.

test('ISSUE-001: WeatherPanel ends loading on error and shows only confirmed weather', async () => {
  const screen = await readProjectFile('app/(tabs)/index.tsx');
  const parsed = ts.createSourceFile('index.tsx', screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const panel = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'WeatherPanel');
  assert.ok(panel, 'The actual WeatherPanel component must exist');
  const { outputText } = ts.transpileModule(`export default ${panel.getText(parsed)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  });
  for (const { status, data, error, caption, temperature } of [
    { status: 'error', data: null, caption: 'Ej tillgängligt', temperature: '—' },
    { status: 'error', data: null, error: 'Ange stallets ort', caption: 'Ange stallets ort', temperature: '—' },
    { status: 'error', data: null, error: 'Ort ej hittad', caption: 'Ort ej hittad', temperature: '—' },
    { status: 'loading', data: null, caption: 'Hämtar väder', temperature: '—' },
    { status: 'ready', data: { location: 'Stallet', temperature: 10, summary: 'Mulet', high: 12, low: 6, symbol: 6, updatedAt: '17:15' }, caption: 'Mulet', temperature: '10°' },
    { status: 'ready', data: { location: 'Stallet', temperature: -4, summary: 'Snöfall', high: -1, low: -8, symbol: 26, updatedAt: '17:15' }, caption: 'Snöfall', temperature: '-4°' },
  ]) {
    const exports = {};
    const opened = [];
    const scope = {
      React: { createElement: (type, props, ...children) => ({ type, props, children }) },
      useWeather: (location) => { assert.equal(location, 'Stallet'); return { data, status, error }; },
      theme: { gradients: { weather: [] } }, styles: {}, palette: { primaryText: '#111111' },
      LinearGradient: 'LinearGradient', View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator', CloudSun: 'CloudSun',
      TouchableOpacity: 'TouchableOpacity', Feather: 'Feather',
      Linking: { openURL: url => { opened.push(url); return Promise.resolve(); } },
    };
    new Function('exports', ...Object.keys(scope), outputText)(exports, ...Object.values(scope));
    const tree = exports.default({ stableLocation: 'Stallet' });
    const types = [];
    const text = [];
    const nodes = [];
    const visit = (node) => {
      if (typeof node === 'string') text.push(node);
      else if (node && typeof node === 'object') {
        types.push(node.type);
        nodes.push(node);
        (node.children ?? []).flat().forEach(visit);
      }
    };
    visit(tree);
    assert.equal(types.includes('ActivityIndicator'), status === 'loading');
    assert.ok(text.includes(caption), `Missing useful ${status} caption`);
    assert.ok(text.includes(temperature), `Incorrect ${status} temperature`);
    if (!data) assert.ok(!text.some((value) => /\d+°/.test(value)), 'No fabricated weather reading');
    if (data) {
      assert.match(text.join(' '), /SMHI/);
      assert.match(text.join(' '), /17:15/);
      assert.match(text.join(' '), /24h/);
      assert.equal(nodes.find(node => node.type === 'Feather').props.name, data.symbol === 26 ? 'cloud-snow' : 'cloud');
      const link = nodes.find(node => node.props?.accessibilityRole === 'link');
      assert.ok(link, 'The source must be accessible'); link.props.onPress();
      assert.deepEqual(opened, ['https://www.smhi.se/vader']);
    }
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
