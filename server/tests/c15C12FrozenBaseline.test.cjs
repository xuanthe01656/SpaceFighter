'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,p),'utf8');
test('C12 remains manual-only, allowlisted, non-economic and disconnected from settlement',()=>{
  const server=read('../server.js');
  const candidate=read('../lib/productionBattleCandidateC11V8.cjs');
  const runtime=read('../lib/productionCandidateRuntimeC12V8.cjs');
  const workflow=read('../../.github/workflows/android-native-smoke.yml');
  assert.match(server,/C12: completely separate production-namespace CANDIDATE service/);
  assert.equal(server.includes('/api/v1/battle/settle'),false);
  assert.match(candidate,/candidateOnly:true,nonEconomic:true/);
  assert.equal(candidate.includes('verifiedSettlementC7B2BV8'),false);
  assert.match(runtime,/GAME_C12_CANDIDATE_STAGING_APPROVED/);
  assert.match(runtime,/allowedUids/);
  assert.match(workflow,/workflow_dispatch/);
  assert.match(workflow,/c12_candidate_qa/);
});
test('C15 RC1 modules are isolated from HTTP, economy and production settlement',()=>{
  for(const file of ['../lib/c15CommercialGenesisV1.cjs','../lib/c15CommercialReplayV1.cjs','../lib/c15RulesV2.cjs']){
    const src=read(file);assert.equal(src.includes('verifiedSettlementC7B2BV8'),false);
    assert.equal(src.includes('server.js'),false);assert.equal(src.includes('wallet'),false);
  }
});
