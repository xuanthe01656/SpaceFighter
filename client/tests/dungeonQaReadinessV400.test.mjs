import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  DUNGEON_QA_READINESS_VERSION_V400,
  DUNGEON_QA_READINESS_POLICY_V400,
  createDungeonQaReadinessV400,
  auditDungeonQaReadinessV400,
} from '../src/game/dungeon/DungeonQaReadinessV400.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const make = options => createDungeonQaReadinessV400({ enabled: true, dungeonId: 'dung_abaddon',
  presetId: 'fortress_mk4', startedAtMs: 1000, ...options });

test('V4.0.1 QA reader is audit-clean and production-disabled by default', () => {
  assert.equal(DUNGEON_QA_READINESS_VERSION_V400, 'dungeon-qa-readiness-v4.0.1');
  assert.deepEqual(auditDungeonQaReadinessV400(), []);
  const disabled = createDungeonQaReadinessV400();
  assert.equal(disabled.beginRoom({roomId:'a'}), false);
  disabled.recordProjectile('gunner');
  disabled.recordDamage({source:'projectile',hpBefore:10,hpAfter:0});
  assert.equal(disabled.snapshot(), null);
});

test('room boundary, source-specific damage, real projectile and telegraph counts', () => {
  const m = make();
  m.beginRoom({roomId:'abaddon_entry', roomIndex:0, nowMs:1100, hp:1200});
  m.recordSpawn('raider'); m.recordSpawn('charger'); m.recordSpawn('gunner');
  m.recordVolley('raider'); m.recordProjectile('raider'); m.recordProjectile('raider');
  m.recordTelegraph(); m.recordHazardDestroyed();
  m.recordDamage({source:'contact',hpBefore:1200,hpAfter:1180});
  m.recordDamage({source:'projectile',hpBefore:1180,hpAfter:1120});
  m.recordDamage({source:'environment',hpBefore:1120,hpAfter:1120,dodged:true});
  m.endRoom({nowMs:19100,hp:1120});
  const report=m.snapshot(20000);
  assert.equal(report.rooms[0].durationMs,18000);
  assert.equal(report.rangedSpawns,2);
  assert.equal(report.spawns,3);
  assert.equal(report.projectiles,2);
  assert.equal(report.telegraphs,1);
  assert.equal(report.destroyedHazards,1);
  assert.equal(report.damageTaken,80);
  assert.equal(report.damageBySource.contact,20);
  assert.equal(report.damageBySource.projectile,60);
  assert.equal(report.dodged,1);
  assert.equal(report.productionApproved,false);
  assert.equal(report.releaseStatus,'APK_QA_REVIEW_REQUIRED');
  assert.ok(!JSON.stringify(report).includes('profileId'));
});

test('one-room direct QA does not invent four missing rooms', () => {
  const m=make({runMode:'single_room',expectedRooms:5});
  m.beginRoom({roomId:'abaddon_leviathan',roomIndex:4,kind:'boss',nowMs:2000,hp:500});
  m.recordVolley('boss');m.recordTelegraph();m.recordProjectile('boss');
  m.endRoom({nowMs:52000,hp:100});
  m.finish({nowMs:53000,hp:100,result:'victory'});
  const r=m.snapshot(1000000);
  assert.equal(r.runMode,'single_room');
  assert.equal(r.expectedRooms,5);
  assert.equal(r.rooms.length,1);
  assert.equal(r.rooms[0].roomIndex,4);
  assert.equal(r.elapsedMs,52000);
  assert.equal(r.outcome,'victory');
  assert.deepEqual(r.reviewFlags,[]);
});

test('ranged enemies alive without any actual bullet yield a review flag', () => {
  const m=make();
  m.beginRoom({roomId:'a',roomIndex:0,nowMs:1100});
  m.recordSpawn('gunner');m.recordSpawn('artillery');
  const report=m.snapshot(12000);
  assert.ok(report.reviewFlags.includes('RANGED_SPAWNED_NO_PROJECTILE'));
  m.recordProjectile('gunner');
  assert.ok(!m.snapshot(12000).reviewFlags.includes('RANGED_SPAWNED_NO_PROJECTILE'));
});

