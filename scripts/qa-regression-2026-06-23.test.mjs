// Regression: ISSUE-001 + ISSUE-002 — weather panel hung on web; admin
// moderation screen lost its desktop sidebar nav.
// Found by /qa on 2026-06-23 (branch balanced-mvp-1.1.0)
// Report: .gstack/qa-reports/qa-report-localhost-2026-06-23.md
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, root), 'utf8');
}

// ISSUE-001 — On web the SMHI open-data API is always CORS-blocked, so the
// fetch can never succeed. The hook must skip it on web and expose an error
// status so the panel hides instead of hanging on "Laddar väder..." forever.
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

test('ISSUE-001: WeatherPanel hides on error instead of hanging on the loader', async () => {
  const screen = await readProjectFile('app/(tabs)/index.tsx');

  assert.match(screen, /const \{ data: weather, status \} = useWeather\(stableLocation\);/);
  // Error state returns null (panel hidden) rather than the loading spinner.
  assert.match(screen, /if \(status === 'error'\) \{\s*return null;/);
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
