import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

async function loadAction(name, dependencies) {
  const source = await readFile(new URL('../context/AppDataContext.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('AppDataContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const provider = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppDataProvider');
  const declaration = provider.body.statements.filter(ts.isVariableStatement)
    .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(ast) === name);
  const callback = declaration.initializer.arguments[0].getText(ast);
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => (${callback});`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

function setup(overrides = {}) {
  const member = {
    id: 'member', name: 'Lisa',
    membership: [{ stableId: 'stable', role: 'staff', access: 'edit', horseIds: ['horse'] }],
  };
  const dispatched = [];
  return {
    dispatched, member,
    dependencies: {
      stateRef: { current: { currentUserId: 'owner', users: { member }, horses: [{ id: 'horse', stableId: 'stable' }] } },
      ensurePermission: () => ({ success: true }), countStableOwners: () => 2,
      dispatch: action => dispatched.push(action), refreshData: async () => ({ success: true }),
      pendingDataWrites: { current: new Set() }, dataWriteVersion: { current: 0 },
      trackDataWrite: promise => promise, console: { warn() {} },
      persistStableMemberUpdate: async () => ({ success: false, reason: 'QA failure' }),
      persistStableMemberDelete: async () => ({ success: false, reason: 'QA failure' }),
      ...overrides,
    },
  };
}

const cases = [
  ['updateMemberRole', action => action({ userId: 'member', stableId: 'stable', role: 'rider' })],
  ['updateMemberHorseIds', action => action({ userId: 'member', stableId: 'stable', horseIds: [] })],
  ['removeMemberFromStable', action => action('member', 'stable')],
];

for (const [name, invoke] of cases) {
  test(`${name} retains membership until acknowledgement and after a rejected write`, async () => {
    let finish;
    const operation = new Promise(resolve => { finish = resolve; });
    const { dependencies, dispatched } = setup({
      persistStableMemberUpdate: () => operation, persistStableMemberDelete: () => operation,
    });
    const action = await loadAction(name, dependencies);
    const result = invoke(action);
    try {
      assert.equal(dispatched.length, 0, 'Do not show changed access before the server confirms it');
      assert.equal(dependencies.pendingDataWrites.current.size, 1);
    } finally {
      finish({ success: false, reason: 'QA rejected membership write' });
    }
    assert.equal((await result).success, false);
    assert.equal(dispatched.length, 0);
    assert.equal(dependencies.pendingDataWrites.current.size, 0);
  });

  test(`${name} respects another in-flight edit of this membership`, async () => {
    let writes = 0;
    const { dependencies, dispatched } = setup({
      pendingDataWrites: { current: new Set(['member:stable:member']) },
      persistStableMemberUpdate: async () => { writes += 1; return { success: true }; },
      persistStableMemberDelete: async () => { writes += 1; return { success: true }; },
    });
    const result = await invoke(await loadAction(name, dependencies));
    assert.equal(result.success, false);
    assert.equal(writes, 0);
    assert.equal(dispatched.length, 0);
  });
}

test('confirmed role edits preserve concurrent changes to another stable and use server membership', async () => {
  let finish;
  let sentUpdates;
  const operation = new Promise(resolve => { finish = resolve; });
  const { dependencies, dispatched, member } = setup({
    persistStableMemberUpdate: (_stable, _user, updates) => { sentUpdates = updates; return operation; },
  });
  const action = await loadAction('updateMemberRole', dependencies);
  const pending = action({ userId: 'member', stableId: 'stable', role: 'rider' });
  const otherMembership = { stableId: 'another-stable', role: 'admin', access: 'owner' };
  dependencies.stateRef.current.users.member = { ...member, membership: [...member.membership, otherMembership] };
  const confirmed = { stableId: 'stable', role: 'rider', access: 'edit', horseIds: ['server-horse'], riderRole: 'medryttare' };
  finish({ success: true, data: confirmed });
  assert.equal((await pending).success, true);
  assert.equal('horseIds' in sentUpdates, false, 'Changing role must not rewrite stale horse assignments');
  assert.deepEqual(dispatched.at(-1).payload.updates.membership, [confirmed, otherMembership]);
});

test('removing a membership uses current user data and keeps membership in other stables', async () => {
  let finish;
  const operation = new Promise(resolve => { finish = resolve; });
  const { dependencies, dispatched, member } = setup({ persistStableMemberDelete: () => operation });
  const pending = (await loadAction('removeMemberFromStable', dependencies))('member', 'stable');
  const otherMembership = { stableId: 'another-stable', role: 'rider', access: 'view' };
  dependencies.stateRef.current.users.member = { ...member, membership: [...member.membership, otherMembership] };
  finish({ success: true });
  assert.equal((await pending).success, true);
  assert.deepEqual(dispatched.at(-1).payload.updates.membership, [otherMembership]);
});

for (const [name, invoke] of cases.filter(([name]) => name !== 'updateMemberHorseIds')) {
  test(`${name} preserves the last-owner guard`, async () => {
    let writes = 0;
    const { dependencies, dispatched, member } = setup({
      countStableOwners: () => 1,
      persistStableMemberUpdate: async () => { writes += 1; return { success: true }; },
      persistStableMemberDelete: async () => { writes += 1; return { success: true }; },
    });
    member.membership[0] = { stableId: 'stable', role: 'admin', access: 'owner' };
    assert.equal((await invoke(await loadAction(name, dependencies))).success, false);
    assert.equal(writes, 0);
    assert.equal(dispatched.length, 0);
  });
}

for (const name of ['persistStableMemberUpdate', 'persistStableMemberDelete']) {
  test(`${name} rejects a successful HTTP response without an acknowledged row`, async () => {
    const query = { then: resolve => Promise.resolve(resolve({ data: [], error: null })) };
    for (const method of ['update', 'delete', 'eq', 'select', 'abortSignal', 'single', 'maybeSingle']) {
      query[method] = () => query;
    }
    const action = await loadAction(name, {
      user: { id: 'owner' }, isQaDemoMode: false, supabase: { from: () => query },
      hasOwnProperty: (value, key) => Object.prototype.hasOwnProperty.call(value, key),
      reportPersistErrorRef: { current() {} }, console: { warn() {} },
    });
    const result = await action('stable', 'member', { role: 'rider' });
    assert.equal(result?.success, false);
  });
}

test('member persistence returns the acknowledged membership and confirms deletion identities', async () => {
  const row = { stable_id: 'stable', user_id: 'member', role: 'rider', access: 'view', horse_ids: ['horse'] };
  for (const name of ['persistStableMemberUpdate', 'persistStableMemberDelete']) {
    const query = { then: resolve => Promise.resolve(resolve({ data: name.endsWith('Update') ? row : [row], error: null })) };
    for (const method of ['update', 'delete', 'eq', 'select', 'abortSignal', 'single', 'maybeSingle']) query[method] = () => query;
    const action = await loadAction(name, {
      user: { id: 'owner' }, isQaDemoMode: false, supabase: { from: () => query },
      hasOwnProperty: (value, key) => Object.prototype.hasOwnProperty.call(value, key),
      reportPersistErrorRef: { current() {} }, console: { warn() {} },
    });
    const result = await action('stable', 'member', { role: 'rider' });
    assert.equal(result.success, true);
    if (name.endsWith('Update')) assert.deepEqual(result.data, {
      stableId: 'stable', role: 'rider', access: 'view', horseIds: ['horse'],
      customRole: undefined, riderRole: undefined,
    });
  }
});
