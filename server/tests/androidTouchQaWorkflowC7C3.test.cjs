'use strict';
/** Static CI guard only, never proof of native QA or of Cloud Build triggers. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const workflow=fs.readFileSync(path.resolve(__dirname,'../../.github/workflows/android-native-smoke.yml'),'utf8');
const cli=fs.readFileSync(path.resolve(__dirname,'../../client/tools/analyzeNativeTouchEvidenceC7C3.mjs'),'utf8');

test('C7C3 Android touch QA build requires explicit manual workflow_dispatch opt-in',()=>{
  assert.match(workflow,/workflow_dispatch:\s*\n\s*inputs:\s*\n\s*touch_qa:/);
  assert.match(workflow,/type: boolean\s*\n\s*default: false/);
  assert.match(workflow,/VITE_SF_NATIVE_TOUCH_QA:.*github\.event_name == 'workflow_dispatch'.*inputs\.touch_qa == true.*'1'.*'0'/);
  assert.match(workflow,/\[\[ "\$GITHUB_EVENT_NAME" == 'workflow_dispatch' \]\]/);
});
test('C7C3 debug APK remains non-release and cannot enable game API',()=>{
  assert.match(workflow,/VITE_GAME_API_ENABLED: 'false'/);
  assert.match(workflow,/\[\[ "\$VITE_GAME_API_ENABLED" == 'false' \]\]/);
  assert.match(workflow,/spacefighter-android-touch-qa-debug-not-for-release/);
  assert.match(workflow,/:app:assembleDebug/);
  assert.doesNotMatch(workflow,/:app:bundleRelease|:app:assembleRelease|firebase deploy|gcloud run deploy/);
});
test('C7C3 off-device evidence analyzer cannot grant approval or upload',()=>{
  assert.match(cli,/releasePolicySelected:false/);
  assert.match(cli,/productionVerifierApproved:false/);
  assert.match(cli,/settlementEnabled:false/);
  assert.match(cli,/cloudBattleP0Locked:true/);
  assert.doesNotMatch(cli,/https?:\/\/|fetch\(/);
});
