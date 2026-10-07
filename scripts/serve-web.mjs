import { Buffer } from 'node:buffer';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const defaultDist = fileURLToPath(new URL('../dist/', import.meta.url));
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
};

async function readExportFile(root, pathname) {
  let handle;
  try {
    const target = await realpath(resolve(root, `.${pathname}`));
    const parts = relative(root, target).split(sep);
    if (parts.some(part => part.startsWith('.')) || !parts[0]) {
      throw Object.assign(new Error('Blocked export path'), { code: 'WEB_BLOCKED_PATH' });
    }
    handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!(await handle.stat()).isFile()) return null;
    return await handle.readFile();
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  } finally {
    await handle?.close();
  }
}

function respond(request, response, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
  response.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

export async function createWebServer({ distDirectory = defaultDist, logger = console } = {}) {
  let root, index;
  try {
    if (!(await lstat(distDirectory)).isDirectory()) throw new Error('Invalid export directory');
    root = await realpath(distDirectory);
    index = await readExportFile(root, '/index.html');
    if (!index?.length) throw new Error('Missing index');
  } catch {
    throw new Error('[web serve] Web-export saknas eller kunde inte läsas. Kör npm run build:web före start.');
  }

  // Identifies the actual cached entry HTML; it does not claim a Git commit.
  const health = JSON.stringify({
    status: 'ok',
    service: 'stableflow-web',
    exportIndexSha256: createHash('sha256').update(index).digest('hex'),
  });
  return createServer(async (request, response) => {
    const reject = (status, reason, message, headers) => {
      logger.warn('[web serve] Request rejected', { status, reason });
      respond(request, response, status, `[web serve] ${message}\n`, undefined, headers);
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      reject(405, 'method_not_allowed', 'Endast GET och HEAD stöds.', { Allow: 'GET, HEAD' });
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent((request.url ?? '').split(/[?#]/, 1)[0]);
    } catch {
      reject(400, 'invalid_path_encoding', 'Ogiltig webbadress.');
      return;
    }
    if (!pathname.startsWith('/') || /[\u0000-\u001f\u007f\\]/.test(pathname)
      || pathname.split('/').some(part => part.startsWith('.'))) {
      reject(404, 'blocked_path', 'Webbfilen hittades inte.');
      return;
    }
    if (pathname === '/healthz') {
      respond(request, response, 200, health, 'application/json; charset=utf-8');
      return;
    }
    if (pathname === '/' || pathname === '/index.html') {
      respond(request, response, 200, index, mimeTypes['.html']);
      return;
    }
    try {
      const content = await readExportFile(root, pathname);
      if (content !== null) {
        respond(request, response, 200, content, mimeTypes[extname(pathname).toLowerCase()] ?? 'application/octet-stream');
      } else if (extname(pathname) || /^\/(assets|_expo)(\/|$)/.test(pathname)) {
        reject(404, 'asset_not_found', 'Webbfilen hittades inte.');
      } else {
        respond(request, response, 200, index, mimeTypes['.html']);
      }
    } catch (error) {
      if (error.code === 'WEB_BLOCKED_PATH' || error.code === 'ELOOP') {
        reject(404, 'blocked_path', 'Webbfilen hittades inte.');
        return;
      }
      logger.error('[web serve] File serving failed', {
        code: /^E[A-Z0-9_]{1,32}$/.test(error.code ?? '') ? error.code : 'Unknown',
      });
      respond(request, response, 500, '[web serve] Webbfilen kunde inte läsas. Försök igen.\n');
    }
  });
}

async function main() {
  const value = process.env.PORT ?? '8080';
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error('[web serve] PORT måste vara ett heltal mellan 1 och 65535.');
  }
  const server = await createWebServer();
  await new Promise((resolveReady, reject) => {
    server.once('error', reject);
    server.listen(Number(value), '0.0.0.0', resolveReady);
  });
  console.info('[web serve] Listening', { port: Number(value) });
  const stop = () => server.close(() => { process.exitCode = 0; });
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

const invokedPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => null) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('[web serve] Kunde inte starta webbservern. Kontrollera PORT och kör npm run build:web före start.');
    process.exitCode = 1;
  });
}
