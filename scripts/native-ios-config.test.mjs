import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve('expo/package.json'));
const plist = expoRequire('@expo/plist').default;
const config = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8')).expo;
const info = plist.parse(await readFile(new URL('../ios/StableFlow/Info.plist', import.meta.url), 'utf8'));
const entitlements = plist.parse(await readFile(new URL('../ios/StableFlow/StableFlow.entitlements', import.meta.url), 'utf8'));

// The checked-in native project is built directly: app.json alone cannot
// supply a missing display name or APNs capability to that binary.
test('the installed iPhone app has the configured StableFlow display name', () => {
  assert.equal(info.CFBundleDisplayName, config.name);
});

test('the native iPhone target retains the configured remote notification background mode', () => {
  assert.ok(config.ios.infoPlist.UIBackgroundModes.includes('remote-notification'));
  assert.ok(info.UIBackgroundModes?.includes('remote-notification'));
});

test('the native iPhone app declares its APNs entitlement for provisioning', () => {
  assert.ok(['development', 'production'].includes(entitlements['aps-environment']),
    'The native target must declare an APNs environment before a push-enabled profile can be signed.');
});
