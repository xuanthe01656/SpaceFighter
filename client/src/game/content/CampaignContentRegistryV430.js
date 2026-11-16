import {
  PLANET_CONFIG as BASE_PLANET_CONFIG,
  STAGE_CONFIG as BASE_STAGE_CONFIG,
  PLANET_STAGE_NAMES as BASE_PLANET_STAGE_NAMES,
  PLANET_ENEMIES as BASE_PLANET_ENEMIES,
  PLANET_BOSSES as BASE_PLANET_BOSSES,
} from '../catalog/worlds.js';
import { CAMPAIGN_EXTENSION_PACKS_V430 } from './packs/CampaignExtensionPacksV430.js';
import {
  CONTENT_AUTHORING_SCHEMA_VERSION_V430,
  cloneJsonLikeV430,
  duplicateValuesV430,
  finiteNumberV430,
  freezeDeepV430,
  localizedTextCompleteV430,
  positiveIntegerV430,
  releaseStateV430,
  sortedNumericRecordV430,
} from './ContentRegistryCoreV430.js';

export const CAMPAIGN_CONTENT_REGISTRY_VERSION_V430 = 'campaign-content-registry-v4.3.0';

const baseMeta = Object.freeze(Object.fromEntries(Object.keys(BASE_PLANET_CONFIG).map(id => [
  Number(id),
  Object.freeze({ packId: 'campaign-base-v430', releaseState: 'production', schemaVersion: 1 }),
])));

const safeObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export function buildCampaignContentRegistryV430({
  packs = CAMPAIGN_EXTENSION_PACKS_V430,
} = {}) {
  const planets = cloneJsonLikeV430(BASE_PLANET_CONFIG);
  const stages = cloneJsonLikeV430(BASE_STAGE_CONFIG);
  const stageNames = cloneJsonLikeV430(BASE_PLANET_STAGE_NAMES);
  const enemies = cloneJsonLikeV430(BASE_PLANET_ENEMIES);
  const bosses = cloneJsonLikeV430(BASE_PLANET_BOSSES);
  const meta = cloneJsonLikeV430(baseMeta);
  const packIds = new Set(['campaign-base-v430']);
  const issues = [];

  for (const pack of Array.isArray(packs) ? packs : []) {
    const packId = String(pack?.id || '').trim();
    if (!packId || packIds.has(packId)) {
      issues.push(`CAMPAIGN_PACK_ID:${packId || 'missing'}`);
      continue;
    }
    packIds.add(packId);
    if (pack.schemaVersion !== CONTENT_AUTHORING_SCHEMA_VERSION_V430) {
      issues.push(`CAMPAIGN_PACK_SCHEMA:${packId}`);
      continue;
    }
    const packRelease = releaseStateV430(pack.releaseState);
    if (!packRelease) {
      issues.push(`CAMPAIGN_PACK_RELEASE:${packId}`);
      continue;
    }

    for (const [stageIdRaw, stage] of Object.entries(safeObject(pack.stages))) {
      const stageId = positiveIntegerV430(stageIdRaw);
      if (!stageId || stages[stageId]) {
        issues.push(`CAMPAIGN_STAGE_DUPLICATE:${packId}:${stageIdRaw}`);
        continue;
      }
      stages[stageId] = cloneJsonLikeV430(stage);
    }

    for (const definition of Array.isArray(pack.planets) ? pack.planets : []) {
      const planetId = positiveIntegerV430(definition?.id ?? definition?.config?.id);
      if (!planetId || planets[planetId]) {
        issues.push(`CAMPAIGN_PLANET_DUPLICATE:${packId}:${planetId || 'invalid'}`);
        continue;
      }
      const config = cloneJsonLikeV430(definition.config || {});
      config.id = planetId;
      config.releaseState = packRelease;
      planets[planetId] = config;
      stageNames[planetId] = cloneJsonLikeV430(definition.stageNames || {});
      enemies[planetId] = cloneJsonLikeV430(definition.enemies || []);
      bosses[planetId] = cloneJsonLikeV430(definition.bosses || {});
      meta[planetId] = {
        packId,
        releaseState: packRelease,
        schemaVersion: pack.schemaVersion,
      };
    }
  }

  return freezeDeepV430({
    version: CAMPAIGN_CONTENT_REGISTRY_VERSION_V430,
    schemaVersion: CONTENT_AUTHORING_SCHEMA_VERSION_V430,
    planets: sortedNumericRecordV430(planets),
    stages: sortedNumericRecordV430(stages),
    stageNames: sortedNumericRecordV430(stageNames),
    enemies: sortedNumericRecordV430(enemies),
    bosses: sortedNumericRecordV430(bosses),
    meta: sortedNumericRecordV430(meta),
    packIds: Object.freeze([...packIds]),
    assemblyIssues: Object.freeze(issues),
  });
}

