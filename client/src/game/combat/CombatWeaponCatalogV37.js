import { GEAR_CATALOG } from '../catalog/gear.js';
import { ENEMY_ARCHETYPES_V2 } from './EnemyCombatCatalogV2.js';
import {
  CAMPAIGN_BOSS_PATTERN_CATALOG_V33,
  CAMPAIGN_PLANET_BOSS_PROFILES_V33,
  resolveCampaignBossPatternContractV33,
  resolveCampaignBossProfileV33,
} from './CampaignBossArsenalV33.js';

/**
 * Read-only combat weapon contract projection V3.7.
 *
 * It does not duplicate balance data.  Enemy, Boss and player catalogs remain
 * the authoritative sources; this module gives tools/tests/runtime a common
 * vocabulary for bullet type, range, cadence and pattern identity.
 */
export const COMBAT_WEAPON_CATALOG_VERSION = 'combat-weapon-catalog-v3.7.0';

const freezeDeep = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, freezeDeep(entry)])));
  }
  return value;
};

const ENEMY_PATTERN_BY_ROLE = Object.freeze({
  raider: 'attack_pass_burst',
  gunner: 'sustained_predictive_burst',
  charger: 'telegraphed_contact_charge',
  shieldbearer: 'guard_lane_spread',
  support: 'soft_homing_ion_pair',
  artillery: 'telegraphed_heavy_pair',
});

const enemyContract = archetype => freezeDeep({
  id: archetype.weaponId || `enemy_${archetype.id}_weapon_v1`,
  ownerType: 'enemy',
  ownerId: archetype.id,
  bulletType: archetype.damageType,
  bulletPattern: archetype.bulletPattern || ENEMY_PATTERN_BY_ROLE[archetype.id],
  engagement: {
    mode: archetype.engagementMode,
    metric: archetype.rangeMetric,
    preferredRange: archetype.preferredRange,
    minimumRange: archetype.fireRangeMin,
    maximumRange: archetype.fireRangeMax,
  },
  cadence: {
    cooldownMs: archetype.fireCooldownMs,
    burstCount: archetype.burstCount,
    burstGapMs: archetype.burstGapMs,
    minVolleysPerPhase: archetype.minVolleysPerFirePhase,
    maxVolleysPerPhase: archetype.maxVolleysPerFirePhase,
  },
  projectile: archetype.canShoot ? {
    speed: archetype.projectileSpeed,
    damage: archetype.projectileDamage,
    aimMode: archetype.projectileAimMode,
    leadFactor: archetype.projectileLeadFactor,
    maxLeadMs: archetype.projectileMaxLeadMs,
    guidanceMs: archetype.projectileGuidanceMs,
    turnRateRadians: archetype.projectileTurnRateRadians,
    lifetimeMs: archetype.projectileLifetimeMs,
    visualId: archetype.projectileVisualId,
  } : null,
  contactDamage: archetype.contactDamage,
});

export const CAMPAIGN_ENEMY_WEAPON_CONTRACTS_V37 = freezeDeep(Object.fromEntries(
  Object.values(ENEMY_ARCHETYPES_V2).map(archetype => [archetype.id, enemyContract(archetype)]),
));

export const CAMPAIGN_PLAYER_WEAPON_CONTRACTS_V37 = freezeDeep(Object.fromEntries(
  GEAR_CATALOG.mainGun.map(gun => [gun.id, {
    id: gun.id,
    ownerType: 'player',
    bulletType: gun.projectileType,
    bulletPattern: gun.firePattern,
    engagement: {
      mode: 'player_forward_salvo',
      metric: 'runtime_projectile_geometry',
      runtimeSource: 'PlayerWeapons.describeMainSalvo',
    },
    cadence: { cooldownMs: Math.round(Number(gun.fireRate) * 1000) },
    projectile: { runtimeSource: 'PlayerWeapons.describeMainSalvo' },
    // Geometry/speed/hit-radius remain authored by PlayerWeapons.describeMainSalvo.
    // Keeping that source explicit prevents this projection from inventing a
    // second player-ballistics catalog.
    runtimeGeometrySource: 'PlayerWeapons.describeMainSalvo',
  }]),
));

export function resolveCampaignEnemyWeaponContractV37(roleId = 'gunner') {
  return CAMPAIGN_ENEMY_WEAPON_CONTRACTS_V37[roleId]
    || CAMPAIGN_ENEMY_WEAPON_CONTRACTS_V37.gunner;
}

