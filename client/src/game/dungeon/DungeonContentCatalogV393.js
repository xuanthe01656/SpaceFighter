import { ENEMY_ARCHETYPES_V2 } from '../combat/EnemyCombatCatalogV2.js';

/**
 * Dungeon content catalog V3.9.5 (V3.9.3 compatibility module).
 *
 * This is the authoritative, data-only content schema for all present and future
 * dungeons. Runtime V3.8 consumes a compatibility projection so existing scene,
 * combat, QA and server-authority contracts do not need to be cloned per dungeon.
 */
export const DUNGEON_CONTENT_CATALOG_VERSION = 'dungeon-content-catalog-v3.9.5';
export const DUNGEON_CONTENT_SCHEMA_VERSION = 1;

const freezeDeep = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, freezeDeep(entry)])));
  }
  return value;
};
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export const DUNGEON_ROOM_TEMPLATES_V393 = freezeDeep({
  clear: {
    runtimeKind: 'entry',
    introMs: 900,
    clearDelayMs: 900,
    activeEnemyCap: 8,
    spawnGapMs: 700,
  },
  hazard_clear: {
    runtimeKind: 'ambush',
    introMs: 950,
    clearDelayMs: 950,
    activeEnemyCap: 9,
    spawnGapMs: 590,
  },
  destroy_nodes: {
    runtimeKind: 'breakable',
    introMs: 950,
    clearDelayMs: 1000,
    activeEnemyCap: 9,
    spawnGapMs: 570,
    breakablesRequired: true,
  },
  elite_formation: {
    runtimeKind: 'elite',
    introMs: 1000,
    clearDelayMs: 1050,
    activeEnemyCap: 10,
    spawnGapMs: 520,
  },
  boss: {
    runtimeKind: 'boss',
    introMs: 1150,
    clearDelayMs: 1200,
    activeEnemyCap: 6,
    spawnGapMs: 680,
  },
});

export const DUNGEON_ENCOUNTER_PACKS_V393 = freezeDeep({
  taurus_entry_screen: {
    threatBudget: 7,
    roles: [{ id: 'raider', weight: 6 }, { id: 'gunner', weight: 4 }],
  },
  taurus_pirate_ambush: {
    threatBudget: 11,
    roles: [{ id: 'raider', weight: 5 }, { id: 'gunner', weight: 4 }, { id: 'charger', weight: 2 }],
    speedMultiplier: 1.04,
  },
  taurus_salvage_guard: {
    threatBudget: 13,
    roles: [{ id: 'gunner', weight: 4 }, { id: 'shieldbearer', weight: 3 }, { id: 'raider', weight: 2 }],
    hpMultiplier: 1.08,
  },
  taurus_elite_escort: {
    threatBudget: 17,
    roles: [
      { id: 'shieldbearer', weight: 4 },
      { id: 'support', weight: 3 },
      { id: 'artillery', weight: 3 },
      { id: 'gunner', weight: 2 },
    ],
    hpMultiplier: 1.16,
    damageMultiplier: 1.08,
    projectileSpeedMultiplier: 1.06,
    fireCooldownMultiplier: .94,
  },
  taurus_boss_guard: {
    threatBudget: 6,
    roles: [{ id: 'gunner', weight: 4 }, { id: 'support', weight: 2 }],
  },

  nereus_entry_screen: {
    threatBudget: 11,
    roles: [{ id: 'gunner', weight: 5 }, { id: 'shieldbearer', weight: 3 }, { id: 'raider', weight: 2 }],
  },
  nereus_current_guard: {
    threatBudget: 15,
    roles: [{ id: 'support', weight: 4 }, { id: 'gunner', weight: 4 }, { id: 'charger', weight: 1 }],
    projectileSpeedMultiplier: 1.05,
  },
  nereus_shield_lattice: {
    threatBudget: 17,
    roles: [{ id: 'shieldbearer', weight: 5 }, { id: 'support', weight: 4 }, { id: 'gunner', weight: 2 }],
    hpMultiplier: 1.10,
  },
  nereus_oracle_guard: {
    threatBudget: 21,
    roles: [{ id: 'shieldbearer', weight: 4 }, { id: 'support', weight: 4 }, { id: 'artillery', weight: 3 }],
    hpMultiplier: 1.18,
    damageMultiplier: 1.10,
    fireCooldownMultiplier: .92,
  },
  nereus_boss_guard: {
    threatBudget: 8,
    roles: [{ id: 'support', weight: 4 }, { id: 'shieldbearer', weight: 3 }],
  },

  abaddon_entry_screen: {
    threatBudget: 16,
    roles: [{ id: 'raider', weight: 5 }, { id: 'charger', weight: 3 }, { id: 'gunner', weight: 2 }],
  },
  abaddon_gravity_assault: {
    threatBudget: 20,
    roles: [{ id: 'raider', weight: 4 }, { id: 'charger', weight: 4 }, { id: 'artillery', weight: 2 }],
    speedMultiplier: 1.06,
  },
  abaddon_rift_anchor_guard: {
    threatBudget: 23,
    roles: [{ id: 'charger', weight: 4 }, { id: 'artillery', weight: 4 }, { id: 'support', weight: 2 }],
    damageMultiplier: 1.08,
  },
  abaddon_brood_elite: {
    threatBudget: 28,
    roles: [
      { id: 'raider', weight: 4 },
      { id: 'charger', weight: 4 },
      { id: 'artillery', weight: 3 },
      { id: 'shieldbearer', weight: 2 },
    ],
    hpMultiplier: 1.20,
    damageMultiplier: 1.16,
    projectileSpeedMultiplier: 1.10,
    fireCooldownMultiplier: .88,
  },
  abaddon_boss_guard: {
    threatBudget: 10,
    roles: [{ id: 'charger', weight: 4 }, { id: 'artillery', weight: 3 }],
  },
});

