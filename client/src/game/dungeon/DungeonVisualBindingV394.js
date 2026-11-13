/**
 * Dungeon visual binding V3.9.4.
 *
 * Resolves authored atlas/static profiles explicitly before spawn. If authored
 * art is absent, runtime keeps a role-specific temporary procedural visual so
 * a combat collider can never be invisible.
 */
import { resolveAssetVisual } from '../assets/AssetRegistry.js';
import {
  DUNGEON_CONTENT_CATALOG_V393,
  resolveDungeonContentProfileV393,
  resolveDungeonVisualAssetIdV393,
} from './DungeonContentCatalogV393.js';

export const DUNGEON_VISUAL_BINDING_VERSION = 'dungeon-visual-binding-v3.9.4';

const freezeDeep = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, freezeDeep(entry)])));
  }
  return value;
};

const TEMPORARY_STYLE_BY_ROLE = Object.freeze({
  raider: 'scout_wedge',
  gunner: 'twin_gun',
  charger: 'ram_spike',
  shieldbearer: 'shield_frame',
  support: 'support_orbit',
  artillery: 'long_cannon',
});

const hasUsableArt = profile => Boolean(profile && (profile.atlasSrc || profile.topSrc || profile.modelSrc));

const firstUsableProfile = (kind, assetIds = [], resolver = resolveAssetVisual) => {
  for (const assetId of [...new Set(assetIds.filter(Boolean))]) {
    const profile = resolver(kind, assetId);
    if (hasUsableArt(profile)) return { assetId, profile };
  }
  return null;
};

export function resolveDungeonEnemyVisualBindingV394({
  dungeonId = 'dung_taurus',
  roleId = 'raider',
  elite = false,
  requestedAssetId = null,
  profileResolver = resolveAssetVisual,
} = {}) {
  const canonicalAssetId = elite
    ? `${dungeonId}_elite`
    : resolveDungeonVisualAssetIdV393(dungeonId, roleId);
  const resolved = firstUsableProfile('dungeon_enemy', [requestedAssetId, canonicalAssetId], profileResolver);
  const assetId = resolved?.assetId || canonicalAssetId || requestedAssetId || `${dungeonId}_scout`;
  const profile = resolved?.profile || null;
  return freezeDeep({
    version: DUNGEON_VISUAL_BINDING_VERSION,
    kind: 'dungeon_enemy',
    requestedAssetId,
    canonicalAssetId,
    assetId,
    profile,
    mode: profile ? (profile.atlasSrc ? 'authored_atlas' : 'authored_static') : 'temporary_procedural',
    temporaryStyle: TEMPORARY_STYLE_BY_ROLE[roleId] || 'scout_wedge',
    roleId,
  });
}

export function resolveDungeonBossVisualBindingV394({
  dungeonId = 'dung_taurus',
  requestedAssetId = null,
  profileResolver = resolveAssetVisual,
} = {}) {
  const profileDefinition = resolveDungeonContentProfileV393(dungeonId);
  const canonicalAssetId = profileDefinition.visualSet.bossAsset.id;
  const resolved = firstUsableProfile('dungeon_boss', [requestedAssetId, canonicalAssetId], profileResolver);
  const assetId = resolved?.assetId || canonicalAssetId || requestedAssetId || `${dungeonId}_boss`;
  const profile = resolved?.profile || null;
  return freezeDeep({
    version: DUNGEON_VISUAL_BINDING_VERSION,
    kind: 'dungeon_boss',
    requestedAssetId,
    canonicalAssetId,
    assetId,
    profile,
    mode: profile ? (profile.atlasSrc ? 'authored_atlas' : 'authored_static') : 'temporary_procedural',
    temporaryStyle: profileDefinition.visualSet.bossAsset.role || 'boss_core',
  });
}

export function auditDungeonVisualBindingsV394() {
  const issues = [];
  const roleIds = ['raider', 'gunner', 'charger', 'shieldbearer', 'support', 'artillery'];
  for (const dungeonId of Object.keys(DUNGEON_CONTENT_CATALOG_V393)) {
    for (const roleId of roleIds) {
      const binding = resolveDungeonEnemyVisualBindingV394({ dungeonId, roleId });
      if (binding.mode !== 'authored_atlas') issues.push(`DUNGEON_ENEMY_ATLAS:${dungeonId}:${roleId}:${binding.mode}`);
      if (!binding.profile?.visual?.animations?.spawn?.frames?.every(frame => frame >= 3)) {
        issues.push(`DUNGEON_ENEMY_VISIBLE_SPAWN:${dungeonId}:${roleId}`);
      }
    }
    const boss = resolveDungeonBossVisualBindingV394({ dungeonId });
    if (boss.mode !== 'authored_atlas') issues.push(`DUNGEON_BOSS_ATLAS:${dungeonId}:${boss.mode}`);
    if (!boss.profile?.visual?.animations?.spawn?.frames?.every(frame => frame >= 3)) {
      issues.push(`DUNGEON_BOSS_VISIBLE_SPAWN:${dungeonId}`);
    }
  }
  return Object.freeze(issues);
}
