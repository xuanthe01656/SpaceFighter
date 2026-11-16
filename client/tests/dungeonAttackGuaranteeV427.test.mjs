import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  DUNGEON_ATTACK_GUARANTEE_VERSION_V427,
  auditDungeonAttackGuaranteeV427,
  createDungeonAttackGuaranteeStateV427,
  markDungeonFirstVolleyV427,
  observeDungeonChargerStepV427,
  resolveDungeonChargerWatchdogV427,
  resolveDungeonRangedFirstVolleyV427,
  resolveDungeonRequiredRoleSequenceV427,
} from '../src/game/dungeon/DungeonAttackGuaranteeV427.js';
import { resolveDungeonVolleyReadinessV399 } from '../src/game/dungeon/DungeonFireReliabilityV399.js';

const root = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const rangedInput = (overrides = {}) => ({
  state: createDungeonAttackGuaranteeStateV427({ roleId: 'artillery' }),
  choreography: { handled: true, completed: false, phaseId: 'battery_relocate', mayFire: false },
  roleId: 'artillery', nowMs: 1000, entryActive: true,
  enemyX: 0, enemyZ: 1, playerX: 0, playerZ: 12,
  hudOcclusionLineZ: -10, fireRangeMin: 9.2, fireRangeMax: 13.4,
  canShoot: true, hasProjectile: true,
  ...overrides,
});

test('V4.2.7 self-audit passes and version is stable', () => {
  assert.equal(DUNGEON_ATTACK_GUARANTEE_VERSION_V427, 'dungeon-attack-guarantee-v4.2.7');
  assert.deepEqual(auditDungeonAttackGuaranteeV427(), []);
});

test('visible ranged enemy gets one authentic first-volley opportunity after deadline', () => {
  const armed = resolveDungeonRangedFirstVolleyV427(rangedInput());
  assert.equal(armed.reason, 'first_volley_arming');
  assert.equal(armed.choreography.mayFire, false);
  const ready = resolveDungeonRangedFirstVolleyV427(rangedInput({
    state: armed.state,
    nowMs: 3000,
  }));
  assert.equal(ready.reason, 'first_volley_deadline');
  assert.equal(ready.forced, true);
  assert.equal(ready.choreography.mayFire, true);
  const marked = markDungeonFirstVolleyV427(ready.state, { nowMs: 3000, forced: true });
  assert.equal(marked.recorded, true);
  const noRepeat = resolveDungeonRangedFirstVolleyV427(rangedInput({
    state: marked.state,
    nowMs: 6000,
  }));
  assert.equal(noRepeat.reason, 'first_volley_complete');
  assert.equal(noRepeat.choreography.mayFire, false);
});

test('forced first volley still requires the real V399 cadence gate', () => {
  const armed = resolveDungeonRangedFirstVolleyV427(rangedInput());
  const ready = resolveDungeonRangedFirstVolleyV427(rangedInput({ state: armed.state, nowMs: 3000 }));
  assert.equal(ready.choreography.mayFire, true);
  assert.equal(resolveDungeonVolleyReadinessV399({
    mayFire: true, canShoot: true, hasProjectile: true,
    nowMs: 3000, lastShoot: 2600, shootMs: 1000,
  }).reason, 'cooldown');
  assert.equal(resolveDungeonVolleyReadinessV399({
    mayFire: true, canShoot: true, hasProjectile: true,
    nowMs: 3000, lastShoot: 1000, shootMs: 1000,
  }).allowed, true);
});

test('first-volley guarantee never fires behind player, under HUD, or outside authored band', () => {
  for (const overrides of [
    { enemyZ: 13 },
    { enemyZ: -12, hudOcclusionLineZ: -9 },
    { enemyX: 9 },
    { enemyZ: -4 },
  ]) {
    const result = resolveDungeonRangedFirstVolleyV427(rangedInput({ ...overrides, nowMs: 4000 }));
    assert.notEqual(result.choreography?.mayFire, true);
  }
});

