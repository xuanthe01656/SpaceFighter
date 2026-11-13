/**
 * Dungeon production presentation contracts V3.9.
 *
 * Presentation-only data. No HP, damage, reward, movement or authority values
 * live here. DungeonScene and the shared projectile renderer consume this
 * catalog without changing deterministic combat state.
 */
export const DUNGEON_PRODUCTION_PRESENTATION_VERSION = 'dungeon-production-presentation-v3.9.8';

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
        vi: 'Đánh chặn từng mô-đun thu hồi đang trôi và tiêu diệt lực lượng bảo vệ.',
        en: 'Intercept each drifting salvage module and clear its guards.',
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
    status: 'production_candidate',
    palette: {
      clearColor: '#03101d', fogColor: '#071b31', ambientDiffuse: '#73a9c9',
      ambientGround: '#04101c', accent: '#38bdf8', accentSoft: '#a7e7ff',
      objective: '#b8f3ff', warning: '#5bd9ff', danger: '#ff5470',
      panel: 'rgba(3,10,22,0.94)', starNear: '#e8fbff', starMid: '#76bcd6', starFar: '#315b70',
    },
    backdrop: {
      style: 'nereus_defense_core',
      decorativeDebrisCount: 8,
      scrollSpeed: .017,
      layerIdentity: ['tidal_grid', 'ion_mist', 'defense_spires'],
      layers: [
        { id: 'tidal_grid', role: 'far_field' },
        { id: 'ion_mist', role: 'mid_field' },
        { id: 'defense_spires', role: 'near_field' },
      ],
    },
    boss: {
      visualAssetId: 'dung_nereus_boss',
      fallbackStyle: 'oracle_core',
      patternPresentation: {},
    },
    hazard: {
      style: 'ion_current_lanes',
      telegraphProfile: 'nereus_ion_lane_charge',
      warningMode: 'lane_charge',
      warningMs: 820,
      warningWidth: 1.35,
      warningDepth: 0,
      warningPulseHz: 3.1,
    },
    breakable: {
      style: 'shield_relay',
      hpBarColor: '#b8f3ff',
      criticalColor: '#ff5470',
    },
    roomObjectives: {
      entry: {
        vi: 'Xuyên qua cổng thủy triều và bẻ lớp phòng vệ ngoài.',
        en: 'Breach the tidal gate and break the outer defense screen.',
      },
      ambush: {
        vi: 'Đọc nhịp dòng ion, đổi làn và phá đội tuần tra.',
        en: 'Read the ion cadence, change lanes and clear the patrol.',
      },
      breakable: {
        vi: 'Phá tuần tự ba relay khiên để mở đường tới Lõi Oracle.',
        en: 'Destroy the three shield relays in sequence to expose the Oracle Core.',
      },
      elite: {
        vi: 'Tách đội hình hỗ trợ, khiên và pháo tuyến sau.',
        en: 'Split the support, shield and rear-artillery formation.',
      },
      boss: {
        vi: 'Vô hiệu hóa Mắt Thần Oracle.',
        en: 'Disable the Oracle Core.',
      },
    },
  },
  dung_abaddon: {
    id: 'dung_abaddon',
    status: 'production_candidate',
    palette: {
      clearColor: '#130308', fogColor: '#260611', ambientDiffuse: '#b47a89',
      ambientGround: '#19040b', accent: '#ff4757', accentSoft: '#ffb0ba',
      objective: '#ffb86b', warning: '#ff6b3d', danger: '#ff1744',
      panel: 'rgba(18,2,8,0.96)', starNear: '#fff0f3', starMid: '#c6687e', starFar: '#62283a',
    },
    backdrop: {
      style: 'abaddon_rift',
      decorativeDebrisCount: 10,
      scrollSpeed: .020,
      layerIdentity: ['rift_veil', 'biomech_shards', 'gravity_scars'],
      layers: [
        { id: 'rift_veil', role: 'far_field' },
        { id: 'biomech_shards', role: 'mid_field' },
        { id: 'gravity_scars', role: 'near_field' },
      ],
    },
    boss: {
      visualAssetId: 'dung_abaddon_boss',
      fallbackStyle: 'rift_leviathan',
      patternPresentation: {},
    },
    hazard: {
      style: 'rift_shear_lanes',
      telegraphProfile: 'abaddon_rift_lane_charge',
      warningMode: 'lane_charge',
      warningMs: 760,
      warningWidth: 1.70,
      warningDepth: 0,
      warningPulseHz: 3.8,
    },
    breakable: {
      style: 'rift_anchor',
      hpBarColor: '#ffb86b',
      criticalColor: '#ff1744',
    },
    roomObjectives: {
      entry: {
        vi: 'Thiết lập hành lang sống sót tại ngưỡng khe nứt.',
        en: 'Establish a survival corridor at the rift threshold.',
      },
      ambush: {
        vi: 'Giữ hành lang, né dải xé trọng lực và phá bầy áp sát.',
        en: 'Hold the corridor, evade gravity shear and destroy the closing swarm.',
      },
      breakable: {
        vi: 'Phá tuần tự ba neo không-thời gian trước khi khe nứt ổn định.',
        en: 'Destroy the three space-time anchors before the rift stabilizes.',
      },
      elite: {
        vi: 'Chặn bầy lai tạp tinh nhuệ trước khi mật độ vượt ngưỡng.',
        en: 'Stop the elite biomech brood before it reaches critical density.',
      },
      boss: {
        vi: 'Đánh bại Leviathan và đóng khe nứt Abaddon.',
        en: 'Defeat the Leviathan and seal the Abaddon rift.',
      },
    },
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
  for (const id of ['dung_nereus', 'dung_abaddon']) {
    const profile = DUNGEON_PRESENTATION_PROFILES_V39[id];
    if (profile?.status !== 'production_candidate'
      || !profile.backdrop?.style
      || !profile.hazard?.style
      || !profile.breakable?.style
      || !profile.boss?.visualAssetId) {
      issues.push(`DUNGEON_PRESENTATION_PRODUCTION_CANDIDATE:${id}`);
    }
    if (!['entry', 'ambush', 'breakable', 'elite', 'boss']
      .every(kind => profile.roomObjectives?.[kind]?.vi && profile.roomObjectives?.[kind]?.en)) {
      issues.push(`DUNGEON_PRESENTATION_OBJECTIVES:${id}`);
    }
  }
  return Object.freeze(issues);
}
