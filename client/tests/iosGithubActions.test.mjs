import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(clientRoot, '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
const workflow = read('.github/workflows/ios-build.yml');
const xcode = read('client/ios/App/App.xcodeproj/project.pbxproj');
const entitlement = read('client/ios/App/App/App.entitlements');
const capacitor = read('client/capacitor.config.ts');

// Deliberate static configuration gates; runtime signing is verified on a macOS runner.
test('iOS workflow is manual and TestFlight upload requires explicit opt-in', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /upload_to_testflight:/);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /if: \$\{\{ inputs\.upload_to_testflight == true \}\}/);
  assert.doesNotMatch(workflow, /^  push:/m);
});

test('iOS build uses a supported macOS runner, Xcode 26 and locked npm install', () => {
  assert.match(workflow, /runs-on: macos-26/);
  assert.match(workflow, /Xcode_26\.6\.app/);
  assert.match(workflow, /npm ci --no-audit --no-fund/);
  assert.doesNotMatch(workflow, /npm install .*@latest/);
});

test('iOS workflow never rebuilds against Astro Cat legacy Firebase or bundle ID', () => {
  assert.doesNotMatch(workflow, /astro-cat-5|271365354200|com\.ban\.astrocat|AstroCat_AppStore_Profile|astro-cat\.onrender/);
  assert.match(workflow, /VITE_FIREBASE_PROJECT_ID: distributed-inn-482605-c6/);
  assert.match(workflow, /VITE_FIREBASE_API_KEY: \$\{\{ vars\.SF_FIREBASE_API_KEY \}\}/);
  assert.match(workflow, /VITE_FIREBASE_APP_ID: '1:528039759292:web:/);
});

test('native bundle identifier agrees with the Android/Firebase V4 contract', () => {
  const id = 'com.theIT.spacefighter4';
  assert.match(workflow, /APP_BUNDLE_ID: com\.theIT\.spacefighter4/);
  assert.match(capacitor, /appId: 'com\.theIT\.spacefighter4'/);
  assert.equal((xcode.match(/PRODUCT_BUNDLE_IDENTIFIER = com\.theIT\.spacefighter4;/g) || []).length, 2);
  assert.ok(id);
});

test('Apple Sign-in entitlement is part of signed Debug and Release app', () => {
  assert.match(entitlement, /<key>com\.apple\.developer\.applesignin<\/key>\s*<array>\s*<string>Default<\/string>/);
  assert.equal((xcode.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || []).length, 2);
  assert.match(xcode, /com\.apple\.SignInWithApple = \{ enabled = 1; \};/);
});

test('workflow fails closed when Apple signing profile does not authorize the app', () => {
  assert.match(workflow, /Profile belongs to another Apple Team/);
  assert.match(workflow, /Profile Bundle ID mismatch/);
  assert.match(workflow, /Recreate profile after enabling Apple Sign-In/);
  assert.match(workflow, /Expected App Store Connect distribution profile/);
  assert.match(workflow, /Provisioning profile expired/);
});

test('workflow checks entitlements in actual signed application', () => {
  assert.match(workflow, /codesign --verify --deep --strict/);
  assert.match(workflow, /codesign --display --entitlements - --xml/);
  assert.match(workflow, /Apple Sign-In missing from actual code signature/);
});

test('iOS workflow builds current client, syncs existing SPM, and never regenerates native project', () => {
  assert.match(workflow, /npm run check:safety/);
  assert.match(workflow, /npm run check:gameplay/);
  assert.match(workflow, /npm run build:mobile/);
  assert.match(workflow, /npx cap sync ios/);
  assert.match(workflow, /ios\/App\/CapApp-SPM\/Package\.swift/);
  assert.doesNotMatch(workflow, /npx cap add ios|npm install @capacitor\/ios@/);
});

test('export and TestFlight both target verified native Bundle ID', () => {
  assert.match(workflow, /'method': 'app-store-connect'/);
  assert.match(workflow, /'provisioningProfiles': \{os\.environ\['APP_BUNDLE_ID'\]: os\.environ\['APPLE_PROFILE_NAME'\]\}/);
  assert.match(workflow, /Apple-Actions\/upload-testflight-build@v5/);
  assert.match(workflow, /secrets\.APPSTORE_API_PRIVATE_KEY/);
  assert.doesNotMatch(workflow, /APPLE_APP_SPECIFIC_PASSWORD|xcrun altool --upload-app/);
});

test('GitHub Actions staging API URL uses HTTPS and the /api/v1 prefix', () => {
  assert.match(workflow, /VITE_GAME_API_URL: https:\/\/spacefighter-api-staging-[^\s]+\.run\.app\/api\/v1/);
  assert.match(workflow, /persist-credentials: false/);
});
