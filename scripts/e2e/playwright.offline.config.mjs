import { connect } from 'node:net';
import { URL } from 'node:url';
import config from './playwright.config.mjs';

function isLoopbackUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol)
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && !url.username && !url.password;
  } catch {
    return false;
  }
}

if (!isLoopbackUrl(config.use.baseURL)) {
  throw new Error('[offline e2e] E2E_URL must use http(s) on localhost, 127.0.0.1 or [::1], without credentials.');
}

// Unhandled external HTTP and WebSockets use this unavailable local proxy.
// Reject an occupied port rather than trusting an unrelated local proxy service.
await new Promise((resolve, reject) => {
  const socket = connect({ host: '127.0.0.1', port: 9 });
  socket.once('connect', () => {
    socket.destroy();
    reject(new Error('[offline e2e] Proxy port 127.0.0.1:9 is occupied. Stop that listener before running offline QA.'));
  });
  socket.once('error', error => {
    socket.destroy();
    if (error.code === 'ECONNREFUSED') resolve();
    else reject(new Error('[offline e2e] Could not verify that proxy port 127.0.0.1:9 is unavailable.'));
  });
  socket.setTimeout(1_000, () => {
    socket.destroy();
    reject(new Error('[offline e2e] Timed out checking proxy port 127.0.0.1:9. Offline QA was not started.'));
  });
});

const proxy = { server: 'http://127.0.0.1:9', bypass: 'localhost,127.0.0.1,[::1]' };

export default {
  ...config,
  testDir: '.',
  testMatch: [
    '**/account-delete-quality.spec.mjs',
    '**/auth-reset.spec.mjs',
    '**/auth-submit-recovery.spec.mjs',
    '**/autumn-ui.spec.mjs',
    '**/core-stable-workflow.spec.mjs',
    '**/daily-work-quality.spec.mjs',
    '**/horse-management-quality.spec.mjs',
    '**/horse-save-timeout.spec.mjs',
    '**/invite-acceptance.spec.mjs',
    '**/invite-receipt.spec.mjs',
    '**/paddock-horse-ids.spec.mjs',
    '**/paddock-save-failure.spec.mjs',
    '**/pilot-db-conflicts.spec.mjs',
    '**/pilot-member-layout.spec.mjs',
    '**/stable-usability.spec.mjs',
  ],
  use: { ...config.use, proxy, serviceWorkers: 'block' },
  projects: config.projects.map(project => ({
    ...project,
    use: { ...project.use, proxy, serviceWorkers: 'block' },
  })),
};
