import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

test('today counts unresolved important messages in this stable, including more than three', async () => {
  const source = await readFile(new URL('../lib/today.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const { deriveTodayOverview } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  const active = Array.from({ length: 4 }, (_, index) => ({ id: String(index), stableId: 'stable', title: `Viktigt ${index}`, severity: 'important', createdAt: '2026-09-08T07:00:00Z' }));
  const state = {
    assignments: [], alerts: [{ id: 'old-info', stableId: 'stable', type: 'info', message: 'Gammal händelse' }],
    stableAlerts: [...active, { ...active[0], id: 'resolved', resolvedAt: '2026-09-08T08:00:00Z' }, { ...active[0], id: 'foreign', stableId: 'other' }],
    horses: [], paddocks: [], horseDayStatuses: [], rideLogs: [], users: { user: { horses: [] } },
  };
  const overview = deriveTodayOverview({ state, currentUserId: 'user', currentStableId: 'stable', todayIso: '2026-09-08', membership: { access: 'owner' }, permissions: { canManageOnboarding: true } });
  assert.equal(overview.insights.find(item => item.id === 'alerts').value, '4');
  assert.deepEqual(overview.importantAlerts.map(alert => alert.id).sort(), active.map(alert => alert.id));
});
