import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFrozenSource, readFrozenSuite } from '../bindings.mjs';
import { createRequire } from 'node:module';
import { URL } from 'node:url';

const require = createRequire(new URL('../../../package.json', import.meta.url));
export const ts = require('typescript');
export const { createClient } = require('@supabase/supabase-js');
const shared = await readFrozenSource('push-receipts');
const sharedOutput = ts.transpileModule(shared, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
export const helpers = await import(`data:text/javascript;base64,${Buffer.from(sharedOutput).toString('base64')}`);

export function uuid(value) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

export function response(value, status = 200) {
  return new globalThis.Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function initializeEdge(name, dependencies) {
  assert.ok(['send-push-notification', 'collect-push-receipts'].includes(name));
  const source = await readFrozenSource(name);
  const ast = ts.createSourceFile(name + '.ts', source, ts.ScriptTarget.Latest, true);
  const body = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n');
  const supplied = {
    ...helpers,
    ...dependencies,
    sendPushTargets: (client, attempt, targets) => helpers.sendPushTargets(client, attempt, targets, dependencies.fetch),
    collectPushReceipts: (client, worker, limit) => helpers.collectPushReceipts(client, worker, limit, dependencies.fetch),
  };
  const { outputText } = ts.transpileModule(`export default ({ ${Object.keys(supplied).join(', ')} }) => { ${body} };`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default(supplied);
}

// Only the relative helper import changes; all frozen assertions execute unchanged.
export async function initializeFrozenSuite(name) {
  const source = await readFrozenSuite(name);
  const dependency = "from './helpers.mjs'";
  assert.equal(source.split(dependency).length, 2, '[push service replay] Expected one helper import');
  const linked = source.replace(dependency, 'from ' + JSON.stringify(new URL('./helpers.mjs', import.meta.url).href));
  await import(`data:text/javascript;base64,${Buffer.from(linked).toString('base64')}`);
}