export const DUNGEON_HAZARD_PROFILES_V393 = freezeDeep({
  taurus_scrap_lanes: {
    id: 'taurus_scrap_lanes',
    type: 'drifting_debris',
    count: 4,
    intervalMs: 1900,
    warningMode: 'edge_pulse',
    entryCueMs: 280,
    entryCueWidth: 1.05,
    warningMs: 280,
    warningWidth: 1.05,
    naturalDrift: true,
    damage: 70,
    speed: .085,
    destructible: true,
    hp: 180,
    score: 45,
    hitRadius: 1.25,
    contactRadius: 1.10,
  },
  nereus_ion_currents: {
    id: 'nereus_ion_currents',
    type: 'ion_current_lanes',
    count: 5,
    intervalMs: 1650,
    warningMs: 820,
    warningWidth: 1.35,
    damage: 82,
    speed: .095,
    destructible: false,
    contactRadius: 1.18,
  },
  abaddon_gravity_shear: {
    id: 'abaddon_gravity_shear',
    type: 'rift_shear_lanes',
    count: 6,
    intervalMs: 1450,
    warningMs: 760,
    warningWidth: 1.7,
    damage: 105,
    speed: .112,
    destructible: false,
    contactRadius: 1.25,
  },
});

export const DUNGEON_OBJECTIVE_PROFILES_V393 = freezeDeep({
  taurus_salvage_cluster: {
    id: 'taurus_salvage_cluster',
    type: 'destroy_cluster',
    title: { vi: 'CỤM THU HỒI KHOÁNG', en: 'SALVAGE RECOVERY CLUSTER' },
    instruction: {
      vi: 'Phá lõi xử lý và hai khoang hàng, đồng thời tiêu diệt lực lượng bảo vệ.',
      en: 'Destroy the processor core and both cargo pods, then clear the guards.',
    },
    layoutId: 'progressive_salvage_route',
    revealPolicy: {
      mode: 'sequential_world_drift',
      initialDelayMs: 650,
      betweenNodesMs: 1050,
      requirePreviousDestroyed: true,
      entryDepthOffset: 2.5,
      exitDepthOffset: 2.2,
      approachSpeed: .066,
      cruiseSpeed: .034,
      driftAmplitude: .28,
      driftFrequency: .30,
      reentryDelayMs: 900,
      passLaneShiftNorm: .12,
      anchorTolerance: .12,
    },
    nodes: [
      {
        id: 'taurus_salvage_core',
        sequenceIndex: 0,
        objectiveRole: 'primary',
        visualId: 'taurus_salvage_core',
        visualStyle: 'salvage_core',
        laneNorm: .06,
        depthNorm: -.35,
        hp: 420,
        score: 140,
        scale: 1.12,
        hitRadius: 1.42,
      },
      {
        id: 'taurus_ore_pod_left',
        sequenceIndex: 1,
        objectiveRole: 'satellite',
        visualId: 'taurus_ore_pod',
        visualStyle: 'ore_pod',
        laneNorm: -.62,
        depthNorm: .18,
        hp: 230,
        score: 70,
        scale: .90,
        hitRadius: 1.02,
      },
      {
        id: 'taurus_power_cell_right',
        sequenceIndex: 2,
        objectiveRole: 'satellite',
        visualId: 'taurus_power_cell',
        visualStyle: 'power_cell',
        laneNorm: .58,
        depthNorm: -.02,
        hp: 250,
        score: 75,
        scale: .94,
        hitRadius: 1.04,
      },
    ],
  },
  nereus_shield_lattice: {
    id: 'nereus_shield_lattice',
    type: 'disable_nodes',
    title: { vi: 'LƯỚI KHIÊN NEREUS', en: 'NEREUS SHIELD LATTICE' },
    instruction: {
      vi: 'Phá ba relay khiên để mở đường tới lõi Oracle.',
      en: 'Destroy three shield relays to expose the Oracle Core.',
    },
    layoutId: 'offset_arc',
    revealPolicy: {
      mode: 'sequential_world_drift', initialDelayMs: 620, betweenNodesMs: 980,
      requirePreviousDestroyed: true, entryDepthOffset: 2.3, exitDepthOffset: 2.2,
      approachSpeed: .060, cruiseSpeed: .030, driftAmplitude: .22, driftFrequency: .26,
      reentryDelayMs: 840, passLaneShiftNorm: .10, anchorTolerance: .12,
    },
    nodes: [
      { id: 'nereus_relay_left', visualId: 'nereus_shield_relay', visualStyle: 'shield_relay', laneNorm: -.60, depthNorm: -.12, hp: 420, score: 120, hitRadius: 1.10 },
      { id: 'nereus_relay_center', visualId: 'nereus_shield_relay', visualStyle: 'shield_relay', laneNorm: 0, depthNorm: -.42, hp: 520, score: 160, hitRadius: 1.22 },
      { id: 'nereus_relay_right', visualId: 'nereus_shield_relay', visualStyle: 'shield_relay', laneNorm: .60, depthNorm: .08, hp: 420, score: 120, hitRadius: 1.10 },
    ],
  },
  abaddon_rift_anchors: {
    id: 'abaddon_rift_anchors',
    type: 'seal_anchors',
    title: { vi: 'CÁC NEO KHE NỨT', en: 'RIFT ANCHORS' },
    instruction: {
      vi: 'Phá các neo không-thời gian trước khi chúng ổn định khe nứt.',
      en: 'Destroy the space-time anchors before the rift stabilizes.',
    },
    layoutId: 'broken_triangle',
    revealPolicy: {
      mode: 'sequential_world_drift', initialDelayMs: 520, betweenNodesMs: 900,
      requirePreviousDestroyed: true, entryDepthOffset: 2.7, exitDepthOffset: 2.4,
      approachSpeed: .074, cruiseSpeed: .040, driftAmplitude: .34, driftFrequency: .36,
      reentryDelayMs: 720, passLaneShiftNorm: .15, anchorTolerance: .13,
    },
    nodes: [
      { id: 'abaddon_anchor_left', visualId: 'abaddon_rift_anchor', visualStyle: 'rift_anchor', laneNorm: -.58, depthNorm: -.30, hp: 680, score: 190, hitRadius: 1.18 },
      { id: 'abaddon_anchor_center', visualId: 'abaddon_rift_anchor', visualStyle: 'rift_anchor', laneNorm: .04, depthNorm: .20, hp: 760, score: 230, hitRadius: 1.28 },
      { id: 'abaddon_anchor_right', visualId: 'abaddon_rift_anchor', visualStyle: 'rift_anchor', laneNorm: .62, depthNorm: -.06, hp: 680, score: 190, hitRadius: 1.18 },
    ],
  },
});

