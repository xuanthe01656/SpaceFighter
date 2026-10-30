'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');

test('C15 RC1B server lane remains allowlisted, non-economic and disconnected from settlement',()=>{
  for(const file of ['server.js','lib/c15Rc1bRuntimeV1.cjs']){const source=read(file);
    assert.doesNotMatch(source,/verifiedSettlementC7B2BV8|productionOutcomeAuthorityC10V8|createC10SettlementBridge|wallet\.coins|missionDelta/);}
  const runtime=read('lib/c15Rc1bRuntimeV1.cjs');assert.match(runtime,/GAME_C15_RC1B_STAGING_APPROVED/);
  assert.match(runtime,/GAME_C15_RC1B_ALLOW_UIDS/);assert.match(runtime,/safeForSettlement:false/);assert.match(runtime,/cloudRewards:false/);
});

test('C12 remains frozen and RC1B adds no production settle/reward endpoint',()=>{
  const server=read('server.js');assert.doesNotMatch(server,/\/api\/v1\/c15\/battle\/(?:settle|reward|outcome)/);
  assert.match(server,/C12: completely separate production-namespace CANDIDATE service/);
  assert.match(server,/C15-RC1B: local deterministic gameplay/);
});

test('Cloud Run image includes immutable C15 resource pack and no secret-bearing client files',()=>{
  const docker=fs.readFileSync(path.resolve(__dirname,'../../Dockerfile'),'utf8');assert.match(docker,/COPY server\/resources\/ \.\/resources\//);
  assert.doesNotMatch(docker,/keystore|\.env|FIREBASE_PRIVATE_KEY/);
});
