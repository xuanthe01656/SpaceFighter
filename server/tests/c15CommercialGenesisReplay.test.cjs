'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {verifyC15CommercialGenesisV1,verifyC15CommercialOriginV1}=require('../lib/c15CommercialGenesisV1.cjs');
const {replayC15CommercialFoundationV1,verifyC15CommercialReplayResultV1}=require('../lib/c15CommercialReplayV1.cjs');
const {createC15Rc1Fixture,generateC15VictoryFrames,generateC15DefeatFrames,chunkC15Frames,T0}=require('../tools/c15Rc1Fixture.cjs');
test('C15 signed genesis pins rules, descriptor, stage and resource packs',async()=>{
  const f=await createC15Rc1Fixture();
  assert.equal(verifyC15CommercialGenesisV1(f.origin.genesis,f.keyRing),true);
  assert.equal(verifyC15CommercialOriginV1(f.origin,f.keyRing),true);
  assert.equal(f.origin.genesis.stage.waveCount,5);assert.equal(f.origin.genesis.stage.totalEnemies,70);
  assert.equal(f.origin.genesis.safeForSettlement,false);assert.equal(f.origin.genesis.resourcePacks.length,2);
});
test('C15 independent replay verifies full five-wave clear without economic authority',async()=>{
  const f=await createC15Rc1Fixture();const golden=generateC15VictoryFrames(f);const chunks=chunkC15Frames(golden.frames,f.battleId);
  const now=T0+Math.ceil(golden.frames.length*1000/30)+5000;
  const out=replayC15CommercialFoundationV1({origin:f.origin,chunks,nowMs:now,keyRing:f.keyRing});
  assert.equal(out.phase,'rc1-verified-clear');assert.equal(out.waves,5);assert.equal(out.kills,70);
  assert.equal(out.safeForSettlement,false);assert.equal(out.eligibleForSettlement,false);
  assert.equal(verifyC15CommercialReplayResultV1(out,{battleId:f.battleId}),true);
});
test('C15 independent replay verifies real defeat and rejects forged/tampered journal',async()=>{
  const f=await createC15Rc1Fixture();const golden=generateC15DefeatFrames(f);const chunks=chunkC15Frames(golden.frames,f.battleId);
  const now=T0+Math.ceil(golden.frames.length*1000/30)+5000;
  const out=replayC15CommercialFoundationV1({origin:f.origin,chunks,nowMs:now,keyRing:f.keyRing});
  assert.equal(out.phase,'rc1-verified-defeat');assert.equal(out.hp,0);
  const changed=structuredClone(chunks);changed[0].frames[0].x=127;
  assert.throws(()=>replayC15CommercialFoundationV1({origin:f.origin,chunks:changed,nowMs:now,keyRing:f.keyRing}));
  assert.throws(()=>replayC15CommercialFoundationV1({origin:f.origin,chunks,nowMs:T0+100,keyRing:f.keyRing}),/before/);
});
test('C15 replay rejects QA outcome promotion and client result fields',async()=>{
  const f=await createC15Rc1Fixture();const g=generateC15DefeatFrames(f);const chunks=chunkC15Frames(g.frames,f.battleId);
  const forged=structuredClone(chunks);forged[0].victory=true;
  assert.throws(()=>replayC15CommercialFoundationV1({origin:f.origin,chunks:forged,
    nowMs:T0+Math.ceil(g.frames.length*1000/30)+5000,keyRing:f.keyRing}),/untrusted/);
});
