/**
 * Dungeon QA loadout catalog V3.9.7.
 *
 * These presets exist only inside an isolated Dungeon QA run. They are projected
 * onto a cloned campaign payload before deriveBattleLoadout() runs; no owned item,
 * selected loadout, reward, progression or trusted profile field is mutated.
 */
export const DUNGEON_QA_LOADOUT_VERSION = 'dungeon-qa-loadout-v3.9.7';
export const DUNGEON_QA_DEFAULT_LOADOUT_PRESET_ID_V397 = 'assault_mk3';

const freezeDeep = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value)
      .map(([key, entry]) => [key, freezeDeep(entry)])));
  }
  return value;
};

const gear = (baseId, type, level, rarity) => ({ baseId, type, level, rarity });

export const DUNGEON_QA_LOADOUT_PRESETS_V397 = freezeDeep({
  account: {
    id: 'account',
    useCurrent: true,
    tier: 0,
    label: { vi: 'TRANG BỊ TÀI KHOẢN', en: 'ACCOUNT LOADOUT' },
    summary: {
      vi: 'Giữ nguyên phi cơ và toàn bộ trang bị hiện có để kiểm tra hồi quy.',
      en: 'Keep the account aircraft and equipment for regression checks.',
    },
  },
  assault_mk3: {
    id: 'assault_mk3',
    tier: 3,
    label: { vi: 'CÔNG KÍCH MK-III', en: 'ASSAULT MK-III' },
    summary: {
      vi: 'Raptor + Neutron + tên lửa, giáp và drone ở cấp QA thấp để quái có thời gian phản công.',
      en: 'Raptor and Neutron with lower-level QA support gear so enemies can counterattack.',
    },
    // V4.0.2 QA-only calibration, based on Taurus V4.0.1 evidence:
    // 28/28 ranged enemies resolved before firing; avg lifetime 119ms; boss 1189ms.
    // Keep the same IDs/slots; do not modify production aircraft/gear or global damage.
    // V4.0.3: QA combat offense is calibrated separately at the enemy/boss damage
    // boundary; this keeps the gear identity and the actual product catalog intact.
    // Default QA outgoing damage scale: 0.10 (10%), with a dev-query override.
    // First-pass numbers require Web/APK validation, not an asserted production balance.
    aircraft: { id: 'ship_raptor', level: 12, stars: 1 },
    equipment: {
      mainGun: gear('gun_neutron', 'mainGun', 10, 2),
      wingman: gear('wing_homing', 'wingman', 8, 2),
      armor: gear('armor_reactive', 'armor', 8, 2),
      drone: gear('drone_laser', 'drone', 8, 2),
    },
  },
  control_mk3: {
    id: 'control_mk3',
    tier: 3,
    label: { vi: 'KHỐNG CHẾ MK-III', en: 'CONTROL MK-III' },
    summary: {
      vi: 'Nebula + Ion + EMP + khiên năng lượng + drone EMP để test hiệu ứng hỗ trợ.',
      en: 'Nebula, Ion, EMP wing, energy shield and EMP drone for control testing.',
    },
    aircraft: { id: 'ship_nebula', level: 38, stars: 3 },
    equipment: {
      mainGun: gear('gun_ion', 'mainGun', 38, 4),
      wingman: gear('wing_emp', 'wingman', 36, 4),
      armor: gear('armor_shield', 'armor', 36, 4),
      drone: gear('drone_emp', 'drone', 36, 4),
    },
  },
  fortress_mk4: {
    id: 'fortress_mk4',
    tier: 4,
    label: { vi: 'PHÁO ĐÀI MK-IV', en: 'FORTRESS MK-IV' },
    summary: {
      vi: 'Eternal + Rail + ngư lôi + giáp hư không + drone sửa chữa cho Abaddon.',
      en: 'Eternal, Rail, torpedo, void armor and repair drone for Abaddon.',
    },
    aircraft: { id: 'ship_eternal', level: 45, stars: 4 },
    equipment: {
      mainGun: gear('gun_rail', 'mainGun', 45, 5),
      wingman: gear('wing_torpedo', 'wingman', 43, 5),
      armor: gear('armor_void', 'armor', 45, 5),
      drone: gear('drone_repair', 'drone', 43, 5),
    },
  },
  stress_mk4: {
    id: 'stress_mk4',
    tier: 4,
    label: { vi: 'HỎA LỰC STRESS MK-IV', en: 'FIREPOWER STRESS MK-IV' },
    summary: {
      vi: 'Nova + Photon + pháo bầy + giáp nano + drone swarm để stress-test projectile/GPU.',
      en: 'Nova, Photon, swarm wing, nano armor and swarm drone for projectile/GPU stress.',
    },
    aircraft: { id: 'ship_nova', level: 48, stars: 4 },
    equipment: {
      mainGun: gear('gun_photon', 'mainGun', 48, 5),
      wingman: gear('wing_dronelet', 'wingman', 46, 5),
      armor: gear('armor_nano', 'armor', 46, 5),
      drone: gear('drone_swarm', 'drone', 46, 5),
    },
  },
});

