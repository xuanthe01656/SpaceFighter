import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  resolveDungeonRaiderEntryFireV404,
  auditDungeonEngagementV404,
  DUNGEON_RAIDER_WINDUP_MS_V404,
} from '../src/game/dungeon/DungeonEngagementContractV404.js';
import { createDungeonQaReadinessV400 } from '../src/game/dungeon/DungeonQaReadinessV400.js';
import { resolveDungeonEnemyFireDecisionV399, resolveDungeonVolleyReadinessV399 } from '../src/game/dungeon/DungeonFireReliabilityV399.js';
import { createCampaignEnemyVolleyPlanV34 } from '../src/game/combat/CampaignEnemyVolleyV34.js';
const entry = Object.freeze({ handled:true, phaseId:'skirmish_entry',mayFire:false,
  fireWindup:false,completed:false,facePlayer:false });
const sample = { choreography:entry,roleId:'raider', nowMs:1800,
  enemyX:0,enemyZ:4.8,playerX:1,playerZ:12,hudOcclusionLineZ:-7,
  fireRangeMin:4.6,fireRangeMax:7.4,canShoot:true,hasProjectile:true };
const decide=(changes={})=>resolveDungeonRaiderEntryFireV404({...sample,...changes});

test('V4.0.4 product contract audit passes',()=>assert.deepEqual(auditDungeonEngagementV404(),[]));
test('Raider approach winds up visibly, then allows exactly a genuine V399 volley opportunity',()=>{
  const first=decide();
  assert.equal(first.choreography.mayFire,false);
  assert.equal(first.choreography.fireWindup,true);
  assert.equal(first.choreography.facePlayer,true);
  assert.equal(first.enteredAtMs,1800);
  assert.equal(entry.mayFire,false); // no Campaign FSM mutation
  const second=decide({nowMs:1800+DUNGEON_RAIDER_WINDUP_MS_V404-1,enteredAtMs:first.enteredAtMs});
  assert.equal(second.choreography.mayFire,false);
  const ready=decide({nowMs:1800+DUNGEON_RAIDER_WINDUP_MS_V404,enteredAtMs:first.enteredAtMs});
  assert.equal(ready.choreography.mayFire,true);
  assert.equal(ready.choreography.phaseId,'skirmish_entry');
  assert.equal(ready.reason,'entry_fire_ready');
});
test('only one entry volley even when cooldown expires before shared FSM advances',()=>{
  const first=decide({nowMs:2500,enteredAtMs:1800});
  assert.equal(first.choreography.mayFire,true);
  const another=decide({nowMs:5000,enteredAtMs:1800,lastVolleyPhaseId:'skirmish_entry'});
  assert.equal(another.choreography,entry);
  assert.equal(another.enteredAtMs,null);
});
test('no fake fire outside HUD or from behind/too close/too far or sideways',()=>{
  for (const change of [
    {enemyZ:-7.2}, {enemyZ:14}, {enemyZ:10}, {enemyZ:1.5}, {enemyX:-7.5},
  ]) {
    const d=decide({...change,nowMs:2600,enteredAtMs:1800});
    assert.equal(d.choreography,entry);
    assert.equal(d.enteredAtMs,null);
  }
});
test('valid approach that is still outside authored fire distance cannot wind up or fire early',()=>{
  const d=decide({enemyZ:2.9, nowMs:2600,enteredAtMs:1800});
  assert.equal(d.choreography.mayFire,false);
  assert.equal(d.choreography.fireWindup,false);
  assert.equal(d.enteredAtMs,null);
});
test('wind-up resets on losing envelope, blocking delayed instant shot re-entry',()=>{
  const outside=decide({enemyZ:-9,nowMs:2400,enteredAtMs:1800});
  assert.equal(outside.enteredAtMs,null);
  const reentered=decide({nowMs:2420,enteredAtMs:outside.enteredAtMs});
  assert.equal(reentered.enteredAtMs,2420);
  assert.equal(reentered.choreography.mayFire,false);
});
test('non-raider, charger, completed, already attacking and no-weapon remain shared FSM',()=>{
  for(const change of [
    {roleId:'gunner'}, {roleId:'charger'}, {enabled:false}, {canShoot:false}, {hasProjectile:false},
    {choreography:{...entry,phaseId:'attack_pass_a'}},
    {choreography:{...entry,completed:true}},
  ]) assert.equal(decide(change).choreography,change.choreography??entry);
});
test('invalid geometry, timestamps and catalog fields never enable a shot',()=>{
  for (const change of [
    {hudOcclusionLineZ:NaN}, {enemyX:Infinity}, {fireRangeMin:NaN},
    {fireRangeMax:4}, {nowMs:NaN},
  ]) assert.equal(decide(change).choreography,entry);
});
test('Dungeon account and Guest QA both use same runtime; Campaign and loot unchanged',()=>{
  const p=path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/Dungeon/DungeonScene.js');
  const scene=fs.readFileSync(p,'utf8');
  assert.match(scene,/resolveDungeonRaiderEntryFireV404\(/);
  assert.match(scene,/VITE_SF_DUNGEON_RAIDER_ENTRY_FIRE_V404/);
  assert.match(scene,/combatResultV404 = raiderEntryV404\.choreography/);
  assert.match(scene,/enemy\.spec\.roleId === 'raider'/);
  assert.match(scene,/choreography: combatResultV404/);
  assert.match(scene,/tryFireDungeonEnemyVolleyV38\(enemy, firingStateV399, nowMs\)/);
  const module=fs.readFileSync(new URL('../src/game/dungeon/DungeonEngagementContractV404.js',import.meta.url),'utf8');
  assert.doesNotMatch(module,/localStorage|Firebase|recordGuestEventKill|setTimeout|bossHp\s*-=/);
});
test('telemetry labels no_fire_intent separately instead of fallback other',()=>{
  const r=createDungeonQaReadinessV400({enabled:true});
  r.beginRoom({roomId:'ambush',nowMs:0});
  r.recordSpawn('raider',{enemyId:'r1',nowMs:1});
  r.recordFireProbe({enemyId:'r1',nowMs:400,reason:'no_fire_intent'});
  r.recordFireProbe({enemyId:'r1',nowMs:800,reason:'no_fire_intent'});
  r.recordFireProbe({enemyId:'r1',nowMs:1300,reason:'invalid_position'});
  const q=r.snapshot(1500);
  assert.equal(q.fireProbeByRole.raider.no_fire_intent,2);
  assert.equal(q.fireProbeByReason.invalid_position,1);
  assert.equal(q.fireProbeByReason.other,0);
});
test('QA report is never an auto-release gate',()=>{
  const r=createDungeonQaReadinessV400({enabled:true});
  r.beginRoom({roomId:'r',nowMs:1});r.recordSpawn('raider',{enemyId:'p',nowMs:2});
  r.recordEnemyResolved({enemyId:'p',nowMs:5000});
  r.finish({nowMs:6000,result:'victory'});
  const q=r.snapshot(6000);
  assert.equal(q.productionApproved,false);
  assert.equal(q.dungeonEngagementVersion,'dungeon-engagement-v4.0.4');
  assert.ok(q.reviewFlags.includes('LONG_LIVED_RANGED_NO_SHOT_REVIEW'));
  assert.equal(createDungeonQaReadinessV400().snapshot(),null);
});

test('V4.0.4 real V399 gate and Campaign V34 volley contract create two ordered shots',()=>{
  const state=decide({nowMs:2300,enteredAtMs:1800}).choreography;
  const decision=resolveDungeonEnemyFireDecisionV399({
    choreography:state, roleId:'raider',canShoot:true,hasProjectile:true,
    nowMs:2300,enemyX:0,enemyZ:4.8,playerX:1,playerZ:12,
  });
  assert.equal(decision.mayFire,true);
  const ready=resolveDungeonVolleyReadinessV399({
    mayFire:decision.mayFire, canShoot:true, hasProjectile:true,
    nowMs:2300,lastShoot:1200,shootMs:980,
  });
  assert.equal(ready.allowed,true);
  const plan=createCampaignEnemyVolleyPlanV34({
    roleId:'raider',phaseId:state.phaseId,createdAtMs:2300,
    burstCount:2,burstGapMs:105,projectileDamage:30,
  });
  assert.deepEqual(plan.shots.map(s=>s.fireOffsetMs),[0,105]);
  assert.equal(Object.isFrozen(plan),true);
  const cooling=resolveDungeonVolleyReadinessV399({
    mayFire:true,canShoot:true,hasProjectile:true,nowMs:2400,
    lastShoot:2300,shootMs:980,
  });
  assert.equal(cooling.allowed,false);
});
