import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('RC5 screen separates high-rate pointer input, fixed 30Hz authority and variable-refresh presentation',()=>{
  const screen=read('client/src/components/C15LocalAlpha1/index.jsx');
  assert.match(screen,/createC15PointerController/);assert.match(screen,/createC15FramePacer/);
  assert.match(screen,/requestAnimationFrame\(runFrame\)/);assert.doesNotMatch(screen,/setInterval\(/);
  assert.match(screen,/predictC15ControlRenderPosition/);assert.match(screen,/cancelC15ControlTarget/);
  assert.match(screen,/visibility-hidden/);assert.match(screen,/touchAction:'none'/);assert.match(screen,/overscrollBehavior:'none'/);
});

test('RC5 control profile reaches the whole playable arena and preserves deterministic authority',()=>{
  const intent=read('client/src/game/c15/C15ControlIntent.js');
  const profiles=read('client/src/game/c15/C15ControlProfilesV1.js');
  assert.match(intent,/coordinateContract==='arena-relative-v2'/);assert.match(intent,/b\.maxX-b\.minX/);
  assert.match(intent,/b\.maxZ-b\.minZ/);assert.match(intent,/edgeCompensationPermille/);
  assert.match(intent,/predictC15ControlRenderPosition/);assert.match(intent,/sampleC15ControlTick/);
  assert.match(profiles,/arcade-responsive-v2/);assert.match(profiles,/maxTargetLagUnits:40000/);
  assert.match(profiles,/simulationHz:30/);assert.match(profiles,/arcade-responsive-v1/);
});

test('RC5 pointer ownership handles multi-touch, cancel, lost capture and coalesced samples',()=>{
  const pointer=read('client/src/game/c15/C15PointerController.js');
  for(const marker of ['secondary-pointer-ignored','getCoalescedEvents','setPointerCapture','releasePointerCapture',
    'pointerrawupdate','pointercancel','lostpointercapture','window-blur','visibility-hidden'])assert.match(pointer,new RegExp(marker));
});

test('Android native shell requests the best supported 60-144Hz refresh preference and touch boost without requiring it',()=>{
  const activity=read('client/android/app/src/main/java/com/theIT/spacefighter4/MainActivity.java');
  assert.match(activity,/getSupportedModes\(\)/);assert.match(activity,/sameResolution/);
  assert.match(activity,/candidate\.getRefreshRate\(\) <= 144\.5f/);assert.match(activity,/best == null/);assert.doesNotMatch(activity,/preferredDisplayModeId/);
  assert.match(activity,/preferredRefreshRate = targetRefreshRate/);assert.match(activity,/preferMinimalPostProcessing = true/);
  assert.match(activity,/Build\.VERSION\.SDK_INT >= 35/);assert.match(activity,/attributes\.setFrameRateBoostOnTouchEnabled\(true\)/);
  assert.match(activity,/@Override\s+public void onResume\(\)/);assert.doesNotMatch(activity,/@Override\s+protected void onResume\(\)/);
  assert.match(read('client/android/app/src/main/AndroidManifest.xml'),/android:appCategory="game"/);
});

test('RC5 Android workflow is manual, mutually exclusive, stable signed and built from profile V2',()=>{
  const workflow=read('.github/workflows/android-native-smoke.yml');
  assert.match(workflow,/c15_rc5:/);assert.match(workflow,/VITE_C15_RC5_CONTROL_ENABLED/);
  assert.match(workflow,/VITE_APP_VERSION:.*1\.2\.2/);assert.match(workflow,/arcade-responsive-v2/);
  assert.match(workflow,/RC1B, RC1C, RC3, RC4 and RC5 inputs are mutually exclusive/);
  assert.match(workflow,/npm run gate:c15-rc5:fast/);assert.match(workflow,/SIGNED_APK_SHA_MATCH/);
  assert.match(workflow,/spacefighter-android-c15-rc5-internal-candidate/);assert.doesNotMatch(workflow,/\n\s+push:/);
});

test('RC5 telemetry remains local aggregate evidence and never captures raw pointer or identity',()=>{
  const telemetry=read('client/src/game/c15/C15ControlTelemetry.js');
  assert.match(telemetry,/networkUpload:false/);assert.match(telemetry,/containsIdentity:false/);
  assert.match(telemetry,/containsRawInput:false/);assert.match(telemetry,/inputToVisibleP95Ms/);
  assert.match(telemetry,/catchUpP95Ms/);assert.match(telemetry,/pointerEvents/);
  assert.doesNotMatch(telemetry,/uid|firebase|token|clientX|clientY/);
});
