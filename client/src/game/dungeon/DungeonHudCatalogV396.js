import {
  DUNGEON_CONTENT_CATALOG_V393,
  resolveDungeonContentProfileV393,
} from './DungeonContentCatalogV393.js';
import { resolveDungeonPresentationV39 } from './DungeonPresentationV39.js';

/**
 * Dungeon HUD catalog V3.9.8 (V3.9.6 compatibility module).
 *
 * Presentation-only metadata for the React HUD. Combat authority, reward values,
 * HP tuning and encounter timing remain in their existing catalogs/runtime.
 */
export const DUNGEON_HUD_CATALOG_VERSION = 'dungeon-hud-catalog-v3.9.8';
export const DUNGEON_HUD_MAX_VISIBLE_ROOM_MARKERS_V396 = 8;

const freezeDeep = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, freezeDeep(entry)])));
  }
  return value;
};

const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));
const integer = (value, fallback = 0) => Number.isFinite(Number(value))
  ? Math.max(0, Math.round(Number(value)))
  : fallback;
const localized = (value, lang = 'vi', fallback = '') => value?.[lang]
  || value?.vi
  || value?.en
  || fallback;

export const DUNGEON_HUD_ROOM_KIND_V396 = freezeDeep({
  entry: {
    icon: '01',
    tone: 'standard',
    label: { vi: 'TIẾP CẬN', en: 'APPROACH' },
  },
  ambush: {
    icon: '02',
    tone: 'warning',
    label: { vi: 'NGUY HIỂM', en: 'HAZARD' },
  },
  breakable: {
    icon: '03',
    tone: 'objective',
    label: { vi: 'MỤC TIÊU', en: 'OBJECTIVE' },
  },
  elite: {
    icon: '04',
    tone: 'elite',
    label: { vi: 'TINH NHUỆ', en: 'ELITE' },
  },
  boss: {
    icon: '05',
    tone: 'boss',
    label: { vi: 'TRÙM', en: 'BOSS' },
  },
});

const PROFILE_META = freezeDeep({
  dung_taurus: {
    shortCode: 'TAURUS',
    displayName: { vi: 'VÀNH ĐAI THU HỒI TAURUS', en: 'TAURUS SALVAGE BELT' },
    missionLabel: { vi: 'CHIẾN DỊCH THU HỒI', en: 'SALVAGE OPERATION' },
    qaLabel: 'TAURUS PRODUCTION QA',
  },
  dung_nereus: {
    shortCode: 'NEREUS',
    displayName: { vi: 'LÕI PHÒNG VỆ NEREUS', en: 'NEREUS DEFENSE CORE' },
    missionLabel: { vi: 'XÂM NHẬP HỆ THỐNG', en: 'SYSTEM INCURSION' },
    qaLabel: 'NEREUS CANDIDATE QA',
  },
  dung_abaddon: {
    shortCode: 'ABADDON',
    displayName: { vi: 'KHE NỨT ABADDON', en: 'ABADDON RIFT' },
    missionLabel: { vi: 'SINH TỒN KHE NỨT', en: 'RIFT SURVIVAL' },
    qaLabel: 'ABADDON CANDIDATE QA',
  },
});

const buildHudProfile = dungeonId => {
  const content = resolveDungeonContentProfileV393(dungeonId);
  const presentation = resolveDungeonPresentationV39(dungeonId);
  const meta = PROFILE_META[dungeonId] || {
    shortCode: String(dungeonId || 'DUNGEON').replace(/^dung_/, '').toUpperCase(),
    displayName: { vi: content.id, en: content.id },
    missionLabel: { vi: 'PHÓ BẢN', en: 'DUNGEON' },
    qaLabel: 'DUNGEON QA',
  };
  return freezeDeep({
    id: dungeonId,
    version: DUNGEON_HUD_CATALOG_VERSION,
    shortCode: meta.shortCode,
    displayName: meta.displayName,
    missionLabel: meta.missionLabel,
    qaLabel: meta.qaLabel,
    difficultyRank: content.difficultyRank,
    colors: {
      accent: presentation.palette?.accent || '#4beaf4',
      accentSoft: presentation.palette?.accentSoft || '#a9eff7',
      objective: presentation.palette?.objective || '#ffd166',
      warning: presentation.palette?.warning || '#ff9d3d',
      danger: presentation.palette?.danger || '#ff4757',
      panel: presentation.palette?.panel || 'rgba(3,12,20,.94)',
      text: '#edfcff',
      muted: '#9ebdca',
    },
    layout: {
      maxRoomMarkers: DUNGEON_HUD_MAX_VISIBLE_ROOM_MARKERS_V396,
      publishIntervalMs: 100,
      compactWidthPx: 390,
      objectiveMaxLines: 2,
      reservedTopPx: 232,
      alignmentContract: 'shared-baseline-v398',
      worldSafetyMargin: .45,
    },
  });
};

export const DUNGEON_HUD_PROFILES_V396 = freezeDeep(Object.fromEntries(
  Object.keys(DUNGEON_CONTENT_CATALOG_V393).map(dungeonId => [dungeonId, buildHudProfile(dungeonId)]),
));

