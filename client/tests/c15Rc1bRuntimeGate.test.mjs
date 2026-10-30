import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=relative=>fs.readFileSync(path.join(repoRoot,relative),'utf8');

test('C15 RC1B is build-gated to authenticated Alpha stage 1 and legacy Campaign remains fallback',()=>{
  const engine=read('client/src/components/Campaign/CampaignEngine.jsx');
  assert.match(engine,/VITE_C15_RC1B_ENABLED/);assert.match(engine,/Boolean\(auth\.currentUser\)/);
  assert.match(engine,/currentPlanet\|\|1\)===1/);assert.match(engine,/selectedStage\|\|1\)===1/);
  assert.match(engine,/LegacyCampaignEngine/);assert.match(engine,/C15LocalAlpha1/);
});

test('C15 local runtime renders device state and cannot import economy or settlement authority',()=>{
  for(const file of ['client/src/components/C15LocalAlpha1/index.jsx','client/src/components/C15LocalAlpha1/C15LocalRenderer.js',
    'client/src/game/c15/C15Rc1bSession.js','client/src/game/c15/C15KernelRuntime.js']){
    const source=read(file);assert.doesNotMatch(source,/battle\.finish|wallet|verifiedSettlement|productionOutcomeAuthority|cloudRewards\s*:\s*true/);}
  assert.match(read('client/src/game/c15/C15Rc1bSession.js'),/independent server finalize/);
});

test('Android milestone is manual-only, separately gated, stable-signed and non-economic',()=>{
  const workflow=read('.github/workflows/android-native-smoke.yml');
  assert.match(workflow,/c15_rc1b:/);assert.match(workflow,/VITE_C15_RC1B_ENABLED/);
  assert.match(workflow,/C15 RC1B is manual-only/);assert.match(workflow,/must be built separately from legacy QA modes/);
  assert.match(workflow,/spacefighter-android-c15-rc1b-debug-not-for-release/);assert.match(workflow,/SIGNED_APK_SHA_MATCH/);
});