export const CAMPAIGN_CONTENT_REGISTRY_V430 = buildCampaignContentRegistryV430();
export const CAMPAIGN_PLANET_CONFIG_V430 = CAMPAIGN_CONTENT_REGISTRY_V430.planets;
export const CAMPAIGN_STAGE_CONFIG_V430 = CAMPAIGN_CONTENT_REGISTRY_V430.stages;
export const CAMPAIGN_PLANET_STAGE_NAMES_V430 = CAMPAIGN_CONTENT_REGISTRY_V430.stageNames;
export const CAMPAIGN_PLANET_ENEMIES_V430 = CAMPAIGN_CONTENT_REGISTRY_V430.enemies;
export const CAMPAIGN_PLANET_BOSSES_V430 = CAMPAIGN_CONTENT_REGISTRY_V430.bosses;

export function resolveCampaignPlanetV430(planetId = 1) {
  return CAMPAIGN_PLANET_CONFIG_V430[planetId] || CAMPAIGN_PLANET_CONFIG_V430[1] || null;
}

export function resolveCampaignStageV430(stageId = 1) {
  return CAMPAIGN_STAGE_CONFIG_V430[stageId] || CAMPAIGN_STAGE_CONFIG_V430[1] || null;
}

export function listCampaignPlanetIdsV430({ includeDisabled = false } = {}) {
  return Object.keys(CAMPAIGN_PLANET_CONFIG_V430).map(Number)
    .filter(Number.isFinite)
    .filter(id => includeDisabled || CAMPAIGN_CONTENT_REGISTRY_V430.meta[id]?.releaseState !== 'disabled')
    .sort((a, b) => a - b);
}

export function listCampaignStageIdsV430() {
  return Object.keys(CAMPAIGN_STAGE_CONFIG_V430).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
}

export function auditCampaignContentRegistryV430(registry = CAMPAIGN_CONTENT_REGISTRY_V430) {
  const issues = [...(registry.assemblyIssues || [])];
  const planetIds = Object.keys(registry.planets).map(Number).sort((a, b) => a - b);
  const stageIds = Object.keys(registry.stages).map(Number).sort((a, b) => a - b);
  if (!planetIds.length) issues.push('CAMPAIGN_NO_PLANETS');
  if (!stageIds.length) issues.push('CAMPAIGN_NO_STAGES');

  for (const stageId of stageIds) {
    const stage = registry.stages[stageId];
    if (!(finiteNumberV430(stage?.waves) > 0)
      || !(finiteNumberV430(stage?.baseEnemies) > 0)
      || !(finiteNumberV430(stage?.timeLimit) > 0)
      || finiteNumberV430(stage?.expReward, -1) < 0) {
      issues.push(`CAMPAIGN_STAGE_NUMERIC:${stageId}`);
    }
    if (stage?.hasBoss && !String(stage?.bossType || '').trim()) {
      issues.push(`CAMPAIGN_STAGE_BOSS_TYPE:${stageId}`);
    }
  }

  for (const planetId of planetIds) {
    const config = registry.planets[planetId];
    const metadata = registry.meta[planetId];
    if (config?.id !== planetId) issues.push(`CAMPAIGN_PLANET_ID:${planetId}`);
    if (!localizedTextCompleteV430(config?.name)) issues.push(`CAMPAIGN_PLANET_NAME:${planetId}`);
    if (!(finiteNumberV430(config?.battle?.enemyHpMultiplier) > 0)
      || !Array.isArray(config?.battle?.playerModifiers)) {
      issues.push(`CAMPAIGN_PLANET_BATTLE:${planetId}`);
    }
    if (!releaseStateV430(metadata?.releaseState)) issues.push(`CAMPAIGN_PLANET_RELEASE:${planetId}`);
    const names = safeObject(registry.stageNames[planetId]);
    for (const stageId of stageIds) {
      if (!localizedTextCompleteV430(names[stageId])) {
        issues.push(`CAMPAIGN_STAGE_NAME:${planetId}:${stageId}`);
      }
    }
    const planetEnemies = Array.isArray(registry.enemies[planetId]) ? registry.enemies[planetId] : [];
    if (!planetEnemies.length) issues.push(`CAMPAIGN_ENEMIES_EMPTY:${planetId}`);
    const duplicateEnemyIds = duplicateValuesV430(planetEnemies.map(enemy => enemy?.id).filter(Boolean));
    for (const enemyId of duplicateEnemyIds) issues.push(`CAMPAIGN_ENEMY_DUPLICATE:${planetId}:${enemyId}`);
    for (const enemy of planetEnemies) {
      if (!String(enemy?.id || '').trim()
        || !(finiteNumberV430(enemy?.baseHp) > 0)
        || !(finiteNumberV430(enemy?.speedMax) >= finiteNumberV430(enemy?.speedMin))) {
        issues.push(`CAMPAIGN_ENEMY_INVALID:${planetId}:${enemy?.id || 'unknown'}`);
      }
    }
    const planetBosses = safeObject(registry.bosses[planetId]);
    for (const stageId of stageIds.filter(id => registry.stages[id]?.hasBoss)) {
      const bossType = registry.stages[stageId].bossType;
      const boss = planetBosses[bossType];
      if (!boss || !(finiteNumberV430(boss.baseHp) > 0) || !String(boss.id || '').trim()) {
        issues.push(`CAMPAIGN_BOSS_BINDING:${planetId}:${stageId}:${bossType}`);
      }
    }
  }
  return Object.freeze(issues);
}
