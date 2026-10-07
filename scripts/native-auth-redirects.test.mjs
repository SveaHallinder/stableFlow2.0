import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve('expo/package.json'));
const plist = expoRequire('@expo/plist').default;
const { AndroidConfig } = expoRequire('@expo/config-plugins');
const config = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8')).expo;

async function loadAuthRedirect(platform, origin) {
  const source = await readFile(new URL('../lib/authRedirect.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('authRedirect.ts', source, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'authRedirectUrl');
  const callback = declaration.getText(ast).replace(/^export\s+/, '');
  const { outputText } = ts.transpileModule(`export default ({ Platform, globalThis }) => (${callback});`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)).default({
    Platform: { OS: platform }, globalThis: origin ? { location: { origin } } : {},
  });
}

async function registeredSchemes(platform) {
  if (platform === 'ios') {
    const info = plist.parse(await readFile(new URL('../ios/StableFlow/Info.plist', import.meta.url), 'utf8'));
    return info.CFBundleURLTypes.flatMap(entry => entry.CFBundleURLSchemes);
  }
  const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(
    fileURLToPath(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url)),
  );
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
  return activity['intent-filter'].filter(filter =>
    filter.action?.some(entry => entry.$['android:name'] === 'android.intent.action.VIEW')
    && ['android.intent.category.DEFAULT', 'android.intent.category.BROWSABLE'].every(category =>
      filter.category?.some(entry => entry.$['android:name'] === category)),
  ).flatMap(filter => (filter.data ?? []).map(entry => entry.$['android:scheme']).filter(Boolean));
}

for (const platform of ['ios', 'android']) {
  test(`${platform} registers the actual confirmation and reset redirect scheme`, async () => {
    const redirect = await loadAuthRedirect(platform);
    const schemes = await registeredSchemes(platform);
    for (const path of ['confirm', 'reset']) {
      const url = new URL(redirect(path));
      const scheme = url.protocol.slice(0, -1);
      assert.equal(scheme, config.scheme, 'Auth redirects must follow the configured app scheme');
      assert.equal(url.hostname, path);
      assert.ok(schemes.includes(scheme), `${platform} does not register the actual redirect ${url.href}`);
    }
  });
}

test('web confirmation and reset redirects keep the HTTPS origin', async () => {
  const origin = 'https://stableflow.example.test';
  const redirect = await loadAuthRedirect('web', origin);
  for (const path of ['confirm', 'reset']) {
    assert.equal(redirect(path), `${origin}/${path}`);
  }
});