test('performance sampler throttles and reports low FPS without retaining frames', () => {
  const m=make();m.beginRoom({roomId:'a',roomIndex:0,nowMs:1000});
  for(let i=0;i<40;i++){
    assert.equal(m.sample({nowMs:1300+i*300,frameMs:40,enemyCount:8,projectileCount:32}),true);
    assert.equal(m.sample({nowMs:1301+i*300,frameMs:40,enemyCount:8}),false);
  }
  const r=m.snapshot(18000);
  assert.equal(r.sampleCount,40);
  assert.equal(r.peakHostileProjectiles,32);
  assert.equal(r.averageFps,25);
  assert.equal(r.lowFpsPercent,100);
  assert.ok(r.reviewFlags.includes('AVERAGE_FPS_REVIEW'));
  assert.ok(r.reviewFlags.includes('LOW_FPS_SPIKES_REVIEW'));
});

test('room tracking bounded and duplicate finishes cannot mutate closed evidence', () => {
  const m=make();
  for(let i=0;i<25;i++){m.beginRoom({roomId:`room_${i}`,roomIndex:i,nowMs:i*1000});m.endRoom({nowMs:i*1000+500});}
  assert.equal(m.snapshot(40000).rooms.length,DUNGEON_QA_READINESS_POLICY_V400.maxRooms);
  assert.equal(m.finish({nowMs:50000,result:'defeat'}),true);
  assert.equal(m.finish({nowMs:90000,result:'victory'}),false);
  m.recordProjectile('gunner');
  assert.equal(m.snapshot(100000).outcome,'defeat');
  assert.equal(m.snapshot(100000).projectiles,0);
});

