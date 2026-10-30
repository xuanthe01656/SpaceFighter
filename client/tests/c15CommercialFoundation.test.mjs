import test from 'node:test';
import assert from 'node:assert/strict';
import {openC15LocalJournal,appendC15LocalFrame,takeC15UploadChunk,
  acknowledgeC15UploadChunk,closeC15LocalJournal,c15JournalSummary,
  C15_LOCAL_JOURNAL_LIMITS} from '../src/game/combat/C15LocalJournal.js';
import {openC15LocalBattleFoundation,advanceC15LocalBattleFoundation,c15LocalBattleView}
  from '../src/game/combat/C15LocalBattleFoundation.js';
const BID='92e2ee38-1cd8-4c5f-869b-56e31f6300a1';
function descriptor(){return {version:'c15-combat-descriptor-v1',rulesVersion:'c15-rules-v2.0.0',rulesDigest:'9'.repeat(64),catalogVersion:'product-v1.0.0',commercialRc1:true,loadoutId:'alpha-xwing-rail-l1',pilot:{},aircraft:{},mainGun:{},auxiliary:{},stats:{}};}
function genesis(){return {version:'c15-commercial-genesis-v1',purpose:'commercial-local-replay-rc1',keyId:'c15_rc1_key_v1',uid:'user',sessionId:'53f3a57d-28c3-469b-9e0f-69d16a1f3228',battleId:BID,issuedAtMs:1782000000000,expiresAtMs:1782000600000,rulesVersion:'c15-rules-v2.0.0',rulesDigest:'9'.repeat(64),catalogVersion:'product-v1.0.0',descriptorVersion:'c15-combat-descriptor-v1',legacySimulationRulesVersion:'combat-v1.0.0',snapshotHash:'a'.repeat(64),loadoutHash:'b'.repeat(64),descriptor:descriptor(),descriptorDigest:'c'.repeat(64),policyDigest:'8'.repeat(64),stage:{id:'alpha_stage_1',version:'c15-alpha-stage1-v1',waveCount:5,totalEnemies:70,timeLimitTicks:2700,encounterVersion:'pve-server-encounter-qa-v8',encounterDigest:'d'.repeat(64)},resourceManifestVersion:'resource-manifest-v1',resourceManifestDigest:'e'.repeat(64),resourcePacks:[{id:'core-bootstrap',revision:1,sha256:'f'.repeat(64),required:true}],seed:123,rc1Only:true,nonEconomic:true,safeForSettlement:false,mac:'1'.repeat(64)};}
test('C15 local journal reaches 4500 ticks in 151 bounded upload chunks',()=>{
  let s=openC15LocalJournal({battleId:BID,rulesVersion:'c15-rules-v2.0.0',loadoutHash:'a'.repeat(64),issuedAtMs:1});
  for(let i=0;i<C15_LOCAL_JOURNAL_LIMITS.maxTicks;i++){
    s=appendC15LocalFrame(s,{x:0,z:0});
    let out=takeC15UploadChunk(s);
    if(out.chunk){s=acknowledgeC15UploadChunk(out.state,{startTick:out.chunk.startTick,endTick:out.chunk.startTick+out.chunk.frames.length});}
  }
  while(s.pending.length){const out=takeC15UploadChunk(s,{flush:true});s=acknowledgeC15UploadChunk(out.state,{startTick:out.chunk.startTick,endTick:out.chunk.startTick+out.chunk.frames.length});}
  s=closeC15LocalJournal(s);const summary=c15JournalSummary(s);
  assert.equal(summary.ticks,4500);assert.equal(summary.chunks,151);assert.equal(summary.containsOutcome,false);
});
test('C15 local foundation renders provisional state but never settlement authority',()=>{
  const reducer=({state,input,tick})=>({state:{x:state.x-input.x,tick},terminal:tick===3,phase:tick===3?'local-clear':'active'});
  let run=openC15LocalBattleFoundation({genesis:genesis(),initialState:{x:0,tick:0},reducer});
  run=advanceC15LocalBattleFoundation(run,{x:-127,z:0});
  run=advanceC15LocalBattleFoundation(run,{x:-127,z:0});
  run=advanceC15LocalBattleFoundation(run,{x:-127,z:0});
  const view=c15LocalBattleView(run);
  assert.equal(view.localState.x,381);assert.equal(view.provisionalPhase,'local-clear');
  assert.equal(view.serverReplayRequired,true);assert.equal(view.eligibleForSettlement,false);
});
test('C15 journal refuses client outcome fields and post-close frames',()=>{
  let s=openC15LocalJournal({battleId:BID,rulesVersion:'c15-rules-v2.0.0',loadoutHash:'a'.repeat(64),issuedAtMs:1});
  assert.throws(()=>appendC15LocalFrame(s,{x:0,z:0,victory:true}),/invalid/);
});
