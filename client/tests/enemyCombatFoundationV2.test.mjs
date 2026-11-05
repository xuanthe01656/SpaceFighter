import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENEMY_ARCHETYPES_V2,
  BOSS_PHASES_V2,
  auditEnemyCombatCatalogV2,
  bossPhaseForHp,
} from '../src/game/combat/EnemyCombatCatalogV2.js';
import { createEnemyDirectorV2, scaleEnemyStatsV2 } from '../src/game/combat/DeterministicEnemyDirectorV2.js';

test('enemy V2 roles expose readable telegraphs, defense classes and bounded control resistance', () => {
  assert.deepEqual(auditEnemyCombatCatalogV2(), []);
  assert.equal(Object.keys(ENEMY_ARCHETYPES_V2).length, 6);
  assert.equal(BOSS_PHASES_V2.length, 3);
  assert.equal(bossPhaseForHp(.8).id, 'phase_1');
  assert.equal(bossPhaseForHp(.5).id, 'phase_2');
  assert.equal(bossPhaseForHp(.2).id, 'phase_3');
});

test('same seed produces the same wave and boss plans', () => {
  const a = createEnemyDirectorV2({ seed: 12345, stage: 7 });
  const b = createEnemyDirectorV2({ seed: 12345, stage: 7 });
  assert.deepEqual(a.buildWavePlan({ wave: 4, count: 30 }), b.buildWavePlan({ wave: 4, count: 30 }));
  assert.deepEqual(a.buildBossAttackPlan({ cycles: 12 }), b.buildBossAttackPlan({ cycles: 12 }));
});

test('wave plan unlocks roles by stage, limits immediate repetition and uses fixed lanes', () => {
  const early = createEnemyDirectorV2({ seed: 9, stage: 1 }).buildWavePlan({ count: 30 });
  assert.equal(early.every(entry => ['raider', 'gunner'].includes(entry.archetypeId)), true);
  const late = createEnemyDirectorV2({ seed: 9, stage: 8 }).buildWavePlan({ count: 80 });
  assert.equal(late.some(entry => entry.archetypeId === 'artillery'), true);
  assert.equal(late.every(entry => [-.8, -.4, 0, .4, .8].includes(entry.lane)), true);
  let longest = 1, run = 1;
  for (let index = 1; index < late.length; index += 1) {
    run = late[index].archetypeId === late[index - 1].archetypeId ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  assert.ok(longest <= 4);
});

test('enemy stat growth is monotonic but capped instead of scaling from player combat power', () => {
  const archetype = ENEMY_ARCHETYPES_V2.gunner;
  const low = scaleEnemyStatsV2({ baseHp: 100, baseDamage: 20, baseSpeed: 1, archetype, stage: 1, wave: 1 });
  const high = scaleEnemyStatsV2({ baseHp: 100, baseDamage: 20, baseSpeed: 1, archetype, stage: 10, wave: 5, difficulty: 2 });
  assert.ok(high.hp > low.hp && high.damage > low.damage && high.speed >= low.speed);
  const capped = scaleEnemyStatsV2({ baseHp: 100, baseDamage: 20, baseSpeed: 1, archetype, stage: 100, wave: 20, difficulty: 3 });
  assert.ok(capped.hpScale <= 5 && capped.damageScale <= 4 && capped.speedScale <= 1.35);
});

test('boss plan telegraphs every attack and changes phase deterministically', () => {
  const plan = createEnemyDirectorV2({ seed: 2468, stage: 10 }).buildBossAttackPlan({ cycles: 12 });
  assert.equal(plan.every(entry => entry.fireTick - entry.telegraphTick === 30), true);
  assert.deepEqual([...new Set(plan.map(entry => entry.phaseId))], ['phase_1', 'phase_2', 'phase_3']);
});
