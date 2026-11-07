import { ARMOR_TRAITS_V2, SHIP_ACTIVE_SKILLS_V2 } from './GuestAbilityCatalogV2.js';

export const GUEST_COMBAT_QA_SHIP_IDS = Object.freeze(Object.keys(SHIP_ACTIVE_SKILLS_V2));
export const GUEST_COMBAT_QA_ARMOR_IDS = Object.freeze(Object.keys(ARMOR_TRAITS_V2));
export const GUEST_COMBAT_QA_EQUIPMENT_VERSION = 'guest-combat-qa-equipment-v2.6a1';

const freezePreset = preset => Object.freeze({
  ...preset,
  name: Object.freeze({ ...preset.name }),
  ...(preset.equipment ? { equipment: Object.freeze({ ...preset.equipment }) } : {}),
});

/**
 * Curated, battle-local QA equipment bundles.
 *
 * `profile` preserves the equipped profile gun/support slots and only keeps the
 * existing ship/armor preview behavior. Higher presets create temporary item
 * instances inside a cloned campaign payload; they never grant ownership,
 * mutate inventory, unlock stages or write rewards.
 */
export const GUEST_COMBAT_QA_EQUIPMENT_PRESETS = Object.freeze([
  freezePreset({
    id: 'profile',
    name: { vi: 'Trang bị hồ sơ', en: 'Profile gear' },
    shortCode: 'P',
    recommended: { vi: 'Đối chiếu ải thấp', en: 'Low-stage baseline' },
    equipment: null,
  }),
  freezePreset({
    id: 'field',
    name: { vi: 'Bộ tác chiến', en: 'Field set' },
    shortCode: 'F',
    recommended: { vi: 'Khuyến nghị ải 1–4', en: 'Recommended stages 1–4' },
    aircraftLevel: 20,
    gearLevel: 20,
    rarity: 2,
    equipment: {
      mainGunId: 'gun_spread',
      wingmanId: 'wing_missile',
      droneId: 'drone_sniper',
    },
  }),
  freezePreset({
    id: 'elite',
    name: { vi: 'Bộ tinh nhuệ', en: 'Elite set' },
    shortCode: 'E',
    recommended: { vi: 'Khuyến nghị ải 5–8', en: 'Recommended stages 5–8' },
    aircraftLevel: 45,
    gearLevel: 45,
    rarity: 4,
    equipment: {
      mainGunId: 'gun_neutron',
      wingmanId: 'wing_homing',
      droneId: 'drone_laser',
    },
  }),
  freezePreset({
    id: 'boss',
    name: { vi: 'Bộ thử Boss', en: 'Boss test set' },
    shortCode: 'B',
    recommended: { vi: 'Khuyến nghị ải 9–10/Boss', en: 'Recommended stages 9–10/Boss' },
    aircraftLevel: 80,
    gearLevel: 80,
    rarity: 5,
    equipment: {
      mainGunId: 'gun_rail',
      wingmanId: 'wing_homing',
      droneId: 'drone_laser',
    },
  }),
]);
export const GUEST_COMBAT_QA_EQUIPMENT_PRESET_IDS = Object.freeze(
  GUEST_COMBAT_QA_EQUIPMENT_PRESETS.map(preset => preset.id),
);

const QA_ITEM_KEYS = Object.freeze({
  mainGun: '__sf_qa_main_gun__',
  wingman: '__sf_qa_wingman__',
  armor: '__sf_guest_lab_armor__',
  drone: '__sf_qa_drone__',
});

const parseSearch = search => new URLSearchParams(String(search || '').replace(/^\?/, ''));
const validOrFirst = (value, list) => list.includes(value) ? value : list[0];
const localize = (value, lang = 'vi') => value?.[lang === 'vi' ? 'vi' : 'en'] || value?.vi || value?.en || '';

export function getGuestCombatQaEquipmentPresetV2(value = 'profile') {
  const id = validOrFirst(value, GUEST_COMBAT_QA_EQUIPMENT_PRESET_IDS);
  return GUEST_COMBAT_QA_EQUIPMENT_PRESETS.find(preset => preset.id === id)
    || GUEST_COMBAT_QA_EQUIPMENT_PRESETS[0];
}

export function describeGuestCombatQaEquipmentPresetV2(presetOrId, lang = 'vi') {
  const preset = typeof presetOrId === 'string'
    ? getGuestCombatQaEquipmentPresetV2(presetOrId)
    : presetOrId || GUEST_COMBAT_QA_EQUIPMENT_PRESETS[0];
  if (!preset.equipment) return `${localize(preset.name, lang)} · ${localize(preset.recommended, lang)}`;
  return `${localize(preset.name, lang)} · L${preset.gearLevel}/R${preset.rarity}`
    + ` · ${preset.equipment.mainGunId} + ${preset.equipment.wingmanId} + ${preset.equipment.droneId}`;
}

