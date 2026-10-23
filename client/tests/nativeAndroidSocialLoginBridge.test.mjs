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
test('Existing immersive mobile experience remains enabled', () => {
  for (const marker of ['EdgeToEdge.enable(this)', 'WindowCompat.getInsetsController',
    'setSystemBarsBehavior', 'BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE',
    'windowInsetsController.hide(WindowInsetsCompat.Type.systemBars())']) {
    assert.ok(java.includes(marker), 'Missing: ' + marker);
  }
});
test('Android native CI runs only after staging push or explicit manual dispatch', () => {
  assert.match(workflow, /^on:\s*\n  push:\s*\n    branches:\s*\n      - cloudrun-staging/m);
  assert.match(workflow, /^  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  (?:pull_request|schedule):/m);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
});
test('Android native smoke uses locked dependencies, sync and actual Gradle compile', () => {
  assert.match(workflow, /node-version: '22'/);
  assert.match(workflow, /java-version: '21'/);
  assert.match(workflow, /gradle-version: '8\.14\.3'/);
  assert.match(workflow, /npm ci --no-audit --no-fund/);
  assert.match(workflow, /npm run build:mobile/);
  assert.match(workflow, /npx --no-install cap sync android/);
  assert.match(workflow, /gradle --no-daemon --stacktrace :app:assembleDebug/);
});
test('Native workflow does not automatically distribute builds', () => {
  assert.doesNotMatch(workflow, /publish|deploy|google-play|fastlane|upload_to_play|gradle[^\n]*publish/i);
  assert.match(workflow, /:app:assembleDebug/);
});
