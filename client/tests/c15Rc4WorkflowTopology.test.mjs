import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const read=name=>fs.readFileSync(path.join(root,'.github/workflows',name),'utf8');

test('frozen C15 gates and legacy phase gate no longer repeat on every main push',()=>{
  for(const name of ['c15-rc1b-gate.yml','c15-rc1c-rc2-gate.yml','c15-rc3-gate.yml']){
    const text=read(name);assert.match(text,/on:\n\s+workflow_dispatch:/);assert.doesNotMatch(text,/\n\s+push:/);
  }
  const phase=read('phase0-ci.yml');assert.match(phase,/workflow_dispatch:/);assert.match(phase,/pull_request:/);assert.doesNotMatch(phase,/\n\s+push:/);
});

test('RC4 is the only full C15 push gate and native builds are manual fast-gate consumers',()=>{
  const rc4=read('c15-rc4-gate.yml');assert.match(rc4,/push:\n\s+branches: \[main\]/);assert.match(rc4,/npm run gate:c15-rc4/);
  const android=read('android-native-smoke.yml');assert.doesNotMatch(android,/\n\s+push:/);assert.match(android,/c15_rc4:/);assert.match(android,/npm run gate:c15-rc4:fast/);
  assert.match(android,/bundleDebug/);assert.match(android,/spacefighter-android-c15-rc4-internal-candidate/);
  const ios=read('ios-build.yml');assert.match(ios,/npm run gate:c15-rc4:fast/);assert.match(ios,/VITE_SF_BUILD_CHANNEL: release-candidate/);
});