export function resolveDungeonHudProfileV396(dungeonId = 'dung_taurus') {
  return DUNGEON_HUD_PROFILES_V396[dungeonId]
    || buildHudProfile(dungeonId);
}

export function resolveDungeonHudOcclusionLineV396({
  dungeonId = 'dung_taurus',
  worldHalfHeight = 15,
  viewportHeight = 852,
} = {}) {
  const profile = resolveDungeonHudProfileV396(dungeonId);
  const half = Math.max(1, Number(worldHalfHeight) || 15);
  const height = Math.max(320, Number(viewportHeight) || 852);
  const reservedPx = Math.max(120, Number(profile.layout?.reservedTopPx) || 208);
  const margin = Math.max(0, Number(profile.layout?.worldSafetyMargin) || 0);
  const projected = (reservedPx / height) * (half * 2) + margin;
  const reservedWorld = clamp(projected, 3.8, 8.2);
  return -half + reservedWorld;
}

export function resolveDungeonHudRoomV396({
  dungeonId = 'dung_taurus',
  room = null,
  roomIndex = 0,
  lang = 'vi',
} = {}) {
  const content = resolveDungeonContentProfileV393(dungeonId);
  const resolvedRoom = room
    || content.rooms[clamp(roomIndex, 0, Math.max(0, content.rooms.length - 1))]
    || null;
  const kind = resolvedRoom?.kind
    || (resolvedRoom?.templateId && ({
      clear: 'entry',
      hazard_clear: 'ambush',
      destroy_nodes: 'breakable',
      elite_formation: 'elite',
      boss: 'boss',
    })[resolvedRoom.templateId])
    || 'entry';
  const kindMeta = DUNGEON_HUD_ROOM_KIND_V396[kind] || DUNGEON_HUD_ROOM_KIND_V396.entry;
  return freezeDeep({
    id: resolvedRoom?.id || `room_${integer(roomIndex) + 1}`,
    kind,
    tone: kindMeta.tone,
    icon: kindMeta.icon,
    kindLabel: localized(kindMeta.label, lang, kind.toUpperCase()),
    title: localized(resolvedRoom?.title, lang, resolvedRoom?.id || ''),
    objective: localized(resolvedRoom?.objective, lang, ''),
  });
}

export function buildDungeonRoomMarkersV396({
  dungeonId = 'dung_taurus',
  rooms = null,
  currentRoomIndex = 0,
  maxMarkers = DUNGEON_HUD_MAX_VISIBLE_ROOM_MARKERS_V396,
  lang = 'vi',
} = {}) {
  const sourceRooms = Array.isArray(rooms) && rooms.length
    ? rooms
    : resolveDungeonContentProfileV393(dungeonId).rooms;
  const count = sourceRooms.length;
  if (!count) return Object.freeze([]);
  const current = clamp(integer(currentRoomIndex), 0, count - 1);
  const limit = Math.max(3, integer(maxMarkers, DUNGEON_HUD_MAX_VISIBLE_ROOM_MARKERS_V396));
  let indices = [];
  if (count <= limit) {
    indices = sourceRooms.map((_, index) => index);
  } else {
    const candidates = [0, count - 1, current, current - 1, current + 1, current - 2, current + 2]
      .filter(index => index >= 0 && index < count);
    const chosen = new Set(candidates);
    for (let distance = 3; chosen.size < limit && distance < count; distance += 1) {
      for (const index of [current - distance, current + distance]) {
        if (index >= 0 && index < count) chosen.add(index);
        if (chosen.size >= limit) break;
      }
    }
    indices = [...chosen].sort((a, b) => a - b).slice(0, limit);
    if (!indices.includes(count - 1)) indices[indices.length - 1] = count - 1;
    indices = [...new Set(indices)].sort((a, b) => a - b);
  }
  return freezeDeep(indices.map((index, markerIndex) => {
    const roomModel = resolveDungeonHudRoomV396({
      dungeonId,
      room: sourceRooms[index],
      roomIndex: index,
      lang,
    });
    const previousIndex = markerIndex > 0 ? indices[markerIndex - 1] : null;
    return {
      index,
      number: index + 1,
      roomId: roomModel.id,
      kind: roomModel.kind,
      tone: roomModel.tone,
      title: roomModel.title,
      icon: roomModel.icon,
      status: index < current ? 'complete' : (index === current ? 'active' : 'upcoming'),
      gapBefore: previousIndex !== null && index - previousIndex > 1,
    };
  }));
}

