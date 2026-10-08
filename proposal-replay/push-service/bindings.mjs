import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

const freezeBytes = await readFile(new URL('./source-freeze.json', import.meta.url));
assert.equal(createHash('sha256').update(freezeBytes).digest('hex'),
  '53527086f50cb1af8c57d8773360416b525b5d4effb4db4c01515f2420b10c12',
  '[push service replay] Original source-freeze SHA mismatch');
const freeze = JSON.parse(freezeBytes.toString('utf8'));
const paths = {
  'source/supabase/functions/_shared/push-receipts.ts': 'fixtures/push-receipts.ts.txt',
  'source/supabase/functions/send-push-notification/index.ts': 'fixtures/send-push-notification.ts.txt',
  'source/supabase/functions/collect-push-receipts/index.ts': 'fixtures/collect-push-receipts.ts.txt',
  'tests/push-delivery.test.mjs': 'tests/push-delivery.test.mjs.txt',
  'tests/push-receipts.test.mjs': 'tests/push-receipts.test.mjs.txt',
};
const sourceNames = {
  'push-receipts': 'source/supabase/functions/_shared/push-receipts.ts',
  'send-push-notification': 'source/supabase/functions/send-push-notification/index.ts',
  'collect-push-receipts': 'source/supabase/functions/collect-push-receipts/index.ts',
};

async function readBoundFile(original) {
  assert.ok(Object.hasOwn(paths, original), '[push service replay] Unknown fixture');
  const bytes = await readFile(new URL(paths[original], import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), freeze.files[original],
    '[push service replay] Frozen input SHA mismatch: ' + original);
  return bytes.toString('utf8');
}

export async function readFrozenSource(name) {
  assert.ok(Object.hasOwn(sourceNames, name), '[push service replay] Unknown source');
  return readBoundFile(sourceNames[name]);
}

export async function readFrozenSuite(name) {
  assert.ok(['push-delivery', 'push-receipts'].includes(name), '[push service replay] Unknown suite');
  return readBoundFile('tests/' + name + '.test.mjs');
}

export async function verifyFrozenInputs() {
  assert.equal(freeze.base_head, 'b0b5ee71a9577d3ae2b7605874befc76f55efc7f');
  for (const original of Object.keys(paths)) await readBoundFile(original);
  return { base_head: freeze.base_head, fixture_sha256: Object.fromEntries(
    Object.keys(paths).map(original => [paths[original], freeze.files[original]])),
  };
}
