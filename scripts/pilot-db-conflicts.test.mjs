import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const overlapCopy = 'Tiden blev bokad av någon annan. Uppdatera schemat och välj en annan tid. Dina uppgifter finns kvar.';
const ownerCopy = 'Stallet måste ha minst en ägare. Utse en ny ägare först.';
const concurrencyCopy = 'Uppgifterna ändrades samtidigt på en annan telefon. Uppdatera och försök igen.';

async function invokePersist(name, error) {
  const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
  const declaration = provider.body.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === name);
  const query = { then: resolve => Promise.resolve(resolve({ data: null, error })) };
  for (const method of ['insert', 'update', 'delete', 'eq', 'select', 'abortSignal', 'single']) query[method] = () => query;
  const dependencies = {
    user: { id: 'owner' }, isQaDemoMode: false, supabase: { from: () => query },
    hasOwnProperty: (value, key) => Object.prototype.hasOwnProperty.call(value, key), console: { warn() {} },
  };
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const action = (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
  const booking = { id: 'booking', stableId: 'stable', date: '2026-10-01', startTime: '17:00', endTime: '18:00', purpose: 'Dressyr', bookedByUserId: 'owner' };
  return name.startsWith('persistArena') ? action(booking, { startTime: '17:30' }) : action('stable', 'member', { role: 'staff' });
}

const arena = ['persistArenaBookingInsert', 'persistArenaBookingUpdate', 'persistArenaBookingDelete'];
const members = ['persistStableMemberUpdate', 'persistStableMemberDelete'];

for (const name of [...arena, ...members]) {
  for (const code of ['40001', '40P01']) {
    test(`${name} explains ${code} as a concurrent change requiring refresh`, async () => {
      assert.deepEqual(await invokePersist(name, { code, message: 'Synthetic transaction conflict' }), { success: false, reason: concurrencyCopy });
    });
  }
}

for (const name of arena.filter(name => !name.endsWith('Delete'))) {
  test(`${name} explains the server overlap and retains the draft`, async () => {
    assert.deepEqual(await invokePersist(name, { code: '23P01', message: '[arena overlap] Tiden är redan bokad.' }), { success: false, reason: overlapCopy });
  });
}

for (const name of members) {
  test(`${name} explains a rejected removal of the last owner`, async () => {
    assert.deepEqual(await invokePersist(name, { code: '23514', message: '[last owner] Stallet måste ha minst en ägare.' }), { success: false, reason: ownerCopy });
  });
  test(`${name} does not mislabel another check violation as the last-owner guard`, async () => {
    const result = await invokePersist(name, { code: '23514', message: '[another feature] Invalid field.' });
    assert.equal(result.success, false);
    assert.notEqual(result.reason, ownerCopy);
    assert.match(result.reason, /Medlemsändringen kunde inte sparas|Medlemmen kunde inte tas bort/);
  });
}