export function resolveDungeonObjectiveProgressV396({
  roomKind = 'entry',
  roomComplete = false,
  enemiesDefeated = 0,
  enemiesTotal = 0,
  nodesDestroyed = 0,
  nodesTotal = 0,
  bossHp = null,
  bossMaxHp = null,
  lang = 'vi',
} = {}) {
  const vi = lang === 'vi';
  if (roomComplete) {
    return freezeDeep({
      mode: 'complete',
      label: vi ? 'HOÀN TẤT' : 'COMPLETE',
      value: '100%',
      current: 1,
      total: 1,
      ratio: 1,
      secondary: '',
    });
  }
  if (roomKind === 'boss' && Number(bossMaxHp) > 0) {
    const remaining = clamp(Number(bossHp) / Number(bossMaxHp), 0, 1);
    return freezeDeep({
      mode: 'boss',
      label: vi ? 'GIÁP TRÙM' : 'BOSS ARMOR',
      value: `${Math.round(remaining * 100)}%`,
      current: Math.round(Number(bossHp) || 0),
      total: Math.max(1, Math.round(Number(bossMaxHp) || 1)),
      ratio: remaining,
      secondary: '',
    });
  }
  if (roomKind === 'breakable' && Number(nodesTotal) > 0) {
    const current = clamp(integer(nodesDestroyed), 0, integer(nodesTotal));
    const total = Math.max(1, integer(nodesTotal, 1));
    const hostiles = Math.max(0, integer(enemiesDefeated));
    const hostileTotal = Math.max(0, integer(enemiesTotal));
    return freezeDeep({
      mode: 'nodes',
      label: vi ? 'MÔ-ĐUN' : 'MODULES',
      value: `${current}/${total}`,
      current,
      total,
      ratio: clamp(current / total, 0, 1),
      secondary: hostileTotal > 0
        ? `${vi ? 'ĐỊCH' : 'HOSTILES'} ${Math.min(hostiles, hostileTotal)}/${hostileTotal}`
        : '',
    });
  }
  const total = Math.max(1, integer(enemiesTotal, 1));
  const current = clamp(integer(enemiesDefeated), 0, total);
  return freezeDeep({
    mode: 'hostiles',
    label: vi ? 'MỤC TIÊU' : 'HOSTILES',
    value: `${current}/${total}`,
    current,
    total,
    ratio: clamp(current / total, 0, 1),
    secondary: '',
  });
}

export function auditDungeonHudCatalogV396() {
  const issues = [];
  const contentIds = Object.keys(DUNGEON_CONTENT_CATALOG_V393).sort();
  const hudIds = Object.keys(DUNGEON_HUD_PROFILES_V396).sort();
  if (JSON.stringify(contentIds) !== JSON.stringify(hudIds)) issues.push('DUNGEON_HUD_PROFILE_PARITY');
  const forbiddenKeys = new Set(['hp', 'damage', 'reward', 'projectileSpeed', 'fireCooldownMs']);
  const walk = (value, path = '') => {
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) issues.push(`DUNGEON_HUD_AUTHORITY_FIELD:${path}${key}`);
      walk(entry, `${path}${key}.`);
    }
  };
  for (const [id, profile] of Object.entries(DUNGEON_HUD_PROFILES_V396)) {
    if (profile.version !== DUNGEON_HUD_CATALOG_VERSION) issues.push(`DUNGEON_HUD_VERSION:${id}`);
    if (!profile.shortCode || !profile.displayName?.vi || !profile.displayName?.en) {
      issues.push(`DUNGEON_HUD_IDENTITY:${id}`);
    }
    if (!(profile.layout?.publishIntervalMs >= 80 && profile.layout?.publishIntervalMs <= 250)) {
      issues.push(`DUNGEON_HUD_PUBLISH_RATE:${id}`);
    }
    walk(profile, `${id}.`);
  }
  for (const kind of ['entry', 'ambush', 'breakable', 'elite', 'boss']) {
    if (!DUNGEON_HUD_ROOM_KIND_V396[kind]) issues.push(`DUNGEON_HUD_ROOM_KIND:${kind}`);
  }
  const phoneLine = resolveDungeonHudOcclusionLineV396({
    dungeonId: 'dung_taurus', worldHalfHeight: 15, viewportHeight: 852,
  });
  const tabletLine = resolveDungeonHudOcclusionLineV396({
    dungeonId: 'dung_taurus', worldHalfHeight: 15, viewportHeight: 1280,
  });
  if (!(phoneLine > -11.2 && phoneLine < -6.5) || !(tabletLine > -11.2 && tabletLine < -6.5)) {
    issues.push('DUNGEON_HUD_WORLD_OCCLUSION');
  }
  const longMarkers = buildDungeonRoomMarkersV396({
    rooms: Array.from({ length: 12 }, (_, index) => ({
      id: `room_${index}`,
      kind: index === 11 ? 'boss' : 'entry',
      title: { vi: `Phòng ${index + 1}`, en: `Room ${index + 1}` },
    })),
    currentRoomIndex: 7,
  });
  if (longMarkers.length > DUNGEON_HUD_MAX_VISIBLE_ROOM_MARKERS_V396
    || !longMarkers.some(marker => marker.index === 0)
    || !longMarkers.some(marker => marker.index === 7)
    || !longMarkers.some(marker => marker.index === 11)) {
    issues.push('DUNGEON_HUD_LONG_RUN_MARKERS');
  }
  return Object.freeze(issues);
}
