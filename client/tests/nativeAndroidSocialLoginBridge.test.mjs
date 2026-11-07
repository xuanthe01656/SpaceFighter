import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Source-only regression gates: not a substitute for Gradle/device testing.
const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(client);
const java = fs.readFileSync(path.join(client, 'android/app/src/main/java/com/theIT/spacefighter4/MainActivity.java'), 'utf8');
const workflow = fs.readFileSync(path.join(repo, '.github/workflows/android-native-smoke.yml'), 'utf8');

test('Android bridge keeps exact app package and BridgeActivity superclass', () => {
  assert.match(java, /^\uFEFF?package com\.theIT\.spacefighter4;/m);
  assert.match(java, /class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin/);
});
test('SocialLogin Android imports are present and Codetrix is gone', () => {
  for (const source of ['GoogleProvider', 'SocialLoginPlugin', 'ModifiedMainActivityForSocialLoginPlugin']) {
    assert.match(java, new RegExp('import ee\\.forgr\\.capacitor\\.social\\.login\\.' + source + ';'));
  }
  assert.doesNotMatch(java, /codetrixstudio|registerPlugin\s*\(\s*GoogleAuth|import .*GoogleAuth;/i);
});
test('Android result callback delegates to Capacitor superclass', () => {
  assert.match(java, /void onActivityResult\(int requestCode, int resultCode, Intent data\)/);
  assert.match(java, /super\.onActivityResult\(requestCode, resultCode, data\)/);
});
test('Only the Google activity result range is delegated', () => {
  assert.match(java, /requestCode >= GoogleProvider\.REQUEST_AUTHORIZE_GOOGLE_MIN/);
  assert.match(java, /requestCode < GoogleProvider\.REQUEST_AUTHORIZE_GOOGLE_MAX/);
});
test('Bridge resolves registered SocialLogin plugin and rejects wrong types', () => {
  assert.match(java, /getBridge\(\)\.getPlugin\("SocialLogin"\)/);
  assert.match(java, /handle == null/);
  assert.match(java, /plugin instanceof SocialLoginPlugin/);
});
test('Google callback is forwarded only once, without exposing credentials', () => {
  const matches = [...java.matchAll(/\.handleGoogleLoginIntent\(requestCode, data\)/g)];
  assert.equal(matches.length, 1);
  assert.doesNotMatch(java, /Log\.[a-z]+\([^\n]*(?:idToken|accessToken|authCode)/i);
});
test('Required marker interface method is implemented', () => {
  assert.match(java, /void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin\(\)/);
});
test('Immersive mobile experience is re-applied after resume and focus changes', () => {
  for (const marker of ['EdgeToEdge.enable(this)', 'WindowCompat.setDecorFitsSystemWindows',
    'WindowCompat.getInsetsController', 'setSystemBarsBehavior',
    'BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE',
    'controller.hide(WindowInsetsCompat.Type.systemBars())',
    'applyImmersiveMode();', 'onWindowFocusChanged(boolean hasFocus)',
    'postDelayed(() -> {', 'refreshNativeBattleHudInset();']) {
    assert.ok(java.includes(marker), 'Missing: ' + marker);
  }
});
test('Android publishes one battle-HUD top inset instead of stale status-bar padding', () => {
  for (const marker of ['DisplayCutoutCompat', 'ViewCompat.setOnApplyWindowInsetsListener',
    'ViewCompat.getRootWindowInsets', 'getBoundingRects()', 'getSafeInsetTop()',
    'centreVoidLeft', 'centreVoidRight', '--sf-native-battle-hud-top',
    'evaluateJavascript(script, null)', 'sf-native-battle-hud-inset']) {
    assert.ok(java.includes(marker), 'Missing: ' + marker);
  }
  assert.match(java, /viewportWidth \* 0\.34f/);
  assert.match(java, /viewportWidth \* 0\.66f/);
  assert.match(java, /Math\.round\(devicePx \/ density\)/);
  assert.doesNotMatch(java, /WindowInsetsCompat\.Type\.statusBars\(\)/);
});
test('Android native build is explicit manual-only after the single RC5 full gate', () => {
  assert.match(workflow, /^on:\s*\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/m);
  assert.match(workflow, /npm run gate:c15-rc5:fast/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
});
test('Android native smoke uses locked dependencies, sync and actual Gradle compile', () => {
  assert.match(workflow, /node-version: '22'/);
  assert.match(workflow, /java-version: '21'/);
  assert.match(workflow, /gradle-version: '8\.14\.3'/);
  assert.match(workflow, /npm ci --no-audit --no-fund/);
  assert.match(workflow, /npm run build:mobile/);
  assert.match(workflow, /npx --no-install cap sync android/);
  assert.match(workflow, /gradle --no-daemon --stacktrace :app:assembleDebug :app:bundleDebug/);
});
test('Native workflow does not automatically distribute builds', () => {
  assert.doesNotMatch(workflow, /publish|deploy|google-play|fastlane|upload_to_play|gradle[^\n]*publish/i);
  assert.match(workflow, /:app:assembleDebug/);
});
