import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  resolveDungeonRaiderOpeningV405, auditDungeonRaiderOpeningV405,
  DUNGEON_RAIDER_OPENING_WINDUP_MS_V405,
} from '../src/game/dungeon/DungeonRaiderOpeningV405.js';
import {
  resolveDungeonEnemyFireDecisionV399, resolveDungeonVolleyReadinessV399,
} from '../src/game/dungeon/DungeonFireReliabilityV399.js';
import { createCampaignEnemyVolleyPlanV34 } from '../src/game/combat/CampaignEnemyVolleyV34.js';
import { createDungeonQaReadinessV400 } from '../src/game/dungeon/DungeonQaReadinessV400.js';
const phase = Object.freeze({ handled:true, phaseId:'skirmish_entry',
  completed:false, mayFire:false, fireWindup:false, facePlayer:false });
const sample = Object.freeze({ choreography:phase, nowMs:1000, enemyX:1,
  enemyZ:-.7, playerX:1, playerZ:12.5, hudOcclusionLineZ:-10,
  fireRangeMin:4.6, fireRangeMax:7.4, canShoot:true, hasProjectile:true });
const decide = (changes={}) => resolveDungeonRaiderOpeningV405({...sample,...changes});

test('V405 production contract self-audit PASS', () => {
  assert.deepEqual(auditDungeonRaiderOpeningV405(),[]);
});
test('Raider arms while visibly approaching and preserves 420ms across entry to attack pass',()=>{
  const before=decide();
  assert.equal(before.reason,'approaching_fire_band');
  assert.equal(before.armedSinceMs,1000);
  assert.equal(before.choreography,phase);
  assert.equal(phase.mayFire,false);
  const near=decide({nowMs:1200,enemyZ:6.5,
    choreography:{...phase,phaseId:'attack_pass_a'},armedSinceMs:before.armedSinceMs});
  assert.equal(near.reason,'in_band_windup');
  assert.equal(near.choreography.mayFire,false);
  assert.equal(near.choreography.fireWindup,true);
  const ready=decide({nowMs:1000 + DUNGEON_RAIDER_OPENING_WINDUP_MS_V405,
    enemyZ:6.5,choreography:{...phase,phaseId:'attack_pass_a'},
    armedSinceMs:before.armedSinceMs});
  assert.equal(ready.reason,'opening_ready');
  assert.equal(ready.choreography.mayFire,true);
});
test('outside actual firing band never fires even if warm-up elapsed',()=>{
  for(const enemyZ of [-.7,1,3.9]) {
    const d=decide({enemyZ,nowMs:2400,armedSinceMs:1000});
    assert.equal(d.choreography.mayFire,false);
    assert.equal(d.choreography.fireWindup,false);
  }
});
test('rear, HUD, lateral and out-of-range geometry cannot produce bullets',()=>{
  for(const x of [
    {enemyZ:-11}, {enemyZ:14}, {enemyZ:9},
    {enemyZ:-5}, {enemyX:12}, {playerZ:3},
    {fireRangeMin:NaN}, {hudOcclusionLineZ:Infinity},
  ]) {
    const d=decide({...x, nowMs:3000,armedSinceMs:1000});
    assert.equal(d.choreography.mayFire,false);
  }
});
test('one opening volley only, no bonus shots in breakaway or after first successful shot',()=>{
  const c={...phase,phaseId:'attack_pass_a'};
  assert.equal(decide({choreography:c,enemyZ:6,nowMs:2000,armedSinceMs:1000}).choreography.mayFire,true);
  assert.equal(decide({choreography:c,enemyZ:6,nowMs:2500,armedSinceMs:1000,alreadyFired:true}).reason,'opening_consumed');
  assert.equal(decide({choreography:{...c,phaseId:'breakaway'},enemyZ:6,
    nowMs:2500,armedSinceMs:1000}).reason,'not_opening_phase');
});
test('no override when shared Campaign FSM already permits a shot',()=>{
  const existing={...phase,mayFire:true,phaseId:'attack_pass_a'};
  const d=decide({choreography:existing,enemyZ:6,nowMs:2000,armedSinceMs:1000});
  assert.equal(d.choreography,existing);
  assert.equal(d.reason,'shared_ready');
});
test('no fake bullet; V399 shot cooldown and V34 catalog volley still gate the shot',()=>{
  const d=decide({enemyZ:6,nowMs:2000,armedSinceMs:1000});
  assert.equal(d.choreography.mayFire,true);
  assert.equal(resolveDungeonEnemyFireDecisionV399({choreography:d.choreography,
    roleId:'raider',nowMs:2000,enemyX:1,enemyZ:6,playerX:1,playerZ:12.5}).mayFire,true);
  assert.equal(resolveDungeonVolleyReadinessV399({mayFire:true,canShoot:true,hasProjectile:true,
    nowMs:2000,lastShoot:1900,shootMs:920}).allowed,false);
  assert.equal(resolveDungeonVolleyReadinessV399({mayFire:true,canShoot:true,hasProjectile:true,
    nowMs:2000,lastShoot:500,shootMs:920}).allowed,true);
  const plan=createCampaignEnemyVolleyPlanV34({roleId:'raider',phaseId:'skirmish_entry',
    sequence:0,burstCount:2,burstGapMs:100,projectileDamage:28,createdAtMs:2000});
  assert.equal(plan.shots.length,2);
});
test('QA-only bounded breakdown distinguishes approach, range, ready and confirmed shot',()=>{
  const q=createDungeonQaReadinessV400({enabled:true,startedAtMs:0});
  q.beginRoom({roomId:'taurus_entry',roomIndex:0,nowMs:1,hp:100});
  q.recordSpawn('raider',{enemyId:'r1',nowMs:100});
  q.recordRaiderOpeningV405({enemyId:'r1',nowMs:500,reason:'approaching_fire_band'});
  q.recordRaiderOpeningV405({enemyId:'r1',nowMs:600,reason:'in_band_windup'});
  q.recordRaiderOpeningV405({enemyId:'r1',nowMs:800,reason:'opening_ready',successfulOpening:true});
  q.recordProjectile('raider',{enemyId:'r1'});
  q.recordEnemyResolved({enemyId:'r1',nowMs:900});
  q.endRoom({nowMs:1100,hp:100});q.finish({nowMs:1100,hp:100,result:'victory'});
  const a=q.snapshot(1100);
  assert.equal(a.raiderOpeningV405.probeSamples,2);
  assert.equal(a.raiderOpeningV405.successfulOpeningVolleys,1);
  assert.equal(a.raiderOpeningV405.reasons.approaching_fire_band,1);
  assert.equal(a.raiderOpeningV405.reasons.opening_ready,1);
  assert.equal(a.shotsByRole.raider,1);
  assert.equal(a.dungeonRaiderOpeningVersion,'dungeon-raider-opening-v4.0.5');
  assert.equal(a.productionApproved,false);
  assert.equal(createDungeonQaReadinessV400().snapshot(),null);
});
test('live Dungeon scene wires V405 to V399 and does not touch Campaign or reward sources',()=>{
  const scene=readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/Dungeon/DungeonScene.js'),'utf8');
  assert.match(scene,/resolveDungeonRaiderOpeningV405\(/);
  assert.match(scene,/VITE_SF_DUNGEON_RAIDER_OPENING_V405/);
  assert.match(scene,/tryFireDungeonEnemyVolleyV38\(enemy, firingStateV399, nowMs\)/);
  assert.match(scene,/enemy\._raiderOpeningVolleyDoneV405 = true/);
  const own=readFileSync(new URL('../src/game/dungeon/DungeonRaiderOpeningV405.js',import.meta.url),'utf8');
  assert.doesNotMatch(own,/Firebase|localStorage|award|credit|serverRequest|setTimeout/);
});
