'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {auditDungeonC2ECombatWitnessV1,createC15DungeonC2ECausalAuditV1}=require('../lib/c15DungeonC2ECausalAuditV1.cjs');
const {GameError}=require('../lib/economy.cjs');
const read=x=>JSON.parse(JSON.stringify(x));
const fnv=text=>{let h=2166136261;
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;
  return h.toString(16).padStart(8,'0');};
const reseal=record=>{const {checksum,...body}=record;return {...body,checksum:fnv(JSON.stringify(body))};};
let generated;
async function make(){
  if(generated)return read(generated);
  const {createDungeonC2CInputGridV1}=await import('../../client/src/game/dungeon/DungeonC2CInputGridV1.js');
  const {createDungeonC2ECombatWitnessV1}=await import('../../client/src/game/dungeon/DungeonC2ECombatWitnessV1.js');
  const {buildDungeonRoomSpawnPlanV38}=await import('../../client/src/game/dungeon/DungeonEncounterDirectorV38.js');
  const {resolveDungeonEnemySpecV38}=await import('../../client/src/game/dungeon/DungeonCombatAdapterV38.js');
  const seed=12345,grid=createDungeonC2CInputGridV1({sceneSeed:seed,
    seedSource:'local-client-seed',initialPlayer:{x:0,z:12.5}});
  const witness=createDungeonC2ECombatWitnessV1({sceneSeed:seed,
    seedSource:'local-client-seed',getGrid:()=>grid.snapshot()});
  const plan=buildDungeonRoomSpawnPlanV38({dungeonId:'dung_taurus',roomIndex:0,seed});
  const entry=plan.entries[0];
  const spec=resolveDungeonEnemySpecV38({dungeonId:'dung_taurus',room:plan.room,entry});
  witness.capture({kind:'room_start'});
  grid.capturePointer({kind:'down',pointerId:3,atMs:10,position:{x:0,z:12.5},clientX:10,clientY:10});
  let enemyCount=0;
  for(let i=1;i<=80;i++){
    if(i===26){witness.capture({kind:'enemy_spawn',enemyId:entry.id,roleId:entry.roleId,hp:spec.hp});enemyCount=1;}
    if(i===30 && spec.canShoot && spec.weapon?.projectile)witness.capture({kind:'enemy_fire',
      enemyId:entry.id,bulletId:'test-bullet-1',amount:12,
      origin:{x:0,z:-4},velocity:{x:0,z:0.2}});
    if(i===34 && spec.canShoot && spec.weapon?.projectile)witness.capture({kind:'projectile_contact',
      enemyId:entry.id,bulletId:'test-bullet-1',hp:100});
    if(i===36)witness.capture({kind:'enemy_hit',enemyId:entry.id,amount:10,hp:spec.hp-10});
    if(i===37){witness.capture({kind:'enemy_hit',enemyId:entry.id,
      amount:spec.hp-10,hp:0});witness.capture({kind:'enemy_death',enemyId:entry.id});enemyCount=0;}
    if(i===2)grid.capturePointer({kind:'up',pointerId:3,atMs:30,position:{x:0,z:12.5}});
    grid.captureFrame({deltaMs:1000/30+.001,player:{x:0,z:12.5},
      playerHp:100,shieldHp:0,enemyCount});
  }
  generated=witness.snapshot();
  return read(generated);
}
test('C2E independently recomputes Taurus plan and replays real-event causal chain',async()=>{
  const report=await auditDungeonC2ECombatWitnessV1(await make());
  assert.equal(report.causalSubsetPass,true);
  assert.equal(report.gridTicks,80);
  assert.equal(report.observedSpawnPrefix,1);
  assert.equal(report.observedEnemyResolutions,1);
  assert.equal(report.observedEnemyCountDivergenceTicks,0);
  assert.equal(report.fullCombatReplayVerified,false);
  assert.equal(report.safeForSettlement,false);
  assert.equal(report.trueApkServerParity,'NOT_VERIFIED');
  assert.match(report.encounterCatalogDigest,/^[a-f0-9]{64}$/);
});
test('C2E forged checksum fails closed',async()=>{
  const x=await make();x.events[0].kind='enemy_hit';
  await assert.rejects(()=>auditDungeonC2ECombatWitnessV1(x),/C2E_CHECKSUM_MISMATCH/);
});
test('C2E modified event with recomputed FNV cannot bypass authored spawn plan',async()=>{
  const x=await make();x.events.find(e=>e.kind==='enemy_spawn').enemyId='fake-plan-id';
  await assert.rejects(()=>auditDungeonC2ECombatWitnessV1(reseal(x)),/C2E_SPAWN_CATALOG_DIVERGENCE/);
});
test('C2E fake client HP arithmetic fails even with recomputed checksum',async()=>{
  const x=await make();x.events.find(e=>e.kind==='enemy_hit').amount=500;
  await assert.rejects(()=>auditDungeonC2ECombatWitnessV1(reseal(x)),/C2E_ENEMY_HP_CAUSAL_DIVERGENCE/);
});
test('C2E duplicate projectile collision is rejected after checksum rewrite',async()=>{
  const x=await make();const contact=x.events.find(e=>e.kind==='projectile_contact');
  if(!contact)return; // authored initial role may not be a shooter
  x.events.splice(x.events.indexOf(contact)+1,0,{...contact});
  x.events.forEach((e,i)=>e.seq=i+1);
  await assert.rejects(()=>auditDungeonC2ECombatWitnessV1(reseal(x)),/C2E_PROJECTILE_CONTACT_UNPAIRED/);
});
test('C2E grid swapped to another seed fails regardless of recomputed FNV',async()=>{
  const x=await make();x.grid.sceneSeed+=1;
  await assert.rejects(()=>auditDungeonC2ECombatWitnessV1(reseal(x)),/C2E_GRID_BATTLE_SEED_MISMATCH/);
});
test('C2E witness does not trust a stale or tampered C2C pointer checksum',async()=>{
  const x=await make();x.grid.pointerEvents[0].atMs+=1;
  await assert.rejects(()=>auditDungeonC2ECombatWitnessV1(reseal(x)),/C2D_CHECKSUM_MISMATCH/);
});
test('C2E enemy-count mismatch is explicitly NOT a causal-subset PASS',async()=>{
  const x=await make();x.grid.ticks[60].observedEnemyCount=2;
  const {checksum,...body}=x.grid;x.grid.checksum=fnv(JSON.stringify(body));
  const r=await auditDungeonC2ECombatWitnessV1(reseal(x));
  assert.equal(r.causalSubsetPass,false);
  assert.equal(r.status,'ENCOUNTER_OBSERVATION_DIVERGENCE');
});
test('C2E disabled without independent approval and C2B/C2D verified services',async()=>{
  const svc=createC15DungeonC2ECausalAuditV1({env:{GAME_C15_DUNGEON_C2E_ENABLED:'true',
    GAME_C15_DUNGEON_C2E_QA_APPROVED:'true'}});
  assert.equal(svc.enabled,false);
  await assert.rejects(()=>svc.audit({}),err=>err.code==='C15_DUNGEON_C2E_DISABLED');
  assert.throws(()=>svc.claim(),err=>err.code==='C15_DUNGEON_SERVER_REPLAY_REQUIRED');
});
test('C2E server gate binds C2B/C2D ticket, refuses wrong battle and spawn digests',async()=>{
  const original=await make();
  const UUID='01234567-89ab-cdef-0123-456789abcdef';
  original.battleId=UUID;original.seedSource='server-ticket-local-unverified';
  original.grid.battleId=UUID;original.grid.seedSource='server-ticket-local-unverified';
  let body=read(original.grid);delete body.checksum;
  original.grid.checksum=fnv(JSON.stringify(body));
  const record=reseal(original);
  let checks=0;
  const c2d={enabled:true,stagingOnly:true,rewardSettlementEnabled:false,
    audit:async()=>{checks++;return {battleId:UUID,serverSignedTicketVerified:true,
      serverSelectedLoadoutVerified:true,rewardSettlementEnabled:false};}};
  const c2b={enabled:true,stagingOnly:true,rewardSettlementEnabled:false};
  const svc=createC15DungeonC2ECausalAuditV1({env:{GAME_C15_DUNGEON_C2E_ENABLED:'true',
    GAME_C15_DUNGEON_C2E_QA_APPROVED:'true'},c2bService:c2b,c2dService:c2d});
  const expected=await auditDungeonC2ECombatWitnessV1(record);
  const ticket={battleId:UUID,sceneSeed:record.sceneSeed,spawnPlanDigest:expected.encounterCatalogDigest};
  const yes=await svc.audit({uid:'approved',sessionId:'sid',ticket,record});
  assert.equal(yes.serverQaTicketVerified,true);assert.equal(checks,1);
  assert.equal(yes.fullCombatReplayVerified,false);
  await assert.rejects(()=>svc.audit({ticket:{...ticket,spawnPlanDigest:'a'.repeat(64)},record}),
    err=>err.code==='C15_DUNGEON_C2E_BATTLE_OR_PLAN_MISMATCH');
  assert.equal(checks,1);
});

