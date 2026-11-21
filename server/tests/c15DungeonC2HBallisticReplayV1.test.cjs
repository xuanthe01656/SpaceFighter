'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {auditDungeonC2HBallisticReplayV1}=require('../lib/c15DungeonC2HBallisticReplayV1.cjs');
const deep=x=>JSON.parse(JSON.stringify(x));
function fnv(text){let h=2166136261;
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;
  return h.toString(16).padStart(8,'0');
}
function reseal(x){const {checksum,...body}=x;return {...body,checksum:fnv(JSON.stringify(body))};}
let generated;
async function fixture(){
  if(generated)return deep(generated);
  const {createDungeonC2CInputGridV1}=await import('../../client/src/game/dungeon/DungeonC2CInputGridV1.js');
  const {createDungeonC2ECombatWitnessV1}=await import('../../client/src/game/dungeon/DungeonC2ECombatWitnessV1.js');
  const {buildDungeonRoomSpawnPlanV38}=await import('../../client/src/game/dungeon/DungeonEncounterDirectorV38.js');
  const {resolveDungeonEnemySpecV38}=await import('../../client/src/game/dungeon/DungeonCombatAdapterV38.js');
  const seed=3060395586,position={x:0,z:12.5};
  const grid=createDungeonC2CInputGridV1({sceneSeed:seed,
    seedSource:'local-client-seed',initialPlayer:position});
  const witness=createDungeonC2ECombatWitnessV1({sceneSeed:seed,
    seedSource:'local-client-seed',getGrid:()=>grid.exportCombatEvidence(),
    getTick:()=>grid.tickCount});
  const plan=buildDungeonRoomSpawnPlanV38({dungeonId:'dung_taurus',roomIndex:0,seed});
  const e=plan.entries[0],s=resolveDungeonEnemySpecV38({dungeonId:'dung_taurus',room:plan.room,entry:e});
  assert.equal(s.weapon.projectile.aimMode,'predictive');
  witness.capture({kind:'room_start'});
  assert.equal(grid.capturePointer({kind:'down',pointerId:1,atMs:10,position,clientX:50,clientY:50}),true);
  assert.equal(grid.capturePointer({kind:'up',pointerId:1,atMs:20,position}),true);
  let enemyCount=0,hp=100;
  for(let i=1;i<=95;i++){
    if(i===35){witness.capture({kind:'enemy_spawn',enemyId:e.id,roleId:e.roleId,hp:s.hp});enemyCount=1;}
    if(i===55)witness.capture({kind:'enemy_fire',enemyId:e.id,
      bulletId:'test-straight-1',amount:25,
      origin:{x:0,z:11.2},velocity:{x:0,z:s.weapon.projectile.speed}});
    if(i===56){hp=90;witness.capture({kind:'projectile_contact',enemyId:e.id,
      bulletId:'test-straight-1',hp});}
    assert.equal(grid.captureFrame({deltaMs:1000/30+.0001,player:position,
      playerHp:hp,shieldHp:0,enemyCount}),true);
  }
  generated=witness.snapshot();
  return deep(generated);
}
test('C2H projects a catalog-speed shot into a real 30Hz input observation',async()=>{
  const r=await auditDungeonC2HBallisticReplayV1(await fixture());
  assert.equal(r.ballisticSubsetPass,true);
  assert.equal(r.comparedContactEvents,1);
  assert.equal(r.comparedFireEvents,1);
  assert.equal(r.matchedImpactHpObservationTicks,1);
  assert.equal(r.fullCombatReplayVerified,false);
  assert.equal(r.trueApkServerParity,'NOT_VERIFIED');
  assert.equal(r.rewardSettlementEnabled,false);
});
test('C2H rejects authored projectile speed change even with new FNV checksum',async()=>{
  const x=await fixture();x.events.find(e=>e.kind==='enemy_fire').velocity.z=.12;
  await assert.rejects(()=>auditDungeonC2HBallisticReplayV1(reseal(x)),/C2H_AUTHORED_SHOT_SPEED_DIVERGENCE/);
});
test('C2H rejects an impossible shot trajectory after checksum reseal',async()=>{
  const x=await fixture();x.events.find(e=>e.kind==='enemy_fire').origin.z=-10;
  await assert.rejects(()=>auditDungeonC2HBallisticReplayV1(reseal(x)),/C2H_PROJECTILE_TRAJECTORY_DIVERGED/);
});
test('C2H rejects client contact HP that does not equal observed tick HP',async()=>{
  const x=await fixture();x.events.find(e=>e.kind==='projectile_contact').hp=5;
  await assert.rejects(()=>auditDungeonC2HBallisticReplayV1(reseal(x)),/C2H_CONTACT_HP_OBSERVER_DIVERGENCE/);
});
test('C2H does not upgrade input observer frame time to fixed-tick authority',async()=>{
  const x=await fixture();const report=await auditDungeonC2HBallisticReplayV1(x);
  assert.equal(x.tickBasis,'accumulated-babylon-delta-not-fixed-combat-simulation');
  assert.equal(report.fixedTickCombatSimulationVerified,false);
  assert.equal(report.independentlyComputedDamage,false);
  assert.equal(report.independentlySimulatedEnemyAi,false);
  assert.equal(report.serverSignedTicketVerified,false);
});
test('C2H rejects a forged full combat parity claim even with new FNV',async()=>{
  const x=await fixture();x.fullCombatReplayVerified=true;
  await assert.rejects(()=>auditDungeonC2HBallisticReplayV1(reseal(x)),/C2E_UNSAFE_OR_INVALID_RECORD/);
});
test('C2H rejects a mismatched grid count, not just the projectile record',async()=>{
  const x=await fixture();x.grid.ticks[75].observedEnemyCount=0;
  x.grid=reseal(x.grid);
  const report=await assert.rejects(()=>auditDungeonC2HBallisticReplayV1(reseal(x)),
    /C2H_C2E_CAUSAL_SUBSET_REQUIRED/);
  assert.equal(report,undefined);
});
test('C2H reports no settlement path and exposes a stable read-only QA digest',async()=>{
  const x=await fixture();const a=await auditDungeonC2HBallisticReplayV1(x);
  const b=await auditDungeonC2HBallisticReplayV1(x);
  assert.equal(a.projectionDigest,b.projectionDigest);
  assert.match(a.projectionDigest,/^[0-9a-f]{64}$/);
  assert.equal(a.safeForSettlement,false);
  assert.equal(a.cloudRewards,false);
  assert.equal(Object.isFrozen(a),true);
});
test('C2H no projectile contact is INCOMPLETE, not false PASS',async()=>{
  const x=await fixture();x.events=x.events.filter(e=>e.kind!=='projectile_contact');
  x.grid.ticks.forEach(row=>{row.observedHp=100;});
  x.grid=reseal(x.grid);
  const result=await auditDungeonC2HBallisticReplayV1(reseal(x));
  assert.equal(result.ballisticSubsetPass,false);
  assert.equal(result.comparedContactEvents,0);
});
