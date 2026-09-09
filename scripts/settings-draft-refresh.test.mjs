import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadCallback(file, component, name, dependencies) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const owner = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === component);
  const declaration = owner.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === name);
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

test('box edits send only the edited field after another phone changes overnight housing', async () => {
  const horseWrites = [];
  const callback = await loadCallback('../app/(onboarding)/day-logic.tsx', 'OnboardingDayLogic', 'handleSave', {
    savingRef: { current: false }, setSaving() {}, setSaveError() {}, toast: { showToast() {} },
    activeStableId: 'stable', dayLogic: 'loose',
    dirtyDayLogicRef: { current: false }, dirtyHorsesRef: { current: new Map([['horse', new Set(['boxNumber'])]]) },
    horseDrafts: { horse: { boxNumber: '8', canSleepInside: false } },
    stableHorses: [{ id: 'horse', stableId: 'stable', name: 'Mira', boxNumber: '7', canSleepInside: true, note: 'Ny anteckning' }],
    actions: { updateStable: async () => ({ success: true }), upsertHorse: async input => { horseWrites.push(input); return { success: true }; } },
  });
  assert.equal(await callback(), true);
  assert.deepEqual(horseWrites, [{ id: 'horse', stableId: 'stable', boxNumber: '8' }]);
});

test('editing a ride-type description preserves the latest label after refresh', async () => {
  const writes = [];
  const callback = await loadCallback('../app/stables/index.tsx', 'StablesScreen', 'handleSaveRideType', {
    savingSettingsRef: { current: false }, setSavingSettings() {}, setSettingsSaveError() {},
    currentStable: { id: 'stable' }, currentRideTypes: [{ id: 'type', code: 'D', label: 'Ny titel', description: 'Lugnt' }],
    rideTypeDraft: { id: 'type', code: 'D', label: 'Dressyr', description: 'Teknik' },
    rideTypeOriginalRef: { current: { id: 'type', code: 'D', label: 'Dressyr', description: 'Lugnt' } },
    newRideTypeIdRef: { current: null }, generateId: () => 'unused', toast: { showToast() {} }, resetRideTypeDraft() {},
    actions: { updateStable: async input => { writes.push(input); return { success: true }; } },
  });
  await callback();
  assert.deepEqual(writes[0]?.updates.rideTypes, [{ id: 'type', code: 'D', label: 'Ny titel', description: 'Teknik' }]);
});
