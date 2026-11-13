import { DUNGEON_RUNTIME_PROFILES_V38 } from './DungeonEncounterCatalogV38.js';
import {
  DUNGEON_QA_DEFAULT_LOADOUT_PRESET_ID_V397,
  DUNGEON_QA_LOADOUT_PRESETS_V397,
  auditDungeonQaLoadoutsV397,
} from './DungeonQaLoadoutV397.js';

/** Stable function names retained for V3.9.1 callers; contract advanced in V3.9.7. */
export const DUNGEON_QA_ACCESS_VERSION = 'dungeon-qa-access-v3.9.7';

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

export const DUNGEON_QA_PROFILES_V391 = freezeDeep({
  dung_taurus: {
    id: 'dung_taurus',
    visible: true,
    runtimeMode: 'parity_v397',
    readiness: 'production_qa',
    difficultyTier: 1,
    allowDirectRoom: true,
    defaultLoadoutPresetId: 'assault_mk3',
    roomBriefs: roomBriefs('dung_taurus'),
  },
  dung_nereus: {
    id: 'dung_nereus',
    visible: true,
    runtimeMode: 'parity_v397',
    readiness: 'production_qa',
    difficultyTier: 2,
    allowDirectRoom: true,
    defaultLoadoutPresetId: 'control_mk3',
    roomBriefs: roomBriefs('dung_nereus'),
  },
  dung_abaddon: {
    id: 'dung_abaddon',
    visible: true,
    runtimeMode: 'parity_v397',
    readiness: 'production_qa',
    difficultyTier: 3,
    allowDirectRoom: true,
    defaultLoadoutPresetId: 'fortress_mk4',
    roomBriefs: roomBriefs('dung_abaddon'),
  },
});

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
    seedKey: `qa-v397:${profile.id}:${room?.id || 'full'}:${presetId}`,
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
    || !run.seedKey.startsWith(`qa-v397:${run.dungeonId}:`)
    || !run.seedKey.endsWith(`:${run.loadoutPresetId}`)) return false;
  const profile = resolveDungeonQaProfileV391(run.dungeonId);
  if (!profile?.visible || run.runtimeMode !== profile.runtimeMode || run.readiness !== profile.readiness) return false;
  if (run.singleRoom && (!profile.allowDirectRoom || !profile.roomBriefs.some(room => room.id === run.directRoomId))) return false;
  return dungeonId ? run.dungeonId === dungeonId : true;
}

export function getDungeonQaStatusLabelV391(profile, lang = 'vi') {
  if (!profile) return '';
  const tier = Math.max(1, Number(profile.difficultyTier) || 1);
  return lang === 'vi' ? `PRODUCTION QA · BẬC ${tier}` : `PRODUCTION QA · TIER ${tier}`;
}

export function auditDungeonQaAccessV391() {
  const issues = [...auditDungeonQaLoadoutsV397()];
  const ids = Object.keys(DUNGEON_QA_PROFILES_V391);
  if (ids.length !== 3) issues.push('DUNGEON_QA_PROFILE_COUNT');
  for (const profile of Object.values(DUNGEON_QA_PROFILES_V391)) {
    if (!profile.visible || !DUNGEON_RUNTIME_PROFILES_V38[profile.id]) {
      issues.push(`DUNGEON_QA_PROFILE_INVALID:${profile.id}`);
    }
    if (profile.readiness !== 'production_qa' || profile.runtimeMode !== 'parity_v397') {
      issues.push(`DUNGEON_QA_PROFILE_MODE:${profile.id}`);
    }
    if (!profile.allowDirectRoom || profile.roomBriefs.length !== 5) {
      issues.push(`DUNGEON_QA_ROOM_ACCESS:${profile.id}`);
    }
    if (!DUNGEON_QA_LOADOUT_PRESETS_V397[profile.defaultLoadoutPresetId]) {
      issues.push(`DUNGEON_QA_DEFAULT_LOADOUT:${profile.id}`);
    }
  }
  const access = resolveDungeonQaAccessV391({ envEnabled: true });
  const run = createDungeonQaRunV391({
    access,
    dungeonId: 'dung_abaddon',
    roomId: 'abaddon_leviathan',
    loadoutPresetId: 'fortress_mk4',
  });
  if (!isDungeonQaRunV391(run, 'dung_abaddon', { runtimeEnabled: true })
    || run.directRoomIndex !== 4
    || !run.singleRoom
    || run.loadoutPresetId !== 'fortress_mk4') {
    issues.push('DUNGEON_QA_RUN_CONTRACT');
  }
  return Object.freeze(issues);
}