test('charger cannot consume attack cycle while protected and telegraphs after becoming visible', () => {
  const hidden = resolveDungeonChargerWatchdogV427({
    state: createDungeonAttackGuaranteeStateV427({ roleId: 'charger' }),
    chargerState: { phase: 'charge', phaseEndsAtMs: 1200, nextChargeAtMs: 0 },
    nowMs: 1000, entryActive: false, enemyZ: -12, hudOcclusionLineZ: -9,
  });
  assert.equal(hidden.chargerState.phase, 'tracking');
  assert.ok(hidden.chargerState.nextChargeAtMs > 1000);
  const visible = resolveDungeonChargerWatchdogV427({
    state: hidden.state,
    chargerState: { ...hidden.chargerState, nextChargeAtMs: 9999 },
    nowMs: 2500, entryActive: true, enemyZ: -8, hudOcclusionLineZ: -9,
  });
  assert.equal(visible.forced, false);
  const watchdog = resolveDungeonChargerWatchdogV427({
    state: visible.state,
    chargerState: visible.chargerState,
    nowMs: 3800, entryActive: true, enemyZ: -8, hudOcclusionLineZ: -9,
  });
  assert.equal(watchdog.forced, true);
  assert.equal(watchdog.chargerState.nextChargeAtMs, 3800);
  const observed = observeDungeonChargerStepV427(watchdog.state, {
    event: 'telegraph_started', phase: 'telegraph',
  });
  assert.equal(observed.chargerTelegraphs, 1);
});

test('Boss guard compositions require one close threat and one ranged threat', () => {
  const catalog = {
    gunner: { threatCost: 2 }, shieldbearer: { threatCost: 4 },
    support: { threatCost: 4 }, charger: { threatCost: 3 }, artillery: { threatCost: 4 },
  };
  assert.deepEqual(resolveDungeonRequiredRoleSequenceV427({
    requiredRoles: ['gunner', 'shieldbearer'], roleCatalog: catalog, threatBudget: 6,
  }).sequence.map(row => row.roleId), ['gunner', 'shieldbearer']);
  assert.deepEqual(resolveDungeonRequiredRoleSequenceV427({
    requiredRoles: ['support', 'shieldbearer'], roleCatalog: catalog, threatBudget: 8,
  }).sequence.map(row => row.roleId), ['support', 'shieldbearer']);
  assert.deepEqual(resolveDungeonRequiredRoleSequenceV427({
    requiredRoles: ['charger', 'artillery'], roleCatalog: catalog, threatBudget: 8,
  }).sequence.map(row => row.roleId), ['charger', 'artillery']);
});

test('live Dungeon source wires V4.2.7 without changing Campaign or damage authority', () => {
  const scene = read('src/components/Dungeon/DungeonScene.js');
  const content = read('src/game/dungeon/DungeonContentCatalogV393.js');
  const director = read('src/game/dungeon/DungeonEncounterDirectorV38.js');
  const readiness = read('src/game/dungeon/DungeonQaReadinessV400.js');
  assert.match(scene, /resolveDungeonRangedFirstVolleyV427/);
  assert.match(scene, /resolveDungeonChargerWatchdogV427/);
  assert.match(scene, /tryFireDungeonEnemyVolleyV38\(enemy, firingStateV399, nowMs\)/);
  assert.match(scene, /isDungeonEnemyEntryActiveV422/);
  assert.match(content, /requiredRoles: \['charger', 'artillery'\]/);
  assert.match(content, /requiredRoles: \['support', 'shieldbearer'\]/);
  assert.match(content, /requiredRoles: \['gunner', 'shieldbearer'\]/);
  assert.match(director, /resolveDungeonRequiredRoleSequenceV427/);
  assert.match(readiness, /dungeonAttackGuaranteeVersion/);
  assert.doesNotMatch(scene, /gameService|grantReward|settleBattle/);
});