/**
 * V4.0.3: CALIBRATION ONLY. Never applies to a real/account run or non-assault
 * preset. Web QA may set sfDungeonDmg=0.05...1.0 so a new patch is not needed
 * for each balance experiment. Build/non-dev QA uses the 0.10 default.
 *
 * This is NOT a production power rebalance or an authorization mechanism.
 */
export const DUNGEON_QA_ASSAULT_DAMAGE_SCALE_V403 = 0.10;

export function resolveDungeonQaOutgoingDamageScaleV403({
  qaRun = null,
  isDev = false,
  search = '',
} = {}) {
  if (qaRun?.enabled !== true || qaRun?.rewardMode !== 'none'
      || qaRun?.trustedWrites !== false || qaRun?.loadoutPresetId !== 'assault_mk3') return 1;
  if (isDev === true) {
    const raw = new URLSearchParams(String(search || '').replace(/^\?/, '')).get('sfDungeonDmg');
    // Reject blank, exponential, negative and non-numeric input. No implicit zero.
    if (raw !== null && /^(?:0(?:\.\d{1,3})?|1(?:\.0{1,3})?)$/.test(raw)) {
      const value = Number(raw);
      if (Number.isFinite(value) && value >= 0.03 && value <= 1) return value;
    }
  }
  return DUNGEON_QA_ASSAULT_DAMAGE_SCALE_V403;
}

/** Apply once, at the damage-to-enemy/boss boundary. Never scale objectives. */
export function scaleDungeonQaOutgoingDamageV403(rawDamage, factor = 1) {
  const damage = Number(rawDamage);
  const scale = Number(factor);
  if (!Number.isFinite(damage) || damage <= 0) return 0;
  return damage * (Number.isFinite(scale) && scale >= 0.03 && scale <= 1 ? scale : 1);
}

export function resolveDungeonQaLoadoutPresetV397(
  presetId = DUNGEON_QA_DEFAULT_LOADOUT_PRESET_ID_V397,
) {
  return DUNGEON_QA_LOADOUT_PRESETS_V397[presetId]
    || DUNGEON_QA_LOADOUT_PRESETS_V397[DUNGEON_QA_DEFAULT_LOADOUT_PRESET_ID_V397];
}

export function listDungeonQaLoadoutPresetsV397() {
  return Object.freeze(Object.values(DUNGEON_QA_LOADOUT_PRESETS_V397));
}

export function getDungeonQaLoadoutLabelV397(presetId, lang = 'vi') {
  const preset = resolveDungeonQaLoadoutPresetV397(presetId);
  return preset.label?.[lang] || preset.label?.vi || preset.label?.en || preset.id;
}

