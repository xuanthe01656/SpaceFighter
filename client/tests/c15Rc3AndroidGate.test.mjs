import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const workflow=fs.readFileSync(path.resolve(here,'../../.github/workflows/android-native-smoke.yml'),'utf8').replace(/\r\n/g,'\n');
const screen=fs.readFileSync(path.resolve(here,'../src/components/C15LocalAlpha1/index.jsx'),'utf8');
const session=fs.readFileSync(path.resolve(here,'../src/game/c15/C15Rc1bSession.js'),'utf8');
const campaignEngine=fs.readFileSync(path.resolve(here,'../src/components/Campaign/CampaignEngine.jsx'),'utf8');

test('RC3 Android build is manual-only, mutually exclusive and stable-signed',()=>{
  assert.match(workflow,/c15_rc3:\n\s+description:/);
  assert.match(workflow,/inputs\.c15_rc3 == true/);
  assert.match(workflow,/VITE_C15_RC3_ENABLED:/);
  assert.match(workflow,/RC1B, RC1C and RC3 inputs are mutually exclusive/);
  assert.match(workflow,/spacefighter-android-c15-rc3-debug-not-for-release/);
  assert.match(workflow,/SIGNED_APK_SHA_MATCH/);
  assert.match(workflow,/production rewards OFF/);
});
test('RC3 screen exposes explicit claim and canonical profile refresh only after RC2 outcome',()=>{
  assert.match(screen,/CLAIM VERIFIED REWARD/);assert.match(screen,/CHECK DUPLICATE CLAIM/);
  assert.match(session,/phase!=='verified'\|\|!result\|\|!outcome/);
  assert.match(session,/retryVerifiedRewardClaim/);assert.match(session,/forceNetworkRetry:true/);
  assert.match(screen,/await refreshCloudProfile\(\)/);
  assert.match(campaignEngine,/const c15LaneRef=useRef\(c15Eligible\)/);
  assert.match(campaignEngine,/must never replace an active\/terminal C15 screen/);
  assert.doesNotMatch(screen,/wallet\.(coins|diamonds)\s*[+\-]=/);
  assert.match(screen,/production rewards remain off/);
});
