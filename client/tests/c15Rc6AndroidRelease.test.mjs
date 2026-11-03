import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8').replace(/\r\n/g,'\n');
const workflow=read('.github/workflows/android-release-candidate.yml');
const rc6Gate=read('.github/workflows/c15-rc6-gate.yml');
const rc5Gate=read('.github/workflows/c15-rc5-gate.yml');
const rc7Gate=read('.github/workflows/c15-rc7-gate.yml');
const debugWorkflow=read('.github/workflows/android-native-smoke.yml');
const gradle=read('client/android/app/build.gradle');
const manifest=read('client/android/app/src/main/AndroidManifest.xml');
const proguard=read('client/android/app/proguard-rules.pro');

const secret=name=>`secrets.${name}`;

test('RC6 release workflow is manual-only, main-only and requires an explicit confirmation string',()=>{
  assert.match(workflow,/^on:\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow,/^\s+push:/m);
  assert.match(workflow,/BUILD-C15-RC6-ANDROID-RELEASE/);
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/cancel-in-progress: false/);
});

test('RC6 uses a dedicated upload key lane and never reuses the stable QA signing key',()=>{
  for(const name of ['ANDROID_UPLOAD_KEYSTORE_BASE64','ANDROID_UPLOAD_KEYSTORE_PASSWORD','ANDROID_UPLOAD_KEY_ALIAS','ANDROID_UPLOAD_KEY_PASSWORD','ANDROID_UPLOAD_CERT_SHA1','ANDROID_UPLOAD_CERT_SHA256','ANDROID_GOOGLE_SERVICES_JSON_BASE64']){
    assert.ok(workflow.includes(secret(name)),`Missing ${name}`);
  }
  assert.match(workflow,/spacefighter-upload-key\.jks/);
  assert.match(workflow,/Android upload signing certificate.*does not match/);
  assert.match(workflow,/google-services\.json does not contain com\.theIT\.spacefighter4/);
  assert.match(gradle,/spacefighterUpload/);
  assert.match(gradle,/SF_ANDROID_RELEASE_SIGNING_ENABLED/);
  assert.match(gradle,/SF_ANDROID_UPLOAD_KEYSTORE_PATH/);
  const releaseBlock=gradle.match(/release\s*\{[\s\S]*?\n\s*\}/)?.[0]||'';
  assert.match(releaseBlock,/signingConfig signingConfigs\.spacefighterUpload/);
  assert.doesNotMatch(releaseBlock,/spacefighterStableQa/);
  assert.doesNotMatch(workflow,/ANDROID_KEYSTORE_BASE64|spacefighter-stable-qa-signing/);
});

test('release Gradle configuration is versioned, optimized, non-debuggable and fail-closed without signing',()=>{
  assert.match(gradle,/SF_ANDROID_VERSION_CODE/);
  assert.match(gradle,/SF_ANDROID_VERSION_NAME/);
  assert.match(gradle,/versionCode sfAndroidVersionCode/);
  assert.match(gradle,/versionName sfAndroidVersionName/);
  assert.match(gradle,/release\s*\{[\s\S]*minifyEnabled true/);
  assert.match(gradle,/release\s*\{[\s\S]*shrinkResources true/);
  assert.match(gradle,/release\s*\{[\s\S]*debuggable false/);
  assert.match(gradle,/proguard-android-optimize\.txt/);
  assert.match(gradle,/Release packaging is fail-closed/);
  assert.match(proguard,/LineNumberTable/);
  assert.match(proguard,/JavascriptInterface/);
});

test('release candidate targets API 36 and verifies bundletool, signatures and 16 KB page alignment',()=>{
  assert.match(workflow,/platforms;android-36/);
  assert.match(workflow,/build-tools;36\.0\.0/);
  assert.match(workflow,/BUNDLETOOL_VERSION: '1\.18\.3'/);
  assert.match(workflow,/BUNDLETOOL_SHA256: [0-9a-f]{64}/);
  assert.match(workflow,/java -jar "\$tool" validate --bundle/);
  assert.match(workflow,/java -jar "\$tool" dump config --bundle/);
  assert.match(workflow,/PAGE_ALIGNMENT_16K/);
  assert.match(workflow,/build-apks[\s\S]*--mode=universal/);
  assert.match(workflow,/apksigner.*verify --verbose --print-certs/);
  assert.match(workflow,/jarsigner -verify -verbose -certs/);
  assert.match(workflow,/zipalign.*-c -P 16 -v 4/);
  assert.match(workflow,/targetSdkVersion:'36'/);
});

test('release output contains provenance, hashes, R8 mapping and lint evidence without automatic distribution',()=>{
  assert.match(workflow,/RC6_ANDROID_RELEASE_PROVENANCE\.json/);
  assert.match(workflow,/SHA256SUMS\.txt/);
  assert.match(workflow,/mapping\.txt/);
  assert.match(workflow,/lint-results-release/);
  assert.match(workflow,/spacefighter-android-c15-rc6-upload-ready-candidate/);
  assert.match(workflow,/googlePlayUploadPerformed': False/);
  assert.doesNotMatch(workflow,/gradle-play-publisher|upload.*play|google-play|play\/publish|serviceAccountJson/);
  assert.match(workflow,/productionSettlementEnabled': False/);
  assert.match(workflow,/productionCloudRewardsEnabled': False/);
});

test('release manifest hardening preserves app identity and disables Android backup',()=>{
  assert.match(manifest,/android:allowBackup="false"/);
  assert.match(manifest,/android:appCategory="game"/);
  assert.match(gradle,/applicationId "com\.theIT\.spacefighter4"/);
  assert.match(workflow,/package: name='com\.theIT\.spacefighter4'/);
});

test('RC6 is frozen manual while RC7 is the only main-push C15 gate',()=>{
  assert.doesNotMatch(rc6Gate,/\n\s+push:/);
  assert.match(rc6Gate,/Run frozen RC6 manual audit gate/);
  assert.match(rc7Gate,/push:\n\s+branches: \[main\]/);
  assert.match(rc7Gate,/npm run gate:c15-rc7/);
  assert.match(rc7Gate,/spacefighter-c15-rc7-gate-report/);
  assert.doesNotMatch(rc5Gate,/\n\s+push:/);
  assert.match(rc5Gate,/Run frozen RC5 manual audit gate/);
  assert.doesNotMatch(debugWorkflow,/\n\s+push:/);
  assert.match(debugWorkflow,/:app:assembleDebug :app:bundleDebug/);
  assert.doesNotMatch(debugWorkflow,/:app:assembleRelease|:app:bundleRelease/);
});
