'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const wf=fs.readFileSync(path.resolve(__dirname,'../../.github/workflows/android-native-smoke.yml'),'utf8');
const app=fs.readFileSync(path.resolve(__dirname,'../../client/src/App.jsx'),'utf8');
const hq=fs.readFileSync(path.resolve(__dirname,'../../client/src/components/HQ/index.jsx'),'utf8');
test('C8 CI: Cloud QA remains manual-only, OFF for all push-trigger builds',()=>{
  assert.match(wf,/workflow_dispatch:[\s\S]*?cloud_qa_ui:[\s\S]*?default: false/);
  assert.match(wf,/VITE_C8_CLOUD_QA_UI: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.cloud_qa_ui == true && 'true' \|\| 'false' \}\}/);
  assert.match(wf,/Cloud QA is manual-only/);
  assert.match(wf,/Cloud QA must not enable legacy battle API/);
  assert.match(wf,/Cloud QA and Guest Touch QA must not be combined/);
});
test('C8 CI: distinct diagnostic APK artifact, no signing secrets or Cloud deploy',()=>{
  assert.match(wf,/spacefighter-android-cloud-qa-c8-debug-not-for-release/);
  assert.match(wf,/:app:assembleDebug/);
  assert.doesNotMatch(wf,/firebase deploy|gcloud run deploy|:app:bundleRelease|upload-release-asset|GAME_BATTLE_QA_ENABLED:\s*'true'/i);
});
test('C8 UI: explicit opt-in screen cannot override locked authenticated Cloud Battle',()=>{
  assert.match(app,/import\.meta\.env\.VITE_C8_CLOUD_QA_UI === 'true'/);
  assert.match(hq,/import\.meta\.env\.VITE_C8_CLOUD_QA_UI === 'true'/);
  assert.match(hq,/gameAction\('battle\.start'/);
  assert.match(hq,/CLOUD ALPHA 1 .* QA ONLY .* NO REWARDS/);
});
