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

test('HQ launch bridge enters C15 RC1B before the legacy P0 battle.start lane',()=>{
  const hq=read('client/src/components/HQ/index.jsx');
  assert.match(hq,/const c15Rc1bLaunch=import\.meta\.env\.VITE_C15_RC1B_ENABLED==='true'/);
  assert.match(hq,/mode==='campaign'/);
  assert.match(hq,/currentPlanet\|\|1\)===1/);
  assert.match(hq,/selectedStage\|\|1\)===1/);
  const bridge=hq.indexOf('if (c15Rc1bLaunch)');
  const legacy=hq.indexOf("gameAction('battle.start'");
  assert.ok(bridge>=0,'missing C15 launch bridge');
  assert.ok(legacy>bridge,'legacy battle.start must remain after the C15 bridge');
  const section=hq.slice(bridge,legacy);
  assert.match(section,/setScreen\('campaign'\)/);
  assert.match(section,/return;/);
  assert.doesNotMatch(section,/gameAction\('battle\.start'/);
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
  assert.match(workflow,/C15 local runtime is manual-only/);assert.match(workflow,/must be built separately from legacy QA modes/);
  assert.match(workflow,/spacefighter-android-c15-rc1b-debug-not-for-release/);assert.match(workflow,/SIGNED_APK_SHA_MATCH/);
});

test('verified Continue consumes the local terminal session before returning to stage select',()=>{
  const screen=read('client/src/components/C15LocalAlpha1/index.jsx');
  const session=read('client/src/game/c15/C15Rc1bSession.js');
  assert.match(screen,/await sessionRef\.current\?\.completeVerified\(\)/);
  assert.match(screen,/setScreen\('stage_select'\)/);
  assert.doesNotMatch(screen,/onClick=\{\(\)=>setScreen\('stage_select'\)\}>CONTINUE/);
  assert.match(session,/async function completeVerified\(\)/);
  assert.match(session,/store\.remove\('meta',activeKey\(uid\)\)/);
  assert.match(session,/store\.remove\('battles',journalKey\(battleId\)\)/);
  assert.match(session,/completedRecoveryCodes/);
});

test('RC1C Android milestone enables one A/B control APK and keeps legacy QA mutually exclusive',()=>{
  const workflow=read('.github/workflows/android-native-smoke.yml');
  assert.match(workflow,/c15_rc1c:/);assert.match(workflow,/VITE_C15_CONTROL_AB_QA/);
  assert.match(workflow,/arcade-responsive-v1/);assert.match(workflow,/RC1B and RC1C inputs are mutually exclusive/);
  assert.match(workflow,/spacefighter-android-c15-rc1c-debug-not-for-release/);
  assert.match(workflow,/NON-ECONOMIC, NO SETTLEMENT/);
});

test('RC1C local screen uses deterministic control intent, local telemetry and signed RC2 outcome display',()=>{
  const screen=read('client/src/components/C15LocalAlpha1/index.jsx');
  assert.match(screen,/openC15ControlIntent/);assert.match(screen,/sampleC15ControlTick/);
  assert.match(screen,/releaseC15ControlTarget/);assert.match(screen,/createC15ControlTelemetry/);
  assert.match(screen,/CONTROL JSON/);assert.match(screen,/RC2 SIGNED OUTCOME/);
  assert.doesNotMatch(screen,/openCloudInputIntent|sampleCloudInputTick|clearCloudPointerTarget/);
});
