import {
  createCampaignEnemyChoreographyStateV29,
} from '../combat/CampaignCombatChoreographyV29.js';
import {
  ENEMY_ARCHETYPES_V2,
  enemyRuntimeFromCatalogV3,
} from '../combat/EnemyCombatCatalogV2.js';
import { resolveCampaignEnemyWeaponContractV37 } from '../combat/CombatWeaponCatalogV37.js';
import { resolveDungeonRuntimeProfileV38 } from './DungeonEncounterCatalogV38.js';
import { resolveDungeonVisualAssetIdV393 } from './DungeonContentCatalogV393.js';

export const DUNGEON_COMBAT_ADAPTER_VERSION = 'dungeon-combat-adapter-v3.8.0';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const freezeDeep = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, freezeDeep(entry)])));
  }
  return value;
};

const ASSET_KIND_BY_ROLE = Object.freeze({
  raider: 'scout',
  gunner: 'scout',
  charger: 'elite',
  shieldbearer: 'heavy',
  support: 'elite',
  artillery: 'heavy',
});

export function resolveDungeonEnemyAssetKindV38(roleId = 'raider') {
  return ASSET_KIND_BY_ROLE[roleId] || 'scout';
}

export function resolveDungeonEnemySpecV38({
  dungeonId = 'dung_taurus',
  room = null,
  entry = null,
} = {}) {
  const profile = resolveDungeonRuntimeProfileV38(dungeonId);
  const roleId = ENEMY_ARCHETYPES_V2[entry?.roleId] ? entry.roleId : 'raider';
  const archetype = ENEMY_ARCHETYPES_V2[roleId];
  const runtime = enemyRuntimeFromCatalogV3(roleId);
  const visualAssetKind = entry?.elite ? 'elite' : resolveDungeonEnemyAssetKindV38(roleId);
  const visualAssetId = entry?.visualAssetId
    || (entry?.elite ? `${dungeonId}_elite` : resolveDungeonVisualAssetIdV393(dungeonId, roleId));
  const weapon = resolveCampaignEnemyWeaponContractV37(roleId);
  const globalStats = profile.enemyStats;
  const hpMultiplier = finite(entry?.hpMultiplier, finite(room?.hpMultiplier, 1));
  const damageMultiplier = globalStats.damageMultiplier
    * finite(entry?.damageMultiplier, finite(room?.damageMultiplier, 1));
  const speedMultiplier = globalStats.speedMultiplier
    * finite(entry?.speedMultiplier, finite(room?.speedMultiplier, 1));
  const projectileSpeedMultiplier = globalStats.projectileSpeedMultiplier
    * finite(entry?.projectileSpeedMultiplier, finite(room?.projectileSpeedMultiplier, 1));
  const cooldownMultiplier = globalStats.fireCooldownMultiplier
    * finite(entry?.fireCooldownMultiplier, finite(room?.fireCooldownMultiplier, 1));
  const hp = Math.max(40, Math.round(
    globalStats.baseHp * globalStats.hpMultiplier * archetype.hpMultiplier * hpMultiplier,
  ));
  const speed = clamp(
    globalStats.baseSpeed * archetype.speedMultiplier * speedMultiplier,
    .024,
    .13,
  );
  const projectile = weapon.projectile ? freezeDeep({
    ...weapon.projectile,
    speed: clamp(weapon.projectile.speed * projectileSpeedMultiplier, .18, 1.15),
    damage: Math.max(10, Math.round(weapon.projectile.damage * damageMultiplier)),
  }) : null;

  return freezeDeep({
    version: DUNGEON_COMBAT_ADAPTER_VERSION,
    id: entry?.id || `${dungeonId}:${roleId}`,
    dungeonId,
    roomId: room?.id || null,
    roleId,
    assetKind: visualAssetKind,
    visualAssetKind,
    visualAssetId,
    archetype,
    runtime,
    weapon: {
      ...weapon,
      cadence: {
        ...weapon.cadence,
        cooldownMs: weapon.cadence?.cooldownMs
          ? Math.max(420, Math.round(weapon.cadence.cooldownMs * cooldownMultiplier))
          : 0,
      },
      projectile,
      contactDamage: Math.max(20, Math.round((weapon.contactDamage || 0) * damageMultiplier)),
    },
    hp,
    speed,
    elite: Boolean(entry?.elite),
    laneNorm: clamp(finite(entry?.laneNorm, 0), -.90, .90),
    strafeDirection: finite(entry?.strafeDirection, 1) < 0 ? -1 : 1,
    routeVariant: entry?.routeVariant || archetype.routeVariants?.[0] || archetype.behavior,
    preferredRange: runtime.preferredRange,
    fireRangeMin: runtime.fireRangeMin,
    fireRangeMax: runtime.fireRangeMax,
    canShoot: runtime.canShoot,
    canCrossPlayer: runtime.canCrossPlayer,
    reengages: runtime.reengages,
  });
}

