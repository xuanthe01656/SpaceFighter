import { DUNGEON_CONFIG as BASE_DUNGEON_LISTINGS } from '../catalog/worlds.js';
import {
  DUNGEON_CONTENT_CATALOG_V393,
  DUNGEON_CONTENT_SCHEMA_VERSION,
  DUNGEON_ROOM_TEMPLATES_V393,
  DUNGEON_ENCOUNTER_PACKS_V393,
  DUNGEON_HAZARD_PROFILES_V393,
  DUNGEON_OBJECTIVE_PROFILES_V393,
  auditDungeonContentCatalogV393,
  projectDungeonRuntimeProfilesV393,
} from '../dungeon/DungeonContentCatalogV393.js';
import { DUNGEON_EXTENSION_PACKS_V430 } from './packs/DungeonExtensionPacksV430.js';
import {
  CONTENT_AUTHORING_SCHEMA_VERSION_V430,
  cloneJsonLikeV430,
  duplicateValuesV430,
  finiteNumberV430,
  freezeDeepV430,
  localizedTextCompleteV430,
  releaseStateV430,
} from './ContentRegistryCoreV430.js';

export const DUNGEON_CONTENT_REGISTRY_VERSION_V430 = 'dungeon-content-registry-v4.3.0';

const baseReleaseState = profile => profile?.enabledByDefault ? 'production'
  : profile?.qaReady ? 'qa'
    : 'disabled';

const listingById = listings => Object.fromEntries((Array.isArray(listings) ? listings : [])
  .filter(entry => entry?.id)
  .map(entry => [entry.id, entry]));

const normalizedListing = (listing, profile, releaseState) => ({
  ...cloneJsonLikeV430(listing || {}),
  id: profile.id,
  difficulty: profile.difficultyRank,
  waves: profile.rooms.length,
  releaseState,
  qaReady: Boolean(profile.qaReady),
  enabledByDefault: Boolean(profile.enabledByDefault),
});

export function buildDungeonContentRegistryV430({
  packs = DUNGEON_EXTENSION_PACKS_V430,
} = {}) {
  const content = cloneJsonLikeV430(DUNGEON_CONTENT_CATALOG_V393);
  const baseListings = listingById(BASE_DUNGEON_LISTINGS);
  const listings = {};
  const meta = {};
  const issues = [];
  const packIds = new Set(['dungeon-base-v430']);

  for (const profile of Object.values(content)) {
    const releaseState = baseReleaseState(profile);
    listings[profile.id] = normalizedListing(baseListings[profile.id], profile, releaseState);
    meta[profile.id] = {
      packId: 'dungeon-base-v430',
      releaseState,
      schemaVersion: CONTENT_AUTHORING_SCHEMA_VERSION_V430,
    };
  }

  for (const pack of Array.isArray(packs) ? packs : []) {
    const packId = String(pack?.id || '').trim();
    if (!packId || packIds.has(packId)) {
      issues.push(`DUNGEON_PACK_ID:${packId || 'missing'}`);
      continue;
    }
    packIds.add(packId);
    if (pack.schemaVersion !== CONTENT_AUTHORING_SCHEMA_VERSION_V430) {
      issues.push(`DUNGEON_PACK_SCHEMA:${packId}`);
      continue;
    }
    const packRelease = releaseStateV430(pack.releaseState);
    if (!packRelease) {
      issues.push(`DUNGEON_PACK_RELEASE:${packId}`);
      continue;
    }
    const profile = cloneJsonLikeV430(pack.content || {});
    const dungeonId = String(profile.id || pack.listing?.id || '').trim();
    if (!dungeonId || content[dungeonId]) {
      issues.push(`DUNGEON_PACK_DUPLICATE:${packId}:${dungeonId || 'missing'}`);
      continue;
    }
    profile.id = dungeonId;
    if (packRelease === 'production') {
      profile.enabledByDefault = true;
      profile.qaReady = true;
      if (profile.status === 'production_candidate') profile.status = 'vertical_slice';
    } else if (packRelease === 'qa') {
      profile.enabledByDefault = false;
      profile.qaReady = true;
      profile.status = profile.status || 'production_candidate';
    } else {
      profile.enabledByDefault = false;
      profile.qaReady = false;
      profile.status = profile.status || 'disabled';
    }
    content[dungeonId] = profile;
    listings[dungeonId] = normalizedListing(pack.listing, profile, packRelease);
    meta[dungeonId] = {
      packId,
      releaseState: packRelease,
      schemaVersion: pack.schemaVersion,
    };
  }

  const orderedIds = Object.keys(content).sort((left, right) => {
    const rankDelta = finiteNumberV430(content[left]?.difficultyRank) - finiteNumberV430(content[right]?.difficultyRank);
    return rankDelta || left.localeCompare(right);
  });

  return freezeDeepV430({
    version: DUNGEON_CONTENT_REGISTRY_VERSION_V430,
    schemaVersion: CONTENT_AUTHORING_SCHEMA_VERSION_V430,
    content: Object.fromEntries(orderedIds.map(id => [id, content[id]])),
    listings: Object.freeze(orderedIds.map(id => listings[id])),
    listingById: Object.fromEntries(orderedIds.map(id => [id, listings[id]])),
    meta: Object.fromEntries(orderedIds.map(id => [id, meta[id]])),
    packIds: Object.freeze([...packIds]),
    assemblyIssues: Object.freeze(issues),
  });
}

