import { ENEMY_ARCHETYPES_V2, BOSS_PHASES_V2 } from './EnemyCombatCatalogV2.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function rng32(seedValue) {
  let state = (Math.trunc(Number(seedValue) || 1) >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5; state >>>= 0;
    return state;
  };
}

const LANE_NORMALIZED_X = Object.freeze([-0.80, -0.40, 0, 0.40, 0.80]);

export function scaleEnemyStatsV2({ baseHp, baseDamage, baseSpeed, archetype, stage = 1, wave = 1, difficulty = 1 } = {}) {
  const s = clamp(Math.trunc(Number(stage) || 1), 1, 100);
  const w = clamp(Math.trunc(Number(wave) || 1), 1, 20);
  const d = clamp(Number(difficulty) || 1, 0.75, 3);
  const hpScale = clamp(1 + (s - 1) * .12 + (w - 1) * .08 + (d - 1) * .15, .75, 5);
  const damageScale = clamp(1 + (s - 1) * .075 + (w - 1) * .05 + (d - 1) * .12, .75, 4);
  const speedScale = clamp(1 + (s - 1) * .012 + (w - 1) * .01, 1, 1.35);
  return Object.freeze({
    hp: Math.max(1, Math.round((Number(baseHp) || 1) * hpScale * (archetype?.hpMultiplier || 1))),
    damage: Math.max(1, Math.round((Number(baseDamage) || 1) * damageScale * (archetype?.damageMultiplier || 1))),
    speed: Math.max(.01, (Number(baseSpeed) || 1) * speedScale * (archetype?.speedMultiplier || 1)),
    hpScale: Math.round(hpScale * 1000) / 1000,
    damageScale: Math.round(damageScale * 1000) / 1000,
    speedScale: Math.round(speedScale * 1000) / 1000,
  });
}

export function createEnemyDirectorV2({ seed = 1, stage = 1, difficulty = 1 } = {}) {
  const next = rng32(seed);
  const safeStage = clamp(Math.trunc(Number(stage) || 1), 1, 100);
  const safeDifficulty = clamp(Number(difficulty) || 1, .75, 3);

  const available = () => Object.values(ENEMY_ARCHETYPES_V2)
    .filter(enemy => enemy.unlockStage <= safeStage);

  function chooseArchetype(previousId = null) {
    const pool = available();
    const weighted = [];
    for (const enemy of pool) {
      let weight = 10;
      if (enemy.id === 'raider' || enemy.id === 'gunner') weight += 8;
      if (enemy.unlockStage === safeStage) weight -= 2;
      if (enemy.id === previousId) weight = Math.max(2, Math.floor(weight * .35));
      for (let count = 0; count < weight; count += 1) weighted.push(enemy);
    }
    return weighted[next() % weighted.length];
  }

  function buildWavePlan({ wave = 1, count = 8, startTick = 0 } = {}) {
    const safeWave = clamp(Math.trunc(Number(wave) || 1), 1, 20);
    const safeCount = clamp(Math.trunc(Number(count) || 1), 1, 100);
    const interval = clamp(Math.round(66 - safeStage * 2 - safeWave * 1.5), 24, 66);
    const plan = [];
    let previousId = null;
    for (let index = 0; index < safeCount; index += 1) {
      const archetype = chooseArchetype(previousId);
      previousId = archetype.id;
      const jitter = Number(next() % 11) - 5;
      plan.push(Object.freeze({
        index,
        spawnTick: Math.max(0, Math.trunc(startTick) + index * interval + jitter),
        lane: LANE_NORMALIZED_X[next() % LANE_NORMALIZED_X.length],
        archetypeId: archetype.id,
        defenseClass: archetype.defenseClass,
        damageType: archetype.damageType,
        telegraphTicks: archetype.telegraphTicks,
      }));
    }
    return Object.freeze(plan.sort((a, b) => a.spawnTick - b.spawnTick || a.index - b.index));
  }

  function buildBossAttackPlan({ cycles = 12 } = {}) {
    const safeCycles = clamp(Math.trunc(Number(cycles) || 1), 1, 100);
    const result = [];
    let cursor = 0;
    for (let index = 0; index < safeCycles; index += 1) {
      const phase = BOSS_PHASES_V2[Math.min(BOSS_PHASES_V2.length - 1, Math.floor(index / Math.max(1, safeCycles / 3)))];
      const pattern = phase.patterns[next() % phase.patterns.length];
      result.push(Object.freeze({ index, phaseId: phase.id, pattern, telegraphTick: cursor, fireTick: cursor + 30 }));
      cursor += phase.cooldownTicks;
    }
    return Object.freeze(result);
  }

  return Object.freeze({
    version: 'enemy-director-v2.0.0',
    stage: safeStage,
    difficulty: safeDifficulty,
    buildWavePlan,
    buildBossAttackPlan,
  });
}
