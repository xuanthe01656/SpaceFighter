'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {auditDungeonC2ECombatWitnessV1}=require('../lib/c15DungeonC2ECausalAuditV1.cjs');
const fnv=text=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;return h.toString(16).padStart(8,'0');};
const reseal=x=>{const {checksum,...body}=x;return {...body,checksum:fnv(JSON.stringify(body))};};
let fixture;
async function make(){
  if(fixture)return structuredClone(fixture);
  const {createDungeonC2CInputGridV1}=await import('../../client/src/game/dungeon/DungeonC2CInputGridV1.js');
  const {createDungeonC2ECombatWitnessV1}=await import('../../client/src/game/dungeon/DungeonC2ECombatWitnessV1.js');
  const {buildDungeonRoomSpawnPlanV38}=await import('../../client/src/game/dungeon/DungeonEncounterDirectorV38.js');
  const {resolveDungeonEnemySpecV38}=await import('../../client/src/game/dungeon/DungeonCombatAdapterV38.js');
  const seed=3060395586;const initial={x:0,z:12.5};
  const grid=createDungeonC2CInputGridV1({sceneSeed:seed,seedSource:'local-client-seed',initialPlayer:initial});
  const witness=createDungeonC2ECombatWitnessV1({sceneSeed:seed,seedSource:'local-client-seed',
    getGrid:()=>grid.exportCombatEvidence(),getTick:()=>grid.tickCount});
  const plan=buildDungeonRoomSpawnPlanV38({dungeonId:'dung_taurus',roomIndex:0,seed});
  const entry=plan.entries[0];const spec=resolveDungeonEnemySpecV38({
    dungeonId:'dung_taurus',room:plan.room,entry});
  witness.capture({kind:'room_start'});
  grid.capturePointer({kind:'down',pointerId:1,atMs:1,position:initial,clientX:200,clientY:700});
  grid.capturePointer({kind:'up',pointerId:1,atMs:2,position:initial});
  for(let i=1;i<=180;i++){
    if(i===25)witness.capture({kind:'enemy_spawn',enemyId:entry.id,roleId:entry.roleId,hp:spec.hp});
    grid.captureFrame({deltaMs:1000/30+.001,player:initial,playerHp:100,
      shieldHp:0,enemyCount:i>=25?1:0});
  }
  fixture=structuredClone(witness.snapshot());
  return structuredClone(fixture);
}
test('C2G independently checks earliest possible catalog-spawn time in a 180-tick window',async()=>{
  const x=await make();const r=await auditDungeonC2ECombatWitnessV1(x);
  assert.equal(r.causalSubsetPass,true);
  assert.equal(r.observedSpawnPrefix,1);
  assert.equal(r.gridTicks,180);
  assert.equal(r.extendedCaptureAtLeastFiveSeconds,true);
  assert.equal(r.earliestSpawnScheduleSlackMs,350);
  assert.equal(r.trueApkServerParity,'NOT_VERIFIED');
});
test('C2G forged impossibly early spawn is rejected even with recalculated checksum',async()=>{
  const x=await make();x.events[1].tick=2;
  await assert.rejects(()=>auditDungeonC2ECombatWitnessV1(reseal(x)),/C2F_PREMATURE_CATALOG_SPAWN/);
});
test('C2G changing seed without a consistent plan fails closed',async()=>{
  const x=await make();x.sceneSeed=3;x.grid.sceneSeed=3;
  x.grid=reseal(x.grid);
  await assert.rejects(()=>auditDungeonC2ECombatWitnessV1(reseal(x)),/C2E_SPAWN_CATALOG_DIVERGENCE/);
});
test('C2G extended evidence preserves strict no-rewards and no-authoritative flags',async()=>{
  const x=await make();x.safeForSettlement=true;
  await assert.rejects(()=>auditDungeonC2ECombatWitnessV1(reseal(x)),/C2E_UNSAFE_OR_INVALID_RECORD/);
});