export function resolveGuestCombatQaLoadoutV2(search = '') {
  const params = parseSearch(search);
  const equipmentPreset = getGuestCombatQaEquipmentPresetV2(params.get('sfQaGear'));
  return Object.freeze({
    shipId: validOrFirst(params.get('sfGuestShip'), GUEST_COMBAT_QA_SHIP_IDS),
    armorId: validOrFirst(params.get('sfGuestArmor'), GUEST_COMBAT_QA_ARMOR_IDS),
    equipmentPresetId: equipmentPreset.id,
    equipmentPresetIndex: GUEST_COMBAT_QA_EQUIPMENT_PRESET_IDS.indexOf(equipmentPreset.id) + 1,
    equipmentPresetTotal: GUEST_COMBAT_QA_EQUIPMENT_PRESET_IDS.length,
    equipmentPreset,
  });
}

export function cycleGuestCombatQaLoadoutV2(search = '', kind = 'ship') {
  const params = parseSearch(search);
  const current = resolveGuestCombatQaLoadoutV2(search);
  const config = kind === 'armor'
    ? { kind: 'armor', list: GUEST_COMBAT_QA_ARMOR_IDS, key: 'sfGuestArmor', value: current.armorId }
    : kind === 'equipment'
      ? { kind: 'equipment', list: GUEST_COMBAT_QA_EQUIPMENT_PRESET_IDS, key: 'sfQaGear', value: current.equipmentPresetId }
      : { kind: 'ship', list: GUEST_COMBAT_QA_SHIP_IDS, key: 'sfGuestShip', value: current.shipId };
  const index = Math.max(0, config.list.indexOf(config.value));
  const next = config.list[(index + 1) % config.list.length];
  params.set(config.key, next);
  return Object.freeze({
    kind: config.kind,
    value: next,
    search: `?${params.toString()}`,
  });
}

const createTemporaryItem = (baseId, level, rarity, type) => Object.freeze({
  baseId,
  level: Math.max(1, Math.trunc(Number(level) || 1)),
  rarity: Math.max(1, Math.min(5, Math.trunc(Number(rarity) || 1))),
  type,
});

/**
 * Creates the battle-local campaign clone used by Guest Combat QA.
 * No reference from the source profile is mutated. Profile/economy ownership
 * remains untouched even when a high-level preset is selected.
 */
export function createGuestCombatQaBattleDataV26A1(campaignData, {
  shipId = null,
  armorId = null,
  equipmentPresetId = 'profile',
  planetId = null,
  stageId = null,
} = {}) {
  const source = campaignData || {};
  const preset = getGuestCombatQaEquipmentPresetV2(equipmentPresetId);
  const sourceProgress = source.progress || {};
  const sourceLoadout = source.loadout || {};
  const sourceItems = source.items || {};
  const sourceAircraft = source.ownedAircrafts || {};
  const selectedShipId = shipId || sourceLoadout.aircraft || GUEST_COMBAT_QA_SHIP_IDS[0];

  const nextProgress = {
    ...sourceProgress,
    ...(planetId == null ? {} : { currentPlanet: Number(planetId) || 1 }),
    ...(stageId == null ? {} : { selectedStage: Number(stageId) || 1 }),
  };
  const nextLoadout = {
    ...sourceLoadout,
    aircraft: selectedShipId,
  };
  const nextItems = { ...sourceItems };
  const nextOwnedAircrafts = { ...sourceAircraft };

  if (armorId) {
    nextLoadout.armor = QA_ITEM_KEYS.armor;
    nextItems[QA_ITEM_KEYS.armor] = createTemporaryItem(
      armorId,
      preset.equipment ? preset.gearLevel : 1,
      preset.equipment ? preset.rarity : 1,
      'armor',
    );
  }

  if (preset.equipment) {
    nextLoadout.mainGun = QA_ITEM_KEYS.mainGun;
    nextLoadout.wingman = QA_ITEM_KEYS.wingman;
    nextLoadout.drone = QA_ITEM_KEYS.drone;
    nextItems[QA_ITEM_KEYS.mainGun] = createTemporaryItem(
      preset.equipment.mainGunId, preset.gearLevel, preset.rarity, 'mainGun',
    );
    nextItems[QA_ITEM_KEYS.wingman] = createTemporaryItem(
      preset.equipment.wingmanId, preset.gearLevel, preset.rarity, 'wingman',
    );
    nextItems[QA_ITEM_KEYS.drone] = createTemporaryItem(
      preset.equipment.droneId, preset.gearLevel, preset.rarity, 'drone',
    );
    nextOwnedAircrafts[selectedShipId] = {
      ...(sourceAircraft[selectedShipId] || {}),
      level: preset.aircraftLevel,
      stars: Math.max(1, Math.trunc(Number(sourceAircraft[selectedShipId]?.stars) || 1)),
    };
  }

  return Object.freeze({
    ...source,
    progress: nextProgress,
    loadout: nextLoadout,
    items: nextItems,
    ownedAircrafts: nextOwnedAircrafts,
  });
}
