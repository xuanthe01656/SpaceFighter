import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=name=>fs.readFileSync(path.join(root,'.github/workflows',name),'utf8').replace(/\r\n/g,'\n');

test('frozen C15 gates and legacy phase gate no longer repeat on every main push',()=>{
  for(const name of ['c15-rc1b-gate.yml','c15-rc1c-rc2-gate.yml','c15-rc3-gate.yml','c15-rc4-gate.yml','c15-rc5-gate.yml','c15-rc6-gate.yml']){
    const text=read(name);assert.match(text,/on:\n\s+workflow_dispatch:/);assert.doesNotMatch(text,/\n\s+push:/);
  }
  const phase=read('phase0-ci.yml');assert.match(phase,/workflow_dispatch:/);assert.match(phase,/pull_request:/);assert.doesNotMatch(phase,/\n\s+push:/);
});

test('RC7 is the only full C15 push gate and all Android builds remain manual after CI',()=>{
  const rc7=read('c15-rc7-gate.yml');assert.match(rc7,/push:\n\s+branches: \[main\]/);assert.match(rc7,/npm run gate:c15-rc7/);
  assert.match(rc7,/spacefighter-c15-rc7-gate-report/);
  const debug=read('android-native-smoke.yml');assert.doesNotMatch(debug,/\n\s+push:/);assert.match(debug,/c15_rc7_assets:/);
  assert.match(debug,/npm run gate:c15-rc7:fast/);assert.match(debug,/VITE_C15_CONTROL_PROFILE_ID:.*arcade-responsive-v2/);
  assert.match(debug,/:app:assembleDebug :app:bundleDebug/);assert.match(debug,/spacefighter-android-c15-rc7-asset-delivery-candidate/);
  const release=read('android-release-candidate.yml');assert.doesNotMatch(release,/\n\s+push:/);
  assert.match(release,/BUILD-C15-RC6-ANDROID-RELEASE/);assert.match(release,/:app:assembleRelease :app:bundleRelease/);
  assert.match(release,/spacefighter-android-c15-rc6-upload-ready-candidate/);
  const ios=read('ios-build.yml');assert.doesNotMatch(ios,/\n\s+push:/);assert.match(ios,/VITE_SF_BUILD_CHANNEL: release-candidate/);
});