export const DUNGEON_CONTENT_REGISTRY_V430 = buildDungeonContentRegistryV430();
export const DUNGEON_CONTENT_CATALOG_V430 = DUNGEON_CONTENT_REGISTRY_V430.content;
export const DUNGEON_LISTING_CONFIG_V430 = DUNGEON_CONTENT_REGISTRY_V430.listings;
export const DUNGEON_RUNTIME_PROFILES_V430 = projectDungeonRuntimeProfilesV393(DUNGEON_CONTENT_CATALOG_V430);

export function resolveDungeonContentProfileV430(dungeonId = 'dung_taurus') {
  return DUNGEON_CONTENT_CATALOG_V430[dungeonId]
    || DUNGEON_CONTENT_CATALOG_V430.dung_taurus
    || Object.values(DUNGEON_CONTENT_CATALOG_V430)[0]
    || null;
}

export function resolveDungeonListingV430(dungeonId = 'dung_taurus') {
  return DUNGEON_CONTENT_REGISTRY_V430.listingById[dungeonId]
    || DUNGEON_CONTENT_REGISTRY_V430.listingById.dung_taurus
    || null;
}

export function resolveDungeonRuntimeProfileV430(dungeonId = 'dung_taurus') {
  return DUNGEON_RUNTIME_PROFILES_V430[dungeonId]
    || DUNGEON_RUNTIME_PROFILES_V430.dung_taurus
    || Object.values(DUNGEON_RUNTIME_PROFILES_V430)[0]
    || null;
}

export function resolveDungeonVisualAssetIdV430(dungeonId, roleId) {
  const profile = resolveDungeonContentProfileV430(dungeonId);
  return profile?.visualSet?.enemyByRole?.[roleId]
    || profile?.visualSet?.enemyByRole?.raider
    || null;
}

export function resolveDungeonVisualAssetRefsV430(dungeonId = 'dung_taurus') {
  const profile = resolveDungeonContentProfileV430(dungeonId);
  if (!profile?.visualSet) return Object.freeze([]);
  return freezeDeepV430([
    ...(profile.visualSet.enemyAssets || []).map(asset => ({ kind: 'dungeon_enemy', id: asset.id })),
    ...(profile.visualSet.bossAsset?.id ? [{ kind: 'dungeon_boss', id: profile.visualSet.bossAsset.id }] : []),
  ]);
}

export function listDungeonIdsV430({ includeDisabled = false, qaOnly = false } = {}) {
  return Object.values(DUNGEON_CONTENT_CATALOG_V430)
    .filter(profile => includeDisabled || DUNGEON_CONTENT_REGISTRY_V430.meta[profile.id]?.releaseState !== 'disabled')
    .filter(profile => !qaOnly || profile.qaReady)
    .map(profile => profile.id);
}

