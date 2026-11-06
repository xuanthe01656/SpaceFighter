/**
 * Guest combat ability experiment v1. NOT C15 authoritative rules.
 * All IDs match existing persisted Aircraft/Armor IDs; balance values are QA
 * proposals and are intentionally independent of catalog base stats.
 * One manual skill per aircraft. Some armors have one optional manual action;
 * the existing passive resolver remains the authority for passive armor math.
 */
export const GUEST_ABILITY_RULES_VERSION = 'guest-ability-lab-v1';
const skill = (id, vi, en, kind, cooldownSeconds, durationSeconds, params = {}) =>
  Object.freeze({ id, name: Object.freeze({ vi, en }), kind,
    cooldownTicks: Math.round(cooldownSeconds * 30),
    durationTicks: Math.round(durationSeconds * 30), params: Object.freeze(params) });

export const SHIP_ACTIVE_SKILLS = Object.freeze({
  ship_xwing: skill('skill_vector_dash', 'Lướt Vector', 'Vector Dash', 'dash', 12, .75, { distance: 2.4, evade: .35 }),
  ship_scout: skill('skill_recon_sweep', 'Quét Trinh Sát', 'Recon Sweep', 'mark', 16, 6, { markedDamageBonus: .18, range: 18 }),
  ship_tank: skill('skill_bulwark_mode', 'Phòng Thủ Kiên Cố', 'Bulwark Mode', 'barrier', 22, 5, { shieldRatio: .14, mitigation: .25 }),
  ship_phantom: skill('skill_shadow_cloak', 'Ẩn Bóng', 'Shadow Cloak', 'cloak', 20, 3, { mitigation: .35 }),
  ship_void: skill('skill_void_lance', 'Thương Hư Không', 'Void Lance', 'pierce', 18, 0, { damageMultiplier: 2, penetration: 5 }),
  ship_nebula: skill('skill_support_field', 'Vùng Hỗ Trợ', 'Nebula Support Field', 'support', 20, 6, { damageMultiplier: 1.12, healRatio: .04 }),
  ship_raptor: skill('skill_assault_overdrive', 'Quá Tải Tấn Công', 'Assault Overdrive', 'overdrive', 20, 5, { fireIntervalMultiplier: .65, damageMultiplier: 1.10 }),
  ship_spectre: skill('skill_phase_step', 'Dịch Chuyển Pha', 'Phase Step', 'dash', 16, 1, { distance: 3.0, evade: .50 }),
  ship_storm: skill('skill_ion_tempest', 'Bão Ion', 'Ion Tempest', 'area', 18, 2, { radius: 5.5, damageMultiplier: .70, slowTicks: 90 }),
  ship_leviathan: skill('skill_fortress_anchor', 'Pháo Đài Bất Động', 'Fortress Anchor', 'barrier', 25, 6, { shieldRatio: .22, mitigation: .3 }),
  ship_vortex: skill('skill_gravity_well', 'Giếng Trọng Lực', 'Gravity Well', 'pull', 21, 2, { radius: 6.5, pullDistance: 2.1, slowTicks: 100 }),
  ship_nova: skill('skill_nova_burst', 'Bùng Nổ Nova', 'Nova Burst', 'area', 24, 0, { radius: 6.2, damageMultiplier: 1.7, slowTicks: 0 }),
  ship_eternal: skill('skill_guardian_repair', 'Hộ Vệ Phục Hồi', 'Guardian Repair', 'heal', 25, 3, { healRatio: .16, shieldRatio: .05 }),
  ship_abyss: skill('skill_reaper_mark', 'Dấu Ấn Tử Thần', 'Reaper Mark', 'mark', 16, 6, { markedDamageBonus: .25, range: 18 }),
  ship_titanforge: skill('skill_titan_impact', 'Chấn Động Titan', 'Titan Impact', 'area', 25, 1, { radius: 4.7, damageMultiplier: 1.2, slowTicks: 45 }),
  ship_celestial: skill('skill_celestial_beacon', 'Hào Quang Thiên Giới', 'Celestial Beacon', 'support', 24, 6, { damageMultiplier: 1.15, healRatio: .08 }),
});

const manual = (id, vi, kind, cooldownSeconds, durationSeconds, params) =>
  skill(id, vi, id, kind, cooldownSeconds, durationSeconds, params);
export const ARMOR_ABILITY_TRAITS = Object.freeze({
  armor_light: Object.freeze({ trigger: 'manual', ability: manual('armor_quick_reflex','Phản Xạ Nhanh','dash',20,1,{distance:1.8,evade:.25}) }),
  armor_heavy: Object.freeze({ trigger: 'manual', ability: manual('armor_brace','Chống Chịu','barrier',25,4,{shieldRatio:.10,mitigation:.2}) }),
  armor_shield: Object.freeze({ trigger: 'manual', ability: manual('armor_overcharge','Nạp Khiên','barrier',24,5,{shieldRatio:.15,mitigation:0}) }),
  armor_reactive: Object.freeze({ trigger: 'on_hit', passiveId:'reactive' }),
  armor_nano: Object.freeze({ trigger: 'always', passiveId:'regen' }),
  armor_void: Object.freeze({ trigger: 'always', passiveId:'void' }),
  armor_crystal: Object.freeze({ trigger: 'on_hit', passiveId:'crystal' }),
});

export const GUN_DAMAGE_TYPES = Object.freeze({
  gun_laser:'energy', gun_plasma:'energy', gun_spread:'energy',gun_rail:'kinetic',
  gun_pulse:'energy',gun_ion:'ion',gun_neutron:'explosive',gun_photon:'energy',
  gun_wave:'energy',gun_homing:'energy',gun_shotgun:'explosive',gun_charge:'kinetic',
});
// Soft counter QA matrix. No absolute wins; never exceed +/- 15% in this lane.
export function guestCounterMultiplier({ damageType, targetTier, marked = false } = {}) {
  const tier = Math.max(1, Math.min(4, Number(targetTier) || 1));
  let modifier = 1;
  if (damageType === 'kinetic' && tier === 4) modifier += .12; // pierce heavy
  if (damageType === 'ion' && tier === 3) modifier += .12; // ion vs shield units
  if (damageType === 'explosive' && tier === 2) modifier += .10; // AOE vs evasive units
  if (damageType === 'energy' && tier === 3) modifier -= .08;
  if (marked) modifier += .04;
  return Math.max(.85, Math.min(1.15, Math.round(modifier * 1000) / 1000));
}

export function validateGuestAbilityCatalog(aircrafts, armorCatalog) {
  const ships = aircrafts.map(a => a.id);
  const armors = armorCatalog.map(a => a.id);
  const unique = ids => ids.length === new Set(ids).size;
  return unique(ships) && unique(armors) && unique(Object.values(SHIP_ACTIVE_SKILLS).map(s => s.id))
    && ships.length === 16 && armors.length === 7
    && ships.every(id => SHIP_ACTIVE_SKILLS[id])
    && armors.every(id => ARMOR_ABILITY_TRAITS[id]);
}
