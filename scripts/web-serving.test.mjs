import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { URL } from 'node:url';
import { createWebServer } from './serve-web.mjs';

const html = '<!doctype html><html><body>synthetic export</body></html>';

async function fixture() {
  const directory = await mkdtemp('/tmp/sf-web-serving-');
  const dist = join(directory, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await mkdir(join(dist, '_expo/static/js'), { recursive: true });
  await writeFile(join(dist, 'index.html'), html);
  await writeFile(join(dist, '_expo/static/js/entry.js'), 'synthetic javascript');
  await writeFile(join(dist, 'assets/style.css'), 'body {}');
  await writeFile(join(dist, 'assets/font.woff2'), Buffer.from([0, 1, 2, 255]));
  await writeFile(join(dist, 'assets/image.png'), Buffer.from([137, 80, 78, 71]));
  await writeFile(join(dist, 'metadata.json'), '{"synthetic":true}');
  await writeFile(join(dist, '.env'), 'synthetic hidden file');
  await writeFile(join(directory, 'outside.txt'), 'synthetic outside file');
  await symlink(join(directory, 'outside.txt'), join(dist, 'outside.txt'));
  await symlink(directory, join(dist, 'external'));
  await symlink(join(dist, '.env'), join(dist, 'hidden-link'));
  return { directory, dist };
}

function get(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, agent: false }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

async function withServer(run) {
  const files = await fixture();
  const logs = [];
  let server;
  try {
    server = await createWebServer({ distDirectory: files.dist, logger: {
      warn: (...args) => logs.push(args), error: (...args) => logs.push(args),
    } });
    assert.equal(server.listening, false, 'Import and creation must not start a listener');
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    await run({ ...files, port: server.address().port, logs });
  } finally {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await rm(files.directory, { recursive: true, force: true });
  }
}

test('exported SPA serves root, auth redirects and direct app routes', async () => {
  await withServer(async ({ port }) => {
    for (const path of ['/', '/index.html', '/confirm?access_token=synthetic-token', '/reset', '/horses/synthetic-id', '/members']) {
      const result = await get(port, path);
      assert.equal(result.status, 200, path);
      assert.equal(result.headers['content-type'], 'text/html; charset=utf-8');
      assert.equal(result.body.toString(), html);
    }
    const head = await get(port, '/reset', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    assert.equal(Number(head.headers['content-length']), Buffer.byteLength(html));
  });
});

test('static assets preserve MIME and binary bodies; missing assets return 404', async () => {
  await withServer(async ({ port }) => {
    for (const [path, mime, body] of [
      ['/_expo/static/js/entry.js', 'text/javascript; charset=utf-8', Buffer.from('synthetic javascript')],
      ['/assets/style.css', 'text/css; charset=utf-8', Buffer.from('body {}')],
      ['/assets/font.woff2', 'font/woff2', Buffer.from([0, 1, 2, 255])],
      ['/assets/image.png', 'image/png', Buffer.from([137, 80, 78, 71])],
      ['/metadata.json', 'application/json; charset=utf-8', Buffer.from('{"synthetic":true}')],
    ]) {
      const result = await get(port, path);
      assert.equal(result.status, 200);
      assert.equal(result.headers['content-type'], mime);
      assert.equal(result.headers['x-content-type-options'], 'nosniff');
      assert.deepEqual(result.body, body);
      const head = await get(port, path, 'HEAD');
      assert.equal(head.body.length, 0);
      assert.equal(Number(head.headers['content-length']), body.length);
    }
    for (const path of ['/missing.js', '/_expo/missing', '/assets/missing.png', '/assets/missing', '/assets']) {
      const result = await get(port, path);
      assert.equal(result.status, 404, path);
      assert.notEqual(result.body.toString(), html);
    }
    const missingHead = await get(port, '/assets/missing.png', 'HEAD');
    assert.equal(missingHead.status, 404);
    assert.equal(missingHead.body.length, 0);
  });
});

test('encoded traversal, dotfiles and escaping or hidden symlinks cannot expose files', async () => {
  await withServer(async ({ port, logs }) => {
    for (const path of ['/../outside.txt', '/%2e%2e/outside.txt', '/assets/%2e%2e/%2e%2e/outside.txt', '/assets%2f..%2f..%2foutside.txt', '/.env', '/%2eenv', '/outside.txt', '/external/outside.txt', '/hidden-link', '/%5c..%5coutside.txt', '/%00outside']) {
      const result = await get(port, `${path}?access_token=synthetic-secret`);
      assert.equal(result.status, 404, path);
      assert.doesNotMatch(result.body.toString(), /synthetic outside|synthetic hidden/);
    }
    assert.equal((await get(port, '/%zz')).status, 400);
    assert.ok(logs.every(([message]) => message.startsWith('[web serve]')));
    assert.doesNotMatch(JSON.stringify(logs), /synthetic-secret|outside\.txt|sf-web-serving-/);
  });
});

test('health identifies served HTML and rejected methods never publish request details', async () => {
  await withServer(async ({ port, logs }) => {
    const result = await get(port, '/healthz');
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(result.body), {
      status: 'ok', service: 'stableflow-web',
      exportIndexSha256: createHash('sha256').update(html).digest('hex'),
    });
    assert.equal((await get(port, '/healthz', 'HEAD')).body.length, 0);
    const rejected = await get(port, '/reset?token=synthetic-secret', 'POST');
    assert.equal(rejected.status, 405);
    assert.equal(rejected.headers.allow, 'GET, HEAD');
    assert.match(rejected.body.toString(), /^\[web serve\]/);
    assert.doesNotMatch(JSON.stringify(logs), /synthetic-secret|reset/);
  });
});

test('unreadable asset returns a feature error without leaking the filesystem path', async () => {
  await withServer(async ({ port, dist, logs }) => {
    await chmod(join(dist, 'assets/style.css'), 0);
    const result = await get(port, '/assets/style.css?token=synthetic-secret');
    assert.equal(result.status, 500);
    assert.match(result.body.toString(), /^\[web serve\]/);
    assert.ok(logs.some(([message]) => message === '[web serve] File serving failed'));
    assert.doesNotMatch(JSON.stringify(logs), /synthetic-secret|style\.css|sf-web-serving-/);
  });
});

test('missing or escaping index prevents startup before listening, including the CLI', async () => {
  const files = await fixture();
  try {
    const linkedDist = join(files.directory, 'linked-dist');
    await symlink(files.dist, linkedDist);
    await assert.rejects(createWebServer({ distDirectory: linkedDist }), /\[web serve\]/);
    await rm(join(files.dist, 'index.html'));
    await assert.rejects(createWebServer({ distDirectory: files.dist }), /\[web serve\].*npm run build:web/);
    await mkdir(join(files.directory, 'scripts'));
    const script = join(files.directory, 'scripts/serve-web.mjs');
    await copyFile(new URL('./serve-web.mjs', import.meta.url), script);
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, PORT: '8080' }, encoding: 'utf8', timeout: 5_000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.doesNotMatch(result.stdout, /Listening/);
    assert.match(result.stderr, /^\[web serve\]/);
    assert.doesNotMatch(result.stderr, /sf-web-serving-/);
    await symlink(join(files.directory, 'outside.txt'), join(files.dist, 'index.html'));
    await assert.rejects(createWebServer({ distDirectory: files.dist }), /\[web serve\]/);
    await rm(join(files.dist, 'index.html'));
    await writeFile(join(files.dist, 'index.html'), '');
    await assert.rejects(createWebServer({ distDirectory: files.dist }), /\[web serve\]/);
    const invalidPort = spawnSync(process.execPath, [script], {
      env: { ...process.env, PORT: 'synthetic-secret' }, encoding: 'utf8', timeout: 5_000,
    });
    assert.equal(invalidPort.status, 1);
    assert.doesNotMatch(invalidPort.stderr, /synthetic-secret/);
  } finally { await rm(files.directory, { recursive: true, force: true }); }
});