export function createDungeonEnemyChoreographyStateV38(spec, { seed = 1, nowMs = 0 } = {}) {
  return createCampaignEnemyChoreographyStateV29({
    roleId: spec?.roleId || 'raider',
    lane: finite(spec?.laneNorm, 0),
    strafeDirection: finite(spec?.strafeDirection, 1),
    seed,
    nowMs,
    routeVariant: spec?.routeVariant || null,
  });
}

export function resolveDungeonEnemySpawnPointV38({
  laneNorm = 0,
  arenaHalfWidth = 7,
  worldHalfHeight = 15,
  index = 0,
} = {}) {
  const bound = Math.max(2.4, finite(arenaHalfWidth, 7) - .8);
  const stagger = (Math.max(0, Math.trunc(finite(index, 0))) % 3) * .65;
  return freezeDeep({
    x: clamp(finite(laneNorm, 0) * bound, -bound, bound),
    y: .2,
    z: -Math.max(8, finite(worldHalfHeight, 15)) - 2.2 - stagger,
  });
}

export function createDungeonCombatSlotDescriptorV38(enemy) {
  return freezeDeep({
    ownerId: enemy?.runtimeId || enemy?.spec?.id || enemy?.mesh?.uniqueId,
    roleId: enemy?.spec?.roleId || 'gunner',
    seed: enemy?.seed || 1,
    laneNorm: enemy?.spec?.laneNorm || 0,
    preferredRange: enemy?.spec?.preferredRange || 7.5,
    encounterFeatured: false,
  });
}

export function auditDungeonCombatAdapterV38() {
  const issues = [];
  for (const roleId of Object.keys(ENEMY_ARCHETYPES_V2)) {
    const spec = resolveDungeonEnemySpecV38({
      dungeonId: 'dung_taurus',
      room: { id: 'audit', hpMultiplier: 1, damageMultiplier: 1, speedMultiplier: 1 },
      entry: { id: `audit:${roleId}`, roleId, laneNorm: 0 },
    });
    if (spec.roleId !== roleId || !(spec.hp > 0) || !(spec.speed > 0)) {
      issues.push(`DUNGEON_SPEC:${roleId}`);
    }
    const expectedVisual = roleId === 'charger' || roleId === 'support'
      ? 'dung_taurus_elite'
      : roleId === 'shieldbearer' || roleId === 'artillery'
        ? 'dung_taurus_heavy'
        : 'dung_taurus_scout';
    if (spec.visualAssetId !== expectedVisual) issues.push(`DUNGEON_VISUAL_ASSET:${roleId}`);
    if (roleId === 'charger') {
      if (spec.canShoot || spec.weapon.projectile !== null) issues.push('DUNGEON_CHARGER_PROJECTILE');
    } else if (!spec.canShoot || !spec.weapon.projectile) {
      issues.push(`DUNGEON_RANGED_PROJECTILE:${roleId}`);
    }
  }
  return Object.freeze(issues);
}
