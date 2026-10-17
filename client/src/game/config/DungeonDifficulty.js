/** Graphics 2.1.3 enemy tuning, centralized. Not a player debuff. */
export const DUNGEON_DIFFICULTY_CONFIG = Object.freeze({
  1: Object.freeze({ speedBase: 0.038, speedInc: 0.004, spawnBase: 1600, spawnMin: 900,
    countBase: 5, countInc: 3, hpBase: 80, hpInc: 25,
    bulletVel: 0.28, bossBase: 800, bossPerWave: 400 }),
  2: Object.freeze({ speedBase: 0.052, speedInc: 0.006, spawnBase: 1400, spawnMin: 720,
    countBase: 6, countInc: 4, hpBase: 110, hpInc: 32,
    bulletVel: 0.36, bossBase: 2000, bossPerWave: 900 }),
  3: Object.freeze({ speedBase: 0.068, speedInc: 0.009, spawnBase: 1200, spawnMin: 580,
    countBase: 8, countInc: 5, hpBase: 150, hpInc: 48,
    bulletVel: 0.44, bossBase: 4200, bossPerWave: 1600 }),
});
export function resolveDungeonDifficulty(dungeon) {
  const difficulty = Number(dungeon?.difficulty) || 1;
  const cfg = DUNGEON_DIFFICULTY_CONFIG[difficulty];
  if (!cfg) throw new TypeError(`Invalid dungeon difficulty ${difficulty}`);
  return cfg;
}
