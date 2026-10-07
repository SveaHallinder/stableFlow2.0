import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import React from 'react';
import ts from 'typescript';

async function loadSource(path, dependencies, exports) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const body = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast).replace(/^export /, '')).join('\n');
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(dependencies).join(', ')} }) => { ${body}; return { ${exports.join(', ')} }; };`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(dependencies);
}

function sdk(fetch) {
  return createClient('https://stable-invites.invalid', 'synthetic-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
}

const row = (id, stableId = 'A', extra = {}) => ({
  id, stable_id: stableId, email: `${id}@example.test`, role: 'rider', custom_role: null,
  created_at: '2026-10-06T12:00:00Z', expires_at: null, accepted_at: null, ...extra,
});
const response = (data, status = 200) => new globalThis.Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const signal = () => new globalThis.AbortController().signal;

async function loadHelpers(client) {
  return loadSource('../lib/stableInvites.ts', { supabase: client }, ['fetchStableInvites', 'stableInviteStatus', 'MAX_STABLE_INVITES', 'demoStableInvites']);
}

test('actual SDK selects only invitation display fields, scopes the stable and bounds the ordered read', async () => {
  const requests = [];
  let count;
  const helpers = await loadHelpers(sdk(async (url, options) => {
    requests.push({ url: new URL(url), options });
    return response(Array.from({ length: count }, (_, index) => row(`invite-${index}`)));
  }));
  count = helpers.MAX_STABLE_INVITES + 1;
  const abortSignal = signal();
  const result = await helpers.fetchStableInvites('A', abortSignal);
  assert.equal(requests.length, 1);
  const { url, options } = requests[0];
  assert.equal(url.pathname, '/rest/v1/stable_invites');
  assert.equal(url.searchParams.get('stable_id'), 'eq.A');
  assert.equal(url.searchParams.get('select'), 'id,stable_id,email,role,custom_role,created_at,expires_at,accepted_at');
  assert.equal(url.searchParams.get('order'), 'created_at.desc.nullslast,id.desc');
  assert.equal(Number(url.searchParams.get('limit')), count);
  assert.equal(options.method, 'GET');
  assert.equal(options.signal, abortSignal);
  assert.equal(result.invites.length, helpers.MAX_STABLE_INVITES);
  assert.equal(result.truncated, true);
});

test('accepted takes precedence; expiry equality is expired; no deadline stays pending', async () => {
  const { stableInviteStatus } = await loadHelpers(sdk(() => { throw new Error('Unexpected request'); }));
  const now = Date.parse('2026-10-07T12:00:00Z');
  assert.equal(stableInviteStatus(row('accepted', 'A', { accepted_at: '2026-10-01T12:00:00Z', expires_at: '2026-10-02T12:00:00Z' }), now), 'Accepterad');
  assert.equal(stableInviteStatus(row('expired', 'A', { expires_at: '2026-10-07T12:00:00Z' }), now), 'Utgången');
  assert.equal(stableInviteStatus(row('pending', 'A', { expires_at: '2026-10-07T12:00:01Z' }), now), 'Väntande');
  assert.equal(stableInviteStatus(row('no-deadline'), now), 'Väntande');
});

test('SDK empty response is valid; provider and foreign-scope responses fail without exposing raw detail', async () => {
  for (const fixture of [[], { message: 'PRIVATE_PROVIDER_EMAIL@example.test', code: '42501' }, [row('foreign', 'B')], null]) {
    const { fetchStableInvites } = await loadHelpers(sdk(async () => response(fixture, Array.isArray(fixture) || fixture === null ? 200 : 403)));
    if (Array.isArray(fixture) && !fixture.length) {
      assert.deepEqual(await fetchStableInvites('A', signal()), { invites: [], truncated: false });
    } else {
      await assert.rejects(fetchStableInvites('A', signal()), error => error.message === 'Inbjudningarna kunde inte läsas.');
    }
  }
  const { fetchStableInvites } = await loadHelpers(sdk(() => { throw new Error('Unexpected request'); }));
  await assert.rejects(fetchStableInvites('', signal()), /Stall saknas/);
});

function content(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(content).join(' ');
  return tree && typeof tree === 'object' ? content(tree.props?.children) : '';
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

// Execute the actual component effects and event callbacks. The hook driver
// controls commits; the installed SDK talks only to this synthetic transport.
async function componentHarness() {
  const slots = [];
  const pendingEffects = [];
  const requests = [];
  const logs = [];
  let index = 0;
  let unmounted = false;
  let writesAfterUnmount = 0;
  const equalDeps = (before, after) => before && after && before.length === after.length && before.every((value, position) => Object.is(value, after[position]));
  const hooks = {
    ...React,
    useState(initial) {
      const position = index++;
      if (!slots[position]) slots[position] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[position].value, next => {
        if (unmounted) writesAfterUnmount++;
        slots[position].value = typeof next === 'function' ? next(slots[position].value) : next;
      }];
    },
    useMemo(factory, deps) {
      const position = index++;
      if (!equalDeps(slots[position]?.deps, deps)) slots[position] = { deps, value: factory() };
      return slots[position].value;
    },
    useEffect(effect, deps) {
      const position = index++;
      const previous = slots[position];
      if (!equalDeps(previous?.deps, deps)) {
        slots[position] = { deps, effect, cleanup: previous?.cleanup };
        pendingEffects.push(() => {
          slots[position].cleanup?.();
          slots[position].cleanup = effect();
        });
      }
    },
  };
  const fixture = {
    state: {
      currentStableId: 'A', currentUserId: 'owner', sessionUserId: 'owner',
      stables: [{ id: 'A', name: 'Första stallet' }, { id: 'B', name: 'Andra stallet' }],
      users: { owner: { membership: [{ stableId: 'A', role: 'admin', access: 'owner' }, { stableId: 'B', role: 'admin', access: 'owner' }] } },
    },
    auth: { user: { id: 'owner' }, loading: false, pendingAccountDeletionId: null },
  };
  const helpers = await loadHelpers(sdk((url, options) => new Promise((resolve, reject) => requests.push({ url: new URL(url), options, resolve, reject }))));
  const { StableInviteList } = await loadSource('../components/StableInviteList.tsx', {
    React: hooks, StyleSheet: { create: styles => styles, hairlineWidth: 1 }, Text: 'Text', TouchableOpacity: 'TouchableOpacity', View: 'View', Card: 'Card',
    useAppData: () => ({ state: fixture.state }), useAuth: () => fixture.auth, isQaDemoMode: false,
    roleLabels: { rider: 'Ryttare', staff: 'Personal', trainer: 'Tränare' }, theme: { colors: {} },
    console: { warn: (...args) => logs.push(args) }, ...helpers,
  }, ['StableInviteList']);
  const render = (confirmation = null) => { index = 0; return StableInviteList({ confirmation }); };
  const commit = async () => { pendingEffects.splice(0).forEach(effect => effect()); await setImmediate(); };
  const settle = async () => { await setImmediate(); };
  return {
    fixture, requests, logs, render, commit, settle,
    replayEffects: async () => { slots.filter(slot => slot.effect).forEach(slot => { slot.cleanup?.(); slot.cleanup = slot.effect(); }); await setImmediate(); },
    unmount: () => { unmounted = true; slots.forEach(slot => slot.cleanup?.()); },
    writesAfterUnmount: () => writesAfterUnmount,
  };
}

test('owner component reads selected stable, renders persisted roles/statuses, and refreshes only matching confirmation', async () => {
  const view = await componentHarness();
  assert.match(content(view.render()), /Läser inbjudningar/);
  await view.commit();
  assert.equal(view.requests[0].url.searchParams.get('stable_id'), 'eq.A');
  view.requests[0].resolve(response([row('pending'), row('accepted', 'A', { role: 'staff', accepted_at: '2026-10-05T12:00:00Z' }), row('expired', 'A', { custom_role: 'Fodervärd', expires_at: '2020-10-05T12:00:00Z' })]));
  await view.settle();
  const text = content(view.render());
  assert.match(text, /pending@example.test.*Ryttare\s+·\s+Väntande/);
  assert.match(text, /accepted@example.test.*Personal\s+·\s+Accepterad/);
  assert.match(text, /expired@example.test.*Fodervärd\s+·\s+Utgången/);
  assert.match(text, /Mejlleverans är inte bekräftad/);
  const foreign = { email: 'foreign@example.test', codes: [{ stableId: 'B', code: 'B-CODE' }] };
  view.render(foreign); await view.commit();
  assert.equal(view.requests.length, 1);
  const local = { email: 'local@example.test', codes: [{ stableId: 'A', code: 'A-CODE' }] };
  view.render(local); await view.commit();
  assert.equal(view.requests.length, 2);
  assert.match(content(view.render(local)), /Läser inbjudningar/);
  view.requests[1].resolve(response([])); await view.settle();
  assert.match(content(view.render(local)), /Inga inbjudningar i det här stallet ännu/);
});

test('owner gate rejects other-stable ownership, wrong role/access and mismatched or absent sessions without any read', async () => {
  for (const change of [
    fixture => { fixture.state.users.owner.membership[0].role = 'staff'; },
    fixture => { fixture.state.users.owner.membership[0].access = 'edit'; },
    fixture => { fixture.state.users.owner.membership.shift(); },
    fixture => { fixture.auth.user = null; },
    fixture => { fixture.auth.user = { id: 'other-account' }; },
    fixture => { fixture.state.sessionUserId = 'other-account'; },
    fixture => { fixture.auth.loading = true; },
    fixture => { fixture.auth.pendingAccountDeletionId = 'owner'; },
  ]) {
    const view = await componentHarness(); change(view.fixture);
    assert.match(content(view.render()), /Endast ägare i det valda stallet/);
    await view.commit();
    assert.equal(view.requests.length, 0);
  }
});

test('safe failure keeps provider detail out of UI/logs and the actual retry callback recovers', async () => {
  const view = await componentHarness(); view.render(); await view.commit();
  view.requests[0].resolve(response({ message: 'PRIVATE_PROVIDER_EMAIL@example.test', code: '42501' }, 403)); await view.settle();
  const tree = view.render();
  assert.match(content(tree), /Inbjudningarna kunde inte läsas/);
  assert.doesNotMatch(content(tree), /PRIVATE_PROVIDER/);
  assert.deepEqual(view.logs, [['[stable invites] Kunde inte läsa inbjudningslistan.']]);
  nodes(tree).find(node => content(node) === 'Försök igen' && node.props.onPress).props.onPress();
  view.render(); await view.commit();
  assert.equal(view.requests.length, 2);
  view.requests[1].resolve(response([row('recovered')])); await view.settle();
  assert.match(content(view.render()), /recovered@example.test/);
});

test('A→B→A hides old rows before effects and late SDK successes/failures cannot replace the current list', async () => {
  const view = await componentHarness(); view.render(); await view.commit();
  view.requests[0].resolve(response([row('old-a')])); await view.settle();
  assert.match(content(view.render()), /old-a@example.test/);
  view.fixture.state.currentStableId = 'B';
  assert.doesNotMatch(content(view.render()), /old-a@example.test/);
  await view.commit();
  view.fixture.state.currentStableId = 'A';
  assert.doesNotMatch(content(view.render()), /old-a@example.test/);
  await view.commit();
  assert.equal(view.requests.length, 3);
  assert.equal(view.requests[1].options.signal.aborted, true);
  view.requests[2].resolve(response([row('fresh-a')])); await view.settle();
  view.requests[1].resolve(response({ message: 'LATE_PRIVATE_PROVIDER' }, 500)); await view.settle();
  assert.match(content(view.render()), /fresh-a@example.test/);
  assert.doesNotMatch(content(view.render()), /Inbjudningarna kunde inte läsas/);
  assert.deepEqual(view.logs, []);
});

test('permission revocation and session change hide recipients immediately; regrant cannot reuse old rows', async () => {
  const view = await componentHarness(); view.render(); await view.commit();
  view.requests[0].resolve(response([row('private')])); await view.settle();
  assert.match(content(view.render()), /private@example.test/);
  view.fixture.state.users.owner.membership[0].access = 'view';
  assert.doesNotMatch(content(view.render()), /private@example.test/);
  await view.commit();
  view.fixture.state.users.owner.membership[0].access = 'owner';
  assert.doesNotMatch(content(view.render()), /private@example.test/);
  await view.commit();
  view.fixture.auth.user = { id: 'new-account' };
  assert.doesNotMatch(content(view.render()), /private@example.test/);
  await view.commit();
  view.requests[1].resolve(response([row('late-private')])); await view.settle();
  assert.doesNotMatch(content(view.render()), /late-private/);
});

test('unmount and StrictMode cleanup abort reads and suppress every late state write/error', async () => {
  const view = await componentHarness(); view.render(); await view.commit();
  await view.replayEffects();
  assert.equal(view.requests.length, 2);
  assert.equal(view.requests[0].options.signal.aborted, true);
  view.requests[1].resolve(response([row('strict-current')])); await view.settle();
  view.requests[0].resolve(response([row('strict-stale')])); await view.settle();
  assert.match(content(view.render()), /strict-current/);
  assert.doesNotMatch(content(view.render()), /strict-stale/);
  nodes(view.render()).find(node => content(node) === 'Uppdatera inbjudningar' && node.props.onPress).props.onPress();
  view.render(); await view.commit();
  view.unmount();
  assert.equal(view.requests[2].options.signal.aborted, true);
  view.requests[2].reject(new Error('PRIVATE_UNMOUNT_FAILURE')); await view.settle();
  assert.equal(view.writesAfterUnmount(), 0);
  assert.deepEqual(view.logs, []);
});
