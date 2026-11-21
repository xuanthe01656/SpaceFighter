'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {auditC2JKFixedReplayV1}=require('../lib/c15DungeonC2JKFixedReplayV1.cjs');
let modules;
async function fixture(n=90){
  modules||=Promise.all([
    import(pathToFileURL(path.resolve(__dirname,'../../client/src/game/dungeon/DungeonC2JKFixedBallisticJournalV1.js')).href),
    import(pathToFileURL(path.resolve(__dirname,'../../client/src/game/dungeon/DungeonC2CInputGridV1.js')).href),
    import(pathToFileURL(path.resolve(__dirname,'../../client/src/game/dungeon/DungeonC2JKFixedBallisticCoreV1.js')).href)]);
  const [journal,gridModule,core]=await modules;
  const grid=gridModule.createDungeonC2CInputGridV1({sceneSeed:100,
    seedSource:'local-client-seed',initialPlayer:{x:0,z:12.5}});
  const j=journal.createC2JKFixedBallisticJournal({sceneSeed:100,
    seedSource:'local-client-seed',getGrid:()=>grid.snapshot()});
  grid.capturePointer({kind:'down',pointerId:1,atMs:1,position:{x:0,z:12.5},clientX:100,clientY:100});
  grid.capturePointer({kind:'up',pointerId:1,atMs:2,position:{x:0,z:12.5}});
  j.registerShot({id:'bullet-1',sourceId:'enemy-1',origin:{x:0,z:-2},
    velocity:{x:0,z:.5},hitRadius:.8,ttlTicks:60});
  for(let i=0;i<n;i++){
    j.stepFrame(1000/30,{x:0,z:12.5});
    grid.captureFrame({deltaMs:1000/30,player:{x:0,z:12.5},
      playerHp:200,shieldHp:0,enemyCount:0});
  }
  return {record:j.snapshot(),core};
}
const tweak=(record,edit,core)=>{
  const changed=structuredClone(record);edit(changed);
  delete changed.checksum;changed.checksum=core.c2jkHash(changed);return changed;
};
test('C2K imports same ESM pure kernel and replays live shot 90/90',async()=>{
  const {record}=await fixture();const r=await auditC2JKFixedReplayV1(record);
  assert.equal(r.ticksReplayed,90);
  assert.equal(r.contactsReprojected,1);
  assert.equal(r.clientFixedBallisticCoreReprojected,true);
  assert.equal(r.trueApkServerParity,'NOT_VERIFIED');
  assert.equal(r.rewardSettlementEnabled,false);
});
test('C2K can replay 270 fixed ticks with sealed evidence',async()=>{
  const {record}=await fixture(270);
  const r=await auditC2JKFixedReplayV1(record);
  assert.equal(r.ticksReplayed,270);
  assert.equal(record.grid.ticks.length,270);
});
test('C2K rejects accidental corruption checksum',async()=>{
  const {record}=await fixture();record.ticks[0].activeCount=999;
  await assert.rejects(auditC2JKFixedReplayV1(record),/C2JK_CHECKSUM_MISMATCH/);
});
test('C2K rejects fabricated contact after valid checksum recompute',async()=>{
  const {record,core}=await fixture();
  const changed=tweak(record,x=>{x.ticks[2].contacts=['bullet-1'];},core);
  await assert.rejects(auditC2JKFixedReplayV1(changed),/C2JK_REAL_CLIENT_PROJECTILE_DIVERGENCE/);
});
test('C2K rejects altered shot speed after checksum recompute',async()=>{
  const {record,core}=await fixture();
  const changed=tweak(record,x=>{x.shots[0].velocity.z=.45;},core);
  await assert.rejects(auditC2JKFixedReplayV1(changed),/C2JK_REAL_CLIENT_PROJECTILE_DIVERGENCE/);
});
test('C2K rejects inconsistent observed grid pose',async()=>{
  const {record,core}=await fixture();
  const changed=tweak(record,x=>{x.ticks[4].player.x=.5;},core);
  await assert.rejects(auditC2JKFixedReplayV1(changed),/C2JK_FIXED_TICK_INPUT_GRID_MISMATCH/);
});
test('C2K rejects inserted/fake state hash',async()=>{
  const {record,core}=await fixture();
  const changed=tweak(record,x=>{x.ticks[5].stateDigest='12345678';},core);
  await assert.rejects(auditC2JKFixedReplayV1(changed),/C2JK_REAL_CLIENT_PROJECTILE_DIVERGENCE/);
});
test('C2K rejects reward claims even with recomputed checksum',async()=>{
  const {record,core}=await fixture();
  const changed=tweak(record,x=>{x.rewardSettlementEnabled=true;},core);
  await assert.rejects(auditC2JKFixedReplayV1(changed),/C2JK_UNSAFE_OR_UNREVIEWED_RECORD/);
});
test('C2K rejects synthetic server ticket claims in Guest mode',async()=>{
  const {record,core}=await fixture();
  const changed=tweak(record,x=>{x.battleId='aafeaafe-aaaa-4aaa-bbbb-aafeaafeaafe';},core);
  await assert.rejects(auditC2JKFixedReplayV1(changed),/C2JK_UNSAFE_OR_UNREVIEWED_RECORD/);
});
test('C2K rejects extra authority field',async()=>{
  const {record,core}=await fixture();
  const changed=tweak(record,x=>{x.serverTrusted=true;},core);
  await assert.rejects(auditC2JKFixedReplayV1(changed),/C2JK_UNSAFE_OR_UNREVIEWED_RECORD/);
});
test('C2K rejects negative, duplicate and invalid shot IDs',async()=>{
  const {record,core}=await fixture();
  const changed=tweak(record,x=>{x.shots.push({...x.shots[0]});},core);
  await assert.rejects(auditC2JKFixedReplayV1(changed),/C2JK_SHOT_RECORD_INVALID/);
});
test('C2K rejects arbitrary removal of recorded tick',async()=>{
  const {record,core}=await fixture();
  const changed=tweak(record,x=>{x.ticks.splice(4,1);},core);
  await assert.rejects(auditC2JKFixedReplayV1(changed),/C2JK_FIXED_TICK_INPUT_GRID_MISMATCH/);
});
test('C2K can only read project/QA files; never routes into settlement',()=>{
  const s=fs.readFileSync(path.resolve(__dirname,'../lib/c15DungeonC2JKFixedReplayV1.cjs'),'utf8');
  assert.match(s,/rewardSettlementEnabled:false/);
  assert.doesNotMatch(s,/\.collection\(|firestore|firebase-admin|rewardClaim|wallet/);
});
test('C2K does not claim independent AI or damage authority',async()=>{
  const {record}=await fixture();const r=await auditC2JKFixedReplayV1(record);
  assert.equal(r.independentEnemyAiVerified,false);
  assert.equal(r.independentDamageVerified,false);
  assert.equal(r.serverSignedSameSessionVerified,false);
});