test('source wiring keeps QA-only reporting and no trusted write', () => {
  const scene=read('client/src/components/Dungeon/DungeonScene.js');
  const engine=read('client/src/components/Dungeon/DungeonEngine.jsx');
  const panel=read('client/src/ui-system/DungeonQaEvidencePanelV400.jsx');
  assert.match(scene,/createDungeonQaReadinessV400/);
  assert.match(scene,/dungeonQaReadinessV400\.recordProjectile\(sourceRole,/);
  assert.match(scene,/dungeonQaReadinessV400\.recordDamage\(/);
  assert.match(scene,/dungeonQaReadinessV400\.recordTelegraph\(/);
  assert.match(scene,/dungeonQaReadinessV400\.sample\(/);
  assert.match(engine,/onQaUpdate: report/);
  assert.match(engine,/dungeonQaRun \? \(result\.qaReport/);
  assert.match(engine,/isDungeonQaRunV391\(gsRef\.current\?\.dungeonQa/);
  assert.match(panel,/navigator\.clipboard\.writeText/);
  assert.match(panel,/scope !== 'guest_dungeon_qa_only'/);
  assert.doesNotMatch(panel,/fetch\(|gameAction\(|saveUserProfile\(|localStorage|firebase/);
});

test('V4.0.1 fast fortress 5-room clear still flags a fully silent ranged run', () => {
  const m=make({dungeonId:'dung_nereus',presetId:'fortress_mk4',startedAtMs:0});
  const durations=[3142,3776,7909,3103,2828];
  const ranged=[4,4,4,4,1];
  let t=0;
  for(let i=0;i<5;i++){
    m.beginRoom({roomId:`nereus_${i}`,roomIndex:i,kind:i===4?'boss':'entry',nowMs:t,hp:26120});
    for(let j=0;j<ranged[i];j++)m.recordSpawn('gunner',{enemyId:`${i}-${j}`,nowMs:t+100});
    if(i===4)m.recordBossSpawn({nowMs:t+100});
    t+=durations[i];
    m.endRoom({nowMs:t,hp:26120});
  }
  m.finish({nowMs:t,hp:26120,result:'victory'});
  const r=m.snapshot(t+1000);
  assert.equal(r.projectiles,0);
  assert.equal(r.rangedSpawns,17);
  assert.equal(r.hpStart,26120);
  assert.equal(r.hpEnd,26120);
  assert.equal(r.spawnsByRole.gunner,17);
  assert.ok(r.reviewFlags.includes('FULL_RUN_RANGED_NO_PROJECTILES_REVIEW'));
  assert.ok(r.reviewFlags.includes('BOSS_ATTACK_WINDOW_UNTESTED'));
  assert.equal(r.bossLifetimeMs,2728);
  assert.equal(r.productionApproved,false);
});

test('V4.0.1 records enemy lifespan, per-role spawn counts and sampled fire gate reasons without exposing IDs', () => {
  const m=make();
  m.beginRoom({roomId:'a',roomIndex:0,nowMs:1000,hp:1050});
  m.recordSpawn('gunner',{enemyId:'private-001',nowMs:1100});
  m.recordSpawn('artillery',{enemyId:'private-002',nowMs:1100});
  m.recordSpawn('raider',{enemyId:'private-003',nowMs:1100});
  assert.equal(m.recordFireProbe({enemyId:'private-001',nowMs:1200,reason:'windup'}),true);
  assert.equal(m.recordFireProbe({enemyId:'private-001',nowMs:1250,reason:'windup'}),false);
  assert.equal(m.recordFireProbe({enemyId:'private-001',nowMs:1800,reason:'out_of_envelope'}),true);
  m.recordProjectile('raider',{enemyId:'private-003'});
  m.recordEnemyResolved({enemyId:'private-001',nowMs:1700}); // 600ms: quick
  m.recordEnemyResolved({enemyId:'private-002',nowMs:5100}); // 4000ms: no projectile
  m.recordEnemyResolved({enemyId:'private-003',nowMs:5300}); // 4200ms: fired
  m.endRoom({nowMs:6100,hp:1050});
  m.finish({nowMs:6200,hp:1050,result:'victory'});
  const r=m.snapshot(9000);
  assert.equal(r.rangedResolved,3);
  assert.equal(r.rangedFired,1);
  assert.equal(r.rangedShortLivedWithoutShots,1);
  assert.equal(r.rangedLongLivedWithoutShots,1);
  assert.equal(r.averageRangedLifetimeMs,2933);
  assert.equal(r.fireProbeSamples,2);
  assert.equal(r.fireProbeByReason.windup,1);
  assert.equal(r.fireProbeByRole.gunner.windup,1);
  assert.equal(r.fireProbeByReason.out_of_envelope,1);
  assert.equal(r.spawnsByRole.gunner,1);
  assert.equal(r.spawnsByRole.artillery,1);
  assert.equal(r.shotsByRole.raider,1);
  assert.ok(r.reviewFlags.includes('LONG_LIVED_RANGED_NO_SHOT_REVIEW'));
  assert.ok(!JSON.stringify(r).includes('private-'));
});

test('V4.0.1 objective nodes are counted separately from destructible hazards', () => {
  const m=make();m.beginRoom({roomId:'shield_grid',roomIndex:2,nowMs:1000,hp:1050});
  m.recordObjectiveNodeDestroyed();m.recordObjectiveNodeDestroyed();
  m.recordHazardDestroyed();
  m.endRoom({nowMs:3000,hp:1050});m.finish({nowMs:4000,hp:1050,result:'victory'});
  const r=m.snapshot(5000);
  assert.equal(r.objectiveNodesDestroyed,2);
  assert.equal(r.destroyedHazards,1);
  assert.equal(r.rooms[0].objectiveNodesDestroyed,2);
});

test('V4.0.1 boss held long enough without telegraph gets review, not a gameplay decision', () => {
  const m=make({runMode:'single_room'});
  m.beginRoom({roomId:'oracle',roomIndex:4,kind:'boss',nowMs:2000,hp:1050});
  m.recordBossSpawn({nowMs:3000});m.recordProjectile('boss');
  m.recordBossDefeated({nowMs:13000});
  m.endRoom({nowMs:14000,hp:700});m.finish({nowMs:14500,hp:700,result:'victory'});
  const r=m.snapshot(16000);
  assert.equal(r.bossLifetimeMs,10000);
  assert.equal(r.bossDefeated,true);
  assert.equal(r.shotsByRole.boss,1);
  assert.ok(r.reviewFlags.includes('BOSS_TELEGRAPH_UNOBSERVED_REVIEW'));
  assert.ok(!r.reviewFlags.includes('BOSS_ATTACK_WINDOW_UNTESTED'));
  assert.equal(r.hpStart,1050);assert.equal(r.hpEnd,700);
});

test('V4.0.1 Nereus account defeat preserves per-room HP, damage and zero-auto-certification', () => {
  const m=make({dungeonId:'dung_nereus',presetId:'account',startedAtMs:0});
  const hp=[1050,770,683,625,0];
  const duration=[8541,7666,19080,14975];
  const shots=[11,3,2,14];
  const spawns=[5,5,4,4];
  let at=0;
  for(let i=0;i<4;i++){
    m.beginRoom({roomId:`room_${i}`,roomIndex:i,kind:i===3?'elite':'entry',nowMs:at,hp:hp[i]});
    for(let j=0;j<spawns[i];j++)m.recordSpawn('gunner',{enemyId:`enemy_${i}_${j}`,nowMs:at});
    for(let k=0;k<shots[i];k++)m.recordProjectile('gunner');
    m.recordDamage({source:'projectile',hpBefore:hp[i],hpAfter:hp[i+1]});
    at+=duration[i];
    if(i!==3)m.endRoom({nowMs:at,hp:hp[i+1]});
  }
  m.finish({nowMs:at,hp:0,result:'defeat'});
  const r=m.snapshot(at+1000);
  assert.equal(r.hpStart,1050);
  assert.equal(r.hpEnd,0);
  assert.equal(r.damageTaken,1050);
  assert.equal(r.projectiles,30);
  assert.equal(r.rangedSpawns,18);
  assert.equal(r.rooms[3].hpStart,625);
  assert.equal(r.rooms[3].hpEnd,0);
  assert.ok(r.reviewFlags.includes('ROOM_NOT_CLEARED'));
  assert.ok(!r.reviewFlags.includes('FULL_RUN_RANGED_NO_PROJECTILES_REVIEW'));
  assert.equal(r.productionApproved,false);
});

test('V4.0.1 wiring captures real lifecycle, fire gate, objectives, Boss and runtime HP', () => {
  const scene=read('client/src/components/Dungeon/DungeonScene.js');
  const panel=read('client/src/ui-system/DungeonQaEvidencePanelV400.jsx');
  assert.match(scene,/dungeonQaReadinessV400\.recordEnemyResolved\(/);
  assert.match(scene,/dungeonQaReadinessV400\.recordFireProbe\(/);
  assert.match(scene,/sourceRuntimeId: enemy\.runtimeId/);
  assert.match(scene,/dungeonQaReadinessV400\.recordBossSpawn\(/);
  assert.match(scene,/dungeonQaReadinessV400\.recordBossDefeated\(/);
  assert.match(scene,/dungeonQaReadinessV400\.recordObjectiveNodeDestroyed\(/);
  assert.match(panel,/report\.rangedLongLivedWithoutShots/);
  assert.match(panel,/report\.hpStart/);
  assert.doesNotMatch(scene,/saveDungeonQaReport|submitQaReportToServer/);
});