const visualSet = dungeonId => freezeDeep({
  enemyByRole: {
    raider: `${dungeonId}_scout`,
    gunner: `${dungeonId}_scout`,
    charger: `${dungeonId}_elite`,
    shieldbearer: `${dungeonId}_heavy`,
    support: `${dungeonId}_elite`,
    artillery: `${dungeonId}_heavy`,
  },
  enemyAssets: [
    { id: `${dungeonId}_scout`, role: 'scout', size: 2.3 },
    { id: `${dungeonId}_heavy`, role: 'heavy', size: 3.0 },
    { id: `${dungeonId}_elite`, role: 'elite', size: 2.6 },
  ],
  requiredEnemyAssetIds: [`${dungeonId}_scout`, `${dungeonId}_heavy`, `${dungeonId}_elite`],
  bossAssetId: `${dungeonId}_boss`,
  bossAsset: { id: `${dungeonId}_boss`, role: 'boss', size: 5.8 },
});

const dungeon = ({
  id, status, enabledByDefault, difficultyRank, theme, enemyStats, rooms, tags = [],
  runStructure = {}, visualSet: explicitVisualSet = null,
}) => freezeDeep({
  schemaVersion: DUNGEON_CONTENT_SCHEMA_VERSION,
  contentVersion: DUNGEON_CONTENT_CATALOG_VERSION,
  id,
  status,
  enabledByDefault,
  difficultyRank,
  theme,
  tags,
  runStructure: {
    mode: runStructure.mode || 'linear',
    minimumRooms: Math.max(1, Math.trunc(finite(runStructure.minimumRooms, 3))),
    maximumRooms: Math.max(1, Math.trunc(finite(runStructure.maximumRooms, 12))),
    recommendedRooms: Math.max(1, Math.trunc(finite(runStructure.recommendedRooms, rooms.length))),
    entryRoomId: runStructure.entryRoomId || rooms[0]?.id || null,
    bossRoomId: runStructure.bossRoomId || rooms.find(room => room.templateId === 'boss')?.id || null,
  },
  visualSet: explicitVisualSet ? freezeDeep(explicitVisualSet) : visualSet(id),
  enemyStats,
  rooms,
});

