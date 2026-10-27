'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const workflow=read('.github/workflows/android-native-smoke.yml');
const ui=read('client/src/components/CloudQaAlpha1/index.jsx');
const renderer=read('client/src/components/CloudQaAlpha1/BabylonServerRendererC9.js');
const api=read('server/server.js');
const service=read('server/lib/gameService.cjs');
test('C9 Android QA: only manual build can request Babylon checkpoint renderer',()=>{
  assert.match(workflow,/c9_babylon_qa:[\s\S]*?default: false/);
  assert.match(workflow,/VITE_C9_BABYLON_QA_UI: \$\{\{ github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow,/inputs\.cloud_qa_ui == true && inputs\.c9_babylon_qa == true/);
  assert.match(workflow,/C9 Babylon QA is manual-only/);
  assert.match(workflow,/C9 Babylon QA requires Cloud QA cockpit/);
  assert.match(workflow,/C9 QA may not enable legacy Cloud battles/);
});
test('C9 renderer: dynamically imported only in isolated QA screen; Guest remains separate',()=>{
  assert.match(ui,/import\.meta\.env\.VITE_C9_BABYLON_QA_UI==='true'/);
  assert.match(ui,/import\('\.\/BabylonServerRendererC9'\)/);
  assert.match(ui,/createServerSceneModelC9/);
  assert.match(ui,/C9_SERVER_VISUAL_INVALID/);
  assert.match(ui,/2D FALLBACK/);
  assert.doesNotMatch(ui,/verifiedSettlementC7B2BV8|battle\.finish|battle\.settle/);
});
test('C9 renderer: server entities only; no combat/wallet/HP mutation or client win',()=>{
  assert.match(renderer,/frame\.enemies/);
  assert.match(renderer,/frame\.shots/);
  assert.match(renderer,/frame\.enemyShots/);
  assert.match(renderer,/frame\.pilot/);
  assert.match(renderer,/frame\.productionOutcomeIssued!==false/);
  assert.doesNotMatch(renderer,/battle\.start|battle\.finish|setCoins|applyDamage|wallet|missionClaim/);
});
test('C9 security: no production route, P0 remains closed and CI contains no deployment',()=>{
  assert.match(service,/command === 'battle\.start'/);
  assert.match(service,/payload\.victory === true/);
  assert.doesNotMatch(api,/\/api\/v1\/battle\/settle|createVerifiedSettlementC7B2B/);
  assert.doesNotMatch(workflow,/gcloud run deploy|firebase deploy|bundleRelease|GAME_BATTLE_QA_ENABLED:\s*'true'/i);
});
