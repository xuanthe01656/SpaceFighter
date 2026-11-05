/**
 * Guest Combat Foundation V2.
 *
 * This catalog is a DEV/Guest balance candidate, not an authoritative C15
 * ruleset. It deliberately keeps one manual ship action and moves every armor
 * effect to an automatic/passive trigger. IDs remain stable; the versioned
 * rules object is suitable for later porting to a deterministic server kernel.
 */
export const GUEST_COMBAT_RULES_VERSION = 'guest-combat-foundation-v2.0.0';
export const COMBAT_TICK_RATE = 30;

const freezeName = (vi, en) => Object.freeze({ vi, en });
const skill = (id, vi, en, kind, cooldownSeconds, durationSeconds, params = {}) =>
  Object.freeze({
    id,
    name: freezeName(vi, en),
    kind,
    cooldownTicks: Math.round(cooldownSeconds * COMBAT_TICK_RATE),
    durationTicks: Math.round(durationSeconds * COMBAT_TICK_RATE),
    params: Object.freeze({ ...params }),
  });

/**
 * Small, readable effects only. Power comes from role and timing rather than
 * teleport/invulnerability or large one-button bursts. PvP can apply its own
 * mode scalar without changing these stable ability identities.
 */
export const SHIP_ACTIVE_SKILLS_V2 = Object.freeze({
  ship_xwing: skill('skill_focus_fire', 'Hỏa Lực Tập Trung', 'Focus Fire', 'overdrive', 18, 4, {
    damageMultiplier: 1.08, fireIntervalMultiplier: 0.84,
  }),
  ship_scout: skill('skill_recon_lock', 'Khóa Mục Tiêu', 'Recon Lock', 'mark', 18, 5, {
    markedDamageBonus: 0.12, range: 18,
  }),
  ship_tank: skill('skill_bulwark_guard', 'Lá Chắn Kiên Cố', 'Bulwark Guard', 'barrier', 24, 5, {
    shieldRatio: 0.14, mitigation: 0.12,
  }),
  ship_phantom: skill('skill_shadow_cloak', 'Ẩn Bóng', 'Shadow Cloak', 'cloak', 22, 3, {
    mitigation: 0.20,
  }),
  ship_void: skill('skill_void_lance', 'Thương Hư Không', 'Void Lance', 'pierce', 20, 0, {
    damageMultiplier: 1.60, penetration: 3,
  }),
  ship_nebula: skill('skill_support_field', 'Vùng Hỗ Trợ', 'Support Field', 'support', 24, 5, {
    damageMultiplier: 1.05, healRatio: 0.06,
  }),
  ship_raptor: skill('skill_assault_overdrive', 'Quá Tải Tấn Công', 'Assault Overdrive', 'overdrive', 20, 4, {
    damageMultiplier: 1.10, fireIntervalMultiplier: 0.80,
  }),
  ship_spectre: skill('skill_phase_salvo', 'Loạt Bắn Pha', 'Phase Salvo', 'burst', 18, 0, {
    shots: 3, shotDamageMultiplier: 0.55, spread: 0.26,
  }),
  ship_storm: skill('skill_ion_pulse', 'Xung Ion', 'Ion Pulse', 'area', 20, 0, {
    radius: 5.2, damageMultiplier: 0.55, slowTicks: 60,
  }),
  ship_leviathan: skill('skill_fortress_guard', 'Pháo Đài Hộ Vệ', 'Fortress Guard', 'barrier', 28, 6, {
    shieldRatio: 0.18, mitigation: 0.15,
  }),
  ship_vortex: skill('skill_gravity_pulse', 'Xung Trọng Lực', 'Gravity Pulse', 'pull', 24, 0, {
    radius: 5.6, pullDistance: 1.5, slowTicks: 60,
  }),
  ship_nova: skill('skill_nova_burst', 'Bùng Nổ Nova', 'Nova Burst', 'area', 26, 0, {
    radius: 5.8, damageMultiplier: 1.05, slowTicks: 0,
  }),
  ship_eternal: skill('skill_repair_protocol', 'Giao Thức Phục Hồi', 'Repair Protocol', 'heal', 28, 0, {
    healRatio: 0.10, shieldRatio: 0.04,
  }),
  ship_abyss: skill('skill_hunter_mark', 'Dấu Ấn Thợ Săn', 'Hunter Mark', 'mark', 20, 5, {
    markedDamageBonus: 0.15, range: 18,
  }),
  ship_titanforge: skill('skill_titan_shockwave', 'Chấn Động Titan', 'Titan Shockwave', 'area', 24, 0, {
    radius: 4.8, damageMultiplier: 0.75, slowTicks: 30,
  }),
  ship_celestial: skill('skill_rally_beacon', 'Hải Đăng Tiếp Sức', 'Rally Beacon', 'support', 26, 6, {
    damageMultiplier: 1.08, healRatio: 0.06,
  }),
});

const armor = (id, vi, en, trigger, params = {}) => Object.freeze({
  id,
  name: freezeName(vi, en),
  trigger,
  params: Object.freeze({ ...params }),
});

/**
 * Armor is equipment, not a second manual ability bar. Every trigger is
 * automatic and exposes its internal cooldown/charge to the HUD.
 */
