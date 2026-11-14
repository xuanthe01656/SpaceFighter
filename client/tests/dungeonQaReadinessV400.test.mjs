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

test('V4.0 QA reader is audit-clean and production-disabled by default', () => {
  assert.equal(DUNGEON_QA_READINESS_VERSION_V400, 'dungeon-qa-readiness-v4.0.0');
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
  assert.match(scene,/dungeonQaReadinessV400\.recordProjectile\(sourceRole\)/);
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
