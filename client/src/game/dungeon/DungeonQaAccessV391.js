import { DUNGEON_RUNTIME_PROFILES_V38 } from './DungeonEncounterCatalogV38.js';

export const DUNGEON_QA_ACCESS_VERSION = 'dungeon-qa-access-v3.9.1';

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
    runtimeMode: 'parity_v39',
    readiness: 'full_vertical_slice',
    allowDirectRoom: true,
    roomBriefs: roomBriefs('dung_taurus'),
  },
  dung_nereus: {
    id: 'dung_nereus',
    visible: true,
    runtimeMode: 'legacy_preview',
    readiness: 'catalog_preview',
    allowDirectRoom: false,
    roomBriefs: roomBriefs('dung_nereus'),
  },
  dung_abaddon: {
    id: 'dung_abaddon',
    visible: true,
    runtimeMode: 'legacy_preview',
    readiness: 'catalog_preview',
    allowDirectRoom: false,
    roomBriefs: roomBriefs('dung_abaddon'),
  },
});

export function parseDungeonQaQueryV391(search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  return freezeDeep({
    requested: truthy(params.get('sfDungeonQa')),
    dungeonId: params.get('sfDungeon') || null,
    roomId: params.get('sfDungeonRoom') || null,
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
  return freezeDeep({
    version: DUNGEON_QA_ACCESS_VERSION,
    enabled,
    source: envEnabled ? 'build_flag' : (enabled ? 'dev_query' : 'disabled'),
    rewardMode: 'none',
    consumeEnergy: false,
    trustedWrites: false,
    requestedDungeonId: requestedProfile?.id || null,
    requestedRoomId: requestedProfile?.allowDirectRoom ? requestedRoom?.id || null : null,
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
} = {}) {
  if (!access?.enabled) return null;
  const profile = resolveDungeonQaProfileV391(dungeonId);
  if (!profile?.visible) return null;
  const room = profile.allowDirectRoom
    ? profile.roomBriefs.find(entry => entry.id === roomId) || null
    : null;
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
    seedKey: `qa-v391:${profile.id}:${room?.id || 'full'}`,
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
  if (typeof run.seedKey !== 'string' || !run.seedKey.startsWith(`qa-v391:${run.dungeonId}:`)) return false;
  const profile = resolveDungeonQaProfileV391(run.dungeonId);
  if (!profile?.visible || run.runtimeMode !== profile.runtimeMode || run.readiness !== profile.readiness) return false;
  if (run.singleRoom && (!profile.allowDirectRoom || !profile.roomBriefs.some(room => room.id === run.directRoomId))) return false;
  return dungeonId ? run.dungeonId === dungeonId : true;
}

export function getDungeonQaStatusLabelV391(profile, lang = 'vi') {
  if (!profile) return '';
  if (profile.readiness === 'full_vertical_slice') {
    return lang === 'vi' ? 'FULL PARITY QA' : 'FULL PARITY QA';
  }
  return lang === 'vi' ? 'CATALOG / LEGACY PREVIEW' : 'CATALOG / LEGACY PREVIEW';
}

export function auditDungeonQaAccessV391() {
  const issues = [];
  const ids = Object.keys(DUNGEON_QA_PROFILES_V391);
  if (ids.length !== 3) issues.push('DUNGEON_QA_PROFILE_COUNT');
  const taurus = DUNGEON_QA_PROFILES_V391.dung_taurus;
  if (!taurus?.allowDirectRoom || taurus.roomBriefs.length !== 5) issues.push('DUNGEON_QA_TAURUS_ROOMS');
  for (const profile of Object.values(DUNGEON_QA_PROFILES_V391)) {
    if (!profile.visible || !DUNGEON_RUNTIME_PROFILES_V38[profile.id]) {
      issues.push(`DUNGEON_QA_PROFILE_INVALID:${profile.id}`);
    }
  }
  const access = resolveDungeonQaAccessV391({ envEnabled: true });
  const run = createDungeonQaRunV391({ access, dungeonId: 'dung_taurus', roomId: 'taurus_boss' });
  if (!isDungeonQaRunV391(run, 'dung_taurus', { runtimeEnabled: true }) || run.directRoomIndex !== 4 || !run.singleRoom) {
    issues.push('DUNGEON_QA_RUN_CONTRACT');
  }
  return Object.freeze(issues);
}
