import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { promisify } from 'node:util';

const repo = fileURLToPath(new URL('..', import.meta.url));
const fixtures = new URL('./fixtures/push-ownership/', import.meta.url);
const digest = value => createHash('sha256').update(value).digest('hex');
const bindingsBytes = await readFile(new URL('bindings.json', fixtures));
assert.equal(digest(bindingsBytes), '5eb10a6ed632f740bc11baf67f4ce5be35d7ab1697dc67ff13d809841431c58c', 'Push ownership fixture bindings changed');
const bindings = JSON.parse(bindingsBytes);
const verified = new Map();
for (const [name, expected] of Object.entries(bindings.fixtureHashes)) {
  const bytes = await readFile(new URL(name, fixtures));
  assert.equal(digest(bytes), expected, `Push ownership fixture changed: ${name}`);
  verified.set(name, bytes);
}
assert.equal(bindings.scenarios.reduce((total, scenario) => total + scenario.names.length, 0), 33);

async function runHarnesses() {
  // Fixture hashes above are checked before creating any directory/process.
  const directory = await mkdtemp(join(tmpdir(), 'sf-push-ownership-'));
  try {
    for (const folder of ['tests', 'source', 'reports', 'baseline/lib']) {
      await mkdir(join(directory, folder), { recursive: true });
    }
    await symlink(join(repo, 'node_modules'), join(directory, 'node_modules'), 'dir');
    for (const name of ['ownership-overlay.test.mjs', 'primary-session-mutation.test.mjs']) {
      await writeFile(join(directory, 'tests', name), verified.get(`${name}.txt`));
    }
    await writeFile(join(directory, 'baseline/lib/supabase.ts'), verified.get('baseline-supabase.ts.txt'));
    for (const path of bindings.sources) {
      const target = join(directory, 'source', path);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(repo, path), target);
    }
    const environment = {};
    for (const key of ['PATH', 'LANG', 'LC_ALL']) {
      if (process.env[key] !== undefined) environment[key] = process.env[key];
    }
    const execute = promisify(execFile);
    // Node 24 supplies native navigator.locks. These fixtures model a web
    // without it, then explicitly install their own shared LockManager case.
    const runtimeFlags = process.allowedNodeEnvironmentFlags.has('--no-experimental-global-navigator')
      ? ['--no-experimental-global-navigator'] : [];
    const outcomes = await Promise.allSettled(bindings.scenarios.map(async scenario => {
      let exitCode = 0;
      try {
        await execute(process.execPath, [...runtimeFlags, join(directory, 'tests', scenario.harness), ...scenario.args], {
          cwd: directory, env: environment, encoding: 'utf8', timeout: 45000, maxBuffer: 2 * 1024 * 1024,
        });
      } catch (error) {
        // Assertion failures are surfaced as their original named cases.
        // A timeout/signal or a missing report aborts every affected assertion.
        assert.equal(typeof error.code, 'number', 'Push ownership harness did not finish');
        exitCode = error.code;
      }
      const report = JSON.parse(await readFile(join(directory, 'reports', scenario.report), 'utf8'));
      assert.equal(report.mode, 'source');
      assert.equal(report.unmockedExternalFetchAttempts, 0);
      assert.deepEqual(report.cases.map(item => item.name), scenario.names);
      assert.equal(report.total, scenario.names.length);
      assert.equal(report.passed, report.cases.filter(item => item.passed === true).length);
      assert.equal(exitCode, report.passed === report.total ? 0 : 1);
      return report;
    }));
    const failed = outcomes.find(outcome => outcome.status === 'rejected');
    if (failed) throw failed.reason;
    return outcomes.map(outcome => outcome.value);
  } finally {
    // Removes the task-owned symlink and temporary reports, never repo deps.
    await rm(directory, { recursive: true, force: true });
  }
}

const results = runHarnesses();
// Register all 33 tests even if required production source is still absent.
// Each child has its own SDK/global transport; the parent never alters fetch.
for (const [index, scenario] of bindings.scenarios.entries()) {
  for (const [caseIndex, name] of scenario.names.entries()) {
    test(`push ownership ${scenario.label}: ${name}`, async () => {
      const reports = await results;
      const item = reports[index].cases[caseIndex];
      assert.equal(item.passed, true, item.error ?? `Push ownership case failed: ${name}`);
    });
  }
}