export function auditDungeonContentRegistryV430(registry = DUNGEON_CONTENT_REGISTRY_V430) {
  const issues = [...(registry.assemblyIssues || [])];
  if (registry === DUNGEON_CONTENT_REGISTRY_V430) issues.push(...auditDungeonContentCatalogV393());
  const listingIds = registry.listings.map(row => row?.id).filter(Boolean);
  for (const duplicate of duplicateValuesV430(listingIds)) issues.push(`DUNGEON_LISTING_DUPLICATE:${duplicate}`);

  for (const [dungeonId, profile] of Object.entries(registry.content)) {
    const listing = registry.listingById[dungeonId];
    const metadata = registry.meta[dungeonId];
    if (profile.schemaVersion !== DUNGEON_CONTENT_SCHEMA_VERSION) issues.push(`DUNGEON_SCHEMA:${dungeonId}`);
    if (!listing) issues.push(`DUNGEON_LISTING_MISSING:${dungeonId}`);
    if (!releaseStateV430(metadata?.releaseState)) issues.push(`DUNGEON_RELEASE_STATE:${dungeonId}`);
    if (!localizedTextCompleteV430(listing?.title)
      || !localizedTextCompleteV430(listing?.subtitle)
      || !localizedTextCompleteV430(listing?.desc)) {
      issues.push(`DUNGEON_LISTING_LOCALIZATION:${dungeonId}`);
    }
    if (finiteNumberV430(listing?.difficulty) !== finiteNumberV430(profile.difficultyRank)) {
      issues.push(`DUNGEON_DIFFICULTY_PARITY:${dungeonId}`);
    }
    if (finiteNumberV430(listing?.waves) !== profile.rooms.length) {
      issues.push(`DUNGEON_ROOM_COUNT_PARITY:${dungeonId}`);
    }
    if (metadata?.releaseState === 'production' && (!profile.enabledByDefault || !profile.qaReady)) {
      issues.push(`DUNGEON_PRODUCTION_GATE:${dungeonId}`);
    }
    if (metadata?.releaseState === 'qa' && (profile.enabledByDefault || !profile.qaReady)) {
      issues.push(`DUNGEON_QA_ISOLATION:${dungeonId}`);
    }
    if (!profile.productionProfile?.defaultQaLoadoutPresetId) {
      issues.push(`DUNGEON_QA_LOADOUT:${dungeonId}`);
    }
    if (metadata?.packId !== 'dungeon-base-v430') {
      if (!profile.presentation?.palette?.accent
        || !profile.presentation?.backdrop?.style
        || !profile.presentation?.boss?.fallbackStyle) {
        issues.push(`DUNGEON_EXTENSION_PRESENTATION:${dungeonId}`);
      }
      if (!String(listing?.bgImg || '').trim() || !String(listing?.themeColor || '').trim()) {
        issues.push(`DUNGEON_EXTENSION_LISTING_ART:${dungeonId}`);
      }
    }
    const roomIds = profile.rooms.map(room => room.id);
    for (const duplicate of duplicateValuesV430(roomIds)) issues.push(`DUNGEON_ROOM_DUPLICATE:${dungeonId}:${duplicate}`);
    for (const room of profile.rooms) {
      if (!DUNGEON_ROOM_TEMPLATES_V393[room.templateId]) issues.push(`DUNGEON_ROOM_TEMPLATE:${dungeonId}:${room.id}`);
      if (!DUNGEON_ENCOUNTER_PACKS_V393[room.encounterPackId]) issues.push(`DUNGEON_ENCOUNTER_PACK:${dungeonId}:${room.id}`);
      if (room.hazardId && !DUNGEON_HAZARD_PROFILES_V393[room.hazardId]) issues.push(`DUNGEON_HAZARD:${dungeonId}:${room.id}`);
      if (room.objectiveProfileId && !DUNGEON_OBJECTIVE_PROFILES_V393[room.objectiveProfileId]) issues.push(`DUNGEON_OBJECTIVE:${dungeonId}:${room.id}`);
      if (room.templateId === 'boss' && (!room.boss?.sharedBossProfileId || !room.boss?.visualAssetId)) {
        issues.push(`DUNGEON_BOSS_BINDING:${dungeonId}:${room.id}`);
      }
    }
  }
  return Object.freeze(issues);
}