export function buildDungeonQaCampaignDataV397(campaignData, qaRun) {
  const source = campaignData && typeof campaignData === 'object' ? campaignData : {};
  const preset = resolveDungeonQaLoadoutPresetV397(qaRun?.loadoutPresetId);
  if (!qaRun?.enabled || preset.useCurrent) return source;

  const loadout = { ...(source.loadout || {}) };
  const items = { ...(source.items || {}) };
  const ownedAircrafts = { ...(source.ownedAircrafts || {}) };

  loadout.aircraft = preset.aircraft.id;
  ownedAircrafts[preset.aircraft.id] = {
    ...(ownedAircrafts[preset.aircraft.id] || {}),
    level: preset.aircraft.level,
    stars: preset.aircraft.stars,
    qaOnly: true,
  };

  for (const [slot, definition] of Object.entries(preset.equipment || {})) {
    const itemId = `qa_v397_${preset.id}_${slot}`;
    loadout[slot] = itemId;
    items[itemId] = {
      baseId: definition.baseId,
      type: definition.type,
      level: definition.level,
      rarity: definition.rarity,
      qaOnly: true,
    };
  }

  return {
    ...source,
    loadout,
    items,
    ownedAircrafts,
    qaProjection: {
      version: DUNGEON_QA_LOADOUT_VERSION,
      presetId: preset.id,
      ephemeral: true,
      trustedWrites: false,
    },
  };
}

export function auditDungeonQaLoadoutsV397() {
  const issues = [];
  const requiredSlots = ['mainGun', 'wingman', 'armor', 'drone'];
  const ids = Object.keys(DUNGEON_QA_LOADOUT_PRESETS_V397);
  if (!ids.includes(DUNGEON_QA_DEFAULT_LOADOUT_PRESET_ID_V397)) {
    issues.push('DUNGEON_QA_LOADOUT_DEFAULT');
  }
  for (const preset of Object.values(DUNGEON_QA_LOADOUT_PRESETS_V397)) {
    if (!preset.id || !preset.label?.vi || !preset.label?.en) {
      issues.push(`DUNGEON_QA_LOADOUT_IDENTITY:${preset.id || 'unknown'}`);
    }
    if (preset.useCurrent) continue;
    if (!preset.aircraft?.id || !(preset.aircraft.level > 0) || !(preset.aircraft.stars > 0)) {
      issues.push(`DUNGEON_QA_LOADOUT_AIRCRAFT:${preset.id}`);
    }
    for (const slot of requiredSlots) {
      const entry = preset.equipment?.[slot];
      if (!entry?.baseId || entry.type !== slot || !(entry.level > 0) || !(entry.rarity > 0)) {
        issues.push(`DUNGEON_QA_LOADOUT_SLOT:${preset.id}:${slot}`);
      }
    }
  }
  const input = {
    loadout: { aircraft: 'ship_xwing', mainGun: 'item_start_gun', wingman: '', armor: '', drone: '' },
    ownedAircrafts: { ship_xwing: { level: 1, stars: 1 } },
    items: { item_start_gun: { baseId: 'gun_laser', rarity: 1, level: 1, type: 'mainGun' } },
  };
  const projected = buildDungeonQaCampaignDataV397(input, {
    enabled: true,
    loadoutPresetId: DUNGEON_QA_DEFAULT_LOADOUT_PRESET_ID_V397,
  });
  if (projected === input || projected.loadout === input.loadout || projected.items === input.items) {
    issues.push('DUNGEON_QA_LOADOUT_NOT_CLONED');
  }
  if (input.loadout.aircraft !== 'ship_xwing' || input.loadout.wingman !== '') {
    issues.push('DUNGEON_QA_LOADOUT_MUTATED_SOURCE');
  }
  if (!projected.qaProjection?.ephemeral || projected.qaProjection?.trustedWrites !== false) {
    issues.push('DUNGEON_QA_LOADOUT_ISOLATION');
  }
  return Object.freeze(issues);
}
