import assert from 'node:assert/strict';
import { after } from 'node:test';
import { verifyFrozenInputs } from '../proposal-replay/push-service/bindings.mjs';

const binding = await verifyFrozenInputs();
console.log('[push service replay] ' + JSON.stringify(binding));
const originalFetch = globalThis.fetch;
let externalRequests = 0;
globalThis.fetch = async () => {
  externalRequests += 1;
  throw new Error('[push service replay] External HTTP is forbidden');
};
after(() => {
  try {
    assert.equal(externalRequests, 0, '[push service replay] Unexpected external HTTP attempt');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const { initializeFrozenSuite } = await import('../proposal-replay/push-service/tests/helpers.mjs');
await initializeFrozenSuite('push-delivery');
await initializeFrozenSuite('push-receipts');