test('C2E forged observed role is rejected despite recomputing checksum',async()=>{
  const x=await make();x.events.find(e=>e.kind==='enemy_spawn').roleId='fake';
  await assert.rejects(()=>auditDungeonC2ECombatWitnessV1(reseal(x)),/C2E_SPAWN_CATALOG_DIVERGENCE/);
});
test('C2E fake full combat parity claim is rejected even with valid FNV',async()=>{
  const x=await make();x.fullCombatReplayVerified=true;
  await assert.rejects(()=>auditDungeonC2ECombatWitnessV1(reseal(x)),/C2E_UNSAFE_OR_INVALID_RECORD/);
});
test('C2E event moved outside sampled ticks cannot be counted as replay',async()=>{
  const x=await make();x.events[x.events.length-1].tick=81;
  await assert.rejects(()=>auditDungeonC2ECombatWitnessV1(reseal(x)),/C2E_EVENT_SCHEMA_OR_ORDER/);
});
test('C2E duplicate room starts are fail-closed',async()=>{
  const x=await make();const duplicate={...x.events[0]};duplicate.seq=2;
  x.events.splice(1,0,duplicate);x.events.forEach((e,i)=>e.seq=i+1);
  await assert.rejects(()=>auditDungeonC2ECombatWitnessV1(reseal(x)),/C2E_ROOM_START_INVALID/);
});
test('C2E staging path rejects guest seed even with forged matching ticket',async()=>{
  const record=await make();
  const signed={enabled:true,stagingOnly:true,rewardSettlementEnabled:false};
  const svc=createC15DungeonC2ECausalAuditV1({env:{GAME_C15_DUNGEON_C2E_ENABLED:'true',
    GAME_C15_DUNGEON_C2E_QA_APPROVED:'true'},c2bService:signed,
    c2dService:{...signed,audit:async()=>{throw new Error('MUST_NOT_BE_CALLED');}}});
  const report=await auditDungeonC2ECombatWitnessV1(record);
  await assert.rejects(()=>svc.audit({ticket:{battleId:null,sceneSeed:record.sceneSeed,
    spawnPlanDigest:report.encounterCatalogDigest},record}),
    err=>err.code==='C15_DUNGEON_C2E_BATTLE_OR_PLAN_MISMATCH');
});