export const DUNGEON_CONTENT_CATALOG_V393 = freezeDeep({
  dung_taurus: dungeon({
    id: 'dung_taurus',
    status: 'vertical_slice',
    enabledByDefault: true,
    difficultyRank: 1,
    theme: 'salvage_belt',
    tags: ['resource', 'pirates', 'industrial'],
    runStructure: { minimumRooms: 5, maximumRooms: 8, recommendedRooms: 5, entryRoomId: 'taurus_entry', bossRoomId: 'taurus_boss' },
    enemyStats: {
      baseHp: 105, baseSpeed: .042, hpMultiplier: .92, damageMultiplier: .88,
      speedMultiplier: .98, projectileSpeedMultiplier: 1.02, fireCooldownMultiplier: 1.04,
    },
    rooms: [
      {
        id: 'taurus_entry', templateId: 'clear', encounterPackId: 'taurus_entry_screen',
        title: { vi: 'CỬA VÀNH ĐAI', en: 'BELT APPROACH' },
        objective: { vi: 'Dọn sạch lối vào và giữ đội hình.', en: 'Clear the approach and hold formation.' },
      },
      {
        id: 'taurus_ambush', templateId: 'hazard_clear', encounterPackId: 'taurus_pirate_ambush',
        hazardId: 'taurus_scrap_lanes',
        title: { vi: 'Ổ PHỤC HẢI TẶC', en: 'PIRATE AMBUSH' },
        objective: { vi: 'Né phế liệu trôi và tiêu diệt hải tặc.', en: 'Evade drifting scrap and destroy the pirates.' },
      },
      {
        id: 'taurus_salvage', templateId: 'destroy_nodes', encounterPackId: 'taurus_salvage_guard',
        objectiveProfileId: 'taurus_salvage_cluster',
        title: { vi: 'CỤM THU HỒI KHOÁNG', en: 'SALVAGE RECOVERY CLUSTER' },
      },
      {
        id: 'taurus_elite', templateId: 'elite_formation', encounterPackId: 'taurus_elite_escort',
        title: { vi: 'ĐỘI HÌNH HỘ TỐNG', en: 'SALVAGE ESCORT' },
        objective: { vi: 'Phá đội hình hộ tống tinh nhuệ.', en: 'Break the elite escort formation.' },
      },
      {
        id: 'taurus_boss', templateId: 'boss', encounterPackId: 'taurus_boss_guard',
        title: { vi: 'MŨI KHOAN GỈ SÉT', en: 'THE RUSTY DRILLER' },
        objective: { vi: 'Đánh bại Mũi Khoan Gỉ Sét.', en: 'Defeat the Rusty Driller.' },
        boss: {
          id: 'taurus_rust_driller', dungeonId: 'dung_taurus', visualAssetId: 'dung_taurus_boss',
          displayName: { vi: 'MŨI KHOAN GỈ SÉT', en: 'THE RUSTY DRILLER' },
          sharedBossProfileId: 'alpha_mech_sentinel', hp: 7600,
          damageMultiplier: .88, projectileSpeedMultiplier: .96,
        },
      },
    ],
  }),

  dung_nereus: dungeon({
    id: 'dung_nereus',
    status: 'catalog_ready',
    enabledByDefault: false,
    difficultyRank: 2,
    theme: 'shielded_ai_core',
    tags: ['technology', 'ai', 'shield-control'],
    runStructure: { minimumRooms: 5, maximumRooms: 10, recommendedRooms: 5, entryRoomId: 'nereus_entry', bossRoomId: 'nereus_oracle' },
    enemyStats: {
      baseHp: 145, baseSpeed: .046, hpMultiplier: 1.18, damageMultiplier: 1.12,
      speedMultiplier: 1.04, projectileSpeedMultiplier: 1.12, fireCooldownMultiplier: .88,
    },
    rooms: [
      {
        id: 'nereus_entry', templateId: 'clear', encounterPackId: 'nereus_entry_screen',
        title: { vi: 'CỔNG THỦY TRIỀU', en: 'TIDAL GATE' },
        objective: { vi: 'Xuyên qua lớp phòng vệ ngoài của Nereus.', en: 'Breach the outer Nereus defenses.' },
      },
      {
        id: 'nereus_current_lanes', templateId: 'hazard_clear', encounterPackId: 'nereus_current_guard',
        hazardId: 'nereus_ion_currents',
        title: { vi: 'DÒNG ION', en: 'ION CURRENTS' },
        objective: { vi: 'Tránh dòng ion và phá đội tuần tra.', en: 'Avoid the ion currents and clear the patrol.' },
      },
      {
        id: 'nereus_shield_grid', templateId: 'destroy_nodes', encounterPackId: 'nereus_shield_lattice',
        objectiveProfileId: 'nereus_shield_lattice',
        title: { vi: 'LƯỚI KHIÊN', en: 'SHIELD LATTICE' },
      },
      {
        id: 'nereus_oracle_guard', templateId: 'elite_formation', encounterPackId: 'nereus_oracle_guard',
        title: { vi: 'VỆ BINH ORACLE', en: 'ORACLE GUARD' },
        objective: { vi: 'Phá đội hình hỗ trợ và pháo tuyến sau.', en: 'Break the support and artillery formation.' },
      },
      {
        id: 'nereus_oracle', templateId: 'boss', encounterPackId: 'nereus_boss_guard',
        title: { vi: 'LÕI ORACLE', en: 'ORACLE CORE' },
        objective: { vi: 'Vô hiệu hóa Lõi Oracle.', en: 'Disable the Oracle Core.' },
        boss: {
          id: 'nereus_oracle_core', dungeonId: 'dung_nereus', visualAssetId: 'dung_nereus_boss',
          displayName: { vi: 'MẮT THẦN ORACLE', en: 'THE ORACLE CORE' },
          sharedBossProfileId: 'cryo_mech_warden', hp: 13600,
          damageMultiplier: 1.08, projectileSpeedMultiplier: 1.10,
        },
      },
    ],
  }),

  dung_abaddon: dungeon({
    id: 'dung_abaddon',
    status: 'catalog_ready',
    enabledByDefault: false,
    difficultyRank: 3,
    theme: 'rift_survival',
    tags: ['rift', 'survival', 'biomech'],
    runStructure: { minimumRooms: 5, maximumRooms: 12, recommendedRooms: 5, entryRoomId: 'abaddon_entry', bossRoomId: 'abaddon_leviathan' },
    enemyStats: {
      baseHp: 190, baseSpeed: .052, hpMultiplier: 1.42, damageMultiplier: 1.38,
      speedMultiplier: 1.12, projectileSpeedMultiplier: 1.24, fireCooldownMultiplier: .74,
    },
    rooms: [
      {
        id: 'abaddon_entry', templateId: 'clear', encounterPackId: 'abaddon_entry_screen',
        title: { vi: 'NGƯỠNG KHE NỨT', en: 'RIFT THRESHOLD' },
        objective: { vi: 'Thiết lập hành lang an toàn trong khe nứt.', en: 'Establish a safe corridor inside the rift.' },
      },
      {
        id: 'abaddon_gravity_shear', templateId: 'hazard_clear', encounterPackId: 'abaddon_gravity_assault',
        hazardId: 'abaddon_gravity_shear',
        title: { vi: 'XÉ TRỌNG LỰC', en: 'GRAVITY SHEAR' },
        objective: { vi: 'Sống sót qua các dải trọng lực và tiêu diệt địch.', en: 'Survive the gravity lanes and eliminate the swarm.' },
      },
      {
        id: 'abaddon_rift', templateId: 'destroy_nodes', encounterPackId: 'abaddon_rift_anchor_guard',
        objectiveProfileId: 'abaddon_rift_anchors',
        title: { vi: 'NEO KHE NỨT', en: 'RIFT ANCHORS' },
      },
      {
        id: 'abaddon_brood', templateId: 'elite_formation', encounterPackId: 'abaddon_brood_elite',
        title: { vi: 'BẦY LAI TẠP', en: 'BIOMECH BROOD' },
        objective: { vi: 'Phá bầy tinh nhuệ trước khi chúng áp đảo khu vực.', en: 'Destroy the elite brood before it overwhelms the sector.' },
      },
      {
        id: 'abaddon_leviathan', templateId: 'boss', encounterPackId: 'abaddon_boss_guard',
        title: { vi: 'LEVIATHAN LAI TẠP', en: 'BIOMECH LEVIATHAN' },
        objective: { vi: 'Đánh bại Leviathan và đóng khe nứt.', en: 'Defeat the Leviathan and seal the rift.' },
        boss: {
          id: 'abaddon_leviathan', dungeonId: 'dung_abaddon', visualAssetId: 'dung_abaddon_boss',
          displayName: { vi: 'LEVIATHAN LAI TẠP', en: 'BIOMECH LEVIATHAN' },
          sharedBossProfileId: 'inferno_alien_demon', hp: 22000,
          damageMultiplier: 1.22, projectileSpeedMultiplier: 1.18,
        },
      },
    ],
  }),
});

