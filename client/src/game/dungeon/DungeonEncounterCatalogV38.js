import { ENEMY_ARCHETYPES_V2 } from '../combat/EnemyCombatCatalogV2.js';

/**
 * Dungeon Parity Foundation V3.8.
 *
 * V3.8 activates one complete Taurus vertical slice and keeps Nereus/Abaddon as
 * authored catalog briefs.  The runtime is deliberately data-driven so the two
 * remaining dungeons can be enabled without cloning DungeonScene or Campaign
 * combat code.
 */
export const DUNGEON_PARITY_FOUNDATION_VERSION = 'dungeon-parity-foundation-v3.8.0';
export const DUNGEON_VERTICAL_SLICE_ID_V38 = 'dung_taurus';

const freezeDeep = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, freezeDeep(entry)])));
  }
  return value;
};

const room = (id, kind, overrides = {}) => freezeDeep({
  id,
  kind,
  objective: null,
  introMs: 900,
  clearDelayMs: 1050,
  activeEnemyCap: 8,
  threatBudget: 8,
  spawnGapMs: 620,
  roles: [
    { id: 'raider', weight: 5 },
    { id: 'gunner', weight: 4 },
  ],
  hpMultiplier: 1,
  damageMultiplier: 1,
  speedMultiplier: 1,
  projectileSpeedMultiplier: 1,
  fireCooldownMultiplier: 1,
  hazard: null,
  breakables: [],
  breakablesRequired: false,
  boss: null,
  ...overrides,
});

