'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
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
test('C9 renderer: server world remains authoritative; local pilot prediction is visual only',async()=>{
  assert.match(renderer,/frame\.enemies/);
  assert.match(renderer,/frame\.shots/);
  assert.match(renderer,/frame\.enemyShots/);
  assert.match(renderer,/chooseC9PilotDisplay\(frame\)/);
  assert.match(renderer,/frame\.productionOutcomeIssued!==false/);
  assert.doesNotMatch(renderer,/battle\.start|battle\.finish|setCoins|applyDamage|wallet|missionClaim/);

  // Test the actual projection contract instead of requiring frame.pilot text
  // inside a renderer that now delegates pilot selection to a pure adapter.
  const adapterPath=path.join(root,'client/src/game/combat/C9VisualProjection.js');
  const {chooseC9PilotDisplay,toC9BabylonWorld}=await import(pathToFileURL(adapterPath).href);
  const serverPilot=Object.freeze({x:1000,z:11000});
  const localPrediction=Object.freeze({x:1500,z:10500});
  const selected=chooseC9PilotDisplay({pilot:serverPilot,predictedGhost:localPrediction});
  assert.deepEqual(selected.primary,localPrediction);
  assert.deepEqual(selected.serverReference,serverPilot);
  assert.deepEqual(chooseC9PilotDisplay({pilot:serverPilot}).primary,serverPilot);
  assert.deepEqual(toC9BabylonWorld(serverPilot),{x:1,y:.14,z:11});
  assert.throws(()=>chooseC9PilotDisplay({pilot:serverPilot,
    predictedGhost:{x:1500.5,z:10500}}),TypeError);
  assert.doesNotMatch(read('client/src/game/combat/C9VisualProjection.js'),
    /battle\.start|battle\.finish|setCoins|applyDamage|wallet|missionClaim/);
});
test('C9 security: no production route, P0 remains closed and CI contains no deployment',()=>{
  assert.match(service,/command === 'battle\.start'/);
  assert.match(service,/payload\.victory === true/);
  assert.doesNotMatch(api,/\/api\/v1\/battle\/settle|createVerifiedSettlementC7B2B/);
  assert.doesNotMatch(workflow,/gcloud run deploy|firebase deploy|bundleRelease|GAME_BATTLE_QA_ENABLED:\s*'true'/i);
});