export const ARMOR_TRAITS_V2 = Object.freeze({
  armor_light: armor('armor_auto_evade', 'Cơ Động Né Tự Động', 'Auto Evasion', 'on_eligible_hit', {
    chancePermillePve: 80,
    chancePermillePvp: 50,
    internalCooldownTicks: 75,
    eligibleSources: Object.freeze(['projectile']),
  }),
  armor_heavy: armor('armor_stable_plating', 'Giáp Ổn Định', 'Stable Plating', 'always', {
    incomingMultiplier: 0.92,
  }),
  armor_shield: armor('armor_recharge_shield', 'Khiên Tái Nạp', 'Recharge Shield', 'always', {
    shieldRatio: 0.12,
    rechargeDelayTicks: 240,
    rechargeRatioPerSecond: 0.01,
  }),
  armor_reactive: armor('armor_reactive_plating', 'Giáp Phản Ứng', 'Reactive Plating', 'on_projectile_hit', {
    reflectRatio: 0.10,
    internalCooldownTicks: 30,
  }),
  armor_nano: armor('armor_nano_repair', 'Nano Tự Sửa Chữa', 'Nano Repair', 'out_of_combat', {
    delayTicks: 120,
    healRatioPerSecond: 0.0025,
    battleHealCapRatio: 0.20,
  }),
  armor_void: armor('armor_void_damping', 'Giảm Chấn Hư Không', 'Void Damping', 'always', {
    genericIncomingMultiplier: 0.97,
    typedIncomingMultiplier: 0.92,
    resistedDamageTypes: Object.freeze(['energy', 'ion', 'void']),
  }),
  armor_crystal: armor('armor_crystal_prism', 'Lăng Kính Tinh Thể', 'Crystal Prism', 'on_projectile_hit', {
    hitsPerProc: 5,
    procIncomingMultiplier: 0.70,
    reflectRatio: 0.06,
  }),
});

export const GUN_DAMAGE_TYPES_V2 = Object.freeze({
  gun_laser: 'energy',
  gun_plasma: 'energy',
  gun_spread: 'energy',
  gun_rail: 'kinetic',
  gun_pulse: 'energy',
  gun_ion: 'ion',
  gun_neutron: 'explosive',
  gun_photon: 'energy',
  gun_wave: 'energy',
  gun_homing: 'energy',
  gun_shotgun: 'explosive',
  gun_charge: 'kinetic',
});

export const DEFENSE_CLASSES_V2 = Object.freeze([
  'light', 'balanced', 'armored', 'shielded', 'boss',
]);

// Bounded soft counter matrix. The matchup affects choices without deciding a
// fight before player input. Unknown pairs remain neutral.
const COUNTER_MATRIX = Object.freeze({
  kinetic: Object.freeze({ armored: 1.08, shielded: 0.96 }),
  ion: Object.freeze({ shielded: 1.10, armored: 0.95 }),
  explosive: Object.freeze({ light: 1.08, armored: 0.95 }),
  energy: Object.freeze({ light: 1.04, shielded: 0.96 }),
  void: Object.freeze({ shielded: 1.06, boss: 1.03 }),
});

export function guestCounterMultiplierV2({ damageType, targetDefense = 'balanced' } = {}) {
  const defense = DEFENSE_CLASSES_V2.includes(targetDefense) ? targetDefense : 'balanced';
  const raw = COUNTER_MATRIX[damageType]?.[defense] ?? 1;
  return Math.max(0.90, Math.min(1.10, Math.round(raw * 1000) / 1000));
}

/** Temporary adapter for Legacy enemies until archetype metadata replaces tier. */
export function legacyTierDefenseClass(tier) {
  return ({ 1: 'balanced', 2: 'light', 3: 'shielded', 4: 'armored' })[Number(tier)] || 'balanced';
}

/**
 * Prevent accidental power creep while the catalog remains a QA candidate.
 * Returns a list instead of throwing so CI can report every catalog issue.
 */
export function auditGuestCombatCatalogV2(aircrafts = [], armorCatalog = []) {
  const issues = [];
  const shipIds = aircrafts.map(a => a.id);
  const armorIds = armorCatalog.map(a => a.id);
  if (shipIds.length !== 16) issues.push(`EXPECTED_16_SHIPS:${shipIds.length}`);
  if (armorIds.length !== 7) issues.push(`EXPECTED_7_ARMORS:${armorIds.length}`);
  if (new Set(shipIds).size !== shipIds.length) issues.push('DUPLICATE_SHIP_ID');
  if (new Set(armorIds).size !== armorIds.length) issues.push('DUPLICATE_ARMOR_ID');
  for (const id of shipIds) {
    const value = SHIP_ACTIVE_SKILLS_V2[id];
    if (!value) { issues.push(`MISSING_SHIP_SKILL:${id}`); continue; }
    if (value.kind === 'dash') issues.push(`DISALLOWED_DASH:${id}`);
    if (value.cooldownTicks < 15 * COMBAT_TICK_RATE || value.cooldownTicks > 35 * COMBAT_TICK_RATE)
      issues.push(`SHIP_COOLDOWN_OUT_OF_BOUNDS:${id}`);
    if ((value.params.damageMultiplier || 1) > 1.65)
      issues.push(`SHIP_DAMAGE_MULTIPLIER_OUT_OF_BOUNDS:${id}`);
    if ((value.params.mitigation || 0) > 0.25)
      issues.push(`SHIP_MITIGATION_OUT_OF_BOUNDS:${id}`);
    if ((value.params.healRatio || 0) > 0.12)
      issues.push(`SHIP_HEAL_OUT_OF_BOUNDS:${id}`);
  }
  for (const id of armorIds) {
    const value = ARMOR_TRAITS_V2[id];
    if (!value) { issues.push(`MISSING_ARMOR_TRAIT:${id}`); continue; }
    if (value.trigger === 'manual') issues.push(`DISALLOWED_MANUAL_ARMOR:${id}`);
  }
  if (new Set(Object.values(SHIP_ACTIVE_SKILLS_V2).map(v => v.id)).size !== 16)
    issues.push('DUPLICATE_SHIP_SKILL_ID');
  return Object.freeze(issues);
}
