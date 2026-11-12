import {
  projectilesFromCampaignBossAttackPlanV29,
} from '../combat/CampaignBossCombatV29.js';
import {
  createCampaignBossStatechartControllerV37,
  getCampaignBossStatechartSnapshotV37,
  stepCampaignBossStatechartV37,
  stopCampaignBossStatechartControllerV37,
} from '../combat/CampaignBossStatechartV37.js';
import { resolveCampaignBossProfileV33 } from '../combat/CampaignBossArsenalV33.js';
import {
  resolveDungeonBossPatternPresentationV39,
  resolveDungeonPresentationV39,
} from './DungeonPresentationV39.js';

export const DUNGEON_BOSS_ADAPTER_VERSION = 'dungeon-boss-adapter-v3.9.0';

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

export function resolveDungeonBossBindingV38(bossSpec = {}) {
  const profile = resolveCampaignBossProfileV33({
    profileId: bossSpec.sharedBossProfileId || 'alpha_mech_sentinel',
  });
  const bossId = String(bossSpec.id || '');
  const inferredDungeonId = bossId.startsWith('taurus_') ? 'dung_taurus'
    : bossId.startsWith('nereus_') ? 'dung_nereus'
      : bossId.startsWith('abaddon_') ? 'dung_abaddon'
        : 'dung_taurus';
  const dungeonId = bossSpec.dungeonId || inferredDungeonId;
  const presentation = resolveDungeonPresentationV39(dungeonId);
  return freezeDeep({
    version: DUNGEON_BOSS_ADAPTER_VERSION,
    dungeonBossId: bossSpec.id || `dungeon_${profile.id}`,
    dungeonId,
    visualAssetId: bossSpec.visualAssetId || presentation.boss?.visualAssetId || `${dungeonId}_boss`,
    profileId: profile.id,
    planetId: profile.planetId,
    bossType: profile.bossType,
    damageMultiplier: clamp(finite(bossSpec.damageMultiplier, 1), .45, 2.5),
    projectileSpeedMultiplier: clamp(finite(bossSpec.projectileSpeedMultiplier, 1), .55, 2.0),
    movementMultiplier: clamp(finite(bossSpec.movementMultiplier, 1), .65, 1.6),
    profile,
  });
}

export function createDungeonBossControllerV38({ bossSpec = {}, seed = 1, nowMs = 0 } = {}) {
  const binding = resolveDungeonBossBindingV38(bossSpec);
  const controller = createCampaignBossStatechartControllerV37({
    seed,
    nowMs,
    planetId: binding.planetId,
    bossType: binding.bossType,
    profileId: binding.profileId,
    mode: 'authoritative',
    allowLegacyFallback: false,
  });
  return { version: DUNGEON_BOSS_ADAPTER_VERSION, binding, controller };
}

export function stepDungeonBossControllerV38(runtime, input = {}) {
  if (!runtime?.controller) {
    return Object.freeze({ runtime, state: null, events: Object.freeze([]), deltaX: 0, deltaZ: 0 });
  }
  const step = stepCampaignBossStatechartV37(runtime.controller, {
    ...input,
    baseSpeed: Math.max(.012, finite(input.baseSpeed, .045)) * runtime.binding.movementMultiplier,
  });
  runtime.controller = step.controller;
  return Object.freeze({ ...step, runtime });
}

export function getDungeonBossSnapshotV38(runtime) {
  if (!runtime?.controller) return null;
  const snapshot = getCampaignBossStatechartSnapshotV37(runtime.controller);
  return freezeDeep({
    version: DUNGEON_BOSS_ADAPTER_VERSION,
    binding: runtime.binding,
    statechart: snapshot,
  });
}

export function stopDungeonBossControllerV38(runtime) {
  stopCampaignBossStatechartControllerV37(runtime?.controller);
  if (runtime) runtime.controller = null;
}

export function projectilesFromDungeonBossAttackPlanV38(plan, bossSpec = {}) {
  const binding = resolveDungeonBossBindingV38(bossSpec);
  return Object.freeze(projectilesFromCampaignBossAttackPlanV29(plan).map(projectile => {
    const presentation = resolveDungeonBossPatternPresentationV39({
      dungeonId: binding.dungeonId,
      patternId: projectile.pattern,
      visualId: projectile.visualId,
    });
    return freezeDeep({
      ...projectile,
      pattern: presentation.patternId,
      sourcePattern: presentation.originalPatternId,
      visualId: presentation.visualId,
      rawDamage: Math.max(1, Math.round(projectile.rawDamage * binding.damageMultiplier)),
      velocity: {
        x: projectile.velocity.x * binding.projectileSpeedMultiplier,
        z: projectile.velocity.z * binding.projectileSpeedMultiplier,
      },
      dungeonBossId: binding.dungeonBossId,
      dungeonId: binding.dungeonId,
    });
  }));
}

export function auditDungeonBossAdapterV38() {
  const issues = [];
  const binding = resolveDungeonBossBindingV38({
    id: 'taurus_rust_driller',
    dungeonId: 'dung_taurus',
    visualAssetId: 'dung_taurus_boss',
    sharedBossProfileId: 'alpha_mech_sentinel',
    damageMultiplier: .88,
    projectileSpeedMultiplier: .96,
  });
  if (binding.profileId !== 'alpha_mech_sentinel') issues.push('DUNGEON_BOSS_PROFILE_BINDING');
  if (binding.visualAssetId !== 'dung_taurus_boss') issues.push('DUNGEON_BOSS_VISUAL_BINDING');
  if (!(binding.damageMultiplier > 0) || !(binding.projectileSpeedMultiplier > 0)) {
    issues.push('DUNGEON_BOSS_MULTIPLIER');
  }
  return Object.freeze(issues);
}