function runtimeRoomFromContent(profile, definition) {
  const template = DUNGEON_ROOM_TEMPLATES_V393[definition.templateId];
  const pack = DUNGEON_ENCOUNTER_PACKS_V393[definition.encounterPackId];
  const objectiveProfile = definition.objectiveProfileId
    ? DUNGEON_OBJECTIVE_PROFILES_V393[definition.objectiveProfileId]
    : null;
  const hazard = definition.hazardId ? DUNGEON_HAZARD_PROFILES_V393[definition.hazardId] : null;
  return freezeDeep({
    id: definition.id,
    templateId: definition.templateId,
    encounterPackId: definition.encounterPackId,
    objectiveProfileId: definition.objectiveProfileId || null,
    kind: template.runtimeKind,
    title: definition.title,
    objective: definition.objective || objectiveProfile?.instruction || null,
    objectiveType: objectiveProfile?.type || (template.runtimeKind === 'boss' ? 'defeat_boss' : 'clear_hostiles'),
    layoutId: objectiveProfile?.layoutId || null,
    objectiveRevealPolicy: objectiveProfile?.revealPolicy || null,
    introMs: finite(definition.introMs, template.introMs),
    clearDelayMs: finite(definition.clearDelayMs, template.clearDelayMs),
    activeEnemyCap: Math.max(1, Math.trunc(finite(definition.activeEnemyCap, template.activeEnemyCap))),
    threatBudget: Math.max(0, Math.trunc(finite(definition.threatBudget, pack.threatBudget))),
    spawnGapMs: Math.max(1, finite(definition.spawnGapMs, template.spawnGapMs)),
    roles: pack.roles,
    hpMultiplier: finite(definition.hpMultiplier, finite(pack.hpMultiplier, 1)),
    damageMultiplier: finite(definition.damageMultiplier, finite(pack.damageMultiplier, 1)),
    speedMultiplier: finite(definition.speedMultiplier, finite(pack.speedMultiplier, 1)),
    projectileSpeedMultiplier: finite(definition.projectileSpeedMultiplier, finite(pack.projectileSpeedMultiplier, 1)),
    fireCooldownMultiplier: finite(definition.fireCooldownMultiplier, finite(pack.fireCooldownMultiplier, 1)),
    hazard,
    breakables: objectiveProfile?.nodes || [],
    breakablesRequired: Boolean(template.breakablesRequired && objectiveProfile?.nodes?.length),
    boss: definition.boss || null,
  });
}

