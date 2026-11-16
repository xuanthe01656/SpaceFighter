/**
 * Static Campaign extension packs.
 *
 * Add a reviewed pack import here when authoring a new planet or stage set.
 * Do not register packs dynamically at runtime.
 *
 * Pack shape:
 * {
 *   id: 'campaign-planet-4',
 *   schemaVersion: 1,
 *   releaseState: 'qa', // production | qa | disabled
 *   stages: { 11: { waves, baseEnemies, timeLimit, expReward, ... } },
 *   planets: [{
 *     id: 4,
 *     config: { id: 4, name:{vi,en}, battle:{playerModifiers:[],enemyHpMultiplier:1}, ... },
 *     stageNames: { 1:{vi,en}, ... },
 *     enemies: [{ id, tier, baseHp, speedMin, speedMax, score, imgSrc }],
 *     bosses: { mech:{...}, alien:{...} },
 *   }],
 * }
 */
export const CAMPAIGN_EXTENSION_PACKS_V430 = Object.freeze([]);