export const DUNGEON_RUNTIME_PROFILES_V38 = freezeDeep({
  dung_taurus: {
    id: 'dung_taurus',
    status: 'vertical_slice',
    enabledByDefault: true,
    difficultyRank: 1,
    theme: 'salvage_belt',
    enemyStats: {
      baseHp: 105,
      baseSpeed: .042,
      hpMultiplier: .92,
      damageMultiplier: .88,
      speedMultiplier: .98,
      projectileSpeedMultiplier: 1.02,
      fireCooldownMultiplier: 1.04,
    },
    rooms: [
      room('taurus_entry', 'entry', {
        title: { vi: 'CỬA VÀNH ĐAI', en: 'BELT APPROACH' },
        objective: { vi: 'Dọn sạch lối vào và giữ đội hình.', en: 'Clear the approach and hold formation.' },
        threatBudget: 7,
        spawnGapMs: 760,
        roles: [
          { id: 'raider', weight: 6 },
          { id: 'gunner', weight: 4 },
        ],
      }),
      room('taurus_ambush', 'ambush', {
        title: { vi: 'Ổ PHỤC HẢI TẶC', en: 'PIRATE AMBUSH' },
        objective: { vi: 'Né phế liệu trôi và tiêu diệt hải tặc.', en: 'Evade drifting scrap and destroy the pirates.' },
        threatBudget: 11,
        activeEnemyCap: 9,
        spawnGapMs: 590,
        roles: [
          { id: 'raider', weight: 5 },
          { id: 'gunner', weight: 4 },
          { id: 'charger', weight: 2 },
        ],
        speedMultiplier: 1.04,
        hazard: {
          id: 'taurus_debris_lane',
          type: 'drifting_debris',
          count: 4,
          intervalMs: 1900,
          warningMs: 720,
          warningWidth: 1.55,
          damage: 70,
          speed: .085,
        },
      }),
      room('taurus_salvage', 'breakable', {
        title: { vi: 'KHO PHẾ LIỆU', en: 'SALVAGE FIELD' },
        objective: { vi: 'Phá toàn bộ kho quặng và tiêu diệt địch.', en: 'Destroy every ore cache and all hostiles.' },
        threatBudget: 13,
        activeEnemyCap: 9,
        spawnGapMs: 560,
        roles: [
          { id: 'gunner', weight: 4 },
          { id: 'shieldbearer', weight: 3 },
          { id: 'raider', weight: 2 },
        ],
        hpMultiplier: 1.08,
        breakablesRequired: true,
        breakables: [
          { id: 'ore_cache_left', visualId: 'taurus_ore_cache', laneNorm: -.56, depthNorm: -.18, hp: 280, score: 80 },
          { id: 'ore_cache_center', visualId: 'taurus_ore_cache', laneNorm: 0, depthNorm: -.32, hp: 340, score: 110 },
          { id: 'ore_cache_right', visualId: 'taurus_ore_cache', laneNorm: .56, depthNorm: -.18, hp: 280, score: 80 },
        ],
      }),
      room('taurus_elite', 'elite', {
        title: { vi: 'ĐỘI HÌNH HỘ TỐNG', en: 'SALVAGE ESCORT' },
        objective: { vi: 'Phá đội hình hộ tống tinh nhuệ.', en: 'Break the elite escort formation.' },
        threatBudget: 17,
        activeEnemyCap: 10,
        spawnGapMs: 510,
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
      }),
      room('taurus_boss', 'boss', {
        title: { vi: 'MŨI KHOAN GỈ SÉT', en: 'THE RUSTY DRILLER' },
        objective: { vi: 'Đánh bại Mũi Khoan Gỉ Sét.', en: 'Defeat the Rusty Driller.' },
        threatBudget: 6,
        activeEnemyCap: 6,
        spawnGapMs: 680,
        roles: [
          { id: 'gunner', weight: 4 },
          { id: 'support', weight: 2 },
        ],
        boss: {
          id: 'taurus_rust_driller',
          dungeonId: 'dung_taurus',
          visualAssetId: 'dung_taurus_boss',
          displayName: { vi: 'MŨI KHOAN GỈ SÉT', en: 'THE RUSTY DRILLER' },
          sharedBossProfileId: 'alpha_mech_sentinel',
          hp: 7600,
          damageMultiplier: .88,
          projectileSpeedMultiplier: .96,
        },
      }),
    ],
  },
  dung_nereus: {
    id: 'dung_nereus',
    status: 'catalog_ready',
    enabledByDefault: false,
    difficultyRank: 2,
    theme: 'shielded_ai_core',
    enemyStats: {
      baseHp: 145,
      baseSpeed: .046,
      hpMultiplier: 1.18,
      damageMultiplier: 1.12,
      speedMultiplier: 1.04,
      projectileSpeedMultiplier: 1.12,
      fireCooldownMultiplier: .88,
    },
    rooms: [
      room('nereus_entry', 'entry', { threatBudget: 11 }),
      room('nereus_shield_grid', 'hazard', {
        threatBudget: 16,
        roles: [{ id: 'shieldbearer', weight: 5 }, { id: 'support', weight: 4 }, { id: 'gunner', weight: 2 }],
      }),
      room('nereus_oracle', 'boss', {
        boss: {
          id: 'nereus_oracle_core', dungeonId: 'dung_nereus', visualAssetId: 'dung_nereus_boss',
          sharedBossProfileId: 'cryo_mech_warden', hp: 13600,
        },
      }),
    ],
  },
  dung_abaddon: {
    id: 'dung_abaddon',
    status: 'catalog_ready',
    enabledByDefault: false,
    difficultyRank: 3,
    theme: 'rift_survival',
    enemyStats: {
      baseHp: 190,
      baseSpeed: .052,
      hpMultiplier: 1.42,
      damageMultiplier: 1.38,
      speedMultiplier: 1.12,
      projectileSpeedMultiplier: 1.24,
      fireCooldownMultiplier: .74,
    },
    rooms: [
      room('abaddon_entry', 'entry', { threatBudget: 16 }),
      room('abaddon_rift', 'hazard', {
        threatBudget: 22,
        roles: [{ id: 'raider', weight: 4 }, { id: 'charger', weight: 4 }, { id: 'artillery', weight: 3 }],
      }),
      room('abaddon_leviathan', 'boss', {
        boss: {
          id: 'abaddon_leviathan', dungeonId: 'dung_abaddon', visualAssetId: 'dung_abaddon_boss',
          sharedBossProfileId: 'inferno_alien_demon', hp: 22000,
        },
      }),
    ],
  },
});

export function resolveDungeonRuntimeProfileV38(dungeonId = DUNGEON_VERTICAL_SLICE_ID_V38) {
  return DUNGEON_RUNTIME_PROFILES_V38[dungeonId]
    || DUNGEON_RUNTIME_PROFILES_V38[DUNGEON_VERTICAL_SLICE_ID_V38];
}

export function isDungeonParityFoundationEnabledV38({
  dungeonId = DUNGEON_VERTICAL_SLICE_ID_V38,
  envEnabled = true,
} = {}) {
  const profile = DUNGEON_RUNTIME_PROFILES_V38[dungeonId];
  return Boolean(envEnabled && profile?.enabledByDefault && profile.status === 'vertical_slice');
}

export function auditDungeonEncounterCatalogV38() {
  const issues = [];
  const validRoles = new Set(Object.keys(ENEMY_ARCHETYPES_V2));
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
  return Object.freeze(issues);
}
