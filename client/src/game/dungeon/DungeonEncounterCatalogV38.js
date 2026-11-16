import { ENEMY_ARCHETYPES_V2 } from '../combat/EnemyCombatCatalogV2.js';
import {
  DUNGEON_CONTENT_REGISTRY_VERSION_V430,
  DUNGEON_CONTENT_REGISTRY_V430,
  DUNGEON_CONTENT_CATALOG_V430,
  DUNGEON_RUNTIME_PROFILES_V430,
  auditDungeonContentRegistryV430,
} from '../content/DungeonContentRegistryV430.js';

/**
 * Dungeon Parity Foundation V3.8 compatibility projection.
 *
 * V3.9.3 moved authored content into DungeonContentCatalogV393. This module keeps
 * the stable V3.8 runtime API consumed by DungeonScene, QA and existing tests.
 */
export const DUNGEON_PARITY_FOUNDATION_VERSION = 'dungeon-parity-foundation-v3.8.0';
export const DUNGEON_VERTICAL_SLICE_ID_V38 = 'dung_taurus';
export const DUNGEON_CONTENT_PROJECTION_VERSION_V393 = DUNGEON_CONTENT_REGISTRY_VERSION_V430;

export const DUNGEON_RUNTIME_PROFILES_V38 = DUNGEON_RUNTIME_PROFILES_V430;

export function resolveDungeonRuntimeProfileV38(dungeonId = DUNGEON_VERTICAL_SLICE_ID_V38) {
  return DUNGEON_RUNTIME_PROFILES_V38[dungeonId]
    || DUNGEON_RUNTIME_PROFILES_V38[DUNGEON_VERTICAL_SLICE_ID_V38];
}

export function isDungeonParityFoundationEnabledV38({
  dungeonId = DUNGEON_VERTICAL_SLICE_ID_V38,
  envEnabled = true,
  qaEnabled = false,
} = {}) {
  const profile = DUNGEON_RUNTIME_PROFILES_V38[dungeonId];
  const releaseState = DUNGEON_CONTENT_REGISTRY_V430.meta[dungeonId]?.releaseState;
  const productionEnabled = profile?.enabledByDefault === true && releaseState === 'production';
  const isolatedQaEnabled = qaEnabled && profile?.qaReady === true && releaseState !== 'disabled';
  return Boolean(envEnabled && (productionEnabled || isolatedQaEnabled));
}

export function auditDungeonEncounterCatalogV38() {
  const issues = [...auditDungeonContentRegistryV430()];
  const validRoles = new Set(Object.keys(ENEMY_ARCHETYPES_V2));
  if (Object.keys(DUNGEON_CONTENT_CATALOG_V430).length !== Object.keys(DUNGEON_RUNTIME_PROFILES_V38).length) {
    issues.push('DUNGEON_REGISTRY_RUNTIME_PARITY');
  }
  for (const profile of Object.values(DUNGEON_RUNTIME_PROFILES_V38)) {
    if (!profile.rooms?.length) issues.push(`DUNGEON_NO_ROOMS:${profile.id}`);
    const roomIds = new Set();
    for (const entry of profile.rooms || []) {
      if (roomIds.has(entry.id)) issues.push(`DUNGEON_DUPLICATE_ROOM:${profile.id}:${entry.id}`);
      roomIds.add(entry.id);
      if (!(entry.threatBudget >= 0) || !(entry.spawnGapMs > 0)) {
        issues.push(`DUNGEON_ROOM_NUMERIC:${profile.id}:${entry.id}`);
      }
      for (const role of entry.roles || []) {
        if (!validRoles.has(role.id)) issues.push(`DUNGEON_UNKNOWN_ROLE:${profile.id}:${entry.id}:${role.id}`);
        if (!(role.weight > 0)) issues.push(`DUNGEON_ROLE_WEIGHT:${profile.id}:${entry.id}:${role.id}`);
      }
      if (entry.breakablesRequired && !entry.breakables?.length) {
        issues.push(`DUNGEON_BREAKABLE_OBJECTIVE:${profile.id}:${entry.id}`);
      }
      if (entry.kind === 'boss' && !entry.boss?.sharedBossProfileId) {
        issues.push(`DUNGEON_BOSS_BINDING:${profile.id}:${entry.id}`);
      }
      if (entry.kind === 'boss' && !entry.boss?.visualAssetId) {
        issues.push(`DUNGEON_BOSS_VISUAL:${profile.id}:${entry.id}`);
      }
    }
  }
  const taurus = DUNGEON_RUNTIME_PROFILES_V38.dung_taurus;
  if (taurus.status !== 'vertical_slice' || taurus.rooms.length !== 5) {
    issues.push('DUNGEON_TAURUS_VERTICAL_SLICE');
  }
  for (const id of ['dung_nereus', 'dung_abaddon']) {
    const profile = DUNGEON_RUNTIME_PROFILES_V38[id];
    if (profile?.enabledByDefault !== false || profile?.status !== 'production_candidate' || profile?.qaReady !== true) {
      issues.push(`DUNGEON_QA_CANDIDATE:${id}`);
    }
    if (isDungeonParityFoundationEnabledV38({ dungeonId: id, envEnabled: true })) {
      issues.push(`DUNGEON_QA_CANDIDATE_PRODUCTION_LEAK:${id}`);
    }
    if (!isDungeonParityFoundationEnabledV38({ dungeonId: id, envEnabled: true, qaEnabled: true })) {
      issues.push(`DUNGEON_QA_CANDIDATE_NOT_TESTABLE:${id}`);
    }
  }
  return Object.freeze(issues);
}