export function resolveCampaignPlayerWeaponContractV37(gunId = 'gun_laser') {
  return CAMPAIGN_PLAYER_WEAPON_CONTRACTS_V37[gunId]
    || CAMPAIGN_PLAYER_WEAPON_CONTRACTS_V37.gun_laser;
}

export function resolveCampaignBossWeaponContractV37({
  planetId = 1,
  bossType = 'mech',
  profileId = null,
  phaseId = 'phase_1',
  patternId = null,
  phaseCombat = null,
} = {}) {
  const profile = resolveCampaignBossProfileV33({ planetId, bossType, profileId });
  const selected = patternId || profile.phasePatterns?.[phaseId]?.[0]
    || profile.phasePatterns?.phase_1?.[0];
  const contract = resolveCampaignBossPatternContractV33({
    profile,
    phaseId,
    pattern: selected,
    phaseCombat,
  });
  if (!contract) return null;
  return freezeDeep({
    id: `${profile.id}:${contract.id}`,
    ownerType: 'boss',
    ownerId: profile.id,
    planetId: profile.planetId,
    bossType: profile.bossType,
    bulletType: contract.damageType,
    bulletPattern: contract.geometry,
    patternId: contract.id,
    engagement: {
      mode: 'phase_anchor',
      metric: 'attack_plan_geometry',
      runtimeSource: 'CampaignBossCombatV29 + CampaignBossArsenalV33',
    },
    cadence: {
      telegraphMs: contract.telegraphMs,
      recoveryMs: contract.recoveryMs,
      shotGapMs: contract.shotGapMs,
      volleyGapMs: contract.volleyGapMs,
      volleys: contract.volleys,
      shotCount: contract.shotCount,
    },
    projectile: {
      speed: contract.projectileSpeed,
      damage: contract.projectileDamage,
      visualId: contract.visualId,
      width: contract.width,
    },
  });
}

export function auditCombatWeaponCatalogV37() {
  const issues = [];
  for (const [roleId, archetype] of Object.entries(ENEMY_ARCHETYPES_V2)) {
    const contract = CAMPAIGN_ENEMY_WEAPON_CONTRACTS_V37[roleId];
    if (!contract) issues.push(`MISSING_ENEMY_WEAPON:${roleId}`);
    else {
      if (!contract.id || !contract.bulletPattern) issues.push(`ENEMY_IDENTITY:${roleId}`);
      if (archetype.canShoot) {
        if (!contract.projectile || !(contract.projectile.speed > 0)
          || !(contract.projectile.damage > 0)) issues.push(`ENEMY_PROJECTILE:${roleId}`);
        if (!(contract.engagement.maximumRange > contract.engagement.minimumRange)) {
          issues.push(`ENEMY_RANGE:${roleId}`);
        }
        if (!(contract.cadence.cooldownMs > 0 && contract.cadence.burstCount >= 1)) {
          issues.push(`ENEMY_CADENCE:${roleId}`);
        }
      } else if (roleId !== 'charger' || contract.projectile !== null) {
        issues.push(`CONTACT_ONLY_CONTRACT:${roleId}`);
      }
    }
  }

  const bossProfiles = Object.values(CAMPAIGN_PLANET_BOSS_PROFILES_V33)
    .flatMap(group => Object.values(group));
  for (const profile of bossProfiles) {
    for (const [phaseId, patterns] of Object.entries(profile.phasePatterns || {})) {
      for (const patternId of patterns) {
        const contract = resolveCampaignBossWeaponContractV37({
          profileId: profile.id, phaseId, patternId,
        });
        if (!contract) issues.push(`MISSING_BOSS_WEAPON:${profile.id}:${patternId}`);
        else if (contract.patternId !== patternId
          || !CAMPAIGN_BOSS_PATTERN_CATALOG_V33[patternId]) {
          issues.push(`BOSS_PATTERN_DRIFT:${profile.id}:${patternId}`);
        }
      }
    }
  }

  for (const gun of GEAR_CATALOG.mainGun) {
    const contract = CAMPAIGN_PLAYER_WEAPON_CONTRACTS_V37[gun.id];
    if (!contract || contract.bulletType !== gun.projectileType
      || contract.bulletPattern !== gun.firePattern
      || contract.cadence.cooldownMs !== Math.round(gun.fireRate * 1000)) {
      issues.push(`PLAYER_WEAPON_DRIFT:${gun.id}`);
    }
  }
  return Object.freeze(issues);
}
