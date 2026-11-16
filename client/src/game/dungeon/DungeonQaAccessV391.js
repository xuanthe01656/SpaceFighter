import { DUNGEON_RUNTIME_PROFILES_V38 } from './DungeonEncounterCatalogV38.js';
import { DUNGEON_CONTENT_REGISTRY_V430 } from '../content/DungeonContentRegistryV430.js';
import {
  DUNGEON_QA_DEFAULT_LOADOUT_PRESET_ID_V397,
  DUNGEON_QA_LOADOUT_PRESETS_V397,
  auditDungeonQaLoadoutsV397,
} from './DungeonQaLoadoutV397.js';

/** Stable function names retained for V3.9.1 callers; content discovery is V4.3-driven. */
export const DUNGEON_QA_ACCESS_VERSION = 'dungeon-qa-access-v3.9.8';
export const DUNGEON_QA_RUNTIME_MODE_V430 = 'parity_v398';

const freezeDeep = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, freezeDeep(entry)])));
  }
  return value;
};

const truthy = value => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());

const roomBriefs = dungeonId => (DUNGEON_RUNTIME_PROFILES_V38[dungeonId]?.rooms || []).map((room, index) => ({
  id: room.id,
  index,
  kind: room.kind,
  title: room.title || { vi: room.id, en: room.id },
}));

const readinessFor = (profile, releaseState) => releaseState === 'production' || profile.enabledByDefault
  ? 'production_qa'
  : 'production_candidate_qa';

const buildQaProfiles = () => Object.fromEntries(Object.values(DUNGEON_RUNTIME_PROFILES_V38)
  .filter(profile => profile?.qaReady)
  .sort((left, right) => (Number(left.difficultyRank) || 0) - (Number(right.difficultyRank) || 0)
    || left.id.localeCompare(right.id))
  .map(profile => {
    const releaseState = DUNGEON_CONTENT_REGISTRY_V430.meta[profile.id]?.releaseState || 'qa';
    const defaultPreset = profile.productionProfile?.defaultQaLoadoutPresetId;
    return [profile.id, {
      id: profile.id,
      visible: releaseState !== 'disabled',
      runtimeMode: DUNGEON_QA_RUNTIME_MODE_V430,
      readiness: readinessFor(profile, releaseState),
      difficultyTier: Math.max(1, Number(profile.difficultyRank) || 1),
      allowDirectRoom: true,
      defaultLoadoutPresetId: DUNGEON_QA_LOADOUT_PRESETS_V397[defaultPreset]
        ? defaultPreset
        : DUNGEON_QA_DEFAULT_LOADOUT_PRESET_ID_V397,
      roomBriefs: roomBriefs(profile.id),
    }];
  }));

export const DUNGEON_QA_PROFILES_V391 = freezeDeep(buildQaProfiles());

export function parseDungeonQaQueryV391(search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  return freezeDeep({
    requested: truthy(params.get('sfDungeonQa')),
    dungeonId: params.get('sfDungeon') || null,
    roomId: params.get('sfDungeonRoom') || null,
    loadoutPresetId: params.get('sfDungeonLoadout') || null,
  });
}

export function resolveDungeonQaAccessV391({
  envEnabled = false,
  isDev = false,
  search = '',
} = {}) {
  const query = parseDungeonQaQueryV391(search);
  const enabled = Boolean(envEnabled || (isDev && query.requested));
  const requestedProfile = DUNGEON_QA_PROFILES_V391[query.dungeonId] || null;
  const requestedRoom = requestedProfile?.roomBriefs?.find(room => room.id === query.roomId) || null;
  const requestedLoadoutPresetId = DUNGEON_QA_LOADOUT_PRESETS_V397[query.loadoutPresetId]
    ? query.loadoutPresetId
    : null;
  return freezeDeep({
    version: DUNGEON_QA_ACCESS_VERSION,
    enabled,
    source: envEnabled ? 'build_flag' : (enabled ? 'dev_query' : 'disabled'),
    rewardMode: 'none',
    consumeEnergy: false,
    trustedWrites: false,
    requestedDungeonId: requestedProfile?.id || null,
    requestedRoomId: requestedProfile?.allowDirectRoom ? requestedRoom?.id || null : null,
    requestedLoadoutPresetId,
  });
}

export function resolveDungeonQaProfileV391(dungeonId) {
  return DUNGEON_QA_PROFILES_V391[dungeonId] || null;
}

export function resolveDungeonQaRuntimeAccessV391() {
  return resolveDungeonQaAccessV391({
    envEnabled: import.meta.env?.VITE_SF_DUNGEON_QA === 'true',
    isDev: Boolean(import.meta.env?.DEV),
    search: globalThis.location?.search || '',
  });
}

export function isDungeonQaRuntimeEnabledV391() {
  return resolveDungeonQaRuntimeAccessV391().enabled;
}

