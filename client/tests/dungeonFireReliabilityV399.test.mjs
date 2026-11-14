import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DUNGEON_FIRE_RELIABILITY_VERSION_V399,
  auditDungeonFireReliabilityV399,
  resolveDungeonEnemyFireDecisionV399,
  resolveDungeonVolleyReadinessV399,
  createDungeonFireQaMonitorV399,
} from '../src/game/dungeon/DungeonFireReliabilityV399.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(repo, relative), 'utf8').replace(/\r\n/g, '\n');
const actor = {
  // These are the real fields returned by shared Campaign choreography V3.5/3.7.
  mayFire: false, fireWindup: true, phaseId: 'firing_slot',
  fireRangeMin: 5, fireRangeMax: 9, preferredRange: 7,
  playerRange: 7.07, rangeReady: false,
};
const frame = { choreography: actor, roleId: 'gunner', seed: 77,
  enemyX: 0, enemyZ: 0, playerX: 1, playerZ: 7 };

test('V3.9.9 audit and real Campaign return-shape recovery', () => {
  assert.equal(DUNGEON_FIRE_RELIABILITY_VERSION_V399, 'dungeon-fire-reliability-v3.9.9');
  assert.deepEqual(auditDungeonFireReliabilityV399(), []);
  assert.equal(Object.hasOwn(actor, 'forwardDepth'), false);
  assert.equal(Object.hasOwn(actor, 'targetAhead'), false);
  assert.equal(Object.hasOwn(actor, 'directDistance'), false);
  const early = resolveDungeonEnemyFireDecisionV399({ ...frame, nowMs: 1200 });
  assert.equal(early.reason, 'windup');
  assert.equal(early.blockedSinceMs, 1200, 'null must start windup NOW, not epoch zero');
  const ready = resolveDungeonEnemyFireDecisionV399({ ...frame,
    nowMs: 2800, blockedSinceMs: early.blockedSinceMs });
  assert.equal(ready.reason, 'dungeon_arrival_recovery');
  assert.equal(ready.mayFire, true);
  assert.equal(ready.forced, true);
  assert.equal(ready.forwardDepth, 7);
});

test('all five ranged roles can recover a finite windup; chargers never shoot', () => {
  for (const roleId of ['raider', 'gunner', 'shieldbearer', 'support', 'artillery']) {
    const step = resolveDungeonEnemyFireDecisionV399({ ...frame, roleId,
      nowMs: 6000, blockedSinceMs: 2000 });
    assert.equal(step.mayFire, true, roleId);
  }
  assert.equal(resolveDungeonEnemyFireDecisionV399({ ...frame, roleId: 'charger',
    nowMs: 6000, blockedSinceMs: 2000 }).mayFire, false);
  assert.equal(resolveDungeonEnemyFireDecisionV399({ ...frame, canShoot: false,
    nowMs: 6000, blockedSinceMs: 2000 }).reason, 'non_ranged_role');
});

test('geometry fails closed behind, outside lateral arcs and with invalid inputs', () => {
  const behind = resolveDungeonEnemyFireDecisionV399({ ...frame, nowMs: 6000,
    blockedSinceMs: 1000, playerZ: -6 });
  assert.equal(behind.mayFire, false);
  assert.equal(behind.blockedSinceMs, null);
  const lateral = resolveDungeonEnemyFireDecisionV399({ ...frame, nowMs: 6000,
    blockedSinceMs: 1000, playerX: 11 });
  assert.equal(lateral.mayFire, false);
  const close = resolveDungeonEnemyFireDecisionV399({ ...frame, nowMs: 6000,
    blockedSinceMs: 1000, playerZ: .5 });
  assert.equal(close.mayFire, false);
  const invalid = resolveDungeonEnemyFireDecisionV399({ ...frame, nowMs: 6000,
    blockedSinceMs: 1000, playerX: NaN });
  assert.equal(invalid.reason, 'invalid_position');
  const fresh = resolveDungeonEnemyFireDecisionV399({ ...frame, nowMs: 7100,
    blockedSinceMs: behind.blockedSinceMs });
  assert.equal(fresh.mayFire, false, 'reentering range must restart windup');
});

test('shared mayFire still wins, and cooldown prevents duplicate volleys', () => {
  const shared = resolveDungeonEnemyFireDecisionV399({ ...frame,
    choreography: { ...actor, mayFire: true }, nowMs: 2000 });
  assert.equal(shared.mayFire, true);
  assert.equal(shared.forced, false);
  assert.equal(shared.reason, 'shared_ready');
  for (const nowMs of [1000, 1200, 1600]) {
    const ready = resolveDungeonVolleyReadinessV399({mayFire: true,
      canShoot: true, hasProjectile: true, nowMs, lastShoot: 1000, shootMs: 600});
    assert.equal(ready.allowed, false);
  }
  assert.equal(resolveDungeonVolleyReadinessV399({mayFire: true,
    canShoot: true, hasProjectile: true, nowMs: 1601, lastShoot: 1000, shootMs: 600}).allowed, true);
  assert.equal(resolveDungeonVolleyReadinessV399({mayFire: false,
    canShoot: true, hasProjectile: true, nowMs: 5000, lastShoot: 1000, shootMs: 600}).allowed, false);
});

test('QA-only fire counters log at most once every eight seconds', () => {
  const sent = [];
  const qa = createDungeonFireQaMonitorV399({ enabled: true, dungeonId: 'dung_nereus' });
  qa.record('gunner', 'windup');
  qa.record('gunner', 'volley_started');
  qa.record('gunner', 'projectile_created');
  assert.equal(qa.maybeLog(1000, (...args) => sent.push(args)), false);
  assert.equal(qa.maybeLog(7000, (...args) => sent.push(args)), false);
  assert.equal(qa.maybeLog(9000, (...args) => sent.push(args)), true);
  assert.equal(qa.maybeLog(9010, (...args) => sent.push(args)), false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0][1].byRole.gunner.projectile_created, 1);
  const prod = createDungeonFireQaMonitorV399({ enabled: false, dungeonId: 'dung_taurus' });
  prod.record('gunner', 'volley_started');
  assert.equal(Object.keys(prod.snapshot().byRole).length, 0);
});

test('scene wires world-space recovery, immediate first shot and QA diagnostics', () => {
  const scene = read('client/src/components/Dungeon/DungeonScene.js');
  assert.match(scene, /resolveDungeonEnemyFireDecisionV399\(/);
  assert.match(scene, /enemyX: enemy\.mesh\.position\.x/);
  assert.match(scene, /playerX: playerRoot\.position\.x/);
  assert.match(scene, /fireDungeonEnemyShotV38\(enemy, nowMs, firstShot\.index, plan\.shots\.length\)/);
  assert.match(scene, /createDungeonFireQaMonitorV399/);
  const fireModule = read('client/src/game/dungeon/DungeonFireReliabilityV399.js');
  assert.match(fireModule, /\[DUNGEON_FIRE_QA_V399\]/);
  assert.match(scene, /resolveDungeonVolleyReadinessV399\(/);
  assert.doesNotMatch(scene, /resolveDungeonEnemyFireDecisionV398\(/);
});
