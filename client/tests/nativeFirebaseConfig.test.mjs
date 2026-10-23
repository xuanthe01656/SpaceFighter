import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Static contract: no Firebase/Apple credentials or device build required.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const matchOne = (source, pattern, label) => {
  const match = source.match(pattern);
  assert.ok(match, `Missing ${label}`);
  return match[1];
};
const plistString = (source, key) => matchOne(
  source, new RegExp(String.raw`<key>\s*${key}\s*</key>\s*<string>([^<]*)</string>`),
  `plist ${key}`
);

const config = read('capacitor.config.ts');
const androidGradle = read('android/app/build.gradle');
const mainActivity = read('android/app/src/main/java/com/theIT/spacefighter4/MainActivity.java');
const androidStrings = read('android/app/src/main/res/values/strings.xml');
const iosXcode = read('ios/App/App.xcodeproj/project.pbxproj');
const iosInfo = read('ios/App/App/Info.plist');
const iosFirebase = read('ios/App/App/GoogleService-Info.plist');
const auth = read('src/hooks/useAuth.jsx');
const nativeBridge = read('src/utils/nativeSocialLoginV8.mjs');
const appId = matchOne(config, /\bappId:\s*'([^']+)'/, 'Capacitor appId');

test('Capacitor appId equals Android applicationId', () => {
  assert.equal(appId, matchOne(androidGradle, /\bapplicationId\s+"([^"]+)"/, 'Android applicationId'));
});

test('Android namespace and MainActivity package equal appId', () => {
  assert.equal(appId, matchOne(androidGradle, /\bnamespace\s*=\s*"([^"]+)"/, 'Android namespace'));
  assert.equal(appId, matchOne(mainActivity, /^package\s+([^;]+);/m, 'MainActivity package'));
});

test('Xcode Debug and Release bundle identifiers equal appId', () => {
  const values = [...iosXcode.matchAll(/\bPRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/g)].map(x => x[1].trim());
  assert.equal(values.length, 2, 'Expected exactly Debug and Release bundle IDs');
  assert.deepEqual(values, [appId, appId]);
});

test('Firebase iOS plist bundle ID equals native appId', () => {
  assert.equal(plistString(iosFirebase, 'BUNDLE_ID'), appId);
});

test('Google iOS callback scheme matches SocialLogin initialization client ID', () => {
  const clientId = matchOne(nativeBridge, /GOOGLE_IOS_CLIENT_ID\s*=\s*'([^']+)'/, 'Google iOS client ID');
  assert.match(clientId, /\.apps\.googleusercontent\.com$/);
  const expected = 'com.googleusercontent.apps.' + clientId.replace(/\.apps\.googleusercontent\.com$/, '');
  const actual = matchOne(iosInfo, /<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>([^<]+)<\/string>/, 'iOS Google URL scheme');
  assert.equal(actual, expected);
  assert.match(config, /SocialLogin:\s*\{[\s\S]*?google:\s*true/);
});

test('Apple SocialLogin only uses native iOS with hashed nonce and Firebase rawNonce', () => {
  assert.match(auth, /Capacitor\.getPlatform\(\) !== 'ios'/);
  assert.match(nativeBridge, /nonce:\s*hashedNonce/);
  assert.match(auth, /\.credential\(\{\s*idToken,\s*rawNonce\s*\}\)/);
  assert.match(config, /SocialLogin:\s*\{[\s\S]*?apple:\s*true/);
  assert.doesNotMatch(auth, /SignInWithApple|GoogleAuth\.signIn|GoogleAuth\.signOut/);
});

test('Android package_name and custom_url_scheme are plain string resources', () => {
  assert.equal(matchOne(androidStrings, /<string\s+name="package_name">([^<]*)<\/string>/, 'Android package_name').trim(), appId);
  assert.equal(matchOne(androidStrings, /<string\s+name="custom_url_scheme">([^<]*)<\/string>/, 'Android URL scheme').trim(), appId);
  assert.doesNotMatch(androidStrings, /<string\s+name="package_name">\s*</);
});

test('Mobile WebView schemes remain compatible with V3', () => {
  assert.equal(matchOne(config, /\biosScheme:\s*'([^']+)'/, 'iOS scheme'), 'capacitor');
  assert.equal(matchOne(config, /\bandroidScheme:\s*'([^']+)'/, 'Android scheme'), 'http');
});
