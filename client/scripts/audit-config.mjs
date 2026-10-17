import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(base,p),'utf8');
const first = (s,re) => re.exec(s)?.[1] ?? null;
const capacitorId = first(read('capacitor.config.ts'),/appId:\s*['"]([^'"]+)/);
const androidId = first(read('android/app/build.gradle'),/applicationId\s+['"]([^'"]+)/);
const iosIds = [...new Set([...read('ios/App/App.xcodeproj/project.pbxproj').matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/g)].map(m=>m[1].trim()))];
const targetSdk = first(read('android/variables.gradle'),/targetSdkVersion\s*=\s*(\d+)/);
const manifest = JSON.parse(read('public/manifest.webmanifest'));
let problems = 0;
const problem = message => { problems++; console.warn(`WARN: ${message}`); };
console.log('Application identifiers:');
console.log(`  Capacitor: ${capacitorId}`);
console.log(`  Android: ${androidId}; targetSdk: ${targetSdk}`);
console.log(`  iOS Xcode: ${iosIds.join(', ')}`);
if (capacitorId !== androidId) problem('Capacitor appId differs from Android applicationId. Do NOT change a published ID without migration planning.');
if (!iosIds.includes(capacitorId)) problem('iOS Xcode bundle ID differs from Capacitor appId.');
if (Number(targetSdk)<36) problem('Android targetSdk lower than 36; check store requirements before release.');
for (const icon of manifest.icons||[]) {
  if (!fs.existsSync(path.join(base,'public',icon.src))) problem(`PWA icon missing: ${icon.src}`);
}
if (!fs.existsSync(path.join(base,'android/app/google-services.json'))) {
  problem('Android google-services.json absent from source package; supply your real file locally before native build.');
}
if (problems) console.log(`Configuration audit: ${problems} warning(s). Release remains blocked until reconciled.`);
else console.log('Configuration audit: no warnings.');
if (process.argv.includes('--strict') && problems) process.exitCode = 1;
