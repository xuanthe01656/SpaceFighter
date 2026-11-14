import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DUNGEON_CONTENT_CATALOG_V393,
  DUNGEON_HAZARD_PROFILES_V393,
} from '../src/game/dungeon/DungeonContentCatalogV393.js';
import {
  DUNGEON_PRODUCTION_TUNING_VERSION,
  auditDungeonDifficultyCurveV398,
  auditDungeonProductionTuningV398,
  resolveDungeonCombatSlotV398,
  resolveDungeonEnemySeparationV398,
  summarizeDungeonDifficultyV398,
} from '../src/game/dungeon/DungeonProductionTuningV398.js';
import { resolveDungeonEnemyFireDecisionV399 } from '../src/game/dungeon/DungeonFireReliabilityV399.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const read = relative => fs.readFileSync(path.join(repo, relative), 'utf8').replace(/\r\n/g, '\n');

test('Dungeon V3.9.8 production tuning is deterministic and audit-clean', () => {
  assert.equal(DUNGEON_PRODUCTION_TUNING_VERSION, 'dungeon-production-tuning-v3.9.8');
  assert.deepEqual(auditDungeonProductionTuningV398(), []);
  assert.deepEqual(auditDungeonDifficultyCurveV398(DUNGEON_CONTENT_CATALOG_V393), []);

  const input = {
    slot: {
      slotId: 'support:1', laneNorm: .25, depthOffset: .2,
      trackingStrength: .58, minSpacing: 1.85, phaseRadius: .48,
    },
    seed: 998,
    roleId: 'support',
    difficultyRank: 2,
  };
  assert.deepEqual(resolveDungeonCombatSlotV398(input), resolveDungeonCombatSlotV398(input));
  const projected = resolveDungeonCombatSlotV398(input);
  assert.equal(projected.slotId, 'support:1', 'shared slot lease identity must remain unchanged');
  assert.ok(projected.trackingStrength < input.slot.trackingStrength);
  assert.ok(projected.minSpacing >= 2.20);
});

test('Dungeon V3.9.9 live-geometry fire recovery preserves wind-up and never fires behind the player', () => {
  const base = {
    mayFire: false,
    fireWindup: true,
    phaseId: 'firing_slot',
    targetAhead: true,
    forwardDepth: 7,
    lateralDistance: 1.2,
    directDistance: 7.1,
    preferredRange: 7,
    fireRangeMin: 5,
    fireRangeMax: 9,
  };
  const early = resolveDungeonEnemyFireDecisionV399({
    choreography: base, roleId: 'gunner', seed: 77, nowMs: 500, blockedSinceMs: 0,
    enemyX: 0, enemyZ: 0, playerX: 1.2, playerZ: 7,
  });
  assert.equal(early.mayFire, false);
  assert.equal(early.reason, 'windup');

  const ready = resolveDungeonEnemyFireDecisionV399({
    choreography: base, roleId: 'gunner', seed: 77, nowMs: 2000, blockedSinceMs: 0,
    enemyX: 0, enemyZ: 0, playerX: 1.2, playerZ: 7,
  });
  assert.equal(ready.mayFire, true);
  assert.equal(ready.forced, true);
  assert.equal(ready.reason, 'dungeon_arrival_recovery');

  const behind = resolveDungeonEnemyFireDecisionV399({
    choreography: { ...base, targetAhead: false, forwardDepth: -2 },
    roleId: 'gunner', seed: 77, nowMs: 3000, blockedSinceMs: 0,
    enemyX: 0, enemyZ: 0, playerX: 1.2, playerZ: -2,
  });
  assert.equal(behind.mayFire, false);
});

test('Dungeon V3.9.8 separation un-stacks colliders with bounded corrections', () => {
  const separated = resolveDungeonEnemySeparationV398({
    enemyX: 0,
    enemyZ: 0,
    neighbors: [
      { id: 'a', x: .10, z: .08 },
      { id: 'b', x: -.12, z: .04 },
      { id: 'c', x: .06, z: -.10 },
    ],
    minSpacing: 2.25,
    seed: 391,
    frameScale: 1,
  });
  assert.equal(separated.contributors, 3);
  assert.ok(Math.hypot(separated.steeringX, separated.steeringZ) > 0);
  assert.ok(Math.hypot(separated.correctionX, separated.correctionZ) > 0);
  assert.ok(Math.abs(separated.correctionX) <= .05);
  assert.ok(Math.abs(separated.correctionZ) <= .05);

  const exactA = resolveDungeonEnemySeparationV398({
    enemyX: 0, enemyZ: 0, enemyId: 'charger-a',
    neighbors: [{ runtimeId: 'charger-b', x: 0, z: 0 }],
    minSpacing: 2.05, seed: 10,
  });
  const exactB = resolveDungeonEnemySeparationV398({
    enemyX: 0, enemyZ: 0, enemyId: 'charger-b',
    neighbors: [{ runtimeId: 'charger-a', x: 0, z: 0 }],
    minSpacing: 2.05, seed: 11,
  });
  assert.ok(Math.abs(exactA.correctionX + exactB.correctionX) < 1e-9);
  assert.ok(Math.abs(exactA.correctionZ + exactB.correctionZ) < 1e-9);
});

