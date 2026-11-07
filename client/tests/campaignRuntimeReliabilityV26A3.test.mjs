import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CAMPAIGN_BOSS_INTRO_PLAN_V26A3,
  CAMPAIGN_RUNTIME_LIMITS_V26A3,
  createBossIntroPlanV26A3,
  createCampaignRuntimeMonitorV26A3,
  createCampaignRuntimeSnapshotV26A3,
  createChargerMotionStateV26A3,
  stepChargerMotionV26A3,
} from '../src/game/combat/CampaignRuntimeReliabilityV26A3.js';
import {
  ENEMY_GAMEPLAY_FORWARD_AXIS_V26A4,
  ENEMY_SOURCE_NOSE_AXIS_V26A4,
  ENEMY_SOURCE_TO_ROOT_YAW_V26A4,
  resolveEnemyGameplayYawV26A4,
} from '../src/game/assets/EnemyVisualHeadingV26A4.js';
import { createProjectileEmitter } from '../src/game/combat/ProjectileEmitter.js';

const near = (actual, expected, epsilon = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

test('runtime monitor ignores hidden/inactive periods and fails closed on a real render stall', () => {
  let now = 1000;
  const monitor = createCampaignRuntimeMonitorV26A3({ now: () => now, renderStallMs: 3000, simulationStallMs: 4000 });
  const snapshot = createCampaignRuntimeSnapshotV26A3({ active: true, gameState: 'PLAYING', wave: 3, enemies: 12 });
  monitor.markSimulation(snapshot, now);
  monitor.markRenderSuccess(snapshot, now);
  now += 3500;
  assert.equal(monitor.detectStall({ visible: false, active: true, atMs: now }), null);
  assert.equal(monitor.detectStall({ visible: true, active: false, atMs: now }), null);
  const fault = monitor.detectStall({ visible: true, active: true, atMs: now });
  assert.equal(fault.code, 'RENDER_STALL');
  assert.equal(fault.snapshot.wave, 3);
  assert.equal(fault.snapshot.enemies, 12);
  assert.equal(monitor.detectStall({ visible: true, active: true, atMs: now + 1000 }), fault);
});

test('runtime monitor detects simulation tick stalls even while render frames continue', () => {
  let now = 2000;
  const monitor = createCampaignRuntimeMonitorV26A3({ now: () => now, renderStallMs: 5000, simulationStallMs: 1200 });
  const first = createCampaignRuntimeSnapshotV26A3({ active: true, gameState: 'PLAYING', tick: 10, wave: 2 });
  monitor.markSimulation(first, now);
  monitor.markRenderSuccess(first, now);
  for (const delta of [300, 600, 900, 1300]) {
    now = 2000 + delta;
    const frozen = createCampaignRuntimeSnapshotV26A3({ active: true, gameState: 'PLAYING', tick: 10, wave: 2 });
    monitor.markSimulation(frozen, now);
    monitor.markRenderSuccess(frozen, now);
  }
  const fault = monitor.detectStall({ visible: true, active: true, atMs: now });
  assert.equal(fault.code, 'SIMULATION_STALL');
  assert.equal(fault.snapshot.tick, 10);
});

test('projectile emitter bounds delayed burst work as well as live projectile meshes', () => {
  const pending = [];
  const bullets = [];
  const clamps = [];
  const context = new Proxy({}, {
    get: (_target, key) => key === 'createLinearGradient'
      ? (() => ({ addColorStop() {} }))
      : (() => {}),
    set: () => true,
  });
  class DynamicTexture { getContext() { return context; } update() {} dispose() {} }
  class StandardMaterial { dispose() {} }
  const createMesh = () => ({
    position: { set() {} }, rotation: {}, metadata: {}, isDisposed: () => false, dispose() {},
  });
  const BABYLON = {
    DynamicTexture, StandardMaterial,
    Material: { MATERIAL_ALPHABLEND: 2 },
    Color3: { FromHexString: value => value },
    MeshBuilder: { CreatePlane: createMesh, CreateSphere: createMesh, CreateCylinder: createMesh },
  };
  const scene = { isDisposed: () => false, onDisposeObservable: { addOnce() {} } };
  const emitter = createProjectileEmitter({
    scene, BABYLON, bullets,
    maxBullets: 2,
    maxPendingShots: 2,
    onCapacityClamped: event => clamps.push(event.kind),
    scheduleBattleTimer: callback => { pending.push(callback); return pending.length; },
  });
  const shot = index => ({
    x: 0, z: 0, vx: 0, vz: -1, atk: 1, delayMs: 10 + index,
    projectileType: 'kinetic', kind: 'main', color: 0xffffff,
  });
  assert.equal(emitter.fire([shot(0), shot(1), shot(2)]), 2);
  assert.equal(emitter.pendingCount(), 2);
  assert.deepEqual(clamps, ['player_pending_projectile']);
  pending.splice(0).forEach(callback => callback());
  assert.equal(emitter.pendingCount(), 0);
  assert.equal(bullets.length, 2);
  assert.equal(emitter.fire([{ ...shot(3), delayMs: 0 }]), 0);
  assert.deepEqual(clamps, ['player_pending_projectile', 'player_projectile']);
});

test('enemy root uses +Z-forward while source art remains -Z and turns by shortest bounded yaw', () => {
  assert.equal(ENEMY_SOURCE_NOSE_AXIS_V26A4, '-Z');
  assert.equal(ENEMY_GAMEPLAY_FORWARD_AXIS_V26A4, '+Z');
  near(ENEMY_SOURCE_TO_ROOT_YAW_V26A4, Math.PI);
  near(resolveEnemyGameplayYawV26A4({ currentYaw: 0, velocityX: 0, velocityZ: 1 }), 0);
  near(Math.abs(resolveEnemyGameplayYawV26A4({ currentYaw: 0, velocityX: 0, velocityZ: -1 })), Math.PI);
  near(resolveEnemyGameplayYawV26A4({ currentYaw: 0, velocityX: 1, velocityZ: 0 }), Math.PI / 2);
  const bounded = resolveEnemyGameplayYawV26A4({
    currentYaw: Math.PI - .05,
    velocityX: .1,
    velocityZ: -1,
    maxTurnRadians: .1,
  });
  assert.ok(Math.abs(bounded) <= Math.PI);
  assert.ok(Math.abs(bounded - (Math.PI - .05)) <= .100001 || Math.abs(bounded + Math.PI - .05) <= .100001);
});

test('fast charger telegraphs a locked direction before charging and recovering', () => {
  let state = createChargerMotionStateV26A3({ nowMs: 0 });
  let step = stepChargerMotionV26A3(state, { nowMs: 449, enemyX: 0, enemyZ: 0, targetX: 3, targetZ: 4 });
  assert.equal(step.state.phase, 'tracking');
  assert.ok(step.speedMultiplier > 0);

  step = stepChargerMotionV26A3(step.state, { nowMs: 450, enemyX: 0, enemyZ: 0, targetX: 3, targetZ: 4 });
  assert.equal(step.event, 'telegraph_started');
  assert.equal(step.state.phase, 'telegraph');
  assert.equal(step.speedMultiplier, 0);
  near(step.direction.x, .6);
  near(step.direction.z, .8);

  step = stepChargerMotionV26A3(step.state, { nowMs: 1100, enemyX: 1, enemyZ: 1, targetX: -10, targetZ: -10 });
  assert.equal(step.event, 'charge_started');
  assert.equal(step.state.phase, 'charge');
  near(step.direction.x, .6);
  near(step.direction.z, .8);

  step = stepChargerMotionV26A3(step.state, { nowMs: 1800 });
  assert.equal(step.event, 'recovery_started');
  assert.equal(step.state.phase, 'recovery');
  step = stepChargerMotionV26A3(step.state, { nowMs: 2250, enemyX: 0, enemyZ: 0, targetX: -1, targetZ: 0 });
  assert.equal(step.event, 'tracking_resumed');
  assert.equal(step.state.phase, 'tracking');
});

test('boss intro has one warning, one hidden reveal and one fight transition', () => {
  const plan = createBossIntroPlanV26A3();
  assert.equal(plan.warningMs, CAMPAIGN_BOSS_INTRO_PLAN_V26A3.warningMs);
  assert.equal(plan.totalMs, plan.warningMs + plan.revealMs);
  assert.equal(plan.phaseAt(0), 'warning');
  assert.equal(plan.phaseAt(plan.warningMs), 'reveal');
  assert.equal(plan.phaseAt(plan.totalMs - 1), 'reveal');
  assert.equal(plan.phaseAt(plan.totalMs), 'fight');
});

test('Campaign wires fail-closed runtime health, bounded entities, facing and clean boss intro', () => {
  const engine = fs.readFileSync(new URL('../src/components/Campaign/CampaignEngine.jsx', import.meta.url), 'utf8');
  const scene = fs.readFileSync(new URL('../src/components/Campaign/CampaignScene.js', import.meta.url), 'utf8');
  const dungeon = fs.readFileSync(new URL('../src/components/Dungeon/DungeonScene.js', import.meta.url), 'utf8');
  const emitter = fs.readFileSync(new URL('../src/game/combat/ProjectileEmitter.js', import.meta.url), 'utf8');

  assert.match(engine, /createCampaignRuntimeMonitorV26A3/);
  assert.match(engine, /try\{[\s\S]*scene\.render\(\)[\s\S]*catch\(error\)/);
  assert.match(engine, /webglcontextlost/);
  assert.match(engine, /detectStall/);
  assert.match(engine, /runtimeFaultOverlay/);
  assert.match(engine, /scene\.dispose\(\)/);
  assert.match(engine, /THỬ LẠI/);

  assert.match(scene, /createCampaignRuntimeSnapshotV26A3/);
  assert.match(scene, /maxActiveEnemies/);
  assert.match(scene, /maxEnemyProjectiles/);
  assert.match(scene, /resolveEnemyGameplayYawV26A4/);
  assert.match(scene, /_facingYaw: 0/);
  assert.doesNotMatch(scene, /_facingYaw: Math\.PI/);
  assert.match(dungeon, /resolveEnemyGameplayYawV26A4/);
  assert.match(dungeon, /velocityZ: e\.mesh\.position\.z - beforeZ/);
  assert.doesNotMatch(dungeon, /e\.mesh\.rotation\.y \+= 0\.025/);
  assert.match(scene, /stepChargerMotionV26A3/);
  assert.match(scene, /charge_telegraph_/);
  assert.match(scene, /bossMesh\.setEnabled\(false\)/);
  assert.match(scene, /scheduleBattleTimer\(activateBossFight, bossIntroPlan\.revealMs\)/);
  assert.equal((scene.match(/BOSS APPROACHING!/g) || []).length, 1);
  assert.doesNotMatch(scene, /spawnBoss\(\)/);
  assert.match(scene, /gameState==='BOSS_FIGHT'&&bossMesh&&bossHp>0/);

  assert.match(emitter, /maxBullets = Number\.POSITIVE_INFINITY/);
  assert.match(emitter, /maxPendingShots = Number\.POSITIVE_INFINITY/);
  assert.match(emitter, /onCapacityClamped/);
  assert.equal(CAMPAIGN_RUNTIME_LIMITS_V26A3.maxActiveEnemies, 48);
  assert.equal(CAMPAIGN_RUNTIME_LIMITS_V26A3.maxPlayerProjectiles, 220);
  assert.equal(CAMPAIGN_RUNTIME_LIMITS_V26A3.maxPendingPlayerShots, 96);
  assert.equal(CAMPAIGN_RUNTIME_LIMITS_V26A3.maxEnemyProjectiles, 160);
});
