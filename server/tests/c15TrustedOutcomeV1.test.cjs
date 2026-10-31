'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createC15Rc1Fixture,generateC15VictoryFrames,chunkC15Frames,T0}=require('../tools/c15Rc1Fixture.cjs');
const {replayC15CommercialFoundationV1}=require('../lib/c15CommercialReplayV1.cjs');
const {createC15TrustedOutcomeV1,verifyC15TrustedOutcomeV1,journalRoot}=require('../lib/c15TrustedOutcomeV1.cjs');
const KEY_ID='c15_rc2_outcome_test';const KEY=Buffer.alloc(32,0x4d);
function stored(chunks){return chunks.map(chunk=>({startTick:chunk.startTick,endTick:chunk.startTick+chunk.frames.length,
  chunkDigest:require('../lib/combatInputJournalV8.cjs').validateChunk(chunk).chunkDigest}));}

test('RC2 trusted outcome binds origin, journal root, replay, rules, control and resources',async()=>{
  const f=await createC15Rc1Fixture({profileId:'arcade-responsive-v1'}),golden=generateC15VictoryFrames(f),chunks=chunkC15Frames(golden.frames,f.battleId);
  const replay=replayC15CommercialFoundationV1({origin:f.origin,chunks,nowMs:T0+Math.ceil(golden.frames.length*1000/30)+5000,keyRing:f.keyRing});
  const outcome=createC15TrustedOutcomeV1({origin:f.origin,replayResult:replay,chunks:stored(chunks),keyId:KEY_ID,key:KEY,
    issuedAtMs:T0+200000,keyRing:f.keyRing});
  assert.equal(outcome.phase,'rc2-trusted-clear');assert.equal(outcome.controlProfileId,'arcade-responsive-v1');
  assert.equal(outcome.nonEconomic,true);assert.equal(outcome.safeForSettlement,false);assert.equal(outcome.cloudRewards,false);
  assert.equal(verifyC15TrustedOutcomeV1(outcome,{[KEY_ID]:KEY},{uid:f.uid,sessionId:f.sessionId,battleId:f.battleId}),true);
});

test('RC2 outcome rejects journal tamper, missing/reordered chunks and edited signed fields',async()=>{
  const f=await createC15Rc1Fixture(),golden=generateC15VictoryFrames(f),chunks=chunkC15Frames(golden.frames,f.battleId),leaves=stored(chunks);
  assert.throws(()=>journalRoot(leaves.slice(1)),/sequence/);
  const changed=structuredClone(leaves);changed[0].chunkDigest='f'.repeat(64);assert.notEqual(journalRoot(changed),journalRoot(leaves));
  const replay=replayC15CommercialFoundationV1({origin:f.origin,chunks,nowMs:T0+200000,keyRing:f.keyRing});
  const outcome=createC15TrustedOutcomeV1({origin:f.origin,replayResult:replay,chunks:leaves,keyId:KEY_ID,key:KEY,issuedAtMs:T0+200000,keyRing:f.keyRing});
  for(const [field,value] of [['kills',69],['resourceManifestDigest','0'.repeat(64)],['controlProfileDigest','1'.repeat(64)],['mac','2'.repeat(64)]]){
    const edited={...outcome,[field]:value};assert.throws(()=>verifyC15TrustedOutcomeV1(edited,{[KEY_ID]:KEY}),/mismatch|signature|Invalid/);}
});
