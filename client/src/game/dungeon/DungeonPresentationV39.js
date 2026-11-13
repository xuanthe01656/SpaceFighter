/**
 * Dungeon production presentation contracts V3.9.
 *
 * Presentation-only data. No HP, damage, reward, movement or authority values
 * live here. DungeonScene and the shared projectile renderer consume this
 * catalog without changing deterministic combat state.
 */
export const DUNGEON_PRODUCTION_PRESENTATION_VERSION = 'dungeon-production-presentation-v3.9.4';

const freezeDeep = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, freezeDeep(entry)])));
  }
  return value;
};

const TAURUS_PATTERN_PRESENTATION = freezeDeep({
  alpha_lock_burst: {
    patternId: 'taurus_drill_lance',
    visualId: 'dungeon_taurus_drill_lance',
    telegraphColor: '#ff8a32',
  },
  alpha_lane_scan: {
    patternId: 'taurus_ore_cutter',
    visualId: 'dungeon_taurus_ore_cutter',
    telegraphColor: '#ffc857',
  },
  alpha_crossfire: {
    patternId: 'taurus_shrapnel_crossfire',
    visualId: 'dungeon_taurus_shrapnel',
    telegraphColor: '#ff6b35',
  },
  alpha_overdrive: {
    patternId: 'taurus_foundry_overdrive',
    visualId: 'dungeon_taurus_overdrive',
    telegraphColor: '#ff382e',
  },
});

export const DUNGEON_PRESENTATION_PROFILES_V39 = freezeDeep({
  dung_taurus: {
    id: 'dung_taurus',
    status: 'production_vertical_slice',
    palette: {
      clearColor: '#03110e',
      fogColor: '#071c18',
      ambientDiffuse: '#7ca89e',
      ambientGround: '#071916',
      accent: '#4ade80',
      accentSoft: '#9ff5bb',
      objective: '#ffd166',
      warning: '#ff8a32',
      danger: '#ff3f2e',
      panel: 'rgba(3,12,14,0.92)',
      starNear: '#d9fff4',
      starMid: '#73bfae',
      starFar: '#315d55',
    },
    backdrop: {
      style: 'salvage_belt',
      decorativeDebrisCount: 12,
      scrollSpeed: .014,
    },
    boss: {
      visualAssetId: 'dung_taurus_boss',
      fallbackStyle: 'rust_driller',
      patternPresentation: TAURUS_PATTERN_PRESENTATION,
    },
    hazard: {
      style: 'drifting_scrap',
      warningMode: 'edge_pulse',
      warningMs: 280,
      warningWidth: 1.05,
      warningDepth: 0,
      warningPulseHz: 4.2,
    },
    breakable: {
      style: 'ore_cache',
      hpBarColor: '#ffd166',
      criticalColor: '#ff7b32',
    },
    roomObjectives: {
      entry: {
        vi: 'Dọn sạch lối vào và giữ đội hình.',
        en: 'Clear the approach and hold formation.',
      },
      ambush: {
        vi: 'Né phế liệu trôi và tiêu diệt hải tặc.',
        en: 'Evade drifting scrap and destroy the pirates.',
      },
      breakable: {
        vi: 'Phá toàn bộ kho quặng và tiêu diệt địch.',
        en: 'Destroy every ore cache and all hostiles.',
      },
      elite: {
        vi: 'Phá đội hình hộ tống tinh nhuệ.',
        en: 'Break the elite escort formation.',
      },
      boss: {
        vi: 'Đánh bại Mũi Khoan Gỉ Sét.',
        en: 'Defeat the Rusty Driller.',
      },
    },
  },
  dung_nereus: {
    id: 'dung_nereus',
    status: 'catalog_ready',
    palette: {
      clearColor: '#03101d', fogColor: '#071b31', ambientDiffuse: '#73a9c9',
      ambientGround: '#04101c', accent: '#38bdf8', accentSoft: '#a7e7ff',
      objective: '#b8f3ff', warning: '#5bd9ff', danger: '#ff5470',
      panel: 'rgba(3,10,22,0.92)', starNear: '#e8fbff', starMid: '#76bcd6', starFar: '#315b70',
    },
    boss: { visualAssetId: 'dung_nereus_boss', fallbackStyle: 'oracle_core', patternPresentation: {} },
  },
  dung_abaddon: {
    id: 'dung_abaddon',
    status: 'catalog_ready',
    palette: {
      clearColor: '#130308', fogColor: '#260611', ambientDiffuse: '#b47a89',
      ambientGround: '#19040b', accent: '#ff4757', accentSoft: '#ffb0ba',
      objective: '#ffb86b', warning: '#ff6b3d', danger: '#ff1744',
      panel: 'rgba(18,2,8,0.94)', starNear: '#fff0f3', starMid: '#c6687e', starFar: '#62283a',
    },
    boss: { visualAssetId: 'dung_abaddon_boss', fallbackStyle: 'rift_leviathan', patternPresentation: {} },
  },
});

export function resolveDungeonPresentationV39(dungeonId = 'dung_taurus') {
  return DUNGEON_PRESENTATION_PROFILES_V39[dungeonId]
    || DUNGEON_PRESENTATION_PROFILES_V39.dung_taurus;
}

export function resolveDungeonRoomObjectiveV39({ dungeonId = 'dung_taurus', room = null, lang = 'vi' } = {}) {
  const profile = resolveDungeonPresentationV39(dungeonId);
  const localized = room?.objective
    || profile.roomObjectives?.[room?.kind]
    || profile.roomObjectives?.entry
    || { vi: '', en: '' };
  return localized[lang] || localized.vi || localized.en || '';
}

export function resolveDungeonBossPatternPresentationV39({
  dungeonId = 'dung_taurus',
  patternId = null,
  visualId = null,
} = {}) {
  const profile = resolveDungeonPresentationV39(dungeonId);
  const mapped = profile.boss?.patternPresentation?.[patternId] || null;
  return freezeDeep({
    originalPatternId: patternId,
    patternId: mapped?.patternId || patternId,
    visualId: mapped?.visualId || visualId,
    telegraphColor: mapped?.telegraphColor || profile.palette?.danger || '#ff4757',
  });
}

export function auditDungeonPresentationV39() {
  const issues = [];
  const taurus = DUNGEON_PRESENTATION_PROFILES_V39.dung_taurus;
  if (taurus.boss.visualAssetId !== 'dung_taurus_boss') issues.push('TAURUS_BOSS_VISUAL_ID');
  if (taurus.hazard.warningMode !== 'edge_pulse'
    || !(taurus.hazard.warningMs >= 180 && taurus.hazard.warningMs <= 400)
    || taurus.hazard.warningDepth !== 0) {
    issues.push('TAURUS_HAZARD_NATURAL_ENTRY_CUE');
  }
  const patternIds = Object.keys(taurus.boss.patternPresentation || {});
  if (patternIds.length !== 4) issues.push('TAURUS_PATTERN_PRESENTATION_COUNT');
  if (!Object.values(taurus.roomObjectives || {}).every(value => value.vi && value.en)) {
    issues.push('TAURUS_ROOM_OBJECTIVE_LOCALIZATION');
  }
  if (taurus.palette.clearColor.toLowerCase() === '#4ade80') issues.push('TAURUS_FLAT_THEME_BACKGROUND');
  return Object.freeze(issues);
}