export function createDungeonQaRunV391({
  access,
  dungeonId,
  roomId = null,
  loadoutPresetId = null,
} = {}) {
  if (!access?.enabled) return null;
  const profile = resolveDungeonQaProfileV391(dungeonId);
  if (!profile?.visible) return null;
  const room = profile.allowDirectRoom
    ? profile.roomBriefs.find(entry => entry.id === roomId) || null
    : null;
  const presetId = DUNGEON_QA_LOADOUT_PRESETS_V397[loadoutPresetId]
    ? loadoutPresetId
    : DUNGEON_QA_LOADOUT_PRESETS_V397[access.requestedLoadoutPresetId]
      ? access.requestedLoadoutPresetId
      : DUNGEON_QA_LOADOUT_PRESETS_V397[profile.defaultLoadoutPresetId]
        ? profile.defaultLoadoutPresetId
        : DUNGEON_QA_DEFAULT_LOADOUT_PRESET_ID_V397;
  return freezeDeep({
    version: DUNGEON_QA_ACCESS_VERSION,
    enabled: true,
    source: access.source,
    dungeonId: profile.id,
    runtimeMode: profile.runtimeMode,
    readiness: profile.readiness,
    directRoomId: room?.id || null,
    directRoomIndex: room?.index ?? null,
    singleRoom: Boolean(room),
    loadoutPresetId: presetId,
    seedKey: `qa-v398:${profile.id}:${room?.id || 'full'}:${presetId}`,
    rewardMode: 'none',
    consumeEnergy: false,
    trustedWrites: false,
  });
}

export function isDungeonQaRunV391(run, dungeonId = null, {
  runtimeEnabled = isDungeonQaRuntimeEnabledV391(),
} = {}) {
  if (!runtimeEnabled) return false;
  if (!run || run.version !== DUNGEON_QA_ACCESS_VERSION || run.enabled !== true) return false;
  if (run.rewardMode !== 'none' || run.consumeEnergy !== false || run.trustedWrites !== false) return false;
  if (!DUNGEON_QA_LOADOUT_PRESETS_V397[run.loadoutPresetId]) return false;
  if (typeof run.seedKey !== 'string'
    || !run.seedKey.startsWith(`qa-v398:${run.dungeonId}:`)
    || !run.seedKey.endsWith(`:${run.loadoutPresetId}`)) return false;
  const profile = resolveDungeonQaProfileV391(run.dungeonId);
  if (!profile?.visible || run.runtimeMode !== profile.runtimeMode || run.readiness !== profile.readiness) return false;
  if (run.singleRoom && (!profile.allowDirectRoom || !profile.roomBriefs.some(room => room.id === run.directRoomId))) return false;
  return dungeonId ? run.dungeonId === dungeonId : true;
}

export function getDungeonQaStatusLabelV391(profile, lang = 'vi') {
  if (!profile) return '';
  const tier = Math.max(1, Number(profile.difficultyTier) || 1);
  if (profile.readiness === 'production_qa') {
    return lang === 'vi' ? `PRODUCTION QA · BẬC ${tier}` : `PRODUCTION QA · TIER ${tier}`;
  }
  return lang === 'vi' ? `QA ỨNG VIÊN · BẬC ${tier}` : `CANDIDATE QA · TIER ${tier}`;
}

export function auditDungeonQaAccessV391() {
  const issues = [...auditDungeonQaLoadoutsV397()];
  const profiles = Object.values(DUNGEON_QA_PROFILES_V391);
  if (!profiles.length) issues.push('DUNGEON_QA_NO_PROFILES');
  for (const baseId of ['dung_taurus', 'dung_nereus', 'dung_abaddon']) {
    if (!DUNGEON_QA_PROFILES_V391[baseId]) issues.push(`DUNGEON_QA_BASE_PROFILE:${baseId}`);
  }
  for (const profile of profiles) {
    const runtime = DUNGEON_RUNTIME_PROFILES_V38[profile.id];
    if (!profile.visible || !runtime) issues.push(`DUNGEON_QA_PROFILE_INVALID:${profile.id}`);
    const releaseState = DUNGEON_CONTENT_REGISTRY_V430.meta[profile.id]?.releaseState;
    const expectedReadiness = releaseState === 'production' ? 'production_qa' : 'production_candidate_qa';
    if (profile.readiness !== expectedReadiness || profile.runtimeMode !== DUNGEON_QA_RUNTIME_MODE_V430) {
      issues.push(`DUNGEON_QA_PROFILE_MODE:${profile.id}`);
    }
    if (!profile.allowDirectRoom || profile.roomBriefs.length !== (runtime?.rooms?.length || 0)) {
      issues.push(`DUNGEON_QA_ROOM_ACCESS:${profile.id}`);
    }
    if (!DUNGEON_QA_LOADOUT_PRESETS_V397[profile.defaultLoadoutPresetId]) {
      issues.push(`DUNGEON_QA_DEFAULT_LOADOUT:${profile.id}`);
    }
  }
  const sample = profiles.at(-1);
  if (sample) {
    const room = sample.roomBriefs.at(-1);
    const access = resolveDungeonQaAccessV391({ envEnabled: true });
    const run = createDungeonQaRunV391({
      access,
      dungeonId: sample.id,
      roomId: room?.id,
      loadoutPresetId: sample.defaultLoadoutPresetId,
    });
    if (!isDungeonQaRunV391(run, sample.id, { runtimeEnabled: true })
      || run.directRoomIndex !== room?.index
      || !run.singleRoom) {
      issues.push('DUNGEON_QA_RUN_CONTRACT');
    }
  }
  return Object.freeze(issues);
}