test('Dungeon V3.9.8 difficulty curve is progressive without the V3.9.7 spike', () => {
  const taurus = summarizeDungeonDifficultyV398(DUNGEON_CONTENT_CATALOG_V393.dung_taurus);
  const nereus = summarizeDungeonDifficultyV398(DUNGEON_CONTENT_CATALOG_V393.dung_nereus);
  const abaddon = summarizeDungeonDifficultyV398(DUNGEON_CONTENT_CATALOG_V393.dung_abaddon);

  assert.deepEqual([taurus.recommendedPower, nereus.recommendedPower, abaddon.recommendedPower],
    [2600, 4800, 7600]);
  assert.ok(nereus.effectiveHp > taurus.effectiveHp);
  assert.ok(abaddon.effectiveHp > nereus.effectiveHp);
  assert.ok(nereus.pressure / taurus.pressure >= 1.10);
  assert.ok(nereus.pressure / taurus.pressure <= 1.60);
  assert.ok(abaddon.pressure / nereus.pressure >= 1.10);
  assert.ok(abaddon.pressure / nereus.pressure <= 1.60);

  const maxActive = Math.max(...Object.values(DUNGEON_CONTENT_CATALOG_V393)
    .flatMap(profile => profile.rooms.map(room => room.activeEnemyCap || 0)));
  assert.ok(maxActive <= 9, `mobile production active enemy cap must remain bounded, got ${maxActive}`);
});

test('solid Dungeon hazards are destructible while Nereus ion energy remains evasive', () => {
  const taurus = DUNGEON_HAZARD_PROFILES_V393.taurus_scrap_lanes;
  const nereus = DUNGEON_HAZARD_PROFILES_V393.nereus_ion_currents;
  const abaddon = DUNGEON_HAZARD_PROFILES_V393.abaddon_gravity_shear;
  assert.equal(taurus.destructible, true);
  assert.equal(abaddon.destructible, true);
  assert.ok(abaddon.hp > taurus.hp);
  assert.ok(abaddon.hitRadius >= 1.5);
  assert.equal(nereus.destructible, false, 'ion current is energy, not a solid asteroid');
});

test('V3.9.8 source wires compact QA UI, swept hazard hits, slot spread and fire recovery', () => {
  const scene = read('client/src/components/Dungeon/DungeonScene.js');
  const select = read('client/src/components/DungeonSelect/index.jsx');
  const selectCss = read('client/src/components/DungeonSelect/DungeonSelect.module.css');
  const hudCss = read('client/src/ui-system/DungeonHudV396.module.css');
  const tacticalHudCss = read('client/src/ui-system/TacticalCombatHudV411.module.css');

  assert.match(scene, /resolveDungeonCombatSlotV398/);
  assert.match(scene, /resolveDungeonEnemySeparationV398/);
  assert.match(scene, /roleId === 'charger' \? 2\.05 : 1\.95/);
  assert.match(scene, /charge\.direction\.x \* speed \* enemyFrame \+ separation\.correctionX/);
  assert.match(scene, /resolveDungeonEnemyFireDecisionV399/);
  assert.match(scene, /_dungeonPreviousPositionV398/);
  assert.match(scene, /logicalSegmentCircleHitV392\(/);
  assert.match(scene, /targetPriority: 'survival_hazard'/);
  assert.match(scene, /dungeon-hazard-hp-fill/);

  assert.match(select, /<details className=\{styles\.qaSetupPanel\}>/);
  assert.match(select, /QA XUẤT KÍCH · 0 NĂNG LƯỢNG/);
  assert.match(selectCss, /\.card\.qaCard\s*\{\s*max-height:\s*none/);
  assert.match(selectCss, /\.qaCard \.playBtn[\s\S]*min-height:\s*52px/);
  assert.match(hudCss, /shared-baseline|share one baseline/);
  assert.match(tacticalHudCss, /align-items:\s*baseline/);
});