export function projectDungeonRuntimeProfilesV393() {
  return freezeDeep(Object.fromEntries(Object.values(DUNGEON_CONTENT_CATALOG_V393).map(profile => [
    profile.id,
    {
      ...profile,
      rooms: profile.rooms.map(room => runtimeRoomFromContent(profile, room)),
    },
  ])));
}

export function resolveDungeonContentProfileV393(dungeonId = 'dung_taurus') {
  return DUNGEON_CONTENT_CATALOG_V393[dungeonId] || DUNGEON_CONTENT_CATALOG_V393.dung_taurus;
}

export function resolveDungeonVisualAssetIdV393(dungeonId, roleId) {
  const profile = resolveDungeonContentProfileV393(dungeonId);
  return profile.visualSet.enemyByRole[roleId] || profile.visualSet.enemyByRole.raider;
}

export function resolveDungeonVisualAssetRefsV393(dungeonId = 'dung_taurus') {
  const profile = resolveDungeonContentProfileV393(dungeonId);
  return freezeDeep([
    ...profile.visualSet.enemyAssets.map(asset => ({ kind: 'dungeon_enemy', id: asset.id })),
    { kind: 'dungeon_boss', id: profile.visualSet.bossAsset.id },
  ]);
}

export function auditDungeonContentCatalogV393() {
  const issues = [];
  const roleIds = new Set(Object.keys(ENEMY_ARCHETYPES_V2));
  for (const profile of Object.values(DUNGEON_CONTENT_CATALOG_V393)) {
    if (profile.schemaVersion !== DUNGEON_CONTENT_SCHEMA_VERSION) issues.push(`DUNGEON_SCHEMA:${profile.id}`);
    if (!profile.visualSet?.bossAsset?.id || !profile.visualSet?.enemyAssets?.length) {
      issues.push(`DUNGEON_VISUAL_SET:${profile.id}`);
    } else {
      const declaredAssets = new Set(profile.visualSet.enemyAssets.map(asset => asset.id));
      for (const assetId of Object.values(profile.visualSet.enemyByRole || {})) {
        if (!declaredAssets.has(assetId)) issues.push(`DUNGEON_VISUAL_ROLE_REF:${profile.id}:${assetId}`);
      }
      if (declaredAssets.size !== profile.visualSet.enemyAssets.length) issues.push(`DUNGEON_VISUAL_DUPLICATE:${profile.id}`);
    }
    const structure = profile.runStructure || {};
    if (structure.maximumRooms < structure.minimumRooms
      || profile.rooms.length < structure.minimumRooms
      || profile.rooms.length > structure.maximumRooms) {
      issues.push(`DUNGEON_ROOM_COUNT:${profile.id}`);
    }
    const roomIds = new Set();
    for (const definition of profile.rooms) {
      if (roomIds.has(definition.id)) issues.push(`DUNGEON_DUPLICATE_ROOM:${profile.id}:${definition.id}`);
      roomIds.add(definition.id);
      if (!DUNGEON_ROOM_TEMPLATES_V393[definition.templateId]) issues.push(`DUNGEON_ROOM_TEMPLATE:${profile.id}:${definition.id}`);
      const pack = DUNGEON_ENCOUNTER_PACKS_V393[definition.encounterPackId];
      if (!pack) issues.push(`DUNGEON_ENCOUNTER_PACK:${profile.id}:${definition.id}`);
      for (const role of pack?.roles || []) {
        if (!roleIds.has(role.id) || !(role.weight > 0)) issues.push(`DUNGEON_ROLE:${profile.id}:${definition.id}:${role.id}`);
      }
      if (definition.hazardId && !DUNGEON_HAZARD_PROFILES_V393[definition.hazardId]) {
        issues.push(`DUNGEON_HAZARD:${profile.id}:${definition.id}`);
      }
      if (definition.objectiveProfileId && !DUNGEON_OBJECTIVE_PROFILES_V393[definition.objectiveProfileId]) {
        issues.push(`DUNGEON_OBJECTIVE:${profile.id}:${definition.id}`);
      }
      if (definition.templateId === 'boss' && (!definition.boss?.sharedBossProfileId || !definition.boss?.visualAssetId)) {
        issues.push(`DUNGEON_BOSS:${profile.id}:${definition.id}`);
      }
    }
    if (!roomIds.has(structure.entryRoomId)) issues.push(`DUNGEON_ENTRY_ROOM:${profile.id}`);
    if (!roomIds.has(structure.bossRoomId)) issues.push(`DUNGEON_BOSS_ROOM:${profile.id}`);
    const bossRoom = profile.rooms.find(room => room.id === structure.bossRoomId);
    if (bossRoom?.templateId !== 'boss') issues.push(`DUNGEON_BOSS_ROOM_TEMPLATE:${profile.id}`);
  }
  const taurusObjective = DUNGEON_OBJECTIVE_PROFILES_V393.taurus_salvage_cluster;
  const taurusNodes = taurusObjective.nodes;
  if (new Set(taurusNodes.map(node => node.visualStyle)).size < 3) issues.push('TAURUS_SALVAGE_VISUAL_VARIETY');
  if (new Set(taurusNodes.map(node => node.depthNorm)).size < 3) issues.push('TAURUS_SALVAGE_DEPTH_VARIETY');
  if (!taurusNodes.some(node => node.objectiveRole === 'primary')) issues.push('TAURUS_SALVAGE_PRIMARY');
  if (taurusObjective.revealPolicy?.mode !== 'sequential_world_drift') issues.push('TAURUS_SALVAGE_WORLD_DRIFT');
  if (!(taurusObjective.revealPolicy?.cruiseSpeed > 0)) issues.push('TAURUS_SALVAGE_CRUISE_SPEED');
  if (new Set(taurusNodes.map(node => node.sequenceIndex)).size !== taurusNodes.length) issues.push('TAURUS_SALVAGE_SEQUENCE');
  const taurusHazard = DUNGEON_HAZARD_PROFILES_V393.taurus_scrap_lanes;
  if (taurusHazard.warningMode !== 'edge_pulse' || taurusHazard.warningMs > 400) issues.push('TAURUS_HAZARD_NATURAL_ENTRY');
  return Object.freeze(issues);
}
