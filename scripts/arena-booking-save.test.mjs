import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadAction(name, dependencies) {
  const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
  const declaration = provider.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === name);
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

for (const operation of ['add', 'update', 'delete']) {
  test(`arena booking ${operation} requires acknowledgement before changing the calendar`, async () => {
    const dispatched = [];
    const booking = { id: 'booking', stableId: 'stable', date: '2026-09-08', startTime: '17:00', endTime: '18:00', purpose: 'Dressyr' };
    const state = { currentStableId: 'stable', currentUserId: 'user', arenaBookings: operation === 'add' ? [] : [booking] };
    const action = await loadAction({ add: 'addArenaBooking', update: 'updateArenaBooking', delete: 'removeArenaBooking' }[operation], {
      stateRef: { current: state }, ensurePermission: () => ({ success: true }), isValidISODate: () => true, isValidTime: () => true,
      dispatch: value => dispatched.push(value), generateId: () => 'booking', trackDataWrite() {},
      pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
      persistArenaBookingInsert: async () => ({ success: false, reason: 'QA missing receipt' }),
      persistArenaBookingUpdate: async () => ({ success: false, reason: 'QA missing receipt' }),
      persistArenaBookingDelete: async () => ({ success: false, reason: 'QA missing receipt' }),
    });
    const input = operation === 'add' ? booking : operation === 'update' ? { id: 'booking', updates: { note: 'Behåll text' } } : 'booking';
    assert.equal((await action(input)).success, false);
    assert.deepEqual(dispatched, []);
  });
}

test('changing only booking time leaves the current purpose and note off the wire', async () => {
  const existing = { id: 'booking', stableId: 'stable', date: '2026-09-08', startTime: '17:00', endTime: '18:00', purpose: 'Dressyr', note: 'Gammal lokal text' };
  let sent;
  const action = await loadAction('updateArenaBooking', {
    stateRef: { current: { arenaBookings: [existing] } }, ensurePermission: () => ({ success: true }),
    isValidISODate: () => true, isValidTime: () => true, dispatch() {},
    pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
    persistArenaBookingUpdate: async (booking, updates) => { sent = updates; return { success: true, data: { ...booking, ...updates } }; },
  });
  assert.equal((await action({ id: 'booking', updates: { startTime: '17:30' } })).success, true);
  assert.deepEqual(sent, { startTime: '17:30' });
});
