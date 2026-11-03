import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(join(root, '.github/workflows/android-native-smoke.yml'), 'utf8');
const gradle = readFileSync(join(root, 'client/android/app/build.gradle'), 'utf8');
const sha1 = 'D667B762E0A5EA09BB43B0730EF7CFDA1707F55A';
const sha256 = '60B1E4349BA776EBD0138E7713AE2E78E292EB048A52FBBE187699F2CE09D8C4';

const githubSecret = name => `secrets.${name}`;

test('QA signing reads exactly the 4 Android secrets already present in repository settings', () => {
  for (const name of [
    'ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD',
  ]) assert.ok(workflow.includes(githubSecret(name)), `Missing ${name}`);
  assert.doesNotMatch(workflow, /secrets\.SF_ANDROID_QA_/);
  assert.doesNotMatch(gradle, /System\.getenv\('SF_ANDROID_QA_(?:KEY_ALIAS|KEY_PASSWORD|KEYSTORE_PASSWORD)'\)/);
});

test('QA signing verifies existing SHA-1 and SHA-256 certificates before compiling', () => {
  const restore = workflow.indexOf('Restore existing Android keystore secrets');
  const assemble = workflow.indexOf('Compile Android DEBUG APK');
  assert.ok(restore > 0 && assemble > restore);
  assert.ok(workflow.includes(sha1) && workflow.includes(sha256));
  assert.match(workflow, /keytool.*'-list'.*'-v'/);
  assert.match(workflow, /PrivateKeyEntry/);
  assert.match(workflow, /base64\.b64decode/);
});

test('invalid, missing, and mismatched signing material fails closed', () => {
  assert.match(workflow, /Missing required GitHub Actions secret/);
  assert.match(workflow, /QA keystore secret is not valid Base64/);
  assert.match(workflow, /Keystore\/alias\/password invalid/);
  assert.match(workflow, /does not match Firebase registration/);
  assert.match(gradle, /Missing required stable QA signing setting/);
  assert.match(gradle, /Stable QA signing keystore file is missing/);
});

test('Gradle uses actual private keystore for debug only with explicit enable flag', () => {
  assert.match(workflow, /SF_ANDROID_QA_SIGNING_ENABLED: 'true'/);
  assert.match(gradle, /System\.getenv\('SF_ANDROID_QA_SIGNING_ENABLED'\) == 'true'/);
  assert.match(gradle, /signingConfigs \{[\s\S]*spacefighterStableQa/);
  assert.match(gradle, /signingConfig signingConfigs\.spacefighterStableQa/);
  assert.match(gradle, /storeFile file\(System\.getenv\('SF_ANDROID_QA_KEYSTORE_PATH'\)\)/);
  for (const name of ['ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) {
    assert.ok(gradle.includes(`System.getenv('${name}')`));
  }
  assert.match(gradle, /release \{\s*minifyEnabled false/);
  assert.doesNotMatch(gradle, /release \{[^}]*spacefighterStableQa/s);
});

test('actual signed APK SHA digests must match before artifact upload', () => {
  const signedAt = workflow.indexOf('Verify actual APK uses the registered SHA-1 and SHA-256');
  const uploadAt = workflow.indexOf('Preserve debug APK for manual device QA');
  assert.ok(signedAt > 0 && uploadAt > signedAt);
  assert.match(workflow, /apksigner/);
  assert.match(workflow, /'verify', '--verbose', '--print-certs'/);
  assert.match(workflow, /SIGNED_APK_SHA_MATCH/);
  assert.match(workflow, /Multiple APK certificate signers are not permitted/);
});

test('QA keystore is temporary, private and excluded from uploaded artifact', () => {
  assert.match(workflow, /RUNNER_TEMP.*spacefighter-stable-qa-signing\.jks/);
  assert.match(workflow, /path\.chmod\(0o600\)/);
  assert.match(workflow, /Remove temporary QA signing keystore/);
  assert.match(workflow, /if: always\(\)/);
  const uploadSection = workflow.slice(
    workflow.indexOf('Preserve debug APK for manual device QA'),
    workflow.indexOf('Remove temporary QA signing keystore'),
  );
  assert.match(uploadSection, /path:\s*(?:\|\s*)?[\s\S]*client\/android\/app\/build\/outputs\/apk\/debug\/app-debug\.apk/);
  assert.doesNotMatch(uploadSection, /\.jks/);
});

test('C12 Cloud QA is still manual-only, independent from legacy Cloud Battle', () => {
  assert.match(workflow, /^  workflow_dispatch:/m);
  assert.match(workflow, /inputs\.cloud_qa_ui == true && inputs\.c9_babylon_qa == true && inputs\.c12_candidate_qa == true/);
  assert.match(workflow, /VITE_GAME_API_ENABLED: 'false'/);
  assert.match(workflow, /:app:assembleDebug/);
  assert.doesNotMatch(workflow, /:app:assembleRelease|:app:bundleRelease/);
  assert.doesNotMatch(workflow, /^  pull_request:/m);
});

test('manual native candidates share stable QA signing without automatic delivery', () => {
  assert.match(workflow, /^  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  push:/m);
  assert.match(workflow, /cloud_qa_ui:\s*\n[\s\S]*default: false/);
  assert.match(workflow, /c15_rc4:\s*\n[\s\S]*default: false/);
  assert.match(workflow, /c15_rc5:\s*\n[\s\S]*default: false/);
  assert.match(workflow, /npm run gate:c15-rc5:fast/);
  assert.doesNotMatch(workflow, /gradle[^\n]*publish/);
  assert.doesNotMatch(workflow, /firebase appdistribution|play\/publish|google-play/);
});
