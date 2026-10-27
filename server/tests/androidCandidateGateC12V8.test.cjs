'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'../..');
const read=f=>fs.readFileSync(path.join(base,f),'utf8');
const wf=read('.github/workflows/android-native-smoke.yml');
const app=read('client/src/App.jsx');
const ui=read('client/src/components/CloudQaAlpha1/index.jsx');
const api=read('client/src/services/gameApi.js');
test('C12 Android: candidate input flag manual only and requires existing C9/C8 gates',()=>{
  assert.match(wf,/c12_candidate_qa:[\s\S]*?default: false/);
  assert.match(wf,/VITE_C12_CANDIDATE_QA_UI: \$\{\{ github\.event_name == 'workflow_dispatch'/);
  assert.match(wf,/inputs\.cloud_qa_ui == true && inputs\.c9_babylon_qa == true && inputs\.c12_candidate_qa == true/);
  assert.match(wf,/VITE_GAME_API_ENABLED: 'false'/);
  assert.doesNotMatch(wf,/gcloud run deploy|firebase deploy|bundleRelease/);
});
test('C12 Android: candidate UI separate from Guest and cannot send client wins',()=>{
  assert.match(app,/candidate=\{import\.meta\.env\.VITE_C12_CANDIDATE_QA_UI === 'true'\}/);
  assert.match(ui,/createCloudCandidateSessionC12/);
  assert.match(ui,/C12 CANDIDATE ALPHA 1/);
  assert.match(api,/\/candidate\/battle\/\$\{path\}/);
  assert.doesNotMatch(api,/candidate\/battle\/settle|candidate\/battle\/issue/);
});
